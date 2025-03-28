
import { Attendance, Employee } from '../types';
import { getEmployeeById } from './employeeUtils';

// In a real app, this would be replaced with a database call
const ATTENDANCE_STORAGE_KEY = 'qr-attendance-records';

export const getAttendanceRecords = (): Attendance[] => {
  const storedRecords = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
  if (storedRecords) {
    return JSON.parse(storedRecords);
  }
  return [];
};

export const addAttendanceRecord = (employeeId: string): Attendance | null => {
  const employee = getEmployeeById(employeeId);
  if (!employee) return null;
  
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const records = getAttendanceRecords();
  
  // Check if employee already checked in today
  const todayRecord = records.find(
    record => record.employeeId === employeeId && record.date === dateStr
  );
  
  if (todayRecord && !todayRecord.checkOutTime) {
    // Employee is checking out
    todayRecord.checkOutTime = now.toISOString();
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
    return todayRecord;
  } else if (todayRecord && todayRecord.checkOutTime) {
    // Already checked in and out today
    return null;
  }
  
  // Employee is checking in
  const workStartHour = 9; // 9 AM
  const isLate = now.getHours() > workStartHour || 
                (now.getHours() === workStartHour && now.getMinutes() > 0);
  
  const newRecord: Attendance = {
    id: crypto.randomUUID(),
    employeeId,
    employeeName: employee.name,
    checkInTime: now.toISOString(),
    checkOutTime: null,
    date: dateStr,
    status: isLate ? 'late' : 'present',
  };
  
  records.push(newRecord);
  localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(records));
  return newRecord;
};

export const getEmployeeAttendance = (employeeId: string): Attendance[] => {
  const records = getAttendanceRecords();
  return records.filter(record => record.employeeId === employeeId);
};

export const getDailyAttendance = (date: string): Attendance[] => {
  const records = getAttendanceRecords();
  return records.filter(record => record.date === date);
};

export const getAttendanceByDateRange = (
  startDate: string,
  endDate: string
): Attendance[] => {
  const records = getAttendanceRecords();
  return records.filter(
    record => record.date >= startDate && record.date <= endDate
  );
};

export const getAttendanceByDepartment = (
  department: string,
  startDate: string,
  endDate: string
): Attendance[] => {
  const records = getAttendanceRecords();
  const filteredRecords = [];
  
  for (const record of records) {
    if (record.date >= startDate && record.date <= endDate) {
      const employee = getEmployeeById(record.employeeId);
      if (employee && employee.department === department) {
        filteredRecords.push(record);
      }
    }
  }
  
  return filteredRecords;
};
