import { supabase } from '../integrations/supabase/client';
import { Attendance, Employee } from '../types';
import { getEmployeeById } from './employeeUtils';
import { toast } from '@/components/ui/use-toast';

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
        employees(name)
      `)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching attendance records:', error);
      return [];
    }
    
    // Transform the data to match our Attendance type
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: record.employees?.name || '',
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.date,
      status: record.status as 'present' | 'late' | 'absent',
    }));
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
  }
};

export const addAttendanceRecord = async (employeeId: string): Promise<Attendance | null> => {
  try {
    const employee = await getEmployeeById(employeeId);
    if (!employee) {
      toast({
        title: 'Error',
        description: 'Employee not found',
        variant: 'destructive',
      });
      return null;
    }
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    // Check if employee already checked in today
    const { data: existingRecords, error: checkError } = await supabase
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', dateStr);
    
    if (checkError) {
      console.error('Error checking attendance:', checkError);
      return null;
    }
    
    const todayRecord = existingRecords[0];
    
    if (todayRecord && !todayRecord.check_out_time) {
      // Employee is checking out
      const { data: updatedRecord, error: updateError } = await supabase
        .from('attendance')
        .update({ check_out_time: now.toISOString() })
        .eq('id', todayRecord.id)
        .select()
        .single();
      
      if (updateError) {
        console.error('Error updating attendance record:', updateError);
        return null;
      }
      
      return {
        id: updatedRecord.id,
        employeeId: updatedRecord.employee_id,
        employeeName: employee.name,
        checkInTime: updatedRecord.check_in_time,
        checkOutTime: updatedRecord.check_out_time,
        date: updatedRecord.date,
        status: updatedRecord.status as 'present' | 'late' | 'absent',
      };
    } else if (todayRecord && todayRecord.check_out_time) {
      // Already checked in and out today
      toast({
        title: 'Already Checked Out',
        description: `${employee.name} has already checked in and out today`,
        variant: 'default',
      });
      return null;
    }
    
    // Employee is checking in
    const workStartHour = 9; // 9 AM
    const isLate = now.getHours() > workStartHour || 
                  (now.getHours() === workStartHour && now.getMinutes() > 0);
    
    const { data: newRecord, error: insertError } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        check_in_time: now.toISOString(),
        date: dateStr,
        status: isLate ? 'late' : 'present',
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error creating attendance record:', insertError);
      return null;
    }
    
    return {
      id: newRecord.id,
      employeeId: newRecord.employee_id,
      employeeName: employee.name,
      checkInTime: newRecord.check_in_time,
      checkOutTime: newRecord.check_out_time,
      date: newRecord.date,
      status: newRecord.status as 'present' | 'late' | 'absent',
    };
  } catch (error) {
    console.error('Error processing attendance:', error);
    return null;
  }
};

export const getEmployeeAttendance = async (employeeId: string): Promise<Attendance[]> => {
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
        employees(name)
      `)
      .eq('employee_id', employeeId)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching employee attendance:', error);
      return [];
    }
    
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: record.employees?.name || '',
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.date,
      status: record.status as 'present' | 'late' | 'absent',
    }));
  } catch (error) {
    console.error('Error fetching employee attendance:', error);
    return [];
  }
};

export const getDailyAttendance = async (date: string): Promise<Attendance[]> => {
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
        employees(name)
      `)
      .eq('date', date);
    
    if (error) {
      console.error('Error fetching daily attendance:', error);
      return [];
    }
    
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: record.employees?.name || '',
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.date,
      status: record.status as 'present' | 'late' | 'absent',
    }));
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    return [];
  }
};

export const getAttendanceByDateRange = async (
  startDate: string,
  endDate: string
): Promise<Attendance[]> => {
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
        employees(name)
      `)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching attendance by date range:', error);
      return [];
    }
    
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: record.employees?.name || '',
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.date,
      status: record.status as 'present' | 'late' | 'absent',
    }));
  } catch (error) {
    console.error('Error fetching attendance by date range:', error);
    return [];
  }
};

export const getAttendanceByDepartment = async (
  department: string,
  startDate: string,
  endDate: string
): Promise<Attendance[]> => {
  try {
    // First get the department id
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .select('id')
      .eq('name', department)
      .single();
    
    if (deptError) {
      console.error('Error finding department:', deptError);
      return [];
    }
    
    // Get employees in this department
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('department_id', deptData.id);
    
    if (empError) {
      console.error('Error finding employees in department:', empError);
      return [];
    }
    
    const employeeIds = empData.map(emp => emp.id);
    
    if (employeeIds.length === 0) {
      return [];
    }
    
    // Get attendance records for these employees
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        employee_id,
        check_in_time,
        check_out_time,
        date,
        status,
        employees(name)
      `)
      .in('employee_id', employeeIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });
    
    if (error) {
      console.error('Error fetching department attendance:', error);
      return [];
    }
    
    return data.map(record => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeName: record.employees?.name || '',
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.date,
      status: record.status as 'present' | 'late' | 'absent',
    }));
  } catch (error) {
    console.error('Error fetching department attendance:', error);
    return [];
  }
};

// Generate a formatted summary text for attendance records
export const generateAttendanceSummaryText = (
  date: Date,
  attendanceRecords: Attendance[]
): string => {
  const dateStr = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
  
  let summary = `*Attendance Summary for ${dateStr}*\n\n`;
  
  const present = attendanceRecords.length;
  const late = attendanceRecords.filter(r => r.status === 'late').length;
  const checkedOut = attendanceRecords.filter(r => r.checkOutTime).length;
  
  summary += `Total Present: ${present}\n`;
  summary += `On Time: ${present - late}\n`;
  summary += `Late Arrivals: ${late}\n`;
  summary += `Checked Out: ${checkedOut}\n\n`;
  
  summary += `*Employee Details:*\n`;
  attendanceRecords.forEach((record, index) => {
    const checkinTime = new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const checkoutTime = record.checkOutTime 
      ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Not checked out';
    
    summary += `${index + 1}. ${record.employeeName} - ${record.status === 'late' ? '⚠️ Late' : '✅ On Time'}\n`;
    summary += `   In: ${checkinTime} | Out: ${checkoutTime}\n`;
  });
  
  return summary;
};

// Type definition for admin settings
interface AdminContactInfo {
  phoneNumber: string;
  sendMethod: 'whatsapp' | 'sms';
  isAutoShareEnabled: boolean;
}

// Get the saved admin contact information
export const getAdminContactInfo = async (): Promise<AdminContactInfo> => {
  try {
    // We need to use raw SQL query here since the admin_settings table
    // is not in the TypeScript definitions yet
    const { data, error } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('setting_type', 'contact_info')
      .single();
    
    if (error) {
      console.error('Error fetching admin contact info:', error);
      return {
        phoneNumber: '',
        sendMethod: 'whatsapp',
        isAutoShareEnabled: false
      };
    }
    
    return {
      phoneNumber: data.phone_number || '',
      sendMethod: (data.send_method || 'whatsapp') as 'whatsapp' | 'sms',
      isAutoShareEnabled: !!data.auto_share_enabled
    };
  } catch (error) {
    console.error('Error getting admin contact info:', error);
    return {
      phoneNumber: '',
      sendMethod: 'whatsapp',
      isAutoShareEnabled: false
    };
  }
};

// Save the admin contact information
export const saveAdminContactInfo = async (
  phoneNumber: string,
  sendMethod: 'whatsapp' | 'sms',
  isAutoShareEnabled: boolean
): Promise<boolean> => {
  try {
    // Use raw SQL operations since the admin_settings table
    // is not in the TypeScript definitions yet
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'contact_info',
        phone_number: phoneNumber,
        send_method: sendMethod,
        auto_share_enabled: isAutoShareEnabled,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_type'
      });
    
    if (error) {
      console.error('Error saving admin contact info:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error saving admin contact info:', error);
    return false;
  }
};

// Automatically share attendance summary
export const autoShareAttendanceSummary = async (): Promise<boolean> => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    
    // Get today's attendance records
    const attendanceRecords = await getDailyAttendance(dateStr);
    
    // Get admin contact information
    const { phoneNumber, sendMethod, isAutoShareEnabled } = await getAdminContactInfo();
    
    // Check if auto-sharing is enabled and we have a phone number
    if (!isAutoShareEnabled || !phoneNumber) {
      console.log('Auto-sharing is disabled or no phone number found');
      return false;
    }
    
    // Clean the phone number to keep only digits
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 10) {
      console.error('Invalid phone number');
      return false;
    }
    
    // Generate the summary text
    const summaryText = generateAttendanceSummaryText(today, attendanceRecords);
    const encodedSummary = encodeURIComponent(summaryText);
    
    // Create the sharing URL
    let sharingUrl = '';
    if (sendMethod === 'whatsapp') {
      sharingUrl = `https://wa.me/${cleanNumber}?text=${encodedSummary}`;
    } else {
      sharingUrl = `sms:${cleanNumber}?body=${encodedSummary}`;
    }
    
    // Use window.open to open the sharing URL in a new window/tab
    // Note: This approach will work when the function is called in a browser environment
    if (typeof window !== 'undefined') {
      window.open(sharingUrl, '_blank');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error auto-sharing attendance summary:', error);
    return false;
  }
};

// Check if it's time to send the daily report (e.g., at 6 PM every day)
export const shouldSendDailyReport = (): boolean => {
  const now = new Date();
  const hour = now.getHours();
  
  // Send report at 6 PM (18:00)
  return hour === 18;
};

// Set up automatic report scheduling
export const setupAutoReportScheduling = (): void => {
  // Check if we should run the auto-share every 5 minutes
  setInterval(async () => {
    if (shouldSendDailyReport()) {
      // Check if auto-sharing is enabled before attempting to share
      const { isAutoShareEnabled } = await getAdminContactInfo();
      
      if (isAutoShareEnabled) {
        console.log('Auto-sharing daily attendance report...');
        await autoShareAttendanceSummary();
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
};
