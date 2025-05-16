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
  sequence_number: number;
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
  sequence_number: number;
}

interface DetailedAttendanceCount {
  onTime: number;
  lateArrivals: number;
  veryLate: number;
  halfDay: number;
  earlyDepartures: number;
  overtime: number;
  regularHours: number;
}

/**
 * Records an attendance check-in using the provided QR code data
 * @param qrData - Data from the scanned QR code
 * @returns Promise<WorkTimeInfo> - True if check-in was successful
 */
export const recordAttendanceCheckIn = async (qrData: string): Promise<WorkTimeInfo> => {
  try {
    console.log('Attempting to validate employee:', qrData);

    // First, verify if the QR data corresponds to a valid employee
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('*')
      .or('id.eq.' + qrData + ',email.eq.' + qrData)
      .maybeSingle();

    console.log('Employee lookup result:', { employeeData, employeeError });

    if (employeeError) {
      console.error('Database error during employee lookup:', employeeError);
      throw new Error(`Failed to validate employee: ${employeeError.message}`);
    }

    if (!employeeData) {
      console.log('Employee validation failed');
      throw new Error('Invalid or unregistered employee QR code');
    }

    // Check existing attendance records for today
    const today = new Date().toISOString().split('T')[0];
    const { data: existingAttendance, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeData.id)
      .eq('date', today)
      .order('sequence_number', { ascending: false })
      .limit(1);

    if (attendanceError) {
      console.error('Error checking existing attendance:', attendanceError);
      throw new Error(`Failed to check existing attendance: ${attendanceError.message}`);
    }

    const lastRecord = existingAttendance?.[0];
    let sequenceNumber = 1;

    if (lastRecord) {
      // If last record exists and is not checked out, throw error
      if (!lastRecord.check_out_time) {
        throw new Error('Please check out from your previous session first');
      }
      
      // If last record is sequence 2, throw error as max 2 check-ins per day
      if (lastRecord.sequence_number === 2) {
        throw new Error('Maximum check-ins for today reached (2)');
      }
      
      // If we get here, we're doing the second check-in
      sequenceNumber = 2;
    }

    // Calculate late minutes (assuming work starts at 9:00 AM for first check-in)
    const now = new Date();
    const workStartTime = new Date(now);
    workStartTime.setHours(9, 0, 0, 0);
    
    // Only calculate late minutes for first check-in
    const lateMinutes = sequenceNumber === 1 && now > workStartTime ? 
      Math.floor((now.getTime() - workStartTime.getTime()) / (1000 * 60)) : 
      0;

    const checkInTime = now.toISOString();

    // Insert new attendance record
    const { error: insertError } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeData.id,
        check_in_time: checkInTime,
        date: today,
        status: 'present',
        late_duration: lateMinutes,
        sequence_number: sequenceNumber
      });

    if (insertError) {
      console.error('Error inserting attendance record:', insertError);
      throw new Error(`Failed to save attendance record: ${insertError.message}`);
    }

    return {
      checkInTime,
      late_duration: lateMinutes,
      status: 'present',
      sequence_number: sequenceNumber
    };
  } catch (error) {
    console.error('Error recording attendance:', error);
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
 * @param whatsappNumber - WhatsApp number(s) separated by |
 * @param isWhatsappShareEnabled - Whether WhatsApp sharing is enabled
 * @param info - Additional admin contact information
 * @returns Promise<void>
 */
export const saveAdminContactInfo = async (whatsappNumber: string, isWhatsappShareEnabled: boolean, info: AdminContactInfo): Promise<void> => {
  try {
    // Format WhatsApp number
    let formattedNumber = whatsappNumber.trim().replace(/\D/g, '');
    
    // Add country code if needed
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '94' + formattedNumber.substring(1);
    } else if (!formattedNumber.startsWith('94')) {
      formattedNumber = '94' + formattedNumber;
    }

    // Validate number if WhatsApp sharing is enabled
    if (isWhatsappShareEnabled) {
      if (formattedNumber.length < 11) {
        throw new Error('Please enter a valid WhatsApp number (minimum 11 digits)');
      }
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
    throw error instanceof Error ? error : new Error('Failed to save WhatsApp settings');
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

    // Get today's latest attendance record
    const { data: attendanceData, error: fetchError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeData.id)
      .eq('date', today)
      .order('sequence_number', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching attendance:', fetchError);
      throw new Error('Failed to fetch attendance record');
    }

    const lastRecord = attendanceData?.[0];

    if (!lastRecord) {
      throw new Error('No check-in record found for today. Please check-in first.');
    }

    if (lastRecord.check_out_time) {
      throw new Error('You have already checked out from your current session.');
    }

    // Check if 5 minutes have passed since check-in
    const checkInDate = new Date(lastRecord.check_in_time);
    const minutesSinceCheckIn = (now.getTime() - checkInDate.getTime()) / (1000 * 60);

    if (minutesSinceCheckIn < 5) {
      throw new Error('Please wait at least 5 minutes after logging in before logging out.');
    }

    // Calculate total hours worked
    const totalHours = minutesSinceCheckIn / 60;

    // Update the attendance record with check-out time
    const { error: updateError } = await supabase
      .from('attendance')
      .update({
        check_out_time: now.toISOString(),
        total_hours: totalHours,
        status: 'checked-out'
      })
      .eq('id', lastRecord.id);

    if (updateError) {
      console.error('Error updating attendance record:', updateError);
      throw new Error('Failed to update attendance record');
    }

    return {
      checkInTime: lastRecord.check_in_time,
      checkOutTime: now.toISOString(),
      totalHours,
      status: 'checked-out',
      sequence_number: lastRecord.sequence_number
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
 * Gets today's attendance summary with detailed counting
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
    
    // Calculate presence status one by one
    const presenceStatus = {
      currentlyPresent: attendanceData?.filter(record => 
        record.status === 'present' && !record.check_out_time
      ).length || 0,
      
      lateButPresent: attendanceData?.filter(record => 
        record.status === 'present' && 
        record.late_duration && 
        record.late_duration > 0 && 
        !record.check_out_time
      ).length || 0,
      
      checkedOut: attendanceData?.filter(record => 
        record.check_out_time !== null
      ).length || 0,
      
      onTimeArrivals: attendanceData?.filter(record => 
        record.late_duration === 0
      ).length || 0
    };

    // Calculate total present (all types of presence)
    const totalPresent = presenceStatus.currentlyPresent + 
                        presenceStatus.lateButPresent + 
                        presenceStatus.checkedOut;

    // Calculate rates
    const rates = {
      currentPresenceRate: totalEmployees > 0 ? 
        ((presenceStatus.currentlyPresent / totalEmployees) * 100).toFixed(1) : '0',
      
      totalPresentRate: totalEmployees > 0 ? 
        ((totalPresent / totalEmployees) * 100).toFixed(1) : '0',
      
      onTimeRate: totalPresent > 0 ? 
        ((presenceStatus.onTimeArrivals / totalPresent) * 100).toFixed(1) : '0',
      
      lateRate: totalPresent > 0 ? 
        ((presenceStatus.lateButPresent / totalPresent) * 100).toFixed(1) : '0'
    };

    // Calculate absent count
    const absentCount = Math.max(0, totalEmployees - totalPresent);
    const absentRate = totalEmployees > 0 ? 
      ((absentCount / totalEmployees) * 100).toFixed(1) : '0';

    // Detailed counting for time-based categories
    const detailed: DetailedAttendanceCount = {
      onTime: presenceStatus.onTimeArrivals,
      lateArrivals: 0,
      veryLate: 0,
      halfDay: 0,
      earlyDepartures: 0,
      overtime: 0,
      regularHours: 0
    };

    // Process each attendance record for detailed time-based counting
    attendanceData?.forEach(record => {
      if (record.late_duration > 0) {
        if (record.late_duration <= 30) {
          detailed.lateArrivals++;
        } else if (record.late_duration <= 240) {
          detailed.veryLate++;
        } else {
          detailed.halfDay++;
        }
      }

      if (record.check_out_time) {
        const checkIn = new Date(record.check_in_time);
        const checkOut = new Date(record.check_out_time);
        const workEnd = new Date(checkOut);
        workEnd.setHours(17, 0, 0, 0);
        
        const workingHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        
        if (checkOut < workEnd) {
          detailed.earlyDepartures++;
        } else if (workingHours > 9) {
          detailed.overtime++;
        } else {
          detailed.regularHours++;
        }
      }
    });

    return {
      // Standard summary with detailed presence breakdown
      totalEmployees,
      presentCount: presenceStatus.currentlyPresent,
      lateCount: presenceStatus.lateButPresent,
      absentCount,
      checkedOutCount: presenceStatus.checkedOut,
      onTime: detailed.onTime,
      stillWorking: presenceStatus.currentlyPresent + presenceStatus.lateButPresent,
      
      // Detailed rates
      currentPresenceRate: rates.currentPresenceRate,
      totalPresentRate: rates.totalPresentRate,
      onTimeRate: rates.onTimeRate,
      lateRate: rates.lateRate,
      absentRate,
      
      // Detailed counts
      detailed: {
        ...detailed,
        attendanceRate: rates.totalPresentRate,
        efficiencyRate: ((detailed.regularHours + detailed.overtime) / totalPresent * 100).toFixed(1),
        punctualityRate: rates.onTimeRate
      },
      
      // Presence breakdown
      presenceBreakdown: {
        currentlyPresent: presenceStatus.currentlyPresent,
        lateButPresent: presenceStatus.lateButPresent,
        checkedOut: presenceStatus.checkedOut,
        onTimeArrivals: presenceStatus.onTimeArrivals,
        absent: absentCount
      }
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

/**
 * Automatically shares attendance summary via configured methods (e.g., WhatsApp)
 * @returns Promise<string | false> - WhatsApp URL if sharing was successful, false otherwise
 */
export const autoShareAttendanceSummary = async (): Promise<string | false> => {
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    const formattedDate = new Date().toLocaleDateString('en-US', dateOptions);

    // Calculate percentages for better readability
    const onTimePercentage = (100 - parseFloat(summary.lateRate)).toFixed(1);
    const latePercentage = summary.lateRate;
    const absentPercentage = summary.absentRate;
    const efficiencyRate = summary.detailed.efficiencyRate;

    // Create a well-formatted message with proper spacing, emojis, and sections
    const message = 
`🏢 *DETAILED ATTENDANCE REPORT*
━━━━━━━━━━━━━━━━━━━━━
📅 Generated: ${formattedDate}
━━━━━━━━━━━━━━━━━━━━━

📊 *CURRENT STATUS*
• Total Employees: ${summary.totalEmployees}
• Currently Present: ${summary.presenceBreakdown.currentlyPresent} 👥
• Late but Working: ${summary.presenceBreakdown.lateButPresent} ⏰
• Checked Out: ${summary.presenceBreakdown.checkedOut} 🏃
• Absent: ${summary.absentCount} ❌

⏱ *PUNCTUALITY BREAKDOWN*
• On Time Arrivals: ${summary.presenceBreakdown.onTimeArrivals} (${onTimePercentage}%) ✅
• Late Arrivals: ${summary.lateCount} (${latePercentage}%) ⚠️
• Very Late: ${summary.detailed.veryLate} ⛔
• Half Day: ${summary.detailed.halfDay} 📅

💼 *WORK PATTERNS*
• Regular Hours: ${summary.detailed.regularHours} 📝
• Overtime: ${summary.detailed.overtime} 💪
• Early Departures: ${summary.detailed.earlyDepartures} 🚶

📈 *KEY METRICS*
• Attendance Rate: ${summary.totalPresentRate}% 📊
• Efficiency Rate: ${efficiencyRate}% ⚡
• Current Presence: ${summary.currentPresenceRate}% 🎯
• Absence Rate: ${absentPercentage}% 📉

👥 *WORKFORCE INSIGHTS*
• Still Working: ${summary.stillWorking} employees
• Total Present Today: ${summary.presentCount}/${summary.totalEmployees}
• Expected Return: ${summary.presenceBreakdown.lateButPresent} employees

━━━━━━━━━━━━━━━━━━━━━
🤖 Generated by QR Check-In System
🕒 Auto-updates every 30 seconds
📱 Contact admin for any queries`;

    // Process the WhatsApp number
    const number = whatsappNumber.trim().replace(/\D/g, '');
    
    // Ensure proper number format
    let formattedNumber = number;
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '94' + formattedNumber.substring(1);
    } else if (!formattedNumber.startsWith('94')) {
      formattedNumber = '94' + formattedNumber;
    }

    // Validate number
    if (formattedNumber.length < 11) {
      console.error('Invalid WhatsApp number format');
      return false;
    }

    // Create WhatsApp URL using the api.whatsapp.com format
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedNumber}&text=${encodedMessage}`;
    
    return whatsappUrl;
  } catch (error) {
    console.error('Error in autoShareAttendanceSummary:', error);
    return false;
  }
};
