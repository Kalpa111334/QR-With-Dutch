
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
  // Add missing properties referenced in the codebase
  joinDate?: string;
  status?: string;
  departmentId?: string;
}

// Add Attendance type that's being referenced in several files
export interface Attendance {
  id: string;
  employeeId: string;
  checkInTime: string;
  checkOutTime?: string;
  date: string;
  createdAt: string;
  status: string;
  employee?: Employee;
}

// Updated GatePass type with time tracking fields
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
