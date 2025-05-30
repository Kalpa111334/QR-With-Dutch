export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  join_date: string;
  status: 'active' | 'inactive';
  name: string;
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
  check_out_time?: string;
  date: string;
  created_at?: string;
  status: AttendanceStatus;
  employee?: Employee;
  // Additional properties used in components
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
