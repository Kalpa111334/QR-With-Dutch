import { supabase } from '../integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, differenceInHours, differenceInSeconds, parseISO } from 'date-fns';
import { Attendance } from '../types';
import { toast } from '../components/ui/use-toast';
import { Database } from '../integrations/supabase/types';

type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];
type AdminSettingsInsert = Database['public']['Tables']['admin_settings']['Insert'];
type AdminSettingsUpdate = Database['public']['Tables']['admin_settings']['Update'];

// Database types from schema
interface AdminSettings {
  id: string;
  setting_type: string;
  whatsapp_number: string | null;
  is_whatsapp_share_enabled: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminContactInfo {
  whatsappNumber: string;
  isWhatsappShareEnabled: boolean;
}

// Define the start of workday (9:00 AM) for late calculation
const WORKDAY_START_HOUR = 9;
const WORKDAY_START_MINUTE = 0;
const GRACE_PERIOD_MINUTES = 5; // 5 minutes grace period

// Calculate late duration with hours and minutes
const calculateLateDuration = (checkInTime: string): { 
  totalMinutes: number,
  hours: number,
  minutes: number,
  formatted: string,
  expectedTime: string
} => {
  const checkIn = new Date(checkInTime);
  const workdayStart = new Date(checkIn);
  
  // Set to 9:00 AM of the same day
  workdayStart.setHours(WORKDAY_START_HOUR, WORKDAY_START_MINUTE, 0, 0);
  
  // Add grace period
  workdayStart.setMinutes(workdayStart.getMinutes() + GRACE_PERIOD_MINUTES);
  
  // If not late, return 0
  if (checkIn <= workdayStart) {
    return {
      totalMinutes: 0,
      hours: 0,
      minutes: 0,
      formatted: 'On time',
      expectedTime: format(workdayStart, 'HH:mm')
    };
  }
  
  // Calculate minutes late (rounded to nearest minute)
  const totalMinutes = Math.round(differenceInMinutes(checkIn, workdayStart));
  
  // Calculate hours and remaining minutes
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  // Format the duration
  let formatted = '';
  if (hours > 0) {
    formatted += `${hours}h `;
  }
  if (minutes > 0 || hours === 0) {
    formatted += `${minutes}m`;
  }
  
  return {
    totalMinutes: Math.max(0, totalMinutes),
    hours,
    minutes,
    formatted: formatted.trim(),
    expectedTime: format(workdayStart, 'HH:mm')
  };
};

// Calculate minutes late (0 if not late) - keeping for backward compatibility
const calculateMinutesLate = (checkInTime: string): number => {
  return calculateLateDuration(checkInTime).totalMinutes;
};

// Calculate working duration with more precision
const calculateWorkingDuration = (checkInTime: string, checkOutTime: string | null): { 
  minutes: number, 
  hours: number,
  formatted: string,
  fullDuration: string 
} => {
  if (!checkOutTime) {
    // If no checkout time, calculate duration up until now
    const checkIn = new Date(checkInTime);
    const now = new Date();
    const minutes = differenceInMinutes(now, checkIn);
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return {
      minutes,
      hours,
      formatted: `${hours}h ${remainingMinutes}m`,
      fullDuration: `${format(checkIn, 'HH:mm')} - Current`
    };
  }
  
  // Calculate duration between check-in and check-out
  const checkIn = new Date(checkInTime);
  const checkOut = new Date(checkOutTime);
  const minutes = differenceInMinutes(checkOut, checkIn);
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return {
    minutes,
    hours,
    formatted: `${hours}h ${remainingMinutes}m`,
    fullDuration: `${format(checkIn, 'HH:mm')} - ${format(checkOut, 'HH:mm')}`
  };
};

// Get all attendance records - using the old function name for backward compatibility
export const getAttendance = async (): Promise<Attendance[]> => {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        date,
        check_in_time,
        check_out_time,
        status,
        employee_id,
        employees (
          id,
          first_name,
          last_name
        )
      `)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching attendance:', error);
      return [];
    }
    
    // Transform the data to match our Attendance type with proper type casting
    return data.map(record => {
      const checkInTime = record.check_in_time;
      const checkOutTime = record.check_out_time;
      
      // Determine if late based on check-in time
      const lateDuration = calculateLateDuration(checkInTime);
      const late = lateDuration.totalMinutes > 0;
      
      // Calculate working duration
      const workingDuration = calculateWorkingDuration(checkInTime, checkOutTime);
      
      return {
        id: record.id,
        employeeId: record.employee_id,
        employeeName: `${record.employees?.first_name || ''} ${record.employees?.last_name || ''}`.trim(),
        checkInTime,
        checkOutTime,
        date: format(new Date(record.date), 'yyyy-MM-dd'),
        status: late ? 'late' : 'present' as 'present' | 'late' | 'absent',
        minutesLate: lateDuration.totalMinutes,
        lateDuration: lateDuration.formatted,
        expectedTime: lateDuration.expectedTime,
        workingDuration: workingDuration.formatted,
        workingDurationMinutes: workingDuration.minutes,
        workingHours: workingDuration.hours,
        fullTimeRange: workingDuration.fullDuration
      };
    });
  } catch (error) {
    console.error('Error in getAttendance:', error);
    return [];
  }
};

// New function name - adding as an alias to maintain compatibility
export const getAttendanceRecords = getAttendance;

// Get attendance records by date range with proper type casting
export const getAttendanceByDateRange = async (startDate: string, endDate: string): Promise<Attendance[]> => {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        date,
        check_in_time,
        check_out_time,
        status,
        employee_id,
        employees (
          id,
          first_name,
          last_name
        )
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching attendance by date range:', error);
      return [];
    }
    
    // Transform with proper type casting and calculate late/duration values
    return data.map(record => {
      const checkInTime = record.check_in_time;
      const checkOutTime = record.check_out_time;
      
      // Determine if late based on check-in time
      const lateDuration = calculateLateDuration(checkInTime);
      const late = lateDuration.totalMinutes > 0;
      
      // Calculate working duration
      const workingDuration = calculateWorkingDuration(checkInTime, checkOutTime);
      
      return {
        id: record.id,
        employeeId: record.employee_id,
        employeeName: `${record.employees?.first_name || ''} ${record.employees?.last_name || ''}`.trim(),
        checkInTime,
        checkOutTime,
        date: format(new Date(record.date), 'yyyy-MM-dd'),
        status: late ? 'late' : 'present' as 'present' | 'late' | 'absent',
        minutesLate: lateDuration.totalMinutes,
        lateDuration: lateDuration.formatted,
        expectedTime: lateDuration.expectedTime,
        workingDuration: workingDuration.formatted,
        workingDurationMinutes: workingDuration.minutes,
        workingHours: workingDuration.hours,
        fullTimeRange: workingDuration.fullDuration
      };
    });
  } catch (error) {
    console.error('Error in getAttendanceByDateRange:', error);
    return [];
  }
};

// Get total employee count
export const getTotalEmployeeCount = async (): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from('employees')
      .select('*', { count: 'exact' });
    
    if (error) {
      console.error('Error fetching total employee count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    console.error('Error in getTotalEmployeeCount:', error);
    return 0;
  }
};

// Record attendance check-in with improved error handling and retry logic
export const recordAttendanceCheckIn = async (employeeId: string): Promise<boolean> => {
  const MAX_RETRIES = 3;
  let retryCount = 0;

  const attemptCheckIn = async (): Promise<boolean> => {
    try {
      // Log the start of the operation
      console.log(`Attempt ${retryCount + 1} - Starting attendance check-in for employee:`, employeeId);

      // First check if we have an active session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('Session check result:', session ? 'Active session found' : 'No active session');
      
      if (!session || sessionError) {
        console.error('Authentication error:', sessionError);
        toast({
          title: "Authentication Required",
          description: "Please log in to record attendance.",
          variant: "destructive"
        });
        return false;
      }

      // Verify employee exists first with timeout
      console.log('Verifying employee existence...');
      const employeePromise = new Promise<Employee>(async (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Employee verification timeout')), 10000);
        try {
          const { data, error } = await supabase
            .from('employees')
            .select('id, first_name, last_name')
            .eq('id', employeeId)
            .single();
          clearTimeout(timeout);
          if (error) reject(error);
          if (!data) {
            reject(new Error('No employee data found'));
            return;
          }
          resolve(data as Employee);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

const employee: Employee | null = await employeePromise.catch((error) => {
        console.error('Employee verification error:', error);
        toast({
          title: "Employee Verification Failed",
          description: "Could not verify employee ID. Please try again.",
          variant: "destructive"
        });
        return null;
      });

      if (!employee) {
        return false;
      }

      // At this point, employee is guaranteed to be of type Employee
      const verifiedEmployee: Employee = employee;
      console.log('Employee verified:', verifiedEmployee.first_name, verifiedEmployee.last_name);

      // Get current date/time in the correct format
      const now = new Date();
      const today = format(startOfDay(now), 'yyyy-MM-dd');
      const checkInTime = now.toISOString();
      
      // Check for existing attendance with retry logic
      const getExistingRecord = async () => {
        const { data, error } = await supabase
          .from('attendance')
          .select('id, check_in_time, status')
          .eq('employee_id', employeeId)
          .eq('date', today)
          .maybeSingle();

        if (error) throw error;
        return data;
      };

      const existingRecord = await getExistingRecord().catch(error => {
        console.error('Error checking existing attendance:', error);
        toast({
          title: "Error Checking Attendance",
          description: "Failed to verify existing attendance. Retrying...",
          variant: "destructive"
        });
        return null;
      });

      if (existingRecord) {
        console.log('Found existing attendance record:', existingRecord);
        toast({
          title: "Already Checked In",
          description: `You have already checked in today at ${format(new Date(existingRecord.check_in_time), 'HH:mm')}`,
        });
        return false;
      }
      
      // Determine if the employee is late
      const lateDuration = calculateLateDuration(checkInTime);
      const isLate = lateDuration.totalMinutes > 0;
      console.log('Late status:', isLate ? `Late by ${lateDuration.formatted}` : 'On time');
      
      // Prepare attendance record with additional metadata
      const attendanceRecord = {
        employee_id: employeeId,
        date: today,
        check_in_time: checkInTime,
        status: isLate ? 'late' : 'present',
        late_duration: isLate ? lateDuration.totalMinutes : 0,
        device_info: typeof window !== 'undefined' ? navigator.userAgent : 'Unknown',
        check_in_location: 'office' // You can make this dynamic if needed
      };

      console.log('Inserting attendance record:', attendanceRecord);
      
      // Verify database connection before insert
      try {
        const { error: healthError } = await supabase.from('attendance').select('count').limit(1);
        if (healthError) {
          console.error('Database health check failed:', healthError);
          toast({
            title: "Connection Error",
            description: "Unable to connect to the database. Please try again.",
            variant: "destructive"
          });
          return false;
        }
      } catch (healthError) {
        console.error('Health check failed:', healthError);
      }

      // Insert new record with timeout
      const insertPromise = new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error('Insert operation timed out after 15 seconds');
          reject(new Error('Insert timeout'));
        }, 15000);
        
        try {
          console.log('Attempting to insert attendance record...');
          const { data, error } = await supabase
            .from('attendance')
            .insert(attendanceRecord)
            .select()
            .single();
          clearTimeout(timeout);
          if (error) reject(error);
          resolve(data);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      const insertedData = await insertPromise.catch(error => {
        console.error('Error recording attendance check-in:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        // Check for specific database errors
        if (error.code === '23505') {
          toast({
            title: "Already Checked In",
            description: "You have already checked in today.",
          });
        } else if (error.code === '42501') {
          toast({
            title: "Permission Denied",
            description: "You don't have permission to record attendance. Please contact admin.",
            variant: "destructive"
          });
        } else if (error.code === '23503') {
          toast({
            title: "Invalid Employee",
            description: "This employee ID is not valid. Please contact admin.",
            variant: "destructive"
          });
        } else if (error.code === '28P01') {
          toast({
            title: "Database Connection Error",
            description: "Unable to connect to the database. Please try again.",
            variant: "destructive"
          });
        } else if (error.code?.startsWith('08')) {
          toast({
            title: "Connection Error",
            description: "Unable to connect to the server. Please check your internet connection.",
            variant: "destructive"
          });
        } else {
          console.error('Unhandled error during check-in:', error);
          toast({
            title: "Check-in Failed",
            description: "An unexpected error occurred. Please try again.",
            variant: "destructive"
          });
          throw error; // Re-throw for retry
        }
        return null;
      });

      if (!insertedData) {
        return false;
      }
        console.log('Successfully recorded attendance:', insertedData);
      toast({
        title: isLate ? "Late Check-in Recorded" : "Check-in Successful",
        description: isLate
          ? `Checked in ${lateDuration.formatted} late. Expected time was ${lateDuration.expectedTime}`
          : `Successfully checked in at ${format(new Date(checkInTime), 'HH:mm')}`
      });
      return true;
    } catch (error) {
      console.error(`Attempt ${retryCount + 1} failed:`, error);
      
      // Check if we should retry
      if (retryCount < MAX_RETRIES - 1) {
        retryCount++;
        console.log(`Retrying... Attempt ${retryCount + 1} of ${MAX_RETRIES}`);
        
        // Exponential backoff
        const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        
        return attemptCheckIn();
      }
      
      toast({
        title: "Check-in Failed",
        description: "Multiple attempts failed. Please try again later or contact support.",
        variant: "destructive"
      });
      return false;
    }
  };

  return attemptCheckIn();
};

// Record attendance check-out
export const recordAttendanceCheckOut = async (employeeId: string): Promise<boolean> => {
  try {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    // Format check-out time as ISO string for proper timestamp with timezone
    const checkOutTime = now.toISOString();
    
    // Find today's attendance record - use maybeSingle() instead of single()
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching attendance record:', error);
      return false;
    }
    
    if (!data) {
      console.log('No check-in record found for today');
      toast({
        title: "No Check-In Record",
        description: "No check-in record found for today. Please check in first.",
        variant: "destructive",
      });
      return false;
    }
    
    if (data.check_out_time) {
      console.log('Employee already checked out today');
      toast({
        title: "Already Checked Out",
        description: "You have already checked out today.",
      });
      return false;
    }
    
    // Calculate working duration
    const workingDuration = calculateWorkingDuration(data.check_in_time, checkOutTime);
    
    // Update record with check-out time
    const { error: updateError } = await supabase
      .from('attendance')
      .update({
        check_out_time: checkOutTime
      })
      .eq('id', data.id);
    
    if (updateError) {
      console.error('Error recording attendance check-out:', updateError);
      return false;
    }
    
    toast({
      title: "Checked Out",
      description: `Your check-out time has been recorded. Working duration: ${workingDuration.formatted}`,
    });
    return true;
  } catch (error) {
    console.error('Error in recordAttendanceCheckOut:', error);
    return false;
  }
};

// Implementation of addAttendanceRecord
export const addAttendanceRecord = async (employeeId: string): Promise<Attendance | null> => {
  try {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    // Check if employee already has an attendance record for today
    const { data: existingRecord } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();
    
    if (existingRecord) {
      // If record exists but no check-out time, update with check-out
      if (!existingRecord.check_out_time) {
        const checkOutTime = now.toISOString();
        const { data, error } = await supabase
          .from('attendance')
          .update({ check_out_time: checkOutTime })
          .eq('id', existingRecord.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating attendance record:', error);
          return null;
        }
        
        return {
          id: data.id,
          employeeId: data.employee_id,
          employeeName: '',  // This will be populated by the calling function
          checkInTime: data.check_in_time,
          checkOutTime: data.check_out_time,
          date: format(new Date(data.date), 'yyyy-MM-dd'),
          status: (data.status as 'present' | 'late' | 'absent')
        };
      }
      
      return {
        id: existingRecord.id,
        employeeId: existingRecord.employee_id,
        employeeName: '',  // Will be populated by the calling function
        checkInTime: existingRecord.check_in_time,
        checkOutTime: existingRecord.check_out_time,
        date: format(new Date(existingRecord.date), 'yyyy-MM-dd'),
        status: (existingRecord.status as 'present' | 'late' | 'absent')
      };
    }
    
    // If no record exists, create new check-in
    const checkInTime = now.toISOString();
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        check_in_time: checkInTime,
        date: today,
        status: 'present'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating attendance record:', error);
      return null;
    }
    
    return {
      id: data.id,
      employeeId: data.employee_id,
      employeeName: '',  // Will be populated by the calling function
      checkInTime: data.check_in_time,
      checkOutTime: data.check_out_time,
      date: format(new Date(data.date), 'yyyy-MM-dd'),
      status: (data.status as 'present' | 'late' | 'absent')
    };
  } catch (error) {
    console.error('Error in addAttendanceRecord:', error);
    return null;
  }
};

// Function to get admin settings with better error handling
export const getAdminSettings = async (): Promise<AdminSettingsRow | null> => {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('setting_type', 'attendance_report')
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No settings found (no rows returned)
        console.log('No admin settings found, will return defaults');
        return null;
      }
      console.error('Error fetching admin settings:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getAdminSettings:', error);
    return null;
  }
};

// Get admin contact info with WhatsApp settings
export async function getAdminContactInfo(): Promise<AdminContactInfo> {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No settings found, return defaults
        return {
          whatsappNumber: '',
          isWhatsappShareEnabled: false
        };
      }
      throw error;
    }

    return {
      whatsappNumber: data.whatsapp_number || '',
      isWhatsappShareEnabled: data.is_whatsapp_share_enabled || false
    };
  } catch (error) {
    console.error('Error fetching admin contact info:', error);
    throw error;
  }
}

export async function saveAdminContactInfo(
  whatsappNumber: string,
  isWhatsappShareEnabled: boolean
): Promise<void> {
  try {
    // Validate WhatsApp number
    if (whatsappNumber && !/^[0-9+]+$/.test(whatsappNumber)) {
      throw new Error('Invalid WhatsApp number format');
    }

    const { data: existingSettings } = await supabase
      .from('admin_settings')
      .select('id')
      .single();

    const settingsData: Database['public']['Tables']['admin_settings']['Insert'] = {
      setting_type: 'attendance_report',
      whatsapp_number: whatsappNumber,
      is_whatsapp_share_enabled: isWhatsappShareEnabled,
      updated_at: new Date().toISOString()
    };

    if (existingSettings) {
      // Update existing settings
      const { error: updateError } = await supabase
        .from('admin_settings')
        .update(settingsData)
        .eq('id', existingSettings.id);

      if (updateError) throw updateError;
    } else {
      // Insert new settings
      const { error: insertError } = await supabase
        .from('admin_settings')
        .insert({
          ...settingsData,
          created_at: new Date().toISOString()
        });

      if (insertError) throw insertError;
    }
  } catch (error) {
    console.error('Error saving admin contact info:', error);
    throw error;
  }
}

// Get today's attendance summary statistics
export const getTodayAttendanceSummary = async () => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Get all active employees
    const { data: employees, error: employeesError } = await supabase
      .from('employees')
      .select('id')
      .eq('status', 'active');
      
    if (employeesError) {
      throw new Error('Failed to get employee count');
    }
    
    const totalEmployees = employees.length;
    
    // Get today's attendance records
    const { data: attendanceRecords, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', today);
      
    if (attendanceError) {
      throw new Error('Failed to get attendance records');
    }
    
    // Calculate detailed statistics
    const presentCount = attendanceRecords.length;
    const lateCount = attendanceRecords.filter(record => record.status === 'late').length;
    const onTimeCount = presentCount - lateCount;
    const checkedOutCount = attendanceRecords.filter(record => record.check_out_time).length;
    const stillWorkingCount = presentCount - checkedOutCount;
    const absentCount = totalEmployees - presentCount;
    
    // Calculate percentages
    const presentRate = totalEmployees > 0 ? (presentCount / totalEmployees * 100).toFixed(1) : '0';
    const onTimeRate = presentCount > 0 ? (onTimeCount / presentCount * 100).toFixed(1) : '0';
    const lateRate = presentCount > 0 ? (lateCount / presentCount * 100).toFixed(1) : '0';
    const absentRate = totalEmployees > 0 ? (absentCount / totalEmployees * 100).toFixed(1) : '0';
    const checkedOutRate = presentCount > 0 ? (checkedOutCount / presentCount * 100).toFixed(1) : '0';
    
    return {
      date: today,
      totalEmployees,
      presentCount,
      onTimeCount,
      lateCount,
      checkedOutCount,
      stillWorkingCount,
      absentCount,
      presentRate,
      onTimeRate,
      lateRate,
      absentRate,
      checkedOutRate,
      summary: {
        present: `${presentCount}/${totalEmployees} (${presentRate}%)`,
        onTime: `${onTimeCount}/${presentCount} (${onTimeRate}%)`,
        late: `${lateCount}/${presentCount} (${lateRate}%)`,
        absent: `${absentCount}/${totalEmployees} (${absentRate}%)`,
        checkedOut: `${checkedOutCount}/${presentCount} (${checkedOutRate}%)`,
        stillWorking: `${stillWorkingCount}/${presentCount}`
      }
    };
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    throw error;
  }
};

// Generate summary text for email sharing
export const generateAttendanceSummaryHTML = async (date: Date): Promise<string> => {
  try {
    const formattedDate = format(date, 'MMMM d, yyyy');
    const dateString = format(date, 'yyyy-MM-dd');
    
    // Get attendance records for the date
    const records = await getAttendanceByDateRange(dateString, dateString);
    
    // Get summary statistics
    const summary = await getTodayAttendanceSummary();
    
    // Calculate average working hours and late minutes
    let totalHoursWorked = 0;
    let totalCheckedOut = 0;
    let totalLateMinutes = 0;
    
    records.forEach(record => {
      // Calculate late minutes
      if (record.status === 'late' && record.minutesLate) {
        totalLateMinutes += record.minutesLate;
      }
      
      // Calculate hours worked for those who checked out
      if (record.checkOutTime && record.checkInTime) {
        const checkIn = new Date(record.checkInTime);
        const checkOut = new Date(record.checkOutTime);
        const hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        totalHoursWorked += hoursWorked;
        totalCheckedOut++;
      }
    });
    
    const avgHoursWorked = totalCheckedOut > 0 ? (totalHoursWorked / totalCheckedOut).toFixed(1) : '0';
    const avgLateMinutes = summary.lateCount > 0 ? Math.round(totalLateMinutes / summary.lateCount) : 0;
    
    // Create HTML email content
    let htmlContent = `
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          h1 { color: #2563eb; text-align: center; }
          h2 { color: #4b5563; margin-top: 20px; }
          .summary-box { background-color: #f3f4f6; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
          .stat { margin-bottom: 10px; }
          .label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #e5e7eb; text-align: left; padding: 8px; }
          td { border-bottom: 1px solid #e5e7eb; padding: 8px; }
          .late { color: #ef4444; }
          .footer { margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Daily Attendance Summary</h1>
          <p style="text-align: center;"><strong>${formattedDate}</strong></p>
          
          <div class="summary-box">
            <div class="stat"><span class="label">Total Employees:</span> ${summary.totalEmployees}</div>
            <div class="stat"><span class="label">Present Today:</span> ${summary.presentCount} (${(summary.presentCount / summary.totalEmployees * 100).toFixed(1)}%)</div>
            <div class="stat"><span class="label">Absent Today:</span> ${summary.absentCount} (${summary.absentRate}%)</div>
            <div class="stat"><span class="label">Late Arrivals:</span> ${summary.lateCount} employees`;
    
    if (summary.lateCount > 0) {
      htmlContent += ` (avg ${avgLateMinutes} mins late)`;
    }
    
    htmlContent += `</div>
            <div class="stat"><span class="label">Checked Out:</span> ${summary.checkedOutCount} employees</div>`;
    
    if (totalCheckedOut > 0) {
      htmlContent += `<div class="stat"><span class="label">Average Hours Worked:</span> ${avgHoursWorked} hours</div>`;
    }
    
    htmlContent += `</div>`;
    
    // Late employees section
    if (summary.lateCount > 0) {
      htmlContent += `
        <h2>Late Employees</h2>
        <table>
          <tr>
            <th>Name</th>
            <th>Check-in Time</th>
            <th>Minutes Late</th>
          </tr>`;
          
      records
        .filter(r => r.status === 'late')
        .forEach(record => {
          const checkInTime = new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          htmlContent += `
            <tr>
              <td>${record.employeeName}</td>
              <td>${checkInTime}</td>
              <td class="late">${record.minutesLate} mins</td>
            </tr>`;
        });
        
      htmlContent += `</table>`;
    }
    
    // Attendance details section
    if (records.length > 0) {
      htmlContent += `
        <h2>Attendance Details</h2>
        <table>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Duration</th>
          </tr>`;
          
      records.forEach(record => {
        const checkInTime = new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const checkOutTime = record.checkOutTime 
          ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          : 'Still working';
          
        htmlContent += `
          <tr>
            <td>${record.employeeName}</td>
            <td>${record.status === 'late' ? '<span class="late">Late</span>' : 'Present'}</td>
            <td>${checkInTime}</td>
            <td>${checkOutTime}</td>
            <td>${record.workingDuration}</td>
          </tr>`;
      });
        
      htmlContent += `</table>`;
    } else {
      htmlContent += `<p>No attendance records for this date.</p>`;
    }
    
    htmlContent += `
          <div class="footer">
            <p>This is an automated attendance summary. For any questions, please contact HR.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    return htmlContent;
  } catch (error) {
    console.error('Error generating attendance summary HTML:', error);
    throw error;
  }
};

// Update super admin numbers constant with all three numbers
const SUPER_ADMIN_NUMBERS = [
  '94768231675',  // First admin
  '94761938373',  // Second admin
  '94741233252'   // Third admin
];

// Improved format WhatsApp number helper function
const formatWhatsAppNumber = (number: string): string => {
  // Remove all non-digit characters
  let cleaned = number.replace(/\D/g, '');
  
  // Handle Sri Lankan numbers
  if (cleaned.startsWith('0')) {
    cleaned = '94' + cleaned.substring(1);
  } else if (!cleaned.startsWith('94')) {
    cleaned = '94' + cleaned;
  }
  
  // Validate number length for Sri Lankan numbers (should be 11 digits after formatting)
  if (cleaned.length !== 11) {
    console.warn(`Invalid number length for ${cleaned}, should be 11 digits`);
  }
  
  return cleaned;
};

// Define report schedules
const REPORT_SCHEDULES = [
  { hour: 9, minute: 30, type: 'morning' },    // Morning report - Late arrivals focus
  { hour: 13, minute: 0, type: 'midday' },     // Midday report - Attendance overview
  { hour: 18, minute: 0, type: 'evening' }     // Evening report - Full day summary
];

// Enhanced message generation based on report type
const generateReportMessage = async (type: 'morning' | 'midday' | 'evening'): Promise<string> => {
  const summary = await getTodayAttendanceSummary();
  const today = format(new Date(), 'yyyy-MM-dd');
  const records = await getAttendanceByDateRange(today, today);
  const now = new Date();

  let messageHeader = '';
  let messageBody = '';

  switch (type) {
    case 'morning':
      messageHeader = '🌅 *Morning Attendance Report*\n';
      messageBody = `📅 Date: ${format(now, 'MMMM d, yyyy')}\n\n` +
        `*Early Summary*\n` +
        `👥 Total Employees: ${summary.totalEmployees}\n` +
        `✅ Present: ${summary.summary.present}\n` +
        `⏰ Late: ${summary.summary.late}\n` +
        `❌ Not Arrived: ${summary.summary.absent}\n\n` +
        (records.filter(r => r.status === 'late').length > 0 ? 
          `*Late Arrivals*\n${records
            .filter(r => r.status === 'late')
            .map(r => `• ${r.employeeName}: ${r.lateDuration} late (arrived ${format(new Date(r.checkInTime), 'HH:mm')})`)
            .join('\n')}\n\n` : '✨ No late arrivals yet!\n\n');
      break;

    case 'midday':
      messageHeader = '☀️ *Midday Attendance Report*\n';
      messageBody = `📅 Date: ${format(now, 'MMMM d, yyyy')}\n\n` +
        `*Current Status*\n` +
        `👥 Total Employees: ${summary.totalEmployees}\n` +
        `✅ Present: ${summary.summary.present}\n` +
        `⏰ Late Arrivals: ${summary.summary.late}\n` +
        `❌ Absent: ${summary.summary.absent}\n` +
        `🚶‍♂️ Already Left: ${summary.summary.checkedOut}\n\n` +
        `*Working Status*\n` +
        `• Currently Working: ${summary.summary.stillWorking}\n` +
        `• Attendance Rate: ${(100 - parseFloat(summary.absentRate)).toFixed(1)}%\n\n` +
        (records.filter(r => !r.checkOutTime).length > 0 ?
          `*Currently Working*\n${records
            .filter(r => !r.checkOutTime)
            .map(r => `• ${r.employeeName} (since ${format(new Date(r.checkInTime), 'HH:mm')})`)
            .join('\n')}\n\n` : '');
      break;

    case 'evening':
      messageHeader = '🌆 *Evening Attendance Summary*\n';
      messageBody = `📅 Date: ${format(now, 'MMMM d, yyyy')}\n\n` +
        `*Daily Overview*\n` +
        `👥 Total Employees: ${summary.totalEmployees}\n` +
        `✅ Present Today: ${summary.summary.present}\n` +
        `⏰ Late Arrivals: ${summary.summary.late}\n` +
        `❌ Absent Today: ${summary.summary.absent}\n` +
        `🚶‍♂️ Checked Out: ${summary.summary.checkedOut}\n\n` +
        `*Performance Metrics*\n` +
        `• On Time Arrivals: ${summary.summary.onTime}\n` +
        `• Still Working: ${summary.summary.stillWorking}\n` +
        `• Daily Attendance: ${(100 - parseFloat(summary.absentRate)).toFixed(1)}%\n\n` +
        (records.filter(r => r.status === 'late').length > 0 ? 
          `*Late Summary*\n${records
            .filter(r => r.status === 'late')
            .map(r => `• ${r.employeeName}: ${r.lateDuration} late`)
            .join('\n')}\n\n` : '') +
        (records.filter(r => !r.checkOutTime).length > 0 ?
          `*Still Working*\n${records
            .filter(r => !r.checkOutTime)
            .map(r => `• ${r.employeeName} (${calculateWorkingDuration(r.checkInTime, null).formatted})`)
            .join('\n')}\n\n` : '');
      break;
  }

  return messageHeader + messageBody + `\n📊 Report generated at ${format(now, 'HH:mm')}`;
};

// Enhanced autoShareAttendanceSummary with report type
export const autoShareAttendanceSummary = async (reportType: 'morning' | 'midday' | 'evening'): Promise<boolean> => {
  try {
    console.log(`Initiating ${reportType} attendance summary sharing...`);
    
    const message = await generateReportMessage(reportType);
    
    // Share with all super admin numbers with improved error handling
    let successCount = 0;
    const totalAdmins = SUPER_ADMIN_NUMBERS.length;

    for (const number of SUPER_ADMIN_NUMBERS) {
      try {
        const formattedNumber = formatWhatsAppNumber(number);
        const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodeURIComponent(message)}`;
        
        if (typeof window !== 'undefined') {
          window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
          successCount++;
          // Add a small delay between opening multiple windows to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        console.error(`Failed to share with number ${number}:`, error);
      }
    }

    console.log(`Successfully shared ${reportType} report with ${successCount}/${totalAdmins} admins`);
    return successCount > 0;
  } catch (error) {
    console.error(`Error in autoShareAttendanceSummary (${reportType}):`, error);
    return false;
  }
};

// Enhanced setupAutoReportScheduling with multiple report times
export const setupAutoReportScheduling = () => {
  console.log("Setting up enhanced auto report scheduling...");
  
  if ((window as any).__autoReportScheduled) {
    console.log("Auto report already scheduled");
    return;
  }
  
  (window as any).__autoReportScheduled = true;
  
  const checkAndSendReport = async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      // Check each schedule
      for (const schedule of REPORT_SCHEDULES) {
        if (currentHour === schedule.hour && currentMinute === schedule.minute) {
          console.log(`Sending ${schedule.type} attendance report...`);
          const success = await autoShareAttendanceSummary(schedule.type as 'morning' | 'midday' | 'evening');
          console.log(`${schedule.type} report sending status:`, success ? "Sent" : "Failed");
        }
      }
    } catch (error) {
      console.error("Error in checkAndSendReport:", error);
    }
  };
  
  // Check every minute
  const intervalId = setInterval(checkAndSendReport, 60000);
  
  // Initial check after 5 seconds
  setTimeout(checkAndSendReport, 5000);
  
  // Store interval ID for cleanup
  (window as any).__autoReportIntervalId = intervalId;
  
  // Log scheduled report times
  console.log("Scheduled report times:");
  REPORT_SCHEDULES.forEach(schedule => {
    console.log(`- ${schedule.type}: ${schedule.hour}:${schedule.minute.toString().padStart(2, '0')}`);
  });
  
  console.log("Enhanced auto report scheduling setup complete");
};
