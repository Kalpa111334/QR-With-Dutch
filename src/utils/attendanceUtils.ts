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
async function getAttendance(): Promise<Attendance[]> {
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
const getAttendanceRecords = getAttendance;

// Get attendance records by date range with proper type casting
async function getAttendanceByDateRange(startDate: string, endDate: string): Promise<Attendance[]> {
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
async function getTotalEmployeeCount(): Promise<number> {
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
async function recordAttendanceCheckIn(employeeId: string): Promise<boolean> {
  const maxRetries = 3;
  let retryCount = 0;

  const attemptCheckIn = async (): Promise<boolean> => {
    try {
      // Log the start of the operation
      console.log(`Attempt ${retryCount + 1} - Starting attendance check-in for employee:`, employeeId);

      // First check if we have an active session and refresh if needed
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      console.log('Initial session check:', { session: !!session, error: sessionError });
      
      // Always try to refresh the session
      console.log('Attempting to refresh session...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      console.log('Session refresh result:', { success: !!refreshData?.session, error: refreshError });
      
      if (refreshData?.session) {
        console.log('Session refreshed successfully');
        session = refreshData.session;
      } else {
        // Try to get a new session
        console.log('Session refresh failed, attempting to get current session...');
        const { data: currentData, error: currentError } = await supabase.auth.getSession();
        
        if (currentData?.session) {
          console.log('Got current session successfully');
          session = currentData.session;
        } else {
          console.error('Failed to get current session:', { refreshError, currentError });
          sessionError = currentError || refreshError;
        }
      }

      if (!session) {
        console.error('No active session found:', { error: sessionError });
        
        // Try to get a new session one last time
        const { data: finalData } = await supabase.auth.getSession();
        if (finalData?.session) {
          console.log('Got session on final attempt');
          session = finalData.session;
        } else {
          console.error('All session retrieval attempts failed');
          // Clear any stale session data
          await supabase.auth.signOut();
          toast({
            title: "Authentication Error",
            description: "Please refresh the page and log in again.",
            variant: "destructive"
          });
          return false;
        }
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
          console.log('Employee lookup result:', { found: !!data, error });
          
          if (error) {
            console.error('Employee lookup error:', error);
            reject(error);
            return;
          }
          if (!data) {
            console.error('No employee data found for ID:', employeeId);
            reject(new Error('No employee data found'));
            return;
          }
          resolve(data as Employee);
        } catch (err) {
          clearTimeout(timeout);
          console.error('Employee lookup exception:', err);
          reject(err);
        }
      });

      const employee: Employee | null = await employeePromise.catch((error) => {
        console.error('Employee verification error:', error);
        toast({
          title: "Employee Verification Failed",
          description: "Could not verify employee ID. Please try again or contact support.",
          variant: "destructive"
        });
        return null;
      });

      if (!employee) {
        return false;
      }

      // At this point, employee is guaranteed to be of type Employee
      const verifiedEmployee: Employee = employee;
      console.log('Employee verified:', { id: verifiedEmployee.id, name: `${verifiedEmployee.first_name} ${verifiedEmployee.last_name}` });

      // Get current date/time in the correct format
      const now = new Date();
      const today = format(startOfDay(now), 'yyyy-MM-dd');
      const checkInTime = now.toISOString();
      
      // Check for existing attendance with detailed error logging
      console.log('Checking for existing attendance record...');
      const { data: existingRecord, error: checkError } = await supabase
        .from('attendance')
        .select('id, check_in_time, status')
        .eq('employee_id', employeeId)
        .eq('date', today)
        .maybeSingle(); // Use maybeSingle instead of single to avoid errors

      console.log('Existing attendance check result:', { found: !!existingRecord, error: checkError });

      if (checkError) {
        console.error('Error checking existing attendance:', checkError);
        toast({
          title: "Check-in Failed",
          description: "Error checking attendance record. Please try again.",
          variant: "destructive"
        });
        return false;
      }

      if (existingRecord) {
        console.log('Attendance record already exists:', existingRecord);
        toast({
          title: "Already Checked In",
          description: `You have already checked in today at ${format(new Date(existingRecord.check_in_time), 'HH:mm')}`,
          variant: "destructive"
        });
        return false;
      }

      // Create new attendance record with detailed logging
      console.log('Creating new attendance record...');
      const attendanceRecord = {
        employee_id: employeeId,
        date: today,
        check_in_time: checkInTime,
        status: 'present',
        created_at: checkInTime
      };
      
      try {
        console.log('Attempting to insert record:', attendanceRecord);
        const { data: insertedRecord, error: insertError } = await supabase
          .from('attendance')
          .insert([attendanceRecord]) // Wrap in array as required by Supabase
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        if (!insertedRecord) {
          throw new Error('No record was inserted');
        }

        console.log('Attendance check-in successful:', insertedRecord);
        toast({
          title: "Check-in Successful",
          description: `Welcome, ${verifiedEmployee.first_name}! Your attendance has been recorded.`,
          variant: "default"
        });
        return true;
      } catch (error) {
        console.error('Error creating attendance record:', error);
        toast({
          title: "Check-in Failed",
          description: "Failed to record attendance. Please try again.",
          variant: "destructive"
        });
        return false;
      }

    } catch (error) {
      console.error('Unexpected error in attemptCheckIn:', error);
      toast({
        title: "Check-in Failed",
        description: "An unexpected error occurred. Please try again or contact support if the issue persists.",
        variant: "destructive"
      });
      return false;
    }
  };

  while (retryCount < maxRetries) {
    console.log(`Starting check-in attempt ${retryCount + 1} of ${maxRetries}`);
    const success = await attemptCheckIn();
    if (success) {
      console.log('Check-in successful on attempt', retryCount + 1);
      return true;
    }
    retryCount++;
    if (retryCount < maxRetries) {
      const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Check-in failed, waiting ${delay}ms before retry ${retryCount + 1}...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.error('Check-in failed after all retry attempts');
  return false;
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
}

// Get admin contact info with WhatsApp settings
async function getAdminContactInfo(): Promise<AdminContactInfo> {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('setting_type', 'whatsapp')
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

// Save admin contact info with WhatsApp settings
async function saveAdminContactInfo(settings: AdminContactInfo): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'whatsapp',
        whatsapp_number: settings.whatsappNumber,
        is_whatsapp_share_enabled: settings.isWhatsappShareEnabled
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error saving admin contact info:', error);
    return false;
  }
}

// Auto share attendance summary via WhatsApp
async function autoShareAttendanceSummary(): Promise<boolean> {
  try {
    const summary = await getTodayAttendanceSummary();
    const adminSettings = await getAdminContactInfo();

    if (!adminSettings.isWhatsappShareEnabled || !adminSettings.whatsappNumber) {
      return false;
    }

    const message = formatAttendanceSummary(summary);
    const whatsappUrl = `https://wa.me/${adminSettings.whatsappNumber}?text=${encodeURIComponent(message)}`;

    // In a browser environment, open WhatsApp
    if (typeof window !== 'undefined') {
      window.open(whatsappUrl, '_blank');
    }

    return true;
  } catch (error) {
    console.error('Error auto-sharing attendance summary:', error);
    return false;
  }
}

// Get today's attendance summary
async function getTodayAttendanceSummary(): Promise<{
  totalEmployees: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  onTimeCount: number;
}> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [{ data: attendanceData }, totalEmployees] = await Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .eq('date', today),
      getTotalEmployeeCount()
    ]);

    const presentCount = attendanceData?.length || 0;
    const lateCount = attendanceData?.filter(record => record.status === 'late').length || 0;
    const onTimeCount = attendanceData?.filter(record => record.status === 'on_time').length || 0;
    const absentCount = totalEmployees - presentCount;

    return {
      totalEmployees,
      presentCount,
      lateCount,
      absentCount,
      onTimeCount
    };
  } catch (error) {
    console.error('Error getting today\'s attendance summary:', error);
    return {
      totalEmployees: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      onTimeCount: 0
    };
  }
}

// Format attendance summary for WhatsApp
function formatAttendanceSummary(summary: {
  totalEmployees: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  onTimeCount: number;
}): string {
  const date = new Date().toLocaleDateString();
  return `*Attendance Summary - ${date}*\n\n` +
    `Total Employees: ${summary.totalEmployees}\n` +
    `Present: ${summary.presentCount}\n` +
    `- On Time: ${summary.onTimeCount}\n` +
    `- Late: ${summary.lateCount}\n` +
    `Absent: ${summary.absentCount}\n\n` +
    `Attendance Rate: ${((summary.presentCount / summary.totalEmployees) * 100).toFixed(1)}%\n` +
    `On-Time Rate: ${((summary.onTimeCount / summary.presentCount) * 100).toFixed(1)}%`;
}

// Enhanced setupAutoReportScheduling with multiple report times
async function setupAutoReportScheduling() {
  const reportTimes = ['18:00']; // Add more times if needed

  // Clear any existing intervals
  if (typeof window !== 'undefined') {
    const existingIntervals = window.localStorage.getItem('reportIntervals');
    if (existingIntervals) {
      JSON.parse(existingIntervals).forEach((intervalId: number) => {
        clearInterval(intervalId);
      });
    }
  }

  const intervals: number[] = [];

  reportTimes.forEach(time => {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const nextReport = new Date(now);
    nextReport.setHours(hours, minutes, 0, 0);

    if (nextReport <= now) {
      nextReport.setDate(nextReport.getDate() + 1);
    }

    const msUntilNextReport = nextReport.getTime() - now.getTime();

    // Set initial timeout to start the daily interval
    setTimeout(() => {
      // Share the first report
      autoShareAttendanceSummary();

      // Set up daily interval
      const intervalId = window.setInterval(() => {
        autoShareAttendanceSummary();
      }, 24 * 60 * 60 * 1000); // 24 hours

      intervals.push(intervalId);

      // Store interval IDs
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('reportIntervals', JSON.stringify(intervals));
      }
    }, msUntilNextReport);
  });
}

// Function to handle attendance check-out with retries and error handling
async function recordAttendanceCheckOut(employeeId: string): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's attendance record
    const { data: existingRecord } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();
    
    if (!existingRecord) {
      toast({
        title: 'Error',
        description: 'No check-in record found for today',
        variant: 'destructive',
      });
      return false;
    }
    
    if (existingRecord.check_out_time) {
      toast({
        title: 'Already Checked Out',
        description: 'You have already checked out for today',
        variant: 'destructive',
      });
      return false;
    }
    
    // Update the record with check-out time
    const checkOutTime = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('attendance')
      .update({
        check_out_time: checkOutTime,
        updated_at: checkOutTime
      })
      .eq('id', existingRecord.id);
    
    if (updateError) {
      console.error('Error recording check-out:', updateError);
      toast({
        title: 'Error',
        description: 'Failed to record check-out',
        variant: 'destructive',
      });
      return false;
    }
    
    toast({
      title: 'Success',
      description: 'Check-out recorded successfully',
      variant: 'default',
    });
    
    return true;
  } catch (error) {
    console.error('Error in recordAttendanceCheckOut:', error);
    toast({
      title: 'Error',
      description: 'An unexpected error occurred',
      variant: 'destructive',
    });
    return false;
  }
}

export { calculateLateDuration, calculateMinutesLate, calculateWorkingDuration, getAttendance, getAttendanceRecords, getAttendanceByDateRange, getTotalEmployeeCount, recordAttendanceCheckIn, recordAttendanceCheckOut, checkAttendanceStatus, getAdminContactInfo, saveAdminContactInfo, autoShareAttendanceSummary, getTodayAttendanceSummary, setupAutoReportScheduling };
