
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  position?: string;
  department?: string;
  hireDate?: string;
  joinDate?: string;
  status?: string;
  departmentId?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  checkInTime: string;
  checkOutTime?: string;
  date: string;
  createdAt?: string; // Making this optional to fix the TypeScript errors
  status: string;
  employee?: Employee;
  // Additional properties used in components
  employeeName?: string;
  minutesLate?: number;
  workingDuration?: string;
  workingDurationMinutes?: number;
}

export interface GatePass {
  id: string;
  employeeId: string;
  employeeName: string;
  passCode: string;
  validity: 'single' | 'day' | 'week' | 'month';
  type: 'entry' | 'exit' | 'both';
  reason: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  expectedExitTime?: string;
  expectedReturnTime?: string;
  exitTime?: string;
  returnTime?: string;
}
