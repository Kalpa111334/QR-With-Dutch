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
