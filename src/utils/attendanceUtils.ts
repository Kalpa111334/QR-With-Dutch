// Attendance Utilities Module
import { supabase } from '../integrations/supabase/client';
import { 
  Attendance, 
  AttendanceStatus, 
  WorkTimeInfo 
} from '@/types';
import Swal from 'sweetalert2';

// Define AdminContactInfo interface locally
interface AdminContactInfo {
  whatsapp_number: string;
  is_whatsapp_share_enabled: boolean;
}

// Extend WorkTimeInfo interface locally
interface ExtendedWorkTimeInfo extends WorkTimeInfo {
  action?: 'check-in' | 'check-out';
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
const calculateAttendanceMetrics = (
  check_in_time: Date, 
  check_out_time?: Date
): {
  status: AttendanceStatus;
  lateMinutes: number;
  totalHours: number;
  overtime: number;
} => {
  const now = new Date();
  
  // Work schedule constants
  const WORK_START_TIME = 9;  // 9:00 AM
  const WORK_END_TIME = 17;   // 5:00 PM
  const STANDARD_WORK_HOURS = 8;
  const HALF_DAY_THRESHOLD = 4;

  // Calculate late duration
  const workStartDateTime = new Date(check_in_time);
  workStartDateTime.setHours(WORK_START_TIME, 0, 0, 0);
    
  const lateMinutes = check_in_time > workStartDateTime 
    ? Math.floor((check_in_time.getTime() - workStartDateTime.getTime()) / (1000 * 60)) 
    : 0;

  // Determine status and calculate hours
  let status: AttendanceStatus = 'present';
  let totalHours = 0;
  let overtime = 0;
  // If check-out time is provided, calculate precise metrics
  if (check_out_time) {
    // Calculate time difference in minutes
    const timeDiffMinutes = (check_out_time.getTime() - check_in_time.getTime()) / (1000 * 60);
    
    // Convert to hours
    const workDuration = timeDiffMinutes / 60;
    
    // Minimum time requirement check (15 minutes)
    if (timeDiffMinutes < 15) {
      throw new AttendanceError('Invalid check-out: Minimum working duration is 15 minutes');
    }
    
    totalHours = Math.round(workDuration * 10) / 10;

    // Overtime calculation
    if (workDuration > STANDARD_WORK_HOURS) {
      overtime = Math.round((workDuration - STANDARD_WORK_HOURS) * 10) / 10;
      status = 'checked-out-overtime';
    }

    // Early departure and half-day logic
    const expectedEndTime = new Date(check_in_time);
    expectedEndTime.setHours(WORK_END_TIME, 0, 0, 0);

    if (check_out_time < expectedEndTime) {
      status = 'early-departure';
    }

    // Half-day determination
    if (totalHours < HALF_DAY_THRESHOLD) {
      status = 'half-day';
    }
  }

  // Late status determination
  if (lateMinutes > 0) {
    if (lateMinutes > 240) {  // More than 4 hours late
      status = 'half-day';
    } else {
      status = 'late';
    }
  }

  return {
    lateMinutes,
    totalHours,
    overtime,
    status
  };
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

// Main Attendance Recording Function
export const recordAttendance = async (qrData: string): Promise<ExtendedWorkTimeInfo> => {
  try {
    // Validate employee and check existing records in parallel
    const [employeeResult, existingCheckInResult] = await Promise.all([
      supabase
        .from('employees')
        .select('id, name, status')
        .or(`id.eq.${qrData},email.eq.${qrData}`)
        .maybeSingle(),
      supabase
        .from('attendance')
        .select('id, check_in_time')
        .eq('employee_id', qrData)
        .eq('date', new Date().toISOString().split('T')[0])
        .is('check_out_time', null)
        .maybeSingle()
    ]);

    if (employeeResult.error || !employeeResult.data) {
      throw new AttendanceError('Invalid or unregistered employee');
    }

    const employeeData = employeeResult.data;
    if (employeeData.status !== 'active') {
      throw new AttendanceError('Employee is not currently active');
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Handle check-out
    if (existingCheckInResult.data) {
      const existingOpenCheckIn = existingCheckInResult.data;
      const checkInTime = new Date(existingOpenCheckIn.check_in_time);
      const timeDifference = now.getTime() - checkInTime.getTime();
      const minutesPassed = Math.floor(timeDifference / (1000 * 60));

      if (minutesPassed < 5) {
        const remainingMinutes = 5 - minutesPassed;
        throw new AttendanceError(`Please wait ${remainingMinutes} more minute${remainingMinutes > 1 ? 's' : ''} before checking out.`);
      }

      const checkOutMetrics = calculateAttendanceMetrics(checkInTime, now);

      // Update record with check-out info
      const { data: updatedRecord, error: updateError } = await supabase
        .from('attendance')
        .update({
          check_out_time: now.toISOString(),
          status: 'checked-out',
          working_duration: checkOutMetrics.totalHours,
          overtime: checkOutMetrics.overtime
        })
        .eq('id', existingOpenCheckIn.id)
        .select()
        .single();

      if (updateError) {
        throw new AttendanceError(`Check-out failed: ${updateError.message}`);
      }

      // Log check-out asynchronously
      attendanceLogger.log('check-out', employeeData.id, {
        status: 'checked-out',
        total_hours: checkOutMetrics.totalHours,
        overtime: checkOutMetrics.overtime
      });

      return {
        check_in_time: existingOpenCheckIn.check_in_time,
        check_out_time: now.toISOString(),
        status: 'checked-out',
        sequence_number: updatedRecord.sequence_number,
        late_duration: updatedRecord.minutes_late,
        action: 'check-out'
      };
    }

    // Handle check-in
    const checkInMetrics = calculateAttendanceMetrics(now);
    const newAttendanceRecord: Partial<Attendance> = {
      employee_id: employeeData.id,
      check_in_time: now.toISOString(),
      date: today,
      status: 'present',
      minutes_late: checkInMetrics.lateMinutes,
      sequence_number: 1
    };

    const { data: insertedRecord, error: insertError } = await supabase
      .from('attendance')
      .insert(newAttendanceRecord)
      .select()
      .single();

    if (insertError) {
      throw new AttendanceError(`Check-in failed: ${insertError.message}`);
    }

    // Log check-in asynchronously
    attendanceLogger.log('check-in', employeeData.id, {
      status: newAttendanceRecord.status,
      minutes_late: newAttendanceRecord.minutes_late,
    });

    return {
      check_in_time: insertedRecord.check_in_time,
      status: 'present',
      sequence_number: insertedRecord.sequence_number,
      late_duration: insertedRecord.minutes_late,
      action: 'check-in'
    };

  } catch (error) {
    if (!(error instanceof AttendanceError)) {
      console.error('Unexpected attendance recording error:', error);
    }
    // Log error asynchronously
    attendanceLogger.log('error', qrData, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
      if (['present', 'late', 'check-in'].includes(record.status)) {
        statusCounts.currentlyPresent++;
      }
      
      if (['late', 'check-in'].includes(record.status) && record.minutes_late > 0) {
        statusCounts.lateButPresent++;
      }
      
      if (['checked-out', 'checked-out-overtime'].includes(record.status)) {
        statusCounts.checkedOut++;
      }
      
      if (record.minutes_late === 0) {
        statusCounts.onTimeArrivals++;
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

    return {
      totalEmployees,
      presentCount: statusCounts.currentlyPresent,
      lateCount: statusCounts.lateButPresent,
      absentCount: statusCounts.absent,
      checkedOutCount: statusCounts.checkedOut,
      onTime: statusCounts.onTimeArrivals,
      stillWorking: statusCounts.currentlyPresent + statusCounts.lateButPresent,
      
      currentPresenceRate: rates.currentPresenceRate,
      totalPresentRate: rates.totalPresentRate,
      onTimeRate: rates.onTimeRate,
      lateRate: rates.lateRate,
      absentRate: rates.absentRate,
      
      detailed: {
        onTime: statusCounts.onTimeArrivals,
        lateArrivals: statusCounts.lateButPresent,
        veryLate: 0,
        halfDay: 0,
        earlyDepartures: 0,
        overtime: 0,
        regularHours: 0,
        attendanceRate: rates.totalPresentRate,
        efficiencyRate: '0',
        punctualityRate: rates.onTimeRate
      },
      
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
    const result = await recordAttendance(employeeId);
    
    // Fetch employee name for the result
    const { data: employeeData } = await supabase
      .from('employees')
      .select('name')
      .eq('id', employeeId)
      .single();

    // Return the result with the action type and employee name
    return {
      ...result,
      employeeName: employeeData?.name || 'Unknown Employee',
      action: result.check_out_time ? 'check-out' : 'check-in' // Determine action based on check_out_time
    };
  } catch (error) {
    console.error('Single scan attendance error:', error);
    throw error;
  }
};

export const deleteAttendance = async (recordIds: string[]) => {
  try {
    // First verify that all records exist and can be deleted
    const { data: existingRecords, error: verifyError } = await supabase
      .from('attendance')
      .select('id')
      .in('id', recordIds);

    if (verifyError) {
      console.error('Verification error:', verifyError);
      return {
        success: false,
        error: 'Failed to verify records'
      };
    }

    if (!existingRecords || existingRecords.length !== recordIds.length) {
      return {
        success: false,
        error: 'Some records do not exist or have already been deleted'
      };
    }

    // Perform the deletion within a transaction
    const { data, error: deleteError } = await supabase
      .from('attendance')
      .delete()
      .in('id', recordIds)
      .select();

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Failed to delete records'
      };
    }

    // Verify deletion was successful
    const { data: verifyDeletion, error: checkError } = await supabase
      .from('attendance')
      .select('id')
      .in('id', recordIds);

    if (checkError) {
      console.error('Post-deletion verification error:', checkError);
    } else if (verifyDeletion && verifyDeletion.length > 0) {
      console.warn('Some records were not deleted:', verifyDeletion);
      return {
        success: false,
        error: 'Some records could not be deleted'
      };
    }

    return {
      success: true,
      deletedCount: recordIds.length,
      deletedRecords: data
    };
  } catch (error) {
    console.error('Unexpected delete attendance error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred while deleting records'
    };
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
    if (todayRecords.check_out_time) {
      throw new AttendanceError('You have already checked out today');
    }

    const checkInTime = new Date(todayRecords.check_in_time);
    
    // Ensure minimum time between check-in and check-out (15 minutes)
    const minCheckOutTime = new Date(checkInTime.getTime() + 15 * 60 * 1000);
    if (now < minCheckOutTime) {
      throw new AttendanceError('Cannot check out less than 15 minutes after check-in');
    }

    // Generate a unique timestamp for check-out that ensures proper spacing
    const uniqueCheckOutTime = await generateUniqueTimestamp(employeeId, now, 'check-out');

    // Double check the time difference after getting unique timestamp
    const timeDiffMinutes = (uniqueCheckOutTime.getTime() - checkInTime.getTime()) / (1000 * 60);
    if (timeDiffMinutes < 15) {
      throw new AttendanceError('Invalid check-out time: Must be at least 15 minutes after check-in');
    }

    const checkOutMetrics = calculateAttendanceMetrics(checkInTime, uniqueCheckOutTime);

    // Prepare check-out record
    const checkOutRecord: Partial<Attendance> = {
      check_out_time: uniqueCheckOutTime.toISOString(),
      working_duration: checkOutMetrics.totalHours.toFixed(2),
      status: checkOutMetrics.status === 'checked-out-overtime' ? 'checked-out' : checkOutMetrics.status,
      overtime: checkOutMetrics.overtime
    };

    // Update the attendance record
    const { data, error } = await supabase
      .from('attendance')
      .update(checkOutRecord)
      .eq('id', todayRecords.id)
      .select()
      .single();

    if (error) {
      throw new AttendanceError(`Check-out failed: ${error.message}`);
    }

    // Log the check-out
    attendanceLogger.log('check-out', employeeId, {
      status: checkOutMetrics.status,
      total_hours: checkOutMetrics.totalHours,
      overtime: checkOutMetrics.overtime
    });

    // Fetch employee name
    const { data: employeeData } = await supabase
      .from('employees')
      .select('name')
      .eq('id', employeeId)
      .single();

    return {
      action: 'check-out',
      check_in_time: todayRecords.check_in_time,
      check_out_time: uniqueCheckOutTime.toISOString(),
      employeeId,
      employeeName: employeeData?.name || 'Unknown Employee',
      totalHours: checkOutMetrics.totalHours,
      status: 'checked-out',
      overtime: checkOutMetrics.overtime
    };
  } catch (error) {
    console.error('Manual check-out error:', error);
    throw error;
  }
};