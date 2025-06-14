export interface Employee {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  department: string;
  department_id?: string;
  position: string | null;
  phone: string | null;
  join_date: string;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export type AttendanceStatus = 
  | 'present'
  | 'checked-out'
  | 'checked-out-overtime'
  | 'half-day'
  | 'early-departure'
  | 'late'
  | 'absent';

export interface Attendance {
  id: string;
  employee_id: string;
  check_in_time: string;
  check_out_time?: string | null;
  first_check_in_time: string;
  first_check_out_time?: string | null;
  second_check_in_time?: string | null;
  second_check_out_time?: string | null;
  date: string;
  created_at?: string;
  status: AttendanceStatus;
  employee?: Employee;
  employee_name?: string;
  minutes_late?: number;
  late_duration?: string;
  expected_time?: string;
  working_duration?: string;
  working_duration_minutes?: number;
  working_hours?: number;
  full_time_range?: string;
  sequence_number: number;
  overtime?: number;
  break_duration?: string | number;
  is_second_session: boolean;
  previous_session_id?: string;
  previous_session?: Attendance;
  action?: AttendanceAction;
}

export interface ExtendedAttendance extends Attendance {
  first_check_in_time?: string;
  first_check_out_time?: string;
  second_check_in_time?: string;
  second_check_out_time?: string;
  break_duration?: string;
  action?: 'check-in' | 'check-out';
  timestamp?: string;
}

export interface GatePass {
  id: string;
  employeeId: string;
  employeeName: string;
  passCode: string;
  validity: 'single' | 'day' | 'week' | 'month' | 'custom';
  type: 'entry' | 'exit' | 'both';
  reason: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
  usedBy?: string | null;
  expectedExitTime?: string | null;
  expectedReturnTime?: string | null;
  exitTime?: string | null;
  returnTime?: string | null;
  lastUsedAt?: string | null;
  useCount: number;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revocationReason?: string | null;
  customValidity?: {
    hours: number;
    minutes: number;
  };
}

export interface WorkTimeInfo {
  check_in_time: string;
  check_out_time?: string;
  total_hours?: number;
  late_duration?: number;
  status: 'present' | 'checked-out';
  sequence_number: number;
}

export interface ExtendedWorkTimeInfo {
  check_in_time: string;
  check_out_time?: string | null;
  status: AttendanceStatus;
  sequence_number: number;
  action: AttendanceAction;
  late_duration: number;
  timestamp?: string;
  break_duration?: string;
}

export interface CustomPostgrestResponse<T> {
  data: T & {
    action?: string;
    timestamp?: string;
    first_check_in_time?: string;
    first_check_out_time?: string;
    second_check_in_time?: string;
    second_check_out_time?: string;
    break_duration?: string;
    total_hours?: number;
    message?: string;
  };
  error: null | {
    message: string;
  };
}

// Attendance-related types
export type AttendanceAction = 
  'check-in' | 
  'check-out' | 
  'second_check_in' | 
  'second_check_out';
