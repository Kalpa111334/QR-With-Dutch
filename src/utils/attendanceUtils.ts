import { supabase } from '../integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Attendance } from '../types';
import { toast } from '../components/ui/use-toast';

// Admin settings interface for proper typing
interface AdminSettings {
  id: string;
  setting_type: string;
  send_method: string;
  phone_number: string;
  email: string;
  created_at: string;
  updated_at: string;
  auto_share_enabled: boolean;
  email_share_enabled: boolean;
}

// Admin contact info type for better type safety
interface AdminContactInfo {
  phoneNumber: string;
  sendMethod: 'whatsapp' | 'sms';
  isAutoShareEnabled: boolean;
  email: string;
  isEmailShareEnabled: boolean;
}

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
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: `${record.employees?.first_name || ''} ${record.employees?.last_name || ''}`.trim(),
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: format(new Date(record.date), 'yyyy-MM-dd'),
      status: (record.status as 'present' | 'late' | 'absent') || 'present'
    }));
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
    
    // Transform with proper type casting
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: `${record.employees?.first_name || ''} ${record.employees?.last_name || ''}`.trim(),
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: format(new Date(record.date), 'yyyy-MM-dd'),
      status: (record.status as 'present' | 'late' | 'absent') || 'present'
    }));
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

// Record attendance check-in
export const recordAttendanceCheckIn = async (employeeId: string): Promise<boolean> => {
  try {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    // Format the check-in time as an ISO string instead of just time
    // This ensures Postgres can properly parse it as a timestamp with timezone
    const checkInTime = now.toISOString();
    
    // Check if already checked in today - use maybeSingle() instead of single()
    const { data: existingRecord, error: existingError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle();
    
    if (existingError) {
      console.error('Error checking existing attendance:', existingError);
      return false;
    }
    
    if (existingRecord) {
      console.log('Employee already checked in today');
      toast({
        title: "Already Checked In",
        description: "You have already checked in today.",
      });
      return false;
    }
    
    // Insert new record
    const { error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: today,
        check_in_time: checkInTime,
        status: 'present'
      });
    
    if (error) {
      console.error('Error recording attendance check-in:', error);
      return false;
    }
    
    toast({
      title: "Checked In",
      description: "Your attendance has been recorded.",
    });
    return true;
  } catch (error) {
    console.error('Error in recordAttendanceCheckIn:', error);
    return false;
  }
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
      description: "Your check-out time has been recorded.",
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
export const getAdminSettings = async (): Promise<AdminSettings | null> => {
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
    
    return data as AdminSettings;
  } catch (error) {
    console.error('Error in getAdminSettings:', error);
    return null;
  }
};

// Get admin contact info with proper defaults
export const getAdminContactInfo = async (): Promise<AdminContactInfo> => {
  try {
    const settings = await getAdminSettings();
    
    if (!settings) {
      return {
        phoneNumber: '',
        sendMethod: 'whatsapp', // Default to WhatsApp
        isAutoShareEnabled: false,
        email: '',
        isEmailShareEnabled: false
      };
    }
    
    return {
      phoneNumber: settings.phone_number || '',
      sendMethod: 'whatsapp', // Always use WhatsApp as requested
      isAutoShareEnabled: settings.auto_share_enabled || false,
      email: settings.email || '',
      isEmailShareEnabled: settings.email_share_enabled || false
    };
  } catch (error) {
    console.error('Error in getAdminContactInfo:', error);
    return {
      phoneNumber: '',
      sendMethod: 'whatsapp',
      isAutoShareEnabled: false,
      email: '',
      isEmailShareEnabled: false
    };
  }
};

// Save admin contact info
export const saveAdminContactInfo = async (
  phoneNumber: string,
  sendMethod: 'whatsapp' | 'sms',
  autoShareEnabled: boolean,
  email: string = '',
  emailShareEnabled: boolean = false
): Promise<boolean> => {
  try {
    // Validation for phone number if WhatsApp is enabled
    if (autoShareEnabled && !phoneNumber) {
      console.error('Phone number is required for WhatsApp sharing');
      return false;
    }
    
    // Validation for email if email sharing is enabled
    if (emailShareEnabled && !email) {
      console.error('Email is required for email sharing');
      return false;
    }
    
    // Force WhatsApp as the send method regardless of input
    const actualSendMethod = 'whatsapp';

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'attendance_report',
        send_method: actualSendMethod,
        phone_number: phoneNumber,
        auto_share_enabled: autoShareEnabled,
        email: email,
        email_share_enabled: emailShareEnabled,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_type'
      });
    
    if (error) {
      console.error('Error saving admin settings:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in saveAdminSettings:', error);
    return false;
  }
};

// Generate summary text for sharing
export const generateAttendanceSummaryText = (date: Date, records: Attendance[]): string => {
  const formattedDate = format(date, 'MMMM d, yyyy');
  const presentCount = records.filter(r => r.status === 'present').length;
  const lateCount = records.filter(r => r.status === 'late').length;
  const checkedOutCount = records.filter(r => r.checkOutTime).length;
  
  // Calculate average hours worked for those who checked out
  let totalHoursWorked = 0;
  let totalCheckedOut = 0;
  
  records.forEach(record => {
    if (record.checkOutTime && record.checkInTime) {
      const checkIn = new Date(record.checkInTime);
      const checkOut = new Date(record.checkOutTime);
      const hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      totalHoursWorked += hoursWorked;
      totalCheckedOut++;
    }
  });
  
  const avgHoursWorked = totalCheckedOut > 0 ? (totalHoursWorked / totalCheckedOut).toFixed(1) : '0';
  
  // New requested format
  let summaryText = `📊 *Daily Attendance Summary* 📊\n`;
  summaryText += `📆 *${formattedDate}*\n\n`;
  
  summaryText += `👥 *Total Attendance*: ${records.length} employees\n`;
  summaryText += `⏰ *Late Arrivals*: ${lateCount} employees\n`;
  summaryText += `🏠 *Left For Home*: ${checkedOutCount} employees\n`;
  
  if (totalCheckedOut > 0) {
    summaryText += `⌛ *Average Hours Worked*: ${avgHoursWorked} hours\n\n`;
  }
  
  // Late employees detail section
  if (lateCount > 0) {
    summaryText += `*⚠️ Late Employees:*\n`;
    records
      .filter(r => r.status === 'late')
      .forEach(record => {
        const checkInTime = new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        summaryText += `- ${record.employeeName}: ${checkInTime}\n`;
      });
    summaryText += `\n`;
  }
  
  // Present employees summary
  if (records.length > 0) {
    summaryText += `*✅ Attendance Details:*\n`;
    records.forEach(record => {
      const checkInTime = new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkOutTime = record.checkOutTime 
        ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : 'Still working';
        
      const status = record.status === 'late' ? '⚠️' : '✓';
      
      summaryText += `- ${record.employeeName} ${status}: ${checkInTime} to ${checkOutTime}\n`;
    });
  } else {
    summaryText += "No attendance records for this date.";
  }
  
  summaryText += `\n💬 *Need assistance?* Contact HR for any questions.`;
  
  return summaryText;
};

// Auto share attendance summary with improved error handling
export const autoShareAttendanceSummary = async (): Promise<boolean> => {
  try {
    console.log("Attempting to auto-share attendance summary...");
    
    // Get admin settings
    const contactInfo = await getAdminContactInfo();
    
    let successCount = 0;
    
    // Get today's date
    const today = new Date();
    
    // Get attendance for today
    const todayAttendance = await getAttendanceByDateRange(
      format(today, 'yyyy-MM-dd'),
      format(today, 'yyyy-MM-dd')
    );
    
    // Create the summary text
    const summaryText = generateAttendanceSummaryText(today, todayAttendance);
    
    // Share via WhatsApp if enabled
    if (contactInfo.isAutoShareEnabled && contactInfo.phoneNumber) {
      const whatsappSuccess = await shareViaWhatsApp(summaryText, contactInfo.phoneNumber);
      if (whatsappSuccess) successCount++;
    }
    
    // Share via Email if enabled
    if (contactInfo.isEmailShareEnabled && contactInfo.email) {
      const subject = `Attendance Summary for ${format(today, 'MMMM d, yyyy')}`;
      const emailSuccess = await shareViaEmail(summaryText, contactInfo.email, subject);
      if (emailSuccess) successCount++;
    }
    
    return successCount > 0;
  } catch (error) {
    console.error('Error in autoShareAttendanceSummary:', error);
    return false;
  }
};

// Share via WhatsApp with better error handling
export const shareViaWhatsApp = async (message: string, phoneNumber: string): Promise<boolean> => {
  try {
    // Validate phone number
    if (!phoneNumber) {
      console.error("No phone number provided for WhatsApp sharing");
      return false;
    }
    
    // Clean the phone number to ensure it starts with +
    let cleanPhone = phoneNumber.trim();
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    
    // Encode the message for URL
    const encodedMessage = encodeURIComponent(message);
    
    // WhatsApp API URL
    const whatsappUrl = `https://wa.me/${cleanPhone.replace(/\D/g, '')}?text=${encodedMessage}`;
    
    console.log("Opening WhatsApp share URL");
    
    // Open in a new window
    window.open(whatsappUrl, '_blank');
    
    return true;
  } catch (error) {
    console.error('Error in shareViaWhatsApp:', error);
    return false;
  }
};

// Share via Email
export const shareViaEmail = async (message: string, email: string, subject: string): Promise<boolean> => {
  try {
    // Validate email
    if (!email) {
      console.error("No email provided for email sharing");
      return false;
    }
    
    // Encode the message and subject for URL
    const encodedSubject = encodeURIComponent(subject);
    const encodedMessage = encodeURIComponent(message);
    
    // Email URL scheme
    const emailUrl = `mailto:${email}?subject=${encodedSubject}&body=${encodedMessage}`;
    
    console.log("Opening email client");
    
    // Open in a new window
    window.open(emailUrl, '_blank');
    
    return true;
  } catch (error) {
    console.error('Error in shareViaEmail:', error);
    return false;
  }
};

// Share via SMS - Note: This is kept for reference but no longer used as requested
export const shareViaSMS = async (message: string, phoneNumber: string): Promise<boolean> => {
  try {
    // Validate phone number
    if (!phoneNumber) {
      console.error("No phone number provided for SMS sharing");
      return false;
    }
    
    // Clean the phone number
    let cleanPhone = phoneNumber.trim();
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = '+' + cleanPhone;
    }
    
    // Encode the message
    const encodedMessage = encodeURIComponent(message);
    
    // SMS URL scheme
    const smsUrl = `sms:${cleanPhone}?body=${encodedMessage}`;
    
    console.log("Opening SMS app");
    
    // Open SMS app
    window.open(smsUrl, '_blank');
    
    return true;
  } catch (error) {
    console.error('Error in shareViaSMS:', error);
    return false;
  }
};

// Setup auto report scheduling with improved error handling
export const setupAutoReportScheduling = () => {
  console.log("Setting up auto report scheduling...");
  
  // Check if already running to avoid duplicates
  if ((window as any).__autoReportScheduled) {
    console.log("Auto report already scheduled, skipping setup");
    return;
  }
  
  // Mark as scheduled
  (window as any).__autoReportScheduled = true;
  
  // Function to check if it's time to send report (e.g., 5:00 PM)
  const checkAndSendReport = async () => {
    try {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      // Schedule for 6:00 PM (18:00)
      if (hours === 18 && minutes === 0) {
        console.log("It's report time (6:00 PM), attempting to send report...");
        const success = await autoShareAttendanceSummary();
        console.log("Auto report sharing result:", success ? "Successful" : "Failed");
      }
    } catch (error) {
      console.error("Error in checkAndSendReport:", error);
    }
  };
  
  // Check every minute
  setInterval(checkAndSendReport, 60000);
  
  // Also check on startup (after a brief delay)
  setTimeout(checkAndSendReport, 5000);
  
  console.log("Auto report scheduling setup complete");
};
