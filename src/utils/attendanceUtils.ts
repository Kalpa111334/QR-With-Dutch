// Attendance Utilities Module
import { supabase } from '@/integrations/supabase/client';
import { PostgrestSingleResponse } from '@supabase/supabase-js';
import { 
  Attendance, 
  AttendanceStatus, 
  WorkTimeInfo,
  ExtendedWorkTimeInfo, 
  ExtendedAttendance, 
  CustomPostgrestResponse,
  AttendanceAction 
} from '@/types';
import Swal from 'sweetalert2';
import { differenceInMinutes } from 'date-fns';

// Define AdminContactInfo interface locally
interface AdminContactInfo {
  whatsapp_number: string;
  is_whatsapp_share_enabled: boolean;
}

// Custom Error Class for Attendance-related Errors
class AttendanceError extends Error {
  constructor(
    message: string, 
    public code: string = 'ATTENDANCE_ERROR',
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AttendanceError';
  }
}

// Attendance Logging Service
class AttendanceLogger {
  private static instance: AttendanceLogger;
  private logBuffer: Array<{
    timestamp: string;
    type: 'check-in' | 'check-out' | 'error';
    employee_id: string;
    details: Record<string, any>;
  }> = [];

  private constructor() {}

  public static getInstance(): AttendanceLogger {
    if (!AttendanceLogger.instance) {
      AttendanceLogger.instance = new AttendanceLogger();
    }
    return AttendanceLogger.instance;
  }

  public log(
    type: 'check-in' | 'check-out' | 'error', 
    employee_id: string, 
    details: Record<string, any>
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      employee_id,
      details
    };

    this.logBuffer.push(logEntry);
    console.log(`Attendance ${type.toUpperCase()} Log:`, logEntry);
    this.persistLogs();
  }

  private async persistLogs(): Promise<void> {
    try {
      if (this.logBuffer.length >= 10) {
        const { error } = await supabase
          .from('attendance_logs')
          .insert(this.logBuffer);

        if (error) {
          console.error('Failed to persist attendance logs:', error);
        } else {
          this.logBuffer = [];
        }
      }
    } catch (error) {
      console.error('Unexpected error in log persistence:', error);
    }
  }
}

// Initialize the logger
const attendanceLogger = AttendanceLogger.getInstance();

// Attendance Metrics Calculation Utility
export const calculateAttendanceMetrics = (
  firstCheckInTime: Date,
  firstCheckOutTime: Date | null,
  secondCheckInTime: Date | null,
  secondCheckOutTime: Date | null
) => {
  const metrics = {
    totalHours: 0,
    breakDuration: 0,
    status: 'present' as 'present' | 'checked-out',
    isOvertime: false
  };

  // Calculate first session duration
  if (firstCheckOutTime) {
    const firstSessionDuration = (firstCheckOutTime.getTime() - firstCheckInTime.getTime()) / (1000 * 60 * 60);
    metrics.totalHours += firstSessionDuration;
  }

  // Calculate break duration and second session duration
  if (firstCheckOutTime && secondCheckInTime) {
    metrics.breakDuration = (secondCheckInTime.getTime() - firstCheckOutTime.getTime()) / (1000 * 60);
    
    if (secondCheckOutTime) {
      const secondSessionDuration = (secondCheckOutTime.getTime() - secondCheckInTime.getTime()) / (1000 * 60 * 60);
      metrics.totalHours += secondSessionDuration;
      metrics.status = 'checked-out';
    }
  }

  // Check for overtime (more than 8 hours total)
  metrics.isOvertime = metrics.totalHours > 8;

  return metrics;
};

// Utility function to generate a unique timestamp
const generateUniqueTimestamp = async (
  employee_id: string, 
  baseTime: Date, 
  type: 'check-in' | 'check-out'
): Promise<Date> => {
  let uniqueTime = new Date(baseTime);
  let attempt = 0;

  while (attempt < 10) {    // Get the last check-in/check-out for this employee today
    const today = baseTime.toISOString().split('T')[0];
    const { data: lastRecord } = await supabase
      .from('attendance')
      .select('check_in_time, check_out_time')
      .eq('employee_id', employee_id)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // For check-out, ensure minimum 15 minutes from check-in
    if (type === 'check-out' && lastRecord?.check_in_time) {
      const lastCheckIn = new Date(lastRecord.check_in_time);
      const minCheckOutTime = new Date(lastCheckIn.getTime() + 15 * 60 * 1000);
      
      if (baseTime < minCheckOutTime) {
        uniqueTime = minCheckOutTime;
      }
    }

    // For check-in after a check-out, ensure minimum 15 minutes gap
    if (type === 'check-in' && lastRecord?.check_out_time) {
      const lastCheckOut = new Date(lastRecord.check_out_time);
      const minNextCheckIn = new Date(lastCheckOut.getTime() + 15 * 60 * 1000);
      
      if (baseTime < minNextCheckIn) {
        uniqueTime = minNextCheckIn;
      }
    }

    // Add a small offset if needed to ensure uniqueness
    uniqueTime = new Date(uniqueTime.getTime() + 1000 * attempt);

    // Check if this exact timestamp exists for the employee
    const { data: existingRecords, error } = await supabase
      .from('attendance')
      .select('id')
      .eq('employee_id', employee_id)
      .or(
        type === 'check-in' 
          ? `check_in_time.eq.${uniqueTime.toISOString()}`
          : `check_out_time.eq.${uniqueTime.toISOString()}`
      )
      .maybeSingle();

    if (error) {
      console.error('Error checking unique timestamp:', error);
      throw new AttendanceError('Failed to generate unique timestamp');
    }

    // If no record exists with this timestamp, return it
    if (!existingRecords) {
      return uniqueTime;
    }

    attempt++;
  }

  throw new AttendanceError('Unable to generate unique timestamp');
};

// Enhanced Attendance Recording Function
export const recordAttendance = async (qrData: string): Promise<ExtendedWorkTimeInfo> => {
  try {
    const employeeId = qrData;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Get the latest attendance record for today
    const { data: latestRecord, error: fetchError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new AttendanceError('Failed to fetch attendance record', 'FETCH_ERROR', { details: fetchError });
    }

    let action: AttendanceAction;
    let newRecord: Attendance | null = null;

    if (!latestRecord) {
      // First check-in of the day
      action = 'first_check_in';
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          employee_id: employeeId,
          date: today,
          first_check_in_time: now.toISOString(),
          status: 'CHECKED_IN',
          is_second_session: false
        })
        .select()
        .single();

      if (error) throw new AttendanceError('Failed to record first check-in', 'INSERT_ERROR', { details: error });
      newRecord = data;
    } else if (!latestRecord.first_check_out_time && !latestRecord.is_second_session) {
      // First check-out
      action = 'first_check_out';
      const { data, error } = await supabase
        .from('attendance')
        .update({
          first_check_out_time: now.toISOString(),
          status: 'CHECKED_OUT'
        })
        .eq('id', latestRecord.id)
        .select()
        .single();

      if (error) throw new AttendanceError('Failed to record first check-out', 'UPDATE_ERROR', { details: error });
      newRecord = data;
    } else if (latestRecord.first_check_out_time && !latestRecord.is_second_session) {
      // Second check-in (new session)
      action = 'second_check_in';
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          employee_id: employeeId,
          date: today,
          first_check_in_time: now.toISOString(),
          status: 'CHECKED_IN',
          is_second_session: true,
          previous_session_id: latestRecord.id,
          break_duration: `${Math.round((now.getTime() - new Date(latestRecord.first_check_out_time).getTime()) / 60000)} minutes`
        })
        .select()
        .single();

      if (error) throw new AttendanceError('Failed to record second check-in', 'INSERT_ERROR', { details: error });
      newRecord = data;
    } else if (latestRecord.is_second_session && !latestRecord.first_check_out_time) {
      // Second check-out
      action = 'second_check_out';
      const { data, error } = await supabase
        .from('attendance')
        .update({
          first_check_out_time: now.toISOString(),
          status: 'CHECKED_OUT'
        })
        .eq('id', latestRecord.id)
        .select()
        .single();

      if (error) throw new AttendanceError('Failed to record second check-out', 'UPDATE_ERROR', { details: error });
      newRecord = data;
    } else {
      throw new AttendanceError('Maximum daily attendance actions reached', 'MAX_ACTIONS_REACHED');
    }

    // Log the attendance action
    attendanceLogger.log(
      action.includes('check_in') ? 'check-in' : 'check-out',
      employeeId,
      { action, timestamp: now.toISOString() }
    );

    // Calculate work time info
    const workTimeInfo: ExtendedWorkTimeInfo = {
      action,
      record: newRecord,
      message: `Successfully recorded ${action.replace(/_/g, ' ')}`,
      totalHours: 0,
      breakDuration: 0
    };

    // Calculate total hours and break duration
    if (newRecord) {
      if (newRecord.is_second_session) {
        // For second session
        if (newRecord.first_check_out_time) {
          // Second check-out
          workTimeInfo.totalHours = (new Date(newRecord.first_check_out_time).getTime() - 
            new Date(newRecord.first_check_in_time).getTime()) / (1000 * 60 * 60);
        }
        if (newRecord.break_duration) {
          workTimeInfo.breakDuration = parseInt(newRecord.break_duration.split(' ')[0]);
        }
      } else {
        // For first session
        if (newRecord.first_check_out_time) {
          workTimeInfo.totalHours = (new Date(newRecord.first_check_out_time).getTime() - 
            new Date(newRecord.first_check_in_time).getTime()) / (1000 * 60 * 60);
        }
      }
    }

    return workTimeInfo;
  } catch (error) {
    if (error instanceof AttendanceError) {
    throw error;
    }
    throw new AttendanceError('Failed to record attendance', 'UNKNOWN_ERROR', { details: error });
  }
};

// Fetch Attendance Records
export const getAttendanceRecords = async (): Promise<Attendance[]> => {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        employee_id,
        check_in_time,
        check_out_time,
        second_check_in_time,
        second_check_out_time,
        break_duration,
        date,
        status,
        action,
        minutes_late,
        working_duration,
        overtime,
        sequence_number,
        employee:employees (name)
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    return (data || []).map(record => ({
      id: record.id,
      employee_id: record.employee_id,
      employee_name: (record.employee as any)?.name || 'Unknown',
      check_in_time: record.check_in_time,
      check_out_time: record.check_out_time,
      second_check_in_time: record.second_check_in_time,
      second_check_out_time: record.second_check_out_time,
      break_duration: record.break_duration,
      date: record.date,
      status: record.status,
      action: record.action,
      minutes_late: record.minutes_late,
      working_duration: record.working_duration,
      overtime: record.overtime,
      sequence_number: record.sequence_number
    }));
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
  }
};

// Get Today's Attendance Summary
export const getTodayAttendanceSummary = async () => {
    const today = new Date().toISOString().split('T')[0];
    
  try {
    // First, get total number of active employees
    const { data: employeesData, error: employeesError } = await supabase
      .from('employees')
      .select('id')
      .eq('status', 'active');

    if (employeesError) throw employeesError;
    const totalEmployees = employeesData?.length || 0;

    // Get all attendance records for today, including related sessions
    const { data: records, error } = await supabase
      .from('attendance')
      .select(`
        *,
        employee:employees(name),
        previous_session:attendance(
          first_check_in_time,
          first_check_out_time
        )
      `)
      .eq('date', today)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching attendance records:', error);
      throw new AttendanceError('Failed to fetch attendance summary', 'FETCH_ERROR', { details: error });
    }

    // Process records to combine sessions for the same employee
    const processedRecords = records.reduce((acc: Record<string, any>, record: any) => {
      const employeeId = record.employee_id;

      if (!acc[employeeId]) {
        acc[employeeId] = {
          ...record,
          sessions: []
        };
      }

      // Add this session to the employee's sessions
      acc[employeeId].sessions.push({
        id: record.id,
        is_second_session: record.is_second_session,
        first_check_in_time: record.first_check_in_time,
        first_check_out_time: record.first_check_out_time,
        break_duration: record.break_duration
      });

      return acc;
    }, {});

    // Calculate summary statistics
    const presentEmployees = Object.values(processedRecords).filter((record: any) => 
      record.sessions.some((s: any) => s.first_check_in_time && !s.first_check_out_time)
    ).length;

    const checkedOutEmployees = Object.values(processedRecords).filter((record: any) => 
      record.sessions.every((s: any) => s.first_check_in_time && s.first_check_out_time)
    ).length;

    const stillWorking = presentEmployees;
    const absentEmployees = totalEmployees - Object.keys(processedRecords).length;

    // Calculate rates
    const absentRate = totalEmployees > 0 ? ((absentEmployees / totalEmployees) * 100).toFixed(1) : '0.0';
    const presentRate = totalEmployees > 0 ? (((presentEmployees + checkedOutEmployees) / totalEmployees) * 100).toFixed(1) : '0.0';

    return {
      totalEmployees,
      presentCount: presentEmployees,
      checkedOutCount: checkedOutEmployees,
      absentCount: absentEmployees,
      stillWorking,
      absentRate,
      presentRate,
      records: Object.values(processedRecords).map((record: any) => {
        let totalMinutes = 0;
        let totalBreakMinutes = 0;

        // Calculate time for each session
        record.sessions.forEach((session: any) => {
          if (session.first_check_in_time && session.first_check_out_time) {
            const start = new Date(session.first_check_in_time);
            const end = new Date(session.first_check_out_time);
            totalMinutes += Math.round((end.getTime() - start.getTime()) / 60000);
          }

          if (session.break_duration) {
            const breakMinutes = parseInt(session.break_duration.split(' ')[0]);
            if (!isNaN(breakMinutes)) {
              totalBreakMinutes += breakMinutes;
            }
          }
        });

        return {
          ...record,
          total_worked_time: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
          total_break_time: `${Math.floor(totalBreakMinutes / 60)}h ${totalBreakMinutes % 60}m`,
          total_hours: totalMinutes / 60
        };
      })
    };
  } catch (error) {
    console.error('Error in getTodayAttendanceSummary:', error);
    // Return default values in case of error
    return {
      totalEmployees: 0,
      presentCount: 0,
      checkedOutCount: 0,
      absentCount: 0,
      stillWorking: 0,
      absentRate: '0.0',
      presentRate: '0.0',
      records: []
    };
  }
};

// Export additional utility functions
export const setupAttendanceConstraints = async () => {
  try {
    console.log('Attendance constraints setup completed');
    return true;
  } catch (error) {
    console.error('Failed to setup attendance constraints:', error);
    return false;
  }
};

// Auto Report Scheduling Function
export const setupAutoReportScheduling = async (): Promise<void> => {
  try {
    // Placeholder for auto report scheduling logic
    console.log('Auto report scheduling initialized');
    
    // Example: Set up periodic attendance summary generation
    const generateSummaryPeriodically = () => {
      // Run summary generation every 30 minutes
      setInterval(async () => {
        try {
          const summary = await getTodayAttendanceSummary();
          
          // Optional: Send summary via WhatsApp or other notification method
          await autoShareAttendanceSummary();
        } catch (error) {
          console.error('Error in periodic summary generation:', error);
        }
      }, 30 * 60 * 1000); // 30 minutes
    };

    generateSummaryPeriodically();
  } catch (error) {
    console.error('Failed to setup auto report scheduling:', error);
  }
};

// Auto Report Sharing Function
export const autoShareAttendanceSummary = async (): Promise<string | false> => {
  try {
    // Fetch summary and admin settings concurrently
    const [summary, { whatsapp_number, is_whatsapp_share_enabled }] = await Promise.all([
      getTodayAttendanceSummary(),
      getAdminContactInfo()
    ]);

    if (!is_whatsapp_share_enabled || !whatsapp_number) {
      console.log('WhatsApp sharing is disabled or no numbers configured');
      return false;
    }

    // Format date
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    const formattedDate = new Date().toLocaleDateString('en-US', dateOptions);

    // Compute percentages
    const onTimePercentage = (100 - parseFloat(summary.lateRate)).toFixed(1);
    const latePercentage = summary.lateRate;
    const absentPercentage = summary.absentRate;

    // Create summary message
    const message = 
`🏢 *ATTENDANCE SUMMARY*
📅 ${formattedDate}

👥 Total Employees: ${summary.totalEmployees}
✅ Present: ${summary.presentCount} (${onTimePercentage}%)
⏰ Late: ${summary.lateCount} (${latePercentage}%)
❌ Absent: ${summary.absentCount} (${absentPercentage}%)

📊 Attendance Rate: ${summary.totalPresentRate}%
🕒 Currently Working: ${summary.stillWorking}

🤖 Generated by Attendance System`;

    // Process WhatsApp number
    const number = whatsapp_number.trim().replace(/\D/g, '');
    
    // Ensure proper number format
    let formattedNumber = number.startsWith('0') 
      ? '94' + number.substring(1)
      : number.startsWith('94') 
        ? number 
        : '94' + number;

    // Create WhatsApp URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedNumber}&text=${encodedMessage}`;
    
    return whatsappUrl;
  } catch (error) {
    console.error('Error in autoShareAttendanceSummary:', error);
    return false;
  }
};

// Remove the previous export statements and keep the function definitions
export const recordAttendanceCheckIn = async (employeeId: string) => {
  try {
    const result = await recordAttendance(employeeId);
    return result;
  } catch (error) {
    console.error('Check-in error:', error);
    throw error;
  }
};

export const determineNextAttendanceAction = async (employeeId: string) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('attendance')
      .select('check_in_time, check_out_time')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // No record for today, allow check-in
      return 'check-in';
    }

    // If no check-out time exists, prevent another check-in
    if (!data.check_out_time) {
      throw new Error('You have already checked in today. Please check out at the end of your day.');
    }

    // If checked out, allow check-in for the next day
    return 'check-in';
  } catch (error) {
    console.error('Error determining attendance action:', error);
    return 'check-in';
  }
};

export const singleScanAttendance = async (employeeId: string) => {
  try {
    // Perform attendance action (check-in or check-out)
    const { data: result, error } = await supabase.rpc('process_double_attendance', { 
      p_employee_id: employeeId,
      p_current_time: new Date().toISOString()
    });
    
    if (error) {
      console.error('Attendance processing error:', error);
      throw new Error(error.message || 'Failed to process attendance');
    }
    
    if (!result) {
      throw new Error('No response from attendance processor');
    }

    // Check if the result indicates an error
    if (result.status === 'Error') {
      throw new Error(result.message || 'Failed to process attendance');
    }
    
    // Fetch employee name for the result
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('name')
      .eq('id', employeeId)
      .single();

    if (employeeError) {
      console.error('Error fetching employee data:', employeeError);
    }

    // Return the result with employee name
    return {
      ...result,
      employeeName: employeeData?.name || 'Unknown Employee',
      timestamp: result.timestamp || new Date().toISOString(),
      status: result.status || 'present'
    };
  } catch (error) {
    console.error('Single scan attendance error:', error);
    throw error;
  }
};

export const deleteAttendanceRecord = async (recordId: string, deletionType: 'first_check_in' | 'first_check_out' | 'second_check_in' | 'second_check_out' | 'complete') => {
  try {
    // Call the handle_selective_deletion function
    const { data, error } = await supabase
      .rpc('handle_selective_deletion', {
        p_record_id: recordId,
        p_deletion_type: deletionType
      });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || 'Failed to delete record');
    }

    // Return the result with the updated record if it's a partial deletion
      return {
      success: true,
      message: data.message,
      isCompletelyDeleted: deletionType === 'complete' || !data.record,
      updatedRecord: data.record
    };
  } catch (error) {
    console.error('Error in deleteAttendanceRecord:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete record');
  }
};

export const deleteAttendance = async (recordIds: string[]) => {
  try {
    const { data, error } = await supabase
      .rpc('bulk_delete_attendance', {
        p_record_ids: recordIds
      });

    if (error) throw error;

    return {
      success: true,
      deletedCount: recordIds.length,
      message: 'Records deleted successfully'
    };
  } catch (error) {
    console.error('Error in deleteAttendance:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete records');
  }
};

export const getAdminContactInfo = async (): Promise<AdminContactInfo> => {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('whatsapp_number, is_whatsapp_share_enabled')
      .single();

    if (error) {
      console.error('Error fetching admin contact info:', error);
      return {
        whatsapp_number: '',
        is_whatsapp_share_enabled: false
      };
    }

    return {
      whatsapp_number: data?.whatsapp_number || '',
      is_whatsapp_share_enabled: data?.is_whatsapp_share_enabled || false
    };
  } catch (error) {
    console.error('Unexpected error in getAdminContactInfo:', error);
    return {
      whatsapp_number: '',
      is_whatsapp_share_enabled: false
    };
  }
};

export const saveAdminContactInfo = async (
  whatsappNumber: string, 
  isWhatsappShareEnabled: boolean,
  settingsData?: Record<string, any>
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        whatsapp_number: whatsappNumber,
        is_whatsapp_share_enabled: isWhatsappShareEnabled,
        ...settingsData
      }, {
        onConflict: 'whatsapp_number'
      });

    if (error) {
      console.error('Error saving admin contact info:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Unexpected error in saveAdminContactInfo:', error);
    return false;
  }
};

// Manual Check-out Function
export const manualCheckOut = async (employeeId: string) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Fetch today's attendance record for this employee
    const { data: todayRecords, error: recordError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recordError || !todayRecords) {
      throw new AttendanceError('No check-in record found for today');
    }

    // Ensure the record hasn't been checked out already
    if (todayRecords.second_check_out_time) {
      throw new AttendanceError('You have already completed your attendance for today');
    }

    // If first check-in exists but no first check-out
    if (!todayRecords.first_check_out_time) {
      // Check if 5 minutes have passed since first check-in
      const firstCheckInTime = new Date(todayRecords.first_check_in_time);
      const minCheckOutTime = new Date(firstCheckInTime.getTime() + 5 * 60 * 1000);
    if (now < minCheckOutTime) {
        throw new AttendanceError('Cannot check out less than 5 minutes after first check-in');
      }

      // Record first check-out
      const { data: result } = await supabase.rpc('process_double_attendance', { 
        p_employee_id: employeeId,
        p_current_time: new Date().toISOString()
      }) as unknown as { data: any };

      return result;
    }

    // If first check-out exists but no second check-in
    if (!todayRecords.second_check_in_time) {
      // Check if 3 minutes have passed since first check-out
      const firstCheckOutTime = new Date(todayRecords.first_check_out_time);
      const minSecondCheckInTime = new Date(firstCheckOutTime.getTime() + 3 * 60 * 1000);
      if (now < minSecondCheckInTime) {
        throw new AttendanceError('Please wait 3 minutes before second check-in');
      }

      // Record second check-in
      const { data: result } = await supabase.rpc('process_double_attendance', { 
        p_employee_id: employeeId,
        p_current_time: new Date().toISOString()
      }) as unknown as { data: any };

      return result;
    }

    // If second check-in exists but no second check-out
    if (!todayRecords.second_check_out_time) {
      // Record second check-out
      const { data: result } = await supabase.rpc('process_double_attendance', { 
        p_employee_id: employeeId,
        p_current_time: new Date().toISOString()
      }) as unknown as { data: any };

      return result;
    }

    throw new AttendanceError('Invalid attendance state');
  } catch (error) {
    console.error('Manual Check-out Error:', error);
    throw error;
  }
};

// Update the calculateWorkingTime function to handle sessions
export const calculateWorkingTime = (record: Attendance): string => {
  let totalMinutes = 0;

  // Calculate time for the current session
  if (record.first_check_in_time && record.first_check_out_time) {
    const start = new Date(record.first_check_in_time);
    const end = new Date(record.first_check_out_time);
    totalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  }

  // For first sessions, we're done
  // For second sessions, we need to add the previous session's time
  if (record.is_second_session && record.previous_session) {
    const prevSession = record.previous_session;
    if (prevSession.first_check_in_time && prevSession.first_check_out_time) {
      const start = new Date(prevSession.first_check_in_time);
      const end = new Date(prevSession.first_check_out_time);
      totalMinutes += Math.round((end.getTime() - start.getTime()) / 60000);
    }
  }

    const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
};

export const calculateTotalWorkingTime = (record: Attendance): string => {
  let totalMinutes = 0;
  
  // Calculate first session
  if (record.first_check_in_time && record.first_check_out_time) {
    const firstSession = differenceInMinutes(
      new Date(record.first_check_out_time),
      new Date(record.first_check_in_time)
    );
    totalMinutes += firstSession;
  }
  
  // Calculate second session if exists
  if (record.is_second_session && record.second_check_in_time && record.second_check_out_time) {
    const secondSession = differenceInMinutes(
      new Date(record.second_check_out_time),
      new Date(record.second_check_in_time)
    );
    totalMinutes += secondSession;
  }
  
    const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
    
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};