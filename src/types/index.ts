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
  employeeId: string;
  checkInTime: string;
  checkOutTime?: string;
  date: string;
  createdAt?: string;
  status: AttendanceStatus;
  employee?: Employee;
  // Additional properties used in components
  employeeName?: string;
  minutesLate?: number;
  lateDuration?: string;
  expectedTime?: string;
  workingDuration?: string;
  workingDurationMinutes?: number;
  workingHours?: number;
  fullTimeRange?: string;
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
