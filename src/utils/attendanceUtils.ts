
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
