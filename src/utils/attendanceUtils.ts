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
  created_at: string;
  updated_at: string;
  auto_share_enabled: boolean;
}

// Get all attendance records
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
    
    // Transform the data to match our Attendance type
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: `${record.employees?.first_name || ''} ${record.employees?.last_name || ''}`.trim(),
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: format(new Date(record.date), 'yyyy-MM-dd'),
      status: record.status
    }));
  } catch (error) {
    console.error('Error in getAttendance:', error);
    return [];
  }
};

// Get attendance records by date range
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
    
    // Transform the data to match our Attendance type
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: `${record.employees?.first_name || ''} ${record.employees?.last_name || ''}`.trim(),
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: format(new Date(record.date), 'yyyy-MM-dd'),
      status: record.status
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
    const checkInTime = format(now, 'HH:mm:ss');
    
    // Check if already checked in today
    const { data: existingRecord, error: existingError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();
    
    if (existingError && existingError.code !== '404') {
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
    
    // Get employee name
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', employeeId)
      .single();
    
    if (employeeError) {
      console.error('Error fetching employee name:', employeeError);
      return false;
    }
    
    const employeeName = `${employeeData?.first_name || ''} ${employeeData?.last_name || ''}`.trim();
    
    // Insert new record
    const { error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        employee_name: employeeName,
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
    const checkOutTime = format(now, 'HH:mm:ss');
    
    // Find today's attendance record
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();
    
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

// Function to get admin settings with better error handling
export const getAdminSettings = async (): Promise<AdminSettings | null> => {
  try {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('setting_type', 'attendance_report')
      .single();
    
    if (error) {
      console.error('Error fetching admin settings:', error);
      return null;
    }
    
    return data as AdminSettings;
  } catch (error) {
    console.error('Error in getAdminSettings:', error);
    return null;
  }
};

// Save admin settings with improved validation
export const saveAdminSettings = async (
  settings: {
    send_method: string;
    phone_number: string;
    auto_share_enabled: boolean;
  }
): Promise<boolean> => {
  try {
    // Validate phone number
    if (settings.send_method === 'whatsapp' && !isValidPhoneNumber(settings.phone_number)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number including country code (e.g., +1234567890)",
        variant: "destructive",
      });
      return false;
    }

    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'attendance_report',
        send_method: settings.send_method,
        phone_number: settings.phone_number,
        auto_share_enabled: settings.auto_share_enabled,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_type'
      });
    
    if (error) {
      console.error('Error saving admin settings:', error);
      toast({
        title: "Settings Save Failed",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in saveAdminSettings:', error);
    return false;
  }
};

// Validate phone number - basic validation for international format
function isValidPhoneNumber(phone: string): boolean {
  // Check if it starts with + and has 8-15 digits
  return /^\+[0-9]{8,15}$/.test(phone);
}

// Auto share attendance summary with improved error handling
export const autoShareAttendanceSummary = async (): Promise<boolean> => {
  try {
    console.log("Attempting to auto-share attendance summary...");
    
    // Get admin settings
    const settings = await getAdminSettings();
    
    if (!settings) {
      console.log("No admin settings found for attendance report sharing");
      return false;
    }
    
    if (!settings.auto_share_enabled) {
      console.log("Auto-share is disabled in settings");
      return false;
    }
    
    if (!settings.phone_number || !settings.send_method) {
      console.log("Missing phone number or send method in settings");
      return false;
    }
    
    // Get today's date
    const today = new Date();
    
    // Format for displaying
    const formattedDate = format(today, 'MMMM d, yyyy');
    
    // Get attendance for today
    const todayAttendance = await getAttendanceByDateRange(
      format(today, 'yyyy-MM-dd'),
      format(today, 'yyyy-MM-dd')
    );
    
    // Create message
    const totalEmployees = await getTotalEmployeeCount();
    const presentCount = todayAttendance.filter(a => a.status === 'present').length;
    const lateCount = todayAttendance.filter(a => a.status === 'late').length;
    const absentCount = totalEmployees - presentCount - lateCount;
    
    const message = `
*Attendance Summary for ${formattedDate}*

Total Employees: ${totalEmployees}
Present: ${presentCount}
Late: ${lateCount}
Absent: ${absentCount}

Generated automatically by QR Attendance System
`;
    
    // Send based on method
    if (settings.send_method === 'whatsapp') {
      return await shareViaWhatsApp(message, settings.phone_number);
    } else {
      console.log("Unsupported sharing method:", settings.send_method);
      return false;
    }
  } catch (error) {
    console.error('Error in autoShareAttendanceSummary:', error);
    return false;
  }
};

// Share via WhatsApp with better error handling and user feedback
export const shareViaWhatsApp = async (message: string, phoneNumber: string): Promise<boolean> => {
  try {
    // Validate phone number
    if (!isValidPhoneNumber(phoneNumber)) {
      console.error("Invalid phone number format for WhatsApp sharing");
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number including country code (e.g., +1234567890)",
        variant: "destructive",
      });
      return false;
    }
    
    // Encode the message for URL
    const encodedMessage = encodeURIComponent(message);
    
    // WhatsApp API URL
    const whatsappUrl = `https://wa.me/${phoneNumber.replace('+', '')}?text=${encodedMessage}`;
    
    console.log("Opening WhatsApp share URL:", whatsappUrl);
    
    // Try to open in a new window with specific settings to avoid popup blockers
    const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    
    // Check if window was blocked
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      console.error("WhatsApp share window was blocked");
      toast({
        title: "Sharing Failed",
        description: "Please disable popup blocker for this site and try again.",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in shareViaWhatsApp:', error);
    toast({
      title: "Sharing Failed",
      description: "An unexpected error occurred. Please try again later.",
      variant: "destructive",
    });
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
      
      // Schedule for 5:00 PM (17:00)
      if (hours === 17 && minutes === 0) {
        console.log("It's report time (5:00 PM), attempting to send report...");
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
