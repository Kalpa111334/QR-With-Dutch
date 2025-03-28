
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
