import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes } from 'date-fns';
import { calculateWorkingTime } from '@/utils/attendanceUtils';

const COOLDOWN_PERIOD = 3; // 3 minutes cooldown
const MINIMUM_FIRST_CHECKIN_DURATION = 5; // 5 minutes minimum before first checkout

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employeeId } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get today's attendance record
    const { data: attendance, error: fetchError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employeeId', employeeId)
      .eq('date', today.toISOString())
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw fetchError;
    }

    let action: 'first_check_in' | 'first_check_out' | 'second_check_in' | 'second_check_out';
    let cooldownRemaining = 0;
    let breakDuration = 0;
    let updatedAttendance;

    // Determine current attendance state and next action
    const determineAttendanceState = () => {
      if (!attendance) return 'first_check_in';
      
      // Add cooldown check to prevent duplicate timestamps
      const lastAction = attendance.second_check_out_time || 
                        attendance.second_check_in_time || 
                        attendance.first_check_out_time || 
                        attendance.first_check_in_time;
                        
      if (lastAction) {
        const lastActionTime = new Date(lastAction);
        const timeDiff = differenceInMinutes(now, lastActionTime);
        if (timeDiff < COOLDOWN_PERIOD) {
          throw new Error(`Please wait ${COOLDOWN_PERIOD - timeDiff} minutes before next scan`);
        }
      }

      if (attendance.first_check_in_time && !attendance.first_check_out_time) return 'first_check_out';
      if (attendance.first_check_out_time && !attendance.second_check_in_time) return 'second_check_in';
      if (attendance.second_check_in_time && !attendance.second_check_out_time) return 'second_check_out';
      return 'completed';
    };

    const currentState = determineAttendanceState();

    if (currentState === 'first_check_in') {
      // Create new attendance record with first check-in
      const { data, error } = await supabase
        .from('attendance')
        .insert([{
          employeeId,
          date: today.toISOString(),
          first_check_in_time: now.toISOString(),
          status: 'CHECKED_IN'
        }])
        .select()
        .single();

      if (error) throw error;
      updatedAttendance = data;
      action = 'first_check_in';

    } else if (currentState === 'first_check_out') {
      // Validate minimum duration since first check-in
      const minutesSinceFirstCheckIn = differenceInMinutes(now, new Date(attendance.first_check_in_time));
      
      if (minutesSinceFirstCheckIn < MINIMUM_FIRST_CHECKIN_DURATION) {
        cooldownRemaining = (MINIMUM_FIRST_CHECKIN_DURATION - minutesSinceFirstCheckIn) * 60;
        return res.status(400).json({
          error: 'Too soon for check-out',
          cooldown_remaining: cooldownRemaining,
          action: 'first_check_out',
          timestamp: now.toISOString(),
        });
      }

      // Record first check-out
      const { data, error } = await supabase
        .from('attendance')
        .update({
          first_check_out_time: now.toISOString(),
          status: 'ON_BREAK'
        })
        .eq('id', attendance.id)
        .select()
        .single();

      if (error) throw error;
      updatedAttendance = data;
      action = 'first_check_out';

    } else if (currentState === 'second_check_in') {
      // Validate break duration
      const minutesSinceFirstCheckOut = differenceInMinutes(now, new Date(attendance.first_check_out_time));
      
      if (minutesSinceFirstCheckOut < COOLDOWN_PERIOD) {
        cooldownRemaining = (COOLDOWN_PERIOD - minutesSinceFirstCheckOut) * 60;
        return res.status(400).json({
          error: 'Break time not complete',
          cooldown_remaining: cooldownRemaining,
          action: 'second_check_in',
          timestamp: now.toISOString(),
        });
      }

      breakDuration = minutesSinceFirstCheckOut;
      
      // Record second check-in
      const { data, error } = await supabase
        .from('attendance')
        .update({
          second_check_in_time: now.toISOString(),
          break_duration: breakDuration,
          status: 'CHECKED_IN'
        })
        .eq('id', attendance.id)
        .select()
        .single();

      if (error) throw error;
      updatedAttendance = data;
      action = 'second_check_in';

    } else if (currentState === 'second_check_out') {
      // Record second check-out
      const { data: checkoutData, error: checkoutError } = await supabase
        .from('attendance')
        .update({
          second_check_out_time: now.toISOString(),
          status: 'CHECKED_OUT'
        })
        .eq('id', attendance.id)
        .select('*')  // Select all fields to get complete record
        .single();

      if (checkoutError) throw checkoutError;

      // Calculate total working time including both sessions
      const firstSessionMinutes = checkoutData.first_check_out_time ? 
        differenceInMinutes(
          new Date(checkoutData.first_check_out_time),
          new Date(checkoutData.first_check_in_time)
        ) : 0;

      const secondSessionMinutes = checkoutData.second_check_in_time ? 
        differenceInMinutes(
          now,
          new Date(checkoutData.second_check_in_time)
        ) : 0;

      const totalMinutes = firstSessionMinutes + secondSessionMinutes;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.floor(totalMinutes % 60);
      const workingTime = `${hours}h ${minutes}m`;

      // Update working time
      const { data, error } = await supabase
        .from('attendance')
        .update({ 
          working_duration: workingTime,
          total_hours: hours + (minutes / 60)
        })
        .eq('id', attendance.id)
        .select()
        .single();

      if (error) throw error;
      updatedAttendance = data;
      action = 'second_check_out';

    } else {
      return res.status(400).json({
        error: 'All attendance actions completed for today',
        timestamp: now.toISOString(),
      });
    }

    // Return response with all timestamps
    return res.status(200).json({
      action,
      timestamp: now.toISOString(),
      break_duration: breakDuration || undefined,
      cooldown_remaining: cooldownRemaining,
      first_check_in: updatedAttendance.first_check_in_time,
      first_check_out: updatedAttendance.first_check_out_time,
      second_check_in: updatedAttendance.second_check_in_time,
      second_check_out: updatedAttendance.second_check_out_time,
      total_hours: updatedAttendance.total_hours,
      status: updatedAttendance.status
    });

  } catch (error) {
    console.error('Attendance recording error:', error);
    return res.status(500).json({ error: 'Failed to record attendance' });
  }
} 