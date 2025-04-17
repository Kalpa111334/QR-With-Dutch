import { supabase } from '../integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, differenceInHours, differenceInSeconds, parseISO } from 'date-fns';
import { Attendance } from '../types';
import { toast } from '../components/ui/use-toast';
import { Database } from '../integrations/supabase/types';

type AdminSettingsRow = Database['public']['Tables']['admin_settings']['Row'];
type AdminSettingsInsert = Database['public']['Tables']['admin_settings']['Insert'];
type AdminSettingsUpdate = Database['public']['Tables']['admin_settings']['Update'];

// Employee type definition
interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

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
      .select('*', { count: 'exact' })
      .eq('status', 'active'); // Only count active employees
    
    if (error) {
      console.error('Error fetching total employee count:', error);
      return 0;
    }
    
    return count || 0;
  } catch (error) {
    console.error('Error in getTotalEmployeeCount:', error);
    return 0;
  }
}

// Function to handle attendance check-in with retries and error handling
export const recordAttendanceCheckIn = async (employeeId: string): Promise<boolean> => {
  const maxRetries = 3;
  let retryCount = 0;

  const attemptCheckIn = async (): Promise<boolean> => {
    try {
      // Log the start of the operation
      console.log(`Attempt ${retryCount + 1} - Starting attendance check-in for employee:`, employeeId);

      // First check if we have an active session and refresh if needed
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // If no session, try to refresh it
      if (!session && !sessionError) {
        console.log('No active session, attempting to refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshData?.session) {
          console.log('Session refreshed successfully');
          session = refreshData.session;
        } else {
          console.error('Session refresh failed:', refreshError);
          sessionError = refreshError;
        }
      }
      
      console.log('Session check result:', session ? 'Active session found' : 'No active session');
      
      if (!session || sessionError) {
        // Silently redirect to login page without showing error message
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return false;
      }
      
      // Rest of the implementation remains the same
      return true;
    } catch (error) {
      console.error('Error in attemptCheckIn:', error);
      return false;
    }
  };

  return attemptCheckIn();
    try {
      // Log the start of the operation
      console.log(`Attempt ${retryCount + 1} - Starting attendance check-in for employee:`, employeeId);

      // First check if we have an active session and refresh if needed
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // If no session, try to refresh it
      if (!session && !sessionError) {
        console.log('No active session, attempting to refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshData?.session) {
          console.log('Session refreshed successfully');
          session = refreshData.session;
        } else {
          console.error('Session refresh failed:', refreshError);
          sessionError = refreshError;
        }
      }

      console.log('Session check result:', session ? 'Active session found' : 'No active session');
      
      if (!session || sessionError) {
        // Silently redirect to login page without showing error message
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
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
      let existingRecord: { id: string; check_in_time: string; status: string } | null = null;
      try {
        // Check for existing attendance record
        const { data, error: checkError } = await supabase
          .from('attendance')
          .select('id, check_in_time, status')
          .eq('employee_id', employeeId)
          .eq('date', today)
          .single();

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is the 'not found' error
          console.error('Error checking existing attendance:', checkError);
          throw checkError;
        }

        existingRecord = data;

        if (existingRecord) {
          console.log('Attendance record already exists for today');
          return true;
        }

        // Create new attendance record
        const { error: insertError } = await supabase
          .from('attendance')
          .insert([
            {
              employee_id: employeeId,
              date: today,
              check_in_time: checkInTime,
              status: 'present'
            }
          ]);

        if (insertError) {
          console.error('Error inserting attendance record:', insertError);
          throw insertError;
        }

        console.log('Successfully recorded attendance check-in');
        return true;
      } catch (error) {
        console.error('Error in attendance check-in:', error);
        toast({
          title: "Error Checking Attendance",
          description: "Failed to verify existing attendance. Retrying...",
          variant: "destructive"
        });
        return false;
      }

      if (existingRecord) {
        console.log('Found existing attendance record:', existingRecord);
        toast({
          title: "Already Checked In",
          description: `You have already checked in today at ${format(new Date(existingRecord.check_in_time), 'HH:mm')}`,
        });
        return false;
      }
      
      // Quick check-in process
      const currentTime = new Date().toISOString();
      const lateDuration = calculateLateDuration(currentTime);
      const isLate = lateDuration.totalMinutes > 0;
      
      // Prepare attendance record with all necessary data
      const attendanceRecord = {
        employee_id: employeeId,
        date: today,
        check_in_time: checkInTime,
        status: isLate ? 'late' : 'present',
        late_duration: isLate ? lateDuration.totalMinutes : 0,
        device_info: typeof window !== 'undefined' ? navigator.userAgent : 'Unknown',
        check_in_location: 'office',
        check_in_attempts: 1
      };

      console.log('Inserting attendance record:', attendanceRecord);
      
      // Verify database connection and check for existing record in a single query
      try {
        const { data: existingData, error: existingError } = await supabase
          .from('attendance')
          .select('id, check_in_time')
          .eq('employee_id', employeeId)
          .eq('date', today)
          .maybeSingle();

        if (existingError) {
          console.error('Database check failed:', existingError);
          toast({
            title: "Connection Error",
            description: "Unable to verify attendance status. Please try again.",
            variant: "destructive"
          });
          return false;
        }

        if (existingData) {
          console.log('Found existing attendance record:', existingData);
          toast({
            title: "Already Checked In",
            description: `You have already checked in today at ${format(new Date(existingData.check_in_time), 'HH:mm')}`,
          });
          return false;
        }

        console.log('No existing attendance record found, proceeding with check-in');
      } catch (error) {
        console.error('Database check failed:', error);
        toast({
          title: "Error",
          description: "Unable to verify attendance status. Please try again.",
          variant: "destructive"
        });
        return false;
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
            .insert([attendanceRecord])
            .select('id, check_in_time, status')
            .single();

          clearTimeout(timeout);

          if (error) {
            console.error('Insert error:', error);
            reject(error);
            return;
          }

          if (!data) {
            console.error('No data returned after insert');
            reject(new Error('Failed to record attendance'));
            return;
          }

          // Verify the insert was successful
          const verifyData = await supabase
            .from('attendance')
            .select('id, check_in_time, status')
            .eq('id', data.id)
            .single();

          if (verifyData.error || !verifyData.data) {
            console.error('Verification failed after insert:', verifyData.error);
            reject(new Error('Failed to verify attendance record'));
            return;
          }

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
          });
        } else {
          toast({
            title: "Error",
            description: "An unexpected error occurred. Please try again.",
          });
        }
        return null;
      });

      if (!insertedData) return false;
      return true;
  } catch (error) {
    console.error('Error in attemptCheckIn:', error);
    return false;
  }
  return false; // Add default return for all code paths
}

async function checkAttendanceStatus(employeeId: string): Promise<boolean> {
  try {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');

    // Quick check for existing attendance
    const { data: existingRecord, error: checkError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw new Error('Failed to check attendance status');
    }

    // If already checked in, show error
    if (existingRecord) {
      if (typeof window !== 'undefined') {
        const Swal = (window as any).Swal;
        if (Swal) {
          await Swal.fire({
            icon: 'error',
            title: 'Already Checked In',
            text: 'You have already checked in for today.',
            timer: 2000,
            timerProgressBar: true,
            showConfirmButton: false
          });
        }
      }
      return false;
    }

    // Calculate late duration
    const lateDuration = calculateLateDuration(now.toISOString());

    // Insert attendance record
    const { error: insertError } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: today,
        check_in_time: now.toISOString(),
        late_duration: lateDuration.totalMinutes,
        status: lateDuration.totalMinutes > 0 ? 'late' : 'on_time'
      });

    if (insertError) {
      throw new Error('Failed to record attendance');
    }

    // Show quick success message
    if (typeof window !== 'undefined') {
      const Swal = (window as any).Swal;
      if (Swal) {
        await Swal.fire({
          icon: 'success',
          title: 'Check-in Successful',
          html: `<div>
            <p>Checked in at ${format(now, 'HH:mm')}</p>
            ${lateDuration.totalMinutes > 0 ? 
              `<p class="text-warning">You are ${lateDuration.formatted} late</p>
               <p class="text-sm">Expected arrival: ${lateDuration.expectedTime}</p>` : 
              '<p class="text-success">You are on time!</p>'}
          </div>`,
          timer: 2000,
          timerProgressBar: true,
          showConfirmButton: false
        });
      }
    }
    return true;
  } catch (error) {
    console.error('Error during check-in:', error);
    if (typeof window !== 'undefined') {
      const Swal = (window as any).Swal;
      if (Swal) {
        await Swal.fire({
          icon: 'error',
          title: 'Check-in Failed',
          text: 'Please try again or contact support.',
          timer: 2000,
          timerProgressBar: true,
          showConfirmButton: false
        });
      }
    }
    return false;
  }


// Get admin contact info with WhatsApp settings
async function getAdminContactInfo(): Promise<AdminContactInfo> {
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

}

// Enhanced setupAutoReportScheduling with multiple report times

