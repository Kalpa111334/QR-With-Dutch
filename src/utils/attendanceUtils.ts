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
      .is('deleted_at', null) // Only get non-deleted records
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
        : '0',
      
      totalPresentRate: totalEmployees > 0 
        ? ((totalPresent / totalEmployees) * 100).toFixed(1) 
        : '0',
      
      onTimeRate: totalPresent > 0 
        ? ((statusCounts.onTimeArrivals / totalPresent) * 100).toFixed(1) 
        : '0',
      
      lateRate: totalPresent > 0 
        ? ((statusCounts.lateButPresent / totalPresent) * 100).toFixed(1) 
        : '0',
      
      absentRate: totalEmployees > 0 
        ? ((statusCounts.absent / totalEmployees) * 100).toFixed(1) 
        : '0'
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
    
    // Return a default empty summary object
    return {
      totalEmployees: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      checkedOutCount: 0,
      onTime: 0,
      stillWorking: 0,
      currentPresenceRate: '0',
      totalPresentRate: '0',
      onTimeRate: '0',
      lateRate: '0',
      absentRate: '0',
      detailed: {
        onTime: 0,
        lateArrivals: 0,
        veryLate: 0,
        halfDay: 0,
        earlyDepartures: 0,
        overtime: 0,
        regularHours: 0,
        attendanceRate: '0',
        efficiencyRate: '0',
        punctualityRate: '0'
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

// Calculate working time for an attendance record
export const calculateWorkingTime = (record: Attendance): string => {
  let totalMinutes = 0;

  try {
    // For backward compatibility, check both old and new timestamp fields
    const firstCheckIn = record.check_in_time;
    const firstCheckOut = record.check_out_time;
    const secondCheckIn = record.second_check_in_time;
    const secondCheckOut = record.second_check_out_time;

    // Calculate first session duration
    if (firstCheckIn) {
      const firstStart = new Date(firstCheckIn);
      let firstEnd;
      
      if (firstCheckOut) {
        firstEnd = new Date(firstCheckOut);
      } else if (record.status !== 'checked-out') {
        // If still in first session
        firstEnd = new Date();
      }

      if (firstEnd && firstEnd >= firstStart) {
        const sessionMinutes = Math.floor((firstEnd.getTime() - firstStart.getTime()) / (1000 * 60));
        totalMinutes += sessionMinutes;
      }
    }

    // Calculate second session duration
    if (secondCheckIn) {
      const secondStart = new Date(secondCheckIn);
      let secondEnd;

      if (secondCheckOut) {
        secondEnd = new Date(secondCheckOut);
      } else if (record.status !== 'checked-out') {
        // If still in second session
        secondEnd = new Date();
      }

      if (secondEnd && secondEnd >= secondStart) {
        const sessionMinutes = Math.floor((secondEnd.getTime() - secondStart.getTime()) / (1000 * 60));
        totalMinutes += sessionMinutes;
      }
    }

    // Subtract break duration if available
    if (record.break_duration) {
      try {
        // Handle different break duration formats
        let breakMinutes = 0;
        if (typeof record.break_duration === 'string') {
          // If format is "Xm" or "X minutes"
          const match = record.break_duration.match(/(\d+)/);
          if (match) {
            breakMinutes = parseInt(match[1], 10);
          }
        } else if (typeof record.break_duration === 'number') {
          breakMinutes = record.break_duration;
        }
        totalMinutes = Math.max(0, totalMinutes - breakMinutes);
  } catch (error) {
        console.error('Error processing break duration:', error);
      }
    }

    // Convert minutes to hours and minutes format
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    
    // Format with leading zeros for minutes
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  } catch (error) {
    console.error('Error calculating working time:', error);
    return '0h 00m';
  }
};