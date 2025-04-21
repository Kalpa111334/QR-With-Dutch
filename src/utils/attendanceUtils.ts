// Utility functions for handling attendance operations
import { supabase } from '../integrations/supabase/client';

interface AdminContactInfo {
  whatsappNumber: string;
  isWhatsappShareEnabled: boolean;
}

interface WorkTimeInfo {
  checkInTime: string;
  checkOutTime?: string;
  totalHours?: number;
  late_duration?: number;
  status: 'present' | 'checked-out';
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  check_in_time: string;
  check_out_time?: string;
  date: string;
  status: string;
  late_duration?: number;
  total_hours?: number;
  created_at: string;
}

/**
 * Records an attendance check-in using the provided QR code data
 * @param qrData - Data from the scanned QR code
 * @returns Promise<WorkTimeInfo> - True if check-in was successful
 */
export const recordAttendanceCheckIn = async (qrData: string): Promise<WorkTimeInfo> => {
  try {
    console.log('Attempting to validate employee:', qrData); // Debug log

    // First, verify if the QR data corresponds to a valid employee
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('*')
      .or('id.eq.' + qrData + ',email.eq.' + qrData)
      .maybeSingle();

    console.log('Employee lookup result:', { employeeData, employeeError }); // Debug log

    if (employeeError) {
      console.error('Database error during employee lookup:', employeeError);
      throw new Error(`Failed to validate employee: ${employeeError.message}`);
    }

    if (!employeeData) {
      console.log('Employee validation failed'); // Debug log
      throw new Error('Invalid or unregistered employee QR code');
    }

    // Check if attendance already recorded for today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingAttendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeData.id)
      .eq('date', today)
      .maybeSingle();

    if (attendanceError) {
      console.error('Error checking existing attendance:', attendanceError);
      throw new Error(`Failed to check existing attendance: ${attendanceError.message}`);
    }

    if (existingAttendance) {
      throw new Error('Attendance has already been recorded for today');
    }

    // Calculate late minutes (assuming work starts at 9:00 AM)
    const now = new Date();
    const workStartTime = new Date(now);
    workStartTime.setHours(9, 0, 0, 0);
    
    const lateMinutes = now > workStartTime ? 
      Math.floor((now.getTime() - workStartTime.getTime()) / (1000 * 60)) : 
      0;

    const checkInTime = now.toISOString();

    // If we get here, the employee exists and hasn't checked in today
    const { error: insertError } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeData.id,
        check_in_time: checkInTime,
        date: today,
        status: 'present',
        late_duration: lateMinutes
      });

    if (insertError) {
      console.error('Error inserting attendance record:', insertError);
      throw new Error(`Failed to save attendance record: ${insertError.message}`);
    }

    return {
      checkInTime,
      late_duration: lateMinutes,
      status: 'present'
    };
  } catch (error) {
    console.error('Error recording attendance:', error);
    // Preserve the original error message if it's our custom error
    throw error instanceof Error ? error : new Error('Failed to record attendance');
  }
};

/**
 * Gets the admin contact information for WhatsApp sharing
 * @returns Promise<AdminContactInfo>
 */
export const getAdminContactInfo = async (): Promise<AdminContactInfo> => {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('whatsapp_number, is_whatsapp_share_enabled')
      .eq('setting_type', 'whatsapp')
      .maybeSingle();

    // If no settings exist, create default settings
    if (!data) {
      await supabase
        .from('admin_settings')
        .insert({
          setting_type: 'whatsapp',
          whatsapp_number: '',
          is_whatsapp_share_enabled: false
        });
    }

    return {
      whatsappNumber: data?.whatsapp_number || '',
      isWhatsappShareEnabled: data?.is_whatsapp_share_enabled || false
    };
  } catch (error) {
    console.error('Error getting admin contact info:', error);
    return {
      whatsappNumber: '',
      isWhatsappShareEnabled: false
    };
  }
};

/**
 * Saves the admin contact information for WhatsApp sharing
 * @param info - Admin contact information
 * @returns Promise<void>
 */
export const saveAdminContactInfo = async (whatsappNumber: string, isWhatsappShareEnabled: boolean, info: AdminContactInfo): Promise<void> => {
  try {
    // Format WhatsApp number - remove non-digits and ensure proper format
    let formattedNumber = whatsappNumber.replace(/\D/g, '');
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '62' + formattedNumber.substring(1);
    }

    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'whatsapp',
        whatsapp_number: formattedNumber,
        is_whatsapp_share_enabled: isWhatsappShareEnabled
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error saving admin contact info:', error);
    throw new Error('Failed to save WhatsApp settings');
  }
};

/**
 * Sets up automatic scheduling for attendance reports
 * @returns void
 */
export const setupAutoReportScheduling = (): void => {
  // TODO: Implement automatic report scheduling logic
  // This could involve setting up cron jobs or scheduled tasks
  console.log('Auto report scheduling initialized');
};

/**
 * Deletes attendance record(s) based on specified criteria
 * @param attendanceId - ID of the attendance record to delete
 * @returns Promise<boolean> - True if deletion was successful
 */
export const deleteAttendance = async (attendanceId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', attendanceId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting attendance:', error);
    return false;
  }
};

/**
 * Records an attendance check-out using the provided QR code data
 * @param qrData - Data from the scanned QR code
 * @returns Promise<WorkTimeInfo> - True if check-out was successful
 */
export const recordAttendanceCheckOut = async (qrData: string): Promise<WorkTimeInfo> => {
  try {
    console.log('Attempting to validate employee for check-out:', qrData);

    // First, verify if the QR data corresponds to a valid employee
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('*')
      .or('id.eq.' + qrData + ',email.eq.' + qrData)
      .maybeSingle();

    if (employeeError) {
      console.error('Employee verification failed:', employeeError);
      throw new Error(`Failed to validate employee: ${employeeError.message}`);
    }

    if (!employeeData) {
      throw new Error('Invalid or unregistered employee QR code');
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Get today's attendance record
    const { data: attendanceData, error: fetchError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeData.id)
      .eq('date', today)
      .maybeSingle() as { data: AttendanceRecord | null, error: any };

    if (fetchError) {
      console.error('Error fetching attendance:', fetchError);
      throw new Error('Failed to fetch attendance record');
    }

    if (!attendanceData) {
      throw new Error('No check-in record found for today. Please check-in first.');
    }

    if (attendanceData.status === 'checked-out') {
      throw new Error('You have already checked out for today.');
    }

    const checkInDate = new Date(attendanceData.check_in_time);
    const totalHours = (now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60);
    const checkOutTime = now.toISOString();

    // Update the record with check-out information
    const { error: updateError } = await supabase
      .from('attendance')
      .update({
        check_out_time: checkOutTime,
        status: 'checked-out',
        total_hours: totalHours
      })
      .eq('id', attendanceData.id);

    if (updateError) {
      console.error('Error updating attendance record:', updateError);
      throw new Error(`Failed to save check-out: ${updateError.message}`);
    }

    return {
      checkInTime: attendanceData.check_in_time,
      checkOutTime,
      totalHours,
      late_duration: attendanceData.late_duration,
      status: 'checked-out'
    };
  } catch (error) {
    console.error('Error recording check-out:', error);
    throw error instanceof Error ? error : new Error('Failed to record check-out');
  }
};

/**
 * Gets attendance records with optional filtering
 * @returns Promise<Attendance[]> - List of attendance records
 */
export const getAttendanceRecords = async (): Promise<any[]> => {
  try {
    // Join with employees table to get employee names
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        *,
        employee:employees (
          name
        )
      `)
      .order('date', { ascending: false });

    if (error) throw error;

    // Process and format the records
    const formattedRecords = (data || []).map(record => {
      // Calculate working duration if checked out
      let workingDuration = 'Not checked out';
      let workingHours = 0;
      
      if (record.check_out_time && record.check_in_time) {
        const checkIn = new Date(record.check_in_time);
        const checkOut = new Date(record.check_out_time);
        const diffMs = checkOut.getTime() - checkIn.getTime();
        workingHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        workingDuration = `${workingHours} hrs`;
      }

      // Format the record
      return {
        id: record.id,
        employeeId: record.employee_id,
        employeeName: record.employee?.name || 'Unknown',
        date: record.date,
        checkInTime: record.check_in_time,
        checkOutTime: record.check_out_time,
        status: record.status,
        lateDuration: record.late_duration ? `${record.late_duration} min` : 'On time',
        workingDuration,
        workingHours,
        fullTimeRange: record.check_out_time 
          ? `${new Date(record.check_in_time).toLocaleTimeString()} - ${new Date(record.check_out_time).toLocaleTimeString()}`
          : `${new Date(record.check_in_time).toLocaleTimeString()} - Present`
      };
    });

    return formattedRecords;
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
  }
};

/**
 * Gets today's attendance summary
 * @returns Promise<{ totalEmployees: number, presentCount: number, lateCount: number, absentCount: number, checkedOutCount: number }>
 */
export const getTodayAttendanceSummary = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all active employees
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('id')
      .eq('status', 'active');

    if (employeeError) throw employeeError;

    // Get today's attendance records
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', today);

    if (attendanceError) throw attendanceError;

    const totalEmployees = employeeData?.length || 0;
    
    // Count different attendance statuses
    const presentCount = attendanceData?.filter(record => 
      record.status === 'present' && !record.check_out_time
    ).length || 0;
    
    const lateCount = attendanceData?.filter(record => 
      record.late_duration && record.late_duration > 0
    ).length || 0;
    
    const checkedOutCount = attendanceData?.filter(record => 
      record.check_out_time !== null
    ).length || 0;
    
    // Calculate total present (including present, late, and checked out)
    const totalPresent = presentCount + lateCount + checkedOutCount;
    
    // Calculate absent as total employees minus all types of present employees
    const absentCount = Math.max(0, totalEmployees - totalPresent);

    // Calculate rates
    const lateRate = totalPresent > 0 ? ((lateCount / totalPresent) * 100).toFixed(1) : '0';
    const absentRate = totalEmployees > 0 ? ((absentCount / totalEmployees) * 100).toFixed(1) : '0';
    const presentRate = totalEmployees > 0 ? ((totalPresent / totalEmployees) * 100).toFixed(1) : '0';

    return {
      totalEmployees,
      presentCount,
      lateCount,
      absentCount,
      checkedOutCount,
      onTime: presentCount,
      stillWorking: presentCount + lateCount,
      lateRate,
      absentRate,
      presentRate
    };
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    return {
      totalEmployees: 0,
      presentCount: 0,
      lateCount: 0,
      absentCount: 0,
      checkedOutCount: 0,
      onTime: 0,
      stillWorking: 0,
      lateRate: '0',
      absentRate: '0',
      presentRate: '0'
    };
  }
};

/**
 * Automatically shares attendance summary via configured methods (e.g., WhatsApp)
 * @returns Promise<boolean> - True if sharing was successful
 */
export const autoShareAttendanceSummary = async (): Promise<boolean> => {
  try {
    const summary = await getTodayAttendanceSummary();
    const { whatsappNumber, isWhatsappShareEnabled } = await getAdminContactInfo();

    if (!isWhatsappShareEnabled || !whatsappNumber) {
      console.log('WhatsApp sharing is disabled or no numbers configured');
      return false;
    }

    // Format the date in a more readable way
    const dateOptions: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const formattedDate = new Date().toLocaleDateString('en-US', dateOptions);

    // Create a well-formatted message with proper spacing and formatting
    const message = 
`🏢 *DAILY ATTENDANCE REPORT*
───────────────────
📅 Date: ${formattedDate}
───────────────────

📊 *SUMMARY*
• Total Employees: ${summary.totalEmployees}
• Present: ${summary.presentCount} ✅
• Late: ${summary.lateCount} ⏰
• Absent: ${summary.absentCount} ❌
• Checked Out: ${summary.checkedOutCount} 🏃

📈 *STATISTICS*
• On Time Rate: ${(100 - parseFloat(summary.lateRate)).toFixed(1)}%
• Late Rate: ${summary.lateRate}%
• Absence Rate: ${summary.absentRate}%

👥 *CURRENT STATUS*
• Still Working: ${summary.stillWorking}
• Checked Out: ${summary.checkedOutCount}

Generated by QR Check-In System
─────────────────────────`;

    try {
      // Split the WhatsApp numbers
      const numbers = whatsappNumber.split('|').map(n => n.trim());
      
      // Open WhatsApp for each number
      for (const number of numbers) {
        // Clean and format the WhatsApp number
        const cleanNumber = number.replace(/\D/g, '');
        if (!cleanNumber) {
          console.error('Invalid WhatsApp number format:', number);
          continue;
        }

        // Create the WhatsApp URL with proper encoding
        const encodedMessage = encodeURIComponent(message);
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanNumber}&text=${encodedMessage}`;

        // Open in a new window
        window.open(whatsappUrl, '_blank');
        
        // Add a small delay between opening multiple windows to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return true;
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      throw new Error('Failed to open WhatsApp. Please check your browser settings and try again.');
    }
  } catch (error) {
    console.error('Error in autoShareAttendanceSummary:', error);
    return false;
  }
};
