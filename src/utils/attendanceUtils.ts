
import { supabase } from '../integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay, differenceInMinutes, differenceInHours, differenceInSeconds, parseISO } from 'date-fns';
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
  email: string;
  isEmailShareEnabled: boolean;
}

// Define the start of workday (9:00 AM) for late calculation
const WORKDAY_START_HOUR = 9;
const WORKDAY_START_MINUTE = 0;

// Function to check if an employee is late based on check-in time
const isLateArrival = (checkInTime: string): boolean => {
  const checkIn = new Date(checkInTime);
  const workdayStart = new Date(checkIn);
  
  // Set to 9:00 AM of the same day
  workdayStart.setHours(WORKDAY_START_HOUR, WORKDAY_START_MINUTE, 0, 0);
  
  // Employee is late if check-in time is after 9:00 AM
  return checkIn > workdayStart;
};

// Calculate minutes late (0 if not late)
const calculateMinutesLate = (checkInTime: string): number => {
  const checkIn = new Date(checkInTime);
  const workdayStart = new Date(checkIn);
  
  // Set to 9:00 AM of the same day
  workdayStart.setHours(WORKDAY_START_HOUR, WORKDAY_START_MINUTE, 0, 0);
  
  // If not late, return 0
  if (checkIn <= workdayStart) {
    return 0;
  }
  
  // Calculate minutes late
  return differenceInMinutes(checkIn, workdayStart);
};

// Calculate real-time working duration in minutes
const calculateWorkingDuration = (checkInTime: string, checkOutTime: string | null): { minutes: number, formatted: string } => {
  if (!checkOutTime) {
    // If no checkout time, calculate duration up until now
    const checkIn = new Date(checkInTime);
    const now = new Date();
    const minutes = differenceInMinutes(now, checkIn);
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    return {
      minutes,
      formatted: `${hours}h ${remainingMinutes}m`
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
    formatted: `${hours}h ${remainingMinutes}m`
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
      const late = isLateArrival(checkInTime);
      const minutesLate = calculateMinutesLate(checkInTime);
      
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
        minutesLate,
        workingDuration: workingDuration.formatted,
        workingDurationMinutes: workingDuration.minutes
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
      const late = isLateArrival(checkInTime);
      const minutesLate = calculateMinutesLate(checkInTime);
      
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
        minutesLate,
        workingDuration: workingDuration.formatted,
        workingDurationMinutes: workingDuration.minutes
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

// Record attendance check-in
export const recordAttendanceCheckIn = async (employeeId: string): Promise<boolean> => {
  try {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    // Format the check-in time as an ISO string
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
    
    // Determine if the employee is late (after 9:00 AM)
    const isLate = isLateArrival(checkInTime);
    
    // Insert new record
    const { error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: today,
        check_in_time: checkInTime,
        status: isLate ? 'late' : 'present'
      });
    
    if (error) {
      console.error('Error recording attendance check-in:', error);
      return false;
    }
    
    toast({
      title: isLate ? "Checked In (Late)" : "Checked In",
      description: isLate 
        ? `Your attendance has been recorded. You are ${calculateMinutesLate(checkInTime)} minutes late.`
        : "Your attendance has been recorded.",
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
        email: '',
        isEmailShareEnabled: false
      };
    }
    
    return {
      email: settings.email || '',
      isEmailShareEnabled: settings.email_share_enabled || false
    };
  } catch (error) {
    console.error('Error in getAdminContactInfo:', error);
    return {
      email: '',
      isEmailShareEnabled: false
    };
  }
};

// Save admin contact info
export const saveAdminContactInfo = async (
  email: string,
  emailShareEnabled: boolean
): Promise<boolean> => {
  try {
    // Validation for email if email sharing is enabled
    if (emailShareEnabled && !email) {
      console.error('Email is required for email sharing');
      return false;
    }
    
    const { data, error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'attendance_report',
        send_method: 'email',  // Always use email
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
    
    // Calculate summary statistics
    const presentCount = attendanceRecords.length;
    const lateCount = attendanceRecords.filter(record => record.status === 'late').length;
    const checkedOutCount = attendanceRecords.filter(record => record.check_out_time).length;
    const absentCount = totalEmployees - presentCount;
    
    return {
      date: today,
      totalEmployees,
      presentCount,
      lateCount,
      checkedOutCount,
      absentCount,
      absentRate: totalEmployees > 0 ? (absentCount / totalEmployees * 100).toFixed(1) : '0',
      lateRate: presentCount > 0 ? (lateCount / presentCount * 100).toFixed(1) : '0'
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

// Auto share attendance summary with improved error handling
export const autoShareAttendanceSummary = async (): Promise<boolean> => {
  try {
    console.log("Attempting to auto-share attendance summary...");
    
    // Get admin settings
    const contactInfo = await getAdminContactInfo();
    
    // Get today's date
    const today = new Date();
    const subject = `Attendance Summary for ${format(today, 'MMMM d, yyyy')}`;
    
    // Generate HTML content
    const htmlContent = await generateAttendanceSummaryHTML(today);
    
    // Share via Email if enabled
    if (contactInfo.isEmailShareEnabled && contactInfo.email) {
      const emailSuccess = await shareViaEmail(htmlContent, contactInfo.email, subject);
      return emailSuccess;
    }
    
    return false;
  } catch (error) {
    console.error('Error in autoShareAttendanceSummary:', error);
    return false;
  }
};

// Share via Email
export const shareViaEmail = async (htmlContent: string, email: string, subject: string): Promise<boolean> => {
  try {
    // Validate email
    if (!email) {
      console.error("No email provided for email sharing");
      return false;
    }
    
    // Encode the subject for URL
    const encodedSubject = encodeURIComponent(subject);
    
    // Create a plain text version from HTML
    const plainText = htmlContent.replace(/<[^>]*>?/gm, '')
                                .replace(/\s+/g, ' ')
                                .trim();
    const encodedBody = encodeURIComponent(plainText);
    
    // Email URL scheme 
    const emailUrl = `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`;
    
    console.log("Opening email client");
    
    // Open in a new window
    window.open(emailUrl, '_blank');
    
    return true;
  } catch (error) {
    console.error('Error in shareViaEmail:', error);
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
  
  // Function to check if it's time to send report (6:00 PM)
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
