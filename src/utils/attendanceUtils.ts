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

// Define AdminContactInfo interface locally
interface AdminContactInfo {
  whatsapp_number: string;
  is_whatsapp_share_enabled: boolean;
}

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
    // Validate employee and check existing records in parallel
    const [employeeResult, existingRecordResult] = await Promise.all([
      supabase
        .from('employees')
        .select('id, name, status')
        .or(`id.eq.${qrData},email.eq.${qrData}`)
        .maybeSingle(),
      supabase
        .rpc('process_double_attendance', { 
          p_employee_id: qrData,
          p_current_time: new Date().toISOString()
        }, {
          head: true
        })
    ]) as [
      PostgrestSingleResponse<{ id: string; name: string; status: string }>,
      { data: ExtendedAttendance; error: null } | { data: null; error: any }
    ];

    if (employeeResult.error || !employeeResult.data) {
      throw new AttendanceError('Invalid or unregistered employee');
    }

    const employeeData = employeeResult.data;
    if (employeeData.status !== 'active') {
      throw new AttendanceError('Employee is not currently active');
    }

    if (existingRecordResult.error || !existingRecordResult.data) {
      // Check if it's an invalid UUID format error
      if (existingRecordResult.error?.message?.includes('Invalid employee ID format')) {
        throw new AttendanceError('Invalid QR code format');
      }
      throw new AttendanceError('Failed to process attendance');
    }

    const attendanceResult = existingRecordResult.data;

    // Handle different attendance actions
    switch (attendanceResult.action as 'first_check_in' | 'first_check_out' | 'second_check_in' | 'second_check_out') {
      case 'first_check_in':
      return {
          check_in_time: attendanceResult.timestamp || new Date().toISOString(),
          status: 'present',
          sequence_number: 1,
          action: 'check-in',
          late_duration: 0,
          timestamp: attendanceResult.timestamp
        } as ExtendedWorkTimeInfo;
      
      case 'first_check_out':
        return {
          check_in_time: attendanceResult.first_check_in_time || new Date().toISOString(),
          check_out_time: attendanceResult.timestamp || new Date().toISOString(),
      status: 'present',
          sequence_number: 1,
          action: 'check-out',
          late_duration: 0,
          timestamp: attendanceResult.timestamp
        } as ExtendedWorkTimeInfo;
      
      case 'second_check_in':
    return {
          check_in_time: attendanceResult.timestamp,
          check_out_time: null,
      status: 'present',
          sequence_number: 2,
          action: 'check-in',
          late_duration: 0,
          timestamp: attendanceResult.timestamp,
          break_duration: attendanceResult.break_duration
        } as ExtendedWorkTimeInfo;
      
      case 'second_check_out':
        return {
          check_in_time: attendanceResult.second_check_in_time,
          check_out_time: attendanceResult.timestamp,
          status: 'checked-out',
          sequence_number: 2,
          action: 'check-out',
          late_duration: 0,
          timestamp: attendanceResult.timestamp
        } as ExtendedWorkTimeInfo;
      
      default:
        throw new AttendanceError('Maximum check-ins/check-outs reached');
    }
  } catch (error) {
    console.error('Attendance recording error:', error);
    throw error;
  }
};

// Fetch Attendance Records
export const getAttendanceRecords = async (): Promise<Attendance[]> => {
  try {
    console.log('Fetching attendance records...');
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        employee_id,
        check_in_time,
        check_out_time,
        first_check_in_time,
        first_check_out_time,
        second_check_in_time,
        second_check_out_time,
        break_duration,
        date,
        status,
        total_hours,
        late_duration,
        sequence_number,
        created_at,
        early_departure,
        overtime,
        employee:employees (
          id,
          name,
          department_id,
          departments (
            id,
            name
          )
        )
      `)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Supabase error fetching attendance:', error);
      throw error;
    }

    console.log('Raw attendance data:', data);

    const processedRecords = (data || []).map(record => {
      const status = record.status || 'present';
      const action: AttendanceAction = record.check_out_time ? 'check-out' : 'check-in';

      // Calculate working duration if not provided
      let workingDuration = record.total_hours?.toString() || '0';
      if (!record.total_hours) {
        const minutes = calculateWorkingDuration(
          record.first_check_in_time ? new Date(record.first_check_in_time) : null,
          record.first_check_out_time ? new Date(record.first_check_out_time) : null,
          record.second_check_in_time ? new Date(record.second_check_in_time) : null,
          record.second_check_out_time ? new Date(record.second_check_out_time) : null
        );
        workingDuration = formatWorkingDuration(minutes);
      }

      return {
      id: record.id,
      employee_id: record.employee_id,
      employee_name: (record.employee as any)?.name || 'Unknown',
        employee: {
          id: record.employee_id,
          name: (record.employee as any)?.name || 'Unknown',
          first_name: (record.employee as any)?.first_name || 'Unknown',
          last_name: (record.employee as any)?.last_name || 'Unknown',
          email: (record.employee as any)?.email || 'unknown@example.com',
          department: (record.employee as any)?.departments?.name || null,
          position: (record.employee as any)?.position || 'Unknown',
          status: ((record.employee as any)?.status || 'active') as 'active' | 'inactive',
          join_date: (record.employee as any)?.join_date || new Date().toISOString().split('T')[0],
          phone: (record.employee as any)?.phone || null
        },
      check_in_time: record.check_in_time,
      check_out_time: record.check_out_time,
        first_check_in_time: record.first_check_in_time || record.check_in_time,
        first_check_out_time: record.first_check_out_time || record.check_out_time,
      second_check_in_time: record.second_check_in_time,
      second_check_out_time: record.second_check_out_time,
        break_duration: record.break_duration || 0,
      date: record.date,
        status: status as AttendanceStatus,
        action: action,
        minutes_late: record.late_duration || 0,
        working_duration: workingDuration,
        overtime: record.overtime || 0,
        sequence_number: record.sequence_number || 1,
        is_second_session: !!record.second_check_in_time,
        early_departure: record.early_departure || false
      };
    });

    console.log('Processed attendance records:', processedRecords);
    return processedRecords;
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
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
    // First verify the records exist
    const { data: existingRecords, error: checkError } = await supabase
      .from('attendance')
      .select('id')
      .in('id', recordIds);

    if (checkError) {
      console.error('Error checking records:', checkError);
      throw new Error(checkError.message);
    }

    if (!existingRecords || existingRecords.length === 0) {
      throw new Error('No records found to delete');
    }

    // Use the RPC function for hard delete
    const { data, error } = await supabase
      .rpc('bulk_delete_attendance', {
        p_record_ids: recordIds
      });

    if (error) {
      console.error('Error deleting records:', error);
      throw error;
    }

    return {
      success: true,
      deletedCount: recordIds.length,
      message: `Successfully deleted ${recordIds.length} record(s)`
    };
  } catch (error) {
    console.error('Error in deleteAttendance:', error);
    throw error instanceof Error ? error : new Error('Failed to delete records');
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

/**
 * Calculate working time between check-in and check-out timestamps.
 * This function matches the database's calculate_working_time function logic.
 */
export const calculateWorkingTime = (record: Attendance): string => {
  let totalMinutes = 0;

  // Calculate first session duration
  if (record.first_check_in_time && record.first_check_out_time) {
    const firstSessionStart = new Date(record.first_check_in_time);
    const firstSessionEnd = new Date(record.first_check_out_time);
    totalMinutes += Math.max(0, Math.floor((firstSessionEnd.getTime() - firstSessionStart.getTime()) / (1000 * 60)));
  }

  // Calculate second session duration if it exists and is marked as second session
  if (record.is_second_session && record.second_check_in_time && record.second_check_out_time) {
    const secondSessionStart = new Date(record.second_check_in_time);
    const secondSessionEnd = new Date(record.second_check_out_time);
    totalMinutes += Math.max(0, Math.floor((secondSessionEnd.getTime() - secondSessionStart.getTime()) / (1000 * 60)));
  }

  // Format the duration
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

// Create a test department
export const createTestDepartment = async () => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .insert([
        {
          name: 'Test Department',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      console.error('Error creating test department:', error);
      throw error;
    }

    console.log('Created test department:', data);
    return data?.[0];
  } catch (error) {
    console.error('Error in createTestDepartment:', error);
    throw error;
  }
};

// Create a test employee
export const createTestEmployee = async () => {
  try {
    // First, get or create the test department
    const testDepartment = 'Test Department';
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .eq('name', testDepartment)
      .single();

    let departmentId;
    if (deptError && deptError.message.includes('no rows')) {
      // Create test department
      const { data: newDept, error: createError } = await supabase
        .from('departments')
        .insert({ name: testDepartment })
        .select('id, name')
        .single();

      if (createError) {
        console.error('Error creating test department:', createError);
        throw new Error('Failed to create test department');
      }
      departmentId = newDept.id;
    } else if (deptError) {
      console.error('Error fetching test department:', deptError);
      throw new Error('Failed to fetch test department');
    } else {
      departmentId = deptData.id;
    }

    // Create employee
    const { data, error } = await supabase
      .from('employees')
      .insert([
        {
          first_name: 'Test',
          last_name: 'Employee',
          name: 'Test Employee',
          email: `test.employee.${Date.now()}@example.com`,
          status: 'active',
          department_id: departmentId,
          position: 'Test Position',
          join_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select(`
        *,
        departments (
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error creating test employee:', error);
      throw error;
    }

    console.log('Created test employee:', data);
    return {
      ...data,
      department: data.departments?.name || testDepartment
    };
  } catch (error) {
    console.error('Error in createTestEmployee:', error);
    throw error;
  }
};

// Calculate working duration in minutes
const calculateWorkingDuration = (
  firstCheckIn: Date | null,
  firstCheckOut: Date | null,
  secondCheckIn: Date | null,
  secondCheckOut: Date | null
): number => {
  let totalMinutes = 0;

  // Calculate first session
  if (firstCheckIn && firstCheckOut) {
    totalMinutes += Math.max(0, (firstCheckOut.getTime() - firstCheckIn.getTime()) / 60000);
  }

  // Calculate second session
  if (secondCheckIn && secondCheckOut) {
    totalMinutes += Math.max(0, (secondCheckOut.getTime() - secondCheckIn.getTime()) / 60000);
  }

  return Math.floor(totalMinutes);
};

// Format working duration
const formatWorkingDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
};

// Determine attendance status
const determineStatus = (
  checkInTime: Date,
  checkOutTime: Date | null,
  workingMinutes: number
): string => {
  const standardWorkHours = 8; // 8 hours standard workday
  const standardWorkMinutes = standardWorkHours * 60;
  const lateThresholdMinutes = 15; // 15 minutes late threshold
  const halfDayThresholdMinutes = standardWorkMinutes / 2;

  // Check if late
  const startOfDay = new Date(checkInTime);
  startOfDay.setHours(9, 0, 0, 0); // Assuming work starts at 9 AM
  const isLate = checkInTime > startOfDay;

  // Check if early departure
  const endOfDay = new Date(checkInTime);
  endOfDay.setHours(17, 0, 0, 0); // Assuming work ends at 5 PM
  const isEarlyDeparture = checkOutTime && checkOutTime < endOfDay;

  // Check if overtime
  const isOvertime = workingMinutes > standardWorkMinutes;

  if (!checkOutTime) {
    return isLate ? 'late' : 'present';
  }

  if (workingMinutes < halfDayThresholdMinutes) {
    return 'half-day';
  }

  if (isOvertime) {
    return 'checked-out-overtime';
  }

  if (isEarlyDeparture) {
    return 'early-departure';
  }

  return 'checked-out';
};

// Create a test attendance record
export const createTestAttendanceRecord = async () => {
  try {
    // First, get an active employee or create one
    const { data: employees, error: employeeError } = await supabase
      .from('employees')
      .select('id, name')
      .eq('status', 'active')
      .limit(1);

    if (employeeError) {
      console.error('Error fetching employees:', employeeError);
      throw new Error('Failed to fetch employees');
    }

    let employee;
    if (!employees || employees.length === 0) {
      // Create a test employee
      employee = await createTestEmployee();
      if (!employee) {
        throw new Error('Failed to create test employee');
      }
    } else {
      employee = employees[0];
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Check if there's already an attendance record for today
    const { data: existingRecords, error: existingError } = await supabase
      .from('attendance')
      .select(`
        id,
        check_in_time,
        check_out_time,
        first_check_in_time,
        first_check_out_time,
        second_check_in_time,
        second_check_out_time,
        sequence_number,
        last_action_time
      `)
      .eq('employee_id', employee.id)
      .eq('date', today)
      .order('sequence_number', { ascending: false })
      .limit(1);

    if (existingError) {
      console.error('Error checking existing records:', existingError);
      throw new Error('Failed to check existing records');
    }

    if (existingRecords && existingRecords.length > 0) {
      const existingRecord = existingRecords[0];
      const lastActionTime = existingRecord.last_action_time ? new Date(existingRecord.last_action_time) : null;
      
      // Prevent rapid consecutive scans (minimum 1 minute between actions)
      if (lastActionTime && (now.getTime() - lastActionTime.getTime()) < 60000) {
        throw new Error('Please wait at least 1 minute between attendance actions');
      }

      // If first session is not complete
      if (!existingRecord.first_check_out_time) {
        // Make sure at least 15 minutes have passed since first check-in
        const firstCheckIn = new Date(existingRecord.first_check_in_time || existingRecord.check_in_time);
        const minCheckOutTime = new Date(firstCheckIn.getTime() + 15 * 60 * 1000);
        const checkOutTime = now < minCheckOutTime ? minCheckOutTime : now;

        // Calculate working duration
        const workingMinutes = calculateWorkingDuration(
          firstCheckIn,
          checkOutTime,
          null,
          null
        );

        // Determine status
        const status = determineStatus(firstCheckIn, checkOutTime, workingMinutes);

        const { data: updatedRecord, error: updateError } = await supabase
          .from('attendance')
          .update({
            check_out_time: checkOutTime.toISOString(),
            first_check_out_time: checkOutTime.toISOString(),
            status,
            last_action_time: now.toISOString(),
            working_duration: formatWorkingDuration(workingMinutes),
            total_hours: workingMinutes / 60,
            early_departure: status === 'early-departure',
            overtime: status === 'checked-out-overtime' ? Math.max(0, (workingMinutes - 480) / 60) : 0
          })
          .eq('id', existingRecord.id)
          .select();

        if (updateError) {
          console.error('Error updating record:', updateError);
          throw new Error('Failed to update attendance record');
        }

        console.log('Updated first check-out:', updatedRecord);
        return updatedRecord;
      } 
      // If first session is complete but second hasn't started
      else if (!existingRecord.second_check_in_time) {
        // Make sure at least 15 minutes have passed since first check-out
        const firstCheckOut = new Date(existingRecord.first_check_out_time);
        const minCheckInTime = new Date(firstCheckOut.getTime() + 15 * 60 * 1000);
        const checkInTime = now < minCheckInTime ? minCheckInTime : now;

        const { data: updatedRecord, error: updateError } = await supabase
          .from('attendance')
          .update({
            check_in_time: checkInTime.toISOString(),
            second_check_in_time: checkInTime.toISOString(),
            status: 'present',
            last_action_time: now.toISOString(),
            break_duration: `${Math.floor((checkInTime.getTime() - firstCheckOut.getTime()) / 60000)} minutes`
          })
          .eq('id', existingRecord.id)
          .select();

        if (updateError) {
          console.error('Error updating record:', updateError);
          throw new Error('Failed to update attendance record');
        }

        console.log('Added second check-in:', updatedRecord);
        return updatedRecord;
      }
      // If second session started but not complete
      else if (!existingRecord.second_check_out_time) {
        // Make sure at least 15 minutes have passed since second check-in
        const secondCheckIn = new Date(existingRecord.second_check_in_time);
        const minCheckOutTime = new Date(secondCheckIn.getTime() + 15 * 60 * 1000);
        const checkOutTime = now < minCheckOutTime ? minCheckOutTime : now;

        // Calculate working duration
        const workingMinutes = calculateWorkingDuration(
          new Date(existingRecord.first_check_in_time),
          new Date(existingRecord.first_check_out_time),
          secondCheckIn,
          checkOutTime
        );

        // Determine status
        const status = determineStatus(secondCheckIn, checkOutTime, workingMinutes);

        const { data: updatedRecord, error: updateError } = await supabase
          .from('attendance')
          .update({
            check_out_time: checkOutTime.toISOString(),
            second_check_out_time: checkOutTime.toISOString(),
            status,
            last_action_time: now.toISOString(),
            working_duration: formatWorkingDuration(workingMinutes),
            total_hours: workingMinutes / 60,
            early_departure: status === 'early-departure',
            overtime: status === 'checked-out-overtime' ? Math.max(0, (workingMinutes - 480) / 60) : 0
          })
          .eq('id', existingRecord.id)
          .select();

        if (updateError) {
          console.error('Error updating record:', updateError);
          throw new Error('Failed to update attendance record');
        }

        console.log('Added second check-out:', updatedRecord);
        return updatedRecord;
      } else {
        throw new Error('Employee has completed both sessions for today');
      }
    }
    
    // Create new attendance record
    const firstCheckIn = now;
    const status = determineStatus(firstCheckIn, null, 0);

    const { data, error } = await supabase
      .from('attendance')
      .insert([
        {
          employee_id: employee.id,
          check_in_time: firstCheckIn.toISOString(),
          first_check_in_time: firstCheckIn.toISOString(),
          date: today,
          status,
          sequence_number: 1,
          created_at: now.toISOString(),
          last_action_time: now.toISOString(),
          working_duration: '0h 00m',
          total_hours: 0,
          early_departure: false,
          overtime: 0
        }
      ])
      .select();

    if (error) {
      console.error('Error creating test record:', error);
      throw error;
    }

    console.log('Created new attendance record:', data);
    return data;
  } catch (error) {
    console.error('Error in createTestAttendanceRecord:', error);
    throw error;
  }
};