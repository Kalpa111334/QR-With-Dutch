
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  phone: string;
  position: string;
  joinDate: string;
  status: 'active' | 'inactive';
  // Add a computed name property for backward compatibility
  name?: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName: string;
  checkInTime: string;
  checkOutTime: string | null;
  date: string;
  status: 'present' | 'late' | 'absent';
}

export interface Department {
  id: string;
  name: string;
}

export interface GatePass {
  id: string;
  employeeId: string;
  employeeName?: string;
  passCode: string;
  validity: 'single' | 'day' | 'week' | 'month';
  type: 'entry' | 'exit' | 'both';
  reason: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
}
