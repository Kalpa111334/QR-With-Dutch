// Utility functions for handling attendance operations
import { supabase } from '../integrations/supabase/client';

interface AdminContactInfo {
  whatsappNumber: string;
  isWhatsappShareEnabled: boolean;
}

/**
 * Records an attendance check-in using the provided QR code data
 * @param qrData - Data from the scanned QR code
 * @returns Promise<boolean> - True if check-in was successful
 */
export const recordAttendanceCheckIn = async (qrData: string): Promise<boolean> => {
  try {
    console.log('Attempting to validate employee:', qrData); // Debug log

    // First, verify if the QR data corresponds to a valid employee
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('*')
      .or(`id.eq.${qrData},employee_id.eq.${qrData},email.eq.${qrData}`)
      .maybeSingle();

    console.log('Employee lookup result:', { employeeData, employeeError }); // Debug log

    if (!employeeData) {
      console.log('Employee validation failed'); // Debug log
      throw new Error('Invalid employee QR code');
    }

    if (employeeError) {
      console.error('Database error during employee lookup:', employeeError);
      throw new Error('Failed to validate employee');
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
      throw new Error('Failed to check existing attendance');
    }

    if (existingAttendance) {
      throw new Error('Attendance already recorded for today');
    }

    // If we get here, the employee exists and hasn't checked in today
    const { error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeData.id,
        check_in_time: new Date().toISOString(),
        date: today,
        status: 'present'
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error recording attendance:', error);
    throw new Error('Failed to record attendance');
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
export const saveAdminContactInfo = async (info: AdminContactInfo): Promise<void> => {
  try {
    const { error } = await supabase
      .from('admin_settings')
      .upsert({
        setting_type: 'whatsapp',
        whatsapp_number: info.whatsappNumber,
        is_whatsapp_share_enabled: info.isWhatsappShareEnabled
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
 * @returns Promise<boolean> - True if check-out was successful
 */
export const recordAttendanceCheckOut = async (qrData: string): Promise<boolean> => {
  try {
    // Extract employee ID from QR data
    const employeeId = qrData;

    const { data, error } = await supabase
      .from('attendance')
      .update({
        check_out_time: new Date().toISOString(),
        status: 'checked-out'
      })
      .eq('employee_id', employeeId)
      .eq('date', new Date().toISOString().split('T')[0])
      .is('check_out_time', null);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error recording check-out:', error);
    throw new Error('Failed to record check-out');
  }
};

/**
 * Gets attendance records with optional filtering
 * @returns Promise<Attendance[]> - List of attendance records
 */
export const getAttendanceRecords = async (): Promise<any[]> => {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    return [];
  }
};

/**
 * Gets today's attendance summary
 * @returns Promise<{ total: number, present: number, absent: number }>
 */
export const getTodayAttendanceSummary = async (): Promise<{ total: number; present: number; absent: number }> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendance')
      .select('status')
      .eq('date', today);

    if (attendanceError) throw attendanceError;

    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('id');

    if (employeeError) throw employeeError;

    const totalEmployees = employeeData?.length || 0;
    const presentEmployees = attendanceData?.filter(record => record.status === 'present' || record.status === 'checked-out').length || 0;

    return {
      total: totalEmployees,
      present: presentEmployees,
      absent: totalEmployees - presentEmployees
    };
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    return {
      total: 0,
      present: 0,
      absent: 0
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
      console.log('WhatsApp sharing is disabled or no number configured');
      return false;
    }

    const message = `Attendance Summary for ${new Date().toLocaleDateString()}:\n` +
      `Total Employees: ${summary.total}\n` +
      `Present: ${summary.present}\n` +
      `Absent: ${summary.absent}`;

    // In a real implementation, you would integrate with WhatsApp Business API
    console.log('Would send WhatsApp message:', message);
    return true;
  } catch (error) {
    console.error('Error auto-sharing attendance summary:', error);
    return false;
  }
};
