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
  AttendanceAction, 
  Employee, 
  Roster, 
  RosterAttendance, 
  AdminContactInfo
} from '@/types';
import Swal from 'sweetalert2';

// Using AdminContactInfo from types

// Custom Error Class for Attendance-related Errors
export class AttendanceError extends Error {
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

// Calculate session metrics utility
const calculateSessionMetrics = (
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
export const recordAttendance = async (employeeId: string): Promise<any> => {
  try {
    // First get the employee's roster
    const roster = await getEmployeeRoster(employeeId);
    if (!roster || !roster.id) {
      throw new AttendanceError(
        'No active roster found for employee',
        'ROSTER_ERROR',
        { employeeId }
      );
    }

    // Call the database function to process attendance
    const { data: result, error } = await supabase.rpc('process_roster_attendance', { 
      p_employee_id: employeeId,
      p_current_time: new Date().toISOString(),
      p_roster_id: roster.id
    });

    if (error) {
      console.error('Error processing attendance:', error);
      // Check if it's a roster-related error
      if (error.message.includes('roster_id')) {
        throw new AttendanceError(
          'Invalid roster configuration',
          'ROSTER_ERROR',
          { employeeId, rosterId: roster.id }
        );
      }
      throw new AttendanceError(`Failed to process attendance: ${error.message}`);
      }

    if (!result) {
      throw new AttendanceError('No response from attendance processor');
    }

    // Get employee details
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', employeeId)
      .single();

    if (employeeError) {
      console.error('Error fetching employee details:', employeeError);
      throw new AttendanceError('Failed to fetch employee details');
    }

    // Return the processed attendance record with additional info
    return {
      ...result,
      employeeName: employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown',
      timestamp: new Date().toISOString(),
      rosterId: roster.id // Include roster ID in response
    };
  } catch (error) {
    console.error('Error recording attendance:', error);
    if (error instanceof AttendanceError) {
    throw error;
    }
    throw new AttendanceError(
      error instanceof Error ? error.message : 'Failed to record attendance',
      'ATTENDANCE_ERROR'
    );
  }
};

// Helper functions for attendance calculations
const calculateLateness = (currentTime: Date, rosterStartTime: string, gracePeriod: number): number => {
  const [hours, minutes] = rosterStartTime.split(':').map(Number);
  const startTime = new Date(currentTime);
  startTime.setHours(hours, minutes, 0, 0);
  
  const lateMinutes = Math.floor((currentTime.getTime() - startTime.getTime()) / (1000 * 60));
  return Math.max(0, lateMinutes - gracePeriod);
};

const calculateEarlyDeparture = (currentTime: Date, rosterEndTime: string, threshold: number): number => {
  const [hours, minutes] = rosterEndTime.split(':').map(Number);
  const endTime = new Date(currentTime);
  endTime.setHours(hours, minutes, 0, 0);
  
  const earlyMinutes = Math.floor((endTime.getTime() - currentTime.getTime()) / (1000 * 60));
  return Math.max(0, earlyMinutes - threshold);
};

const calculateExpectedHours = (startTime: string, endTime: string, breakDuration: number): number => {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  const totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes) - breakDuration;
  return Math.max(0, totalMinutes / 60);
};

const calculateActualHours = (record: any, currentTime: Date, breakDuration: number): number => {
  if (!record?.first_check_in_time) return 0;
  
  let totalMinutes = 0;
  const firstCheckIn = new Date(record.first_check_in_time);
  
  if (record.first_check_out_time) {
    const firstCheckOut = new Date(record.first_check_out_time);
    totalMinutes += Math.floor((firstCheckOut.getTime() - firstCheckIn.getTime()) / (1000 * 60));
  }
  
  if (record.second_check_in_time) {
    const secondCheckIn = new Date(record.second_check_in_time);
    if (record.second_check_out_time) {
      const secondCheckOut = new Date(record.second_check_out_time);
      totalMinutes += Math.floor((secondCheckOut.getTime() - secondCheckIn.getTime()) / (1000 * 60));
    } else {
      totalMinutes += Math.floor((currentTime.getTime() - secondCheckIn.getTime()) / (1000 * 60));
    }
  }
  
  return Math.max(0, (totalMinutes - breakDuration) / 60);
};

const calculateWorkingDuration = (record: any): string | null => {
  let totalMinutes = 0;

  // Calculate first session duration
  if (record.first_check_in_time && record.first_check_out_time) {
    const firstStart = new Date(record.first_check_in_time);
    const firstEnd = new Date(record.first_check_out_time);
    totalMinutes += (firstEnd.getTime() - firstStart.getTime()) / (1000 * 60);
  }

  // Calculate second session duration
  if (record.second_check_in_time && record.second_check_out_time) {
    const secondStart = new Date(record.second_check_in_time);
    const secondEnd = new Date(record.second_check_out_time);
    totalMinutes += (secondEnd.getTime() - secondStart.getTime()) / (1000 * 60);
  }

  if (totalMinutes === 0) return null;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${hours}h ${minutes}m`;
};

// Fetch Attendance Records
export const getAttendanceRecords = async (): Promise<Attendance[]> => {
  try {
    console.log('Fetching attendance records...');
    
    // First check if the table exists and has the correct structure
    const { error: tableCheckError } = await supabase
      .from('attendance')
      .select('id')
      .limit(1);

    if (tableCheckError) {
      console.error('Table check error:', tableCheckError);
      throw new Error('Attendance table not found or inaccessible');
    }

    // Fetch attendance records with all necessary fields
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        employee_id,
        roster_id,
        date,
        first_check_in_time,
        first_check_out_time,
        second_check_in_time,
        second_check_out_time,
        status,
        minutes_late,
        early_departure_minutes,
        break_duration,
        expected_hours,
        actual_hours,
        last_action,
        created_at,
        updated_at,
        employees!inner (
          id,
          first_name,
          last_name,
          email,
          department_id,
          position,
          status,
          join_date,
          phone,
          departments:department_id (
            id,
            name
          )
        ),
        rosters!inner (
          id,
          name,
          start_time,
          end_time,
          break_start,
          break_end,
          break_duration,
          grace_period,
          early_departure_threshold
        )
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error fetching attendance records:', error);
      throw new Error('Failed to fetch attendance records');
    }

    if (!data || data.length === 0) {
      console.log('No attendance records found');
      return [];
    }

    console.log('Successfully fetched attendance records:', {
      count: data.length,
      sampleRecord: data[0]
    });

    // Process and normalize the records
    const processedRecords = data.map(record => {
      // Calculate working duration if not provided
      const workingDuration = record.actual_hours 
        ? `${Math.floor(record.actual_hours)}h ${Math.round((record.actual_hours % 1) * 60)}m`
        : calculateWorkingTime({
            first_check_in_time: record.first_check_in_time,
            first_check_out_time: record.first_check_out_time,
            second_check_in_time: record.second_check_in_time,
            second_check_out_time: record.second_check_out_time
          });

      // Determine the current action based on check-in/out state
      let action: AttendanceAction = 'first_check_in';
      if (record.first_check_in_time && !record.first_check_out_time) {
        action = 'first_check_out';
      } else if (record.first_check_out_time && !record.second_check_in_time) {
        action = 'second_check_in';
      } else if (record.second_check_in_time && !record.second_check_out_time) {
        action = 'second_check_out';
      }

      return {
        id: record.id,
        employee_id: record.employee_id,
        roster_id: record.roster_id,
        employee_name: `${record.employees.first_name} ${record.employees.last_name}`,
        employee: {
          id: record.employees.id,
          name: `${record.employees.first_name} ${record.employees.last_name}`,
          first_name: record.employees.first_name,
          last_name: record.employees.last_name,
          email: record.employees.email,
          department: record.employees.departments?.name || 'Unassigned',
          position: record.employees.position,
          status: record.employees.status as 'active' | 'inactive',
          join_date: record.employees.join_date,
          phone: record.employees.phone
        },
        date: record.date,
        first_check_in_time: record.first_check_in_time,
        first_check_out_time: record.first_check_out_time,
        second_check_in_time: record.second_check_in_time,
        second_check_out_time: record.second_check_out_time,
        status: record.status,
        minutes_late: record.minutes_late || 0,
        early_departure_minutes: record.early_departure_minutes || 0,
        break_duration: (record.first_check_out_time && record.second_check_in_time) ? (record.break_duration || record.rosters.break_duration || 60) : 0,
        expected_hours: record.expected_hours || 8,
        actual_hours: record.actual_hours || 0,
        working_duration: workingDuration,
        action,
        roster: {
          id: record.rosters.id,
          name: record.rosters.name,
          start_time: record.rosters.start_time,
          end_time: record.rosters.end_time,
          break_start: record.rosters.break_start,
          break_end: record.rosters.break_end,
          break_duration: record.rosters.break_duration,
          grace_period: record.rosters.grace_period,
          early_departure_threshold: record.rosters.early_departure_threshold
        },
        created_at: record.created_at,
        updated_at: record.updated_at
      };
    });

    return processedRecords;
  } catch (error) {
    console.error('Error in getAttendanceRecords:', error);
    throw new Error('Failed to load attendance records. Please try again.');
  }
};

// Get Today's Attendance Summary
export const getTodayAttendanceSummary = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch active employees and today's attendance
    const { data: activeEmployees, error: employeeError } = await supabase
      .from('employees')
      .select('id, status')
      .eq('status', 'active');

    if (employeeError) throw employeeError;

    const totalEmployees = activeEmployees?.length || 0;
    
    // Fetch today's attendance records
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', today);

    if (attendanceError) throw attendanceError;

    // Compute attendance metrics
    const statusCounts = {
      currentlyPresent: 0,
      lateButPresent: 0,
      checkedOut: 0,
      onTimeArrivals: 0,
      absent: 0
    };

    attendanceData?.forEach(record => {
      // Handle first check-in/out sequence
      if (record.first_check_in_time && !record.first_check_out_time) {
        statusCounts.currentlyPresent++;
        if (record.minutes_late > 0) {
          statusCounts.lateButPresent++;
        } else {
          statusCounts.onTimeArrivals++;
        }
      }
      // Handle second check-in/out sequence
      else if (record.second_check_in_time && !record.second_check_out_time) {
        statusCounts.currentlyPresent++;
      }
      // Handle completed attendance
      else if (record.second_check_out_time || (record.first_check_out_time && !record.second_check_in_time)) {
        statusCounts.checkedOut++;
        if (record.minutes_late === 0) {
          statusCounts.onTimeArrivals++;
        }
      }
    });

    // Calculate absent count
    statusCounts.absent = Math.max(0, totalEmployees - (statusCounts.currentlyPresent + statusCounts.checkedOut));

    // Compute rates
    const totalPresent = statusCounts.currentlyPresent + statusCounts.checkedOut;
    const rates = {
      currentPresenceRate: totalEmployees > 0 
        ? ((statusCounts.currentlyPresent / totalEmployees) * 100).toFixed(1) 
        : '0.0',
      
      totalPresentRate: totalEmployees > 0 
        ? ((totalPresent / totalEmployees) * 100).toFixed(1) 
        : '0.0',
      
      onTimeRate: totalPresent > 0 
        ? ((statusCounts.onTimeArrivals / totalPresent) * 100).toFixed(1) 
        : '0.0',
      
      lateRate: totalPresent > 0 
        ? ((statusCounts.lateButPresent / totalPresent) * 100).toFixed(1) 
        : '0.0',
      
      absentRate: totalEmployees > 0 
        ? ((statusCounts.absent / totalEmployees) * 100).toFixed(1) 
        : '0.0'
    };

    // Calculate detailed metrics
    const detailed = {
      onTime: statusCounts.onTimeArrivals,
      lateArrivals: statusCounts.lateButPresent,
      veryLate: attendanceData?.filter(r => r.minutes_late > 30).length || 0,
      halfDay: attendanceData?.filter(r => {
        const workDuration = r.total_worked_time ? parseFloat(r.total_worked_time) : 0;
        return workDuration > 0 && workDuration < 4;
      }).length || 0,
      earlyDepartures: attendanceData?.filter(r => r.status === 'early_departure').length || 0,
      overtime: attendanceData?.filter(r => {
        const workDuration = r.total_worked_time ? parseFloat(r.total_worked_time) : 0;
        return workDuration > 8;
      }).length || 0,
      regularHours: attendanceData?.reduce((sum, r) => sum + (parseFloat(r.total_worked_time) || 0), 0) || 0,
      attendanceRate: rates.totalPresentRate,
      efficiencyRate: ((statusCounts.onTimeArrivals / totalEmployees) * 100).toFixed(1),
      punctualityRate: rates.onTimeRate
    };

    return {
      totalEmployees,
      presentCount: statusCounts.currentlyPresent,
      lateCount: statusCounts.lateButPresent,
      absentCount: statusCounts.absent,
      checkedOutCount: statusCounts.checkedOut,
      onTime: statusCounts.onTimeArrivals,
      stillWorking: statusCounts.currentlyPresent,
      
      currentPresenceRate: rates.currentPresenceRate,
      totalPresentRate: rates.totalPresentRate,
      presentRate: rates.totalPresentRate, // Add alias for compatibility
      onTimeRate: rates.onTimeRate,
      lateRate: rates.lateRate,
      absentRate: rates.absentRate,
      
      detailed,
      
      presenceBreakdown: {
        currentlyPresent: statusCounts.currentlyPresent,
        lateButPresent: statusCounts.lateButPresent,
        checkedOut: statusCounts.checkedOut,
        onTimeArrivals: statusCounts.onTimeArrivals,
        absent: statusCounts.absent
      }
    };
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    
    // Return a default empty summary object with proper formatting
    return {
      totalEmployees: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      checkedOutCount: 0,
      onTime: 0,
      stillWorking: 0,
      currentPresenceRate: '0.0',
      totalPresentRate: '0.0',
      presentRate: '0.0', // Add alias for compatibility
      onTimeRate: '0.0',
      lateRate: '0.0',
      absentRate: '0.0',
      detailed: {
        onTime: 0,
        lateArrivals: 0,
        veryLate: 0,
        halfDay: 0,
        earlyDepartures: 0,
        overtime: 0,
        regularHours: 0,
        attendanceRate: '0.0',
        efficiencyRate: '0.0',
        punctualityRate: '0.0'
      },
      presenceBreakdown: {
        currentlyPresent: 0,
        lateButPresent: 0,
        checkedOut: 0,
        onTimeArrivals: 0,
        absent: 0
      }
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
    const [summary, adminInfo] = await Promise.all([
      getTodayAttendanceSummary(),
      getAdminContactInfo()
    ]);

    if (!adminInfo.notification_preferences?.whatsapp || !adminInfo.whatsapp) {
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

    // Create comprehensive summary message
    const message = 
`🏢 *COMPREHENSIVE ATTENDANCE REPORT*
━━━━━━━━━━━━━━━━━━━━━
📅 ${formattedDate}
━━━━━━━━━━━━━━━━━━━━━

📊 *OVERALL SUMMARY*
• Total Employees: ${summary.totalEmployees}
• Currently Present: ${summary.presentCount} 👥
• Late but Present: ${summary.lateCount} ⏰
• Absent: ${summary.absentCount} ❌
• Checked Out: ${summary.checkedOutCount} 🏃

📈 *PERFORMANCE METRICS*
• Attendance Rate: ${summary.totalPresentRate}%
• Punctuality Rate: ${(100 - Number(summary.lateRate)).toFixed(1)}%
• Efficiency Rate: ${summary.detailed.efficiencyRate}%
• Absence Rate: ${summary.absentRate}%

⏰ *DETAILED ATTENDANCE*
• On Time Arrivals: ${summary.detailed.onTime} ✅
• Late Arrivals: ${summary.detailed.lateArrivals} ⏰
• Very Late (>30min): ${summary.detailed.veryLate} ⚠️
• Half Day: ${summary.detailed.halfDay} 📅
• Early Departures: ${summary.detailed.earlyDepartures} 🚶
• Working Overtime: ${summary.detailed.overtime} 💪

💼 *CURRENT WORKPLACE STATUS*
• Still Working: ${summary.stillWorking}
• Currently Present: ${summary.presenceBreakdown.currentlyPresent}
• Late but Present: ${summary.presenceBreakdown.lateButPresent}
• Checked Out: ${summary.presenceBreakdown.checkedOut}

⚡ *PRODUCTIVITY METRICS*
• Regular Hours Worked: ${summary.detailed.regularHours.toFixed(1)}h
• Attendance Rate: ${summary.detailed.attendanceRate}%
• Efficiency Rate: ${summary.detailed.efficiencyRate}%
• Punctuality Rate: ${summary.detailed.punctualityRate}%

⚠️ *ATTENTION REQUIRED*
${summary.lateCount > 0 ? `• Late Arrivals: ${summary.lateCount} staff\n` : ''}${summary.detailed.veryLate > 0 ? `• Very Late Arrivals: ${summary.detailed.veryLate} staff\n` : ''}${summary.absentCount > 0 ? `• Unplanned Absences: ${summary.absentCount} staff\n` : ''}${summary.detailed.earlyDepartures > 0 ? `• Early Departures: ${summary.detailed.earlyDepartures} staff\n` : ''}${summary.detailed.halfDay > 0 ? `• Half Day: ${summary.detailed.halfDay} staff\n` : ''}

Generated by QR Attendance System
Time: ${new Date().toLocaleTimeString()}
━━━━━━━━━━━━━━━━━━━━━`;

    // Process WhatsApp number
    const number = adminInfo.whatsapp.trim().replace(/\D/g, '');
    
    // Ensure proper number format
    const formattedNumber = number.startsWith('0') 
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
    // First validate that the employee exists
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, first_name, last_name, status')
      .eq('id', employeeId)
      .single();

    if (employeeError || !employee) {
      throw new Error('Employee not found or invalid employee ID');
    }

    if (employee.status !== 'active') {
      throw new Error('Employee is not active in the system');
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Check for existing attendance record
    const { data: existingRecord, error: existingError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .order('created_at', { ascending: false })
      .maybeSingle();
    
    if (existingError) {
      console.error('Error checking existing attendance:', existingError);
      throw new Error('Failed to check existing attendance');
    }

    // Determine the next action based on existing record
    let nextAction = 'FIRST_CHECK_IN';
    if (existingRecord) {
      if (!existingRecord.first_check_out_time) {
        nextAction = 'FIRST_CHECK_OUT';
      } else if (!existingRecord.second_check_in_time) {
        nextAction = 'SECOND_CHECK_IN';
      } else if (!existingRecord.second_check_out_time) {
        nextAction = 'SECOND_CHECK_OUT';
      } else {
        throw new Error('All attendance actions completed for today');
      }
    }

    // Process the attendance based on the next action
    let result;
    const currentTime = new Date().toISOString();

    if (nextAction === 'FIRST_CHECK_IN') {
      const { data, error } = await supabase
        .from('attendance')
        .insert({
          employee_id: employeeId,
          date: today,
          first_check_in_time: currentTime,
          status: 'PRESENT',
          is_second_session: false
        })
        .select()
        .single();

      if (error) throw new Error('Failed to record first check-in');
      result = data;
    } else {
      // Update existing record
      const updateData = {
        first_check_out_time: nextAction === 'FIRST_CHECK_OUT' ? currentTime : existingRecord.first_check_out_time,
        second_check_in_time: nextAction === 'SECOND_CHECK_IN' ? currentTime : existingRecord.second_check_in_time,
        second_check_out_time: nextAction === 'SECOND_CHECK_OUT' ? currentTime : existingRecord.second_check_out_time,
        status: nextAction === 'SECOND_CHECK_OUT' ? 'COMPLETED' : 
                nextAction === 'FIRST_CHECK_OUT' ? 'ON_BREAK' : 'PRESENT',
        is_second_session: nextAction === 'SECOND_CHECK_IN' || nextAction === 'SECOND_CHECK_OUT'
      };

      const { data, error } = await supabase
        .from('attendance')
        .update(updateData)
        .eq('id', existingRecord.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to record ${nextAction.toLowerCase()}`);
      result = data;
    }

    // Return the result with employee name
    return {
      ...result,
      employeeName: `${employee.first_name} ${employee.last_name}`,
      timestamp: currentTime,
      action: nextAction,
      message: `Successfully recorded ${nextAction.toLowerCase().replace('_', ' ')}`
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

// Get active roster for an employee
export async function getEmployeeRoster(employeeId: string): Promise<any> {
  try {
    // First try to get an existing active roster
    const { data: roster, error } = await supabase
      .from('rosters')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!error && roster) {
      return roster;
    }

    // If no roster exists, get employee details first
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('department_id, position')
      .eq('id', employeeId)
        .single();

    if (employeeError) {
      console.error('Error fetching employee details:', employeeError);
      throw new Error('Failed to fetch employee details');
    }

    // Create a default roster with proper data
    const defaultRoster = {
              name: 'Default Day Shift',
              description: 'Standard 9 AM to 5 PM shift with 1-hour lunch break',
              employee_id: employeeId,
      department_id: employee?.department_id,
      position: employee?.position || 'General',
              start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              start_time: '09:00:00',
              end_time: '17:00:00',
              break_start: '13:00:00',
              break_end: '14:00:00',
              break_duration: 60,
              grace_period: 15,
              early_departure_threshold: 30,
      shift_pattern: '[]',
              is_active: true,
              status: 'active'
    };

    // Insert the new roster
    const { data: newRoster, error: createError } = await supabase
      .from('rosters')
      .insert([defaultRoster])
          .select()
          .single();

        if (createError) {
      console.error('Error creating default roster:', createError);
          throw new Error('Failed to create default roster');
        }

    if (!newRoster) {
      throw new Error('Failed to create roster - no data returned');
        }

        return newRoster;
  } catch (error) {
    console.error('Error in getEmployeeRoster:', error);
    throw new AttendanceError(
      error instanceof Error ? error.message : 'Failed to get or create roster',
      'ROSTER_ERROR'
    );
  }
}

// Mark attendance with roster validation
export const markAttendance = async (
  employeeId: string,
  action: 'check_in' | 'start_break' | 'end_break' | 'check_out',
  deviceInfo?: string,
  location?: string
): Promise<{ success: boolean; message: string; action: string }> => {
  try {
    // First, determine the next valid action for this employee
    const nextAction = await getNextAttendanceAction(employeeId);
    
    // If all attendance is completed for today, return early
    if (nextAction === 'completed') {
    return {
        success: false,
        message: 'All attendance actions completed for today',
        action: 'COMPLETED'
      };
    }

    // Validate that the requested action matches the next valid action
    if (action !== nextAction) {
    return {
        success: false,
        message: `Invalid action. Expected ${nextAction}, but got ${action}`,
        action: nextAction.toUpperCase()
      };
    }

    // Record the attendance
    const result = await recordAttendance(employeeId);

    if (!result) {
      return {
        success: false,
        message: 'Failed to record attendance',
        action: nextAction.toUpperCase()
      };
    }

    // Log the successful attendance
    attendanceLogger.log(
      action === 'check_out' ? 'check-out' : 'check-in',
      employeeId,
      { deviceInfo, location, action }
    );

    return {
      success: true,
      message: `Successfully recorded ${action}`,
      action: action.toUpperCase()
    };
  } catch (error) {
    console.error('Error in markAttendance:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      action: 'CHECK_IN' // Default to CHECK_IN on error
    };
  }
};

// Format working duration in hours and minutes
const formatWorkingDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

// Get admin contact info
export const getAdminContactInfo = async (): Promise<AdminContactInfo> => {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('email, phone, whatsapp, telegram, notification_preferences')
      .single();

    if (error) {
      console.error('Error fetching admin contact info:', error);
      return {
        email: '',
        notification_preferences: {
          email: false,
          sms: false,
          whatsapp: false,
          telegram: false
        }
      };
    }

  return data as AdminContactInfo;
};

// Calculate attendance metrics for reporting
export const calculateAttendanceMetrics = async (
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalDays: number;
  daysPresent: number;
  daysAbsent: number;
  totalLateMinutes: number;
  totalEarlyDepartureMinutes: number;
  averageWorkingHours: number;
  rosterComplianceRate: number;
  attendancePercentage: number;
}> => {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
      id,
      date,
      minutes_late,
      early_departure_minutes,
      actual_hours,
      expected_hours,
      compliance_rate
    `)
      .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

    if (error) {
    throw new Error('Error fetching attendance metrics');
    }

  const metrics = data.reduce((acc, record) => {
    acc.totalLateMinutes += record.minutes_late || 0;
    acc.totalEarlyDepartureMinutes += record.early_departure_minutes || 0;
    acc.totalActualHours += record.actual_hours || 0;
    acc.totalExpectedHours += record.expected_hours || 0;
    acc.totalComplianceRate += record.compliance_rate || 0;
    acc.daysPresent += 1;
    return acc;
  }, {
    totalLateMinutes: 0,
    totalEarlyDepartureMinutes: 0,
    totalActualHours: 0,
    totalExpectedHours: 0,
    totalComplianceRate: 0,
    daysPresent: 0
  });

  // Calculate total working days in the date range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
    totalDays,
    daysPresent: metrics.daysPresent,
    daysAbsent: totalDays - metrics.daysPresent,
    totalLateMinutes: metrics.totalLateMinutes,
    totalEarlyDepartureMinutes: metrics.totalEarlyDepartureMinutes,
    averageWorkingHours: metrics.daysPresent ? metrics.totalActualHours / metrics.daysPresent : 0,
    rosterComplianceRate: metrics.daysPresent ? metrics.totalComplianceRate / metrics.daysPresent : 0,
    attendancePercentage: (metrics.daysPresent / totalDays) * 100
  };
};

// Get effective status based on minutes_late and current status
export const getEffectiveStatus = (record: {
  status?: string;
  minutes_late?: number;
}): string => {
  // If employee is late (more than 0 minutes), show as "Late"
  if (record.minutes_late && record.minutes_late > 0) {
    return 'Late';
  }
  
  // Otherwise, return the original status or a formatted version
  const status = record.status;
  if (!status) return 'Present';
  
  // Format common status values for better display
  switch (status.toUpperCase()) {
    case 'PRESENT':
    case 'CHECKED_IN':
    case 'FIRST_SESSION_ACTIVE':
    case 'SECOND_SESSION_ACTIVE':
      return record.minutes_late && record.minutes_late > 0 ? 'Late' : 'Present';
    case 'COMPLETED':
    case 'CHECKED_OUT':
    case 'FIRST_CHECK_OUT':
    case 'SECOND_CHECK_OUT':
      return record.minutes_late && record.minutes_late > 0 ? 'Late' : 'Present';
    case 'ON_BREAK':
      return record.minutes_late && record.minutes_late > 0 ? 'Late' : 'On Break';
    case 'ABSENT':
      return 'Absent';
    default:
      return record.minutes_late && record.minutes_late > 0 ? 'Late' : status;
  }
};

// Calculate working time for an attendance record
export const calculateWorkingTime = (record: {
  first_check_in_time?: string | null;
  first_check_out_time?: string | null;
  second_check_in_time?: string | null;
  second_check_out_time?: string | null;
  break_duration?: number | null;
}): string => {
  if (!record.first_check_in_time) {
    return '0h';
  }

  const now = new Date();
  let totalMinutes = 0;

  // Calculate first session duration
  const firstCheckIn = new Date(record.first_check_in_time);
  const firstCheckOut = record.first_check_out_time ? new Date(record.first_check_out_time) : null;

  if (firstCheckOut) {
    totalMinutes += (firstCheckOut.getTime() - firstCheckIn.getTime()) / (1000 * 60);
  } else {
    // Ongoing first session
    totalMinutes += (now.getTime() - firstCheckIn.getTime()) / (1000 * 60);
    return `${Math.max(0, Math.round(totalMinutes / 60))}h`;
  }

  // Calculate second session duration if exists
  if (record.second_check_in_time) {
    const secondCheckIn = new Date(record.second_check_in_time);
    const secondCheckOut = record.second_check_out_time ? new Date(record.second_check_out_time) : now;
    totalMinutes += (secondCheckOut.getTime() - secondCheckIn.getTime()) / (1000 * 60);
  }

  // Subtract break duration if available and both sessions exist
  if (record.break_duration && record.first_check_out_time && record.second_check_in_time) {
    totalMinutes -= record.break_duration;
  }

  return `${Math.max(0, Math.round(totalMinutes / 60))}h`;
};

// Create a test attendance record for testing purposes
export const createTestAttendanceRecord = (
  employeeId: string,
  options: {
    date?: string;
    firstCheckIn?: string;
    firstCheckOut?: string;
    secondCheckIn?: string;
    secondCheckOut?: string;
    status?: 'present' | 'checked-out';
    minutesLate?: number;
    earlyDeparture?: boolean;
  } = {}
) => {
  const now = new Date();
  const defaultDate = now.toISOString().split('T')[0];
  
  return {
    id: `test-${Date.now()}`,
    employee_id: employeeId,
    date: options.date || defaultDate,
    first_check_in_time: options.firstCheckIn || now.toISOString(),
    first_check_out_time: options.firstCheckOut || null,
    second_check_in_time: options.secondCheckIn || null,
    second_check_out_time: options.secondCheckOut || null,
    status: options.status || 'present',
    minutes_late: options.minutesLate || 0,
    early_departure: options.earlyDeparture || false,
    working_duration: calculateWorkingTime({
      first_check_in_time: options.firstCheckIn,
      first_check_out_time: options.firstCheckOut,
      second_check_in_time: options.secondCheckIn,
      second_check_out_time: options.secondCheckOut
    }),
    sequence_number: options.secondCheckIn ? 2 : 1,
    is_second_session: !!options.secondCheckIn
  };
};

// Delete an attendance record
export const deleteAttendance = async (
  attendanceId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    // Get the attendance record first to check its status
    const { data: record, error: fetchError } = await supabase
      .from('attendance')
      .select('*')
      .eq('id', attendanceId)
      .single();

    if (fetchError) {
      throw new Error('Failed to fetch attendance record');
    }

    if (!record) {
    return {
        success: false,
        message: 'Attendance record not found'
      };
    }

    // Delete the attendance record
    const { error: deleteError } = await supabase
      .from('attendance')
      .delete()
      .eq('id', attendanceId);

    if (deleteError) {
      throw new Error('Failed to delete attendance record');
    }

    // Log the deletion
    attendanceLogger.log('error', record.employee_id, {
      action: 'delete',
      record_id: attendanceId,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: 'Attendance record deleted successfully'
    };
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete attendance record'
    };
    }
};

// Save admin contact information
export const saveAdminContactInfo = async (
  contactInfo: AdminContactInfo
): Promise<{ success: boolean; message: string }> => {
  try {
    // First check if a record exists
    const { data: existingData, error: fetchError } = await supabase
      .from('admin_settings')
      .select('id')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means no rows returned
      throw new Error('Failed to check existing settings');
      }

    let result;
    if (existingData?.id) {
      // Update existing record
      result = await supabase
        .from('admin_settings')
          .update({
          email: contactInfo.email,
          phone: contactInfo.phone,
          whatsapp: contactInfo.whatsapp,
          telegram: contactInfo.telegram,
          notification_preferences: contactInfo.notification_preferences,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingData.id);
      } else {
      // Insert new record
      result = await supabase
        .from('admin_settings')
        .insert({
          ...contactInfo,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }

    if (result.error) {
      throw new Error('Failed to save admin contact information');
    }

    return {
      success: true,
      message: 'Admin contact information saved successfully'
    };
  } catch (error) {
    console.error('Error saving admin contact info:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save admin contact information'
    };
  }
};

interface AttendanceSession {
  first_check_in_time: string | null;
  first_check_out_time: string | null;
  second_check_in_time: string | null;
  second_check_out_time: string | null;
}

export const getNextAttendanceAction = async (employeeId: string): Promise<'first_check_in' | 'first_check_out' | 'second_check_in' | 'second_check_out' | 'completed'> => {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const { data: record, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle();

    if (error) {
      console.error('Database error in getNextAttendanceAction:', error);
      return 'first_check_in';
    }

    // No record exists - start with first check in
    if (!record) {
      return 'first_check_in';
    }

    // Determine next action based on existing timestamps
    if (!record.first_check_in_time) {
      return 'first_check_in';
    }
    
    if (!record.first_check_out_time) {
      return 'first_check_out';
    }
    
    if (!record.second_check_in_time) {
      return 'second_check_in';
    }
    
    if (!record.second_check_out_time) {
      return 'second_check_out';
    }

    return 'completed';
  } catch (error) {
    console.error('Error in getNextAttendanceAction:', error);
    return 'first_check_in';
  }
};

export const getCurrentAttendanceState = async (employeeId: string): Promise<'not_checked_in' | 'first_checked_in' | 'first_checked_out' | 'second_checked_in' | 'second_checked_out'> => {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const { data: record, error } = await supabase
          .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle();

    if (error || !record) {
      return 'not_checked_in';
    }

    if (record.second_check_out_time) {
      return 'second_checked_out';
    }
    
    if (record.second_check_in_time) {
      return 'second_checked_in';
    }
    
    if (record.first_check_out_time) {
      return 'first_checked_out';
    }
    
    if (record.first_check_in_time) {
      return 'first_checked_in';
    }

    return 'not_checked_in';
  } catch (error) {
    console.error('Error in getCurrentAttendanceState:', error);
    return 'not_checked_in';
  }
};

// Helper function to format duration
export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};