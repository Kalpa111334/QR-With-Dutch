
import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAttendanceRecords } from '@/utils/attendanceUtils';
import { getEmployees } from '@/utils/employeeUtils';
import { User, Users, Clock, ClockCheck, CheckCheck } from 'lucide-react';

const Dashboard: React.FC = () => {
  const attendanceRecords = getAttendanceRecords();
  const employees = getEmployees();
  
  const today = new Date().toISOString().split('T')[0];
  
  const stats = useMemo(() => {
    const todayRecords = attendanceRecords.filter(record => record.date === today);
    const activeEmployees = employees.filter(emp => emp.status === 'active');
    
    const presentCount = todayRecords.length;
    const lateCount = todayRecords.filter(record => record.status === 'late').length;
    const absentCount = activeEmployees.length - presentCount;
    
    return {
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      checkedOut: todayRecords.filter(record => record.checkOutTime).length
    };
  }, [attendanceRecords, employees, today]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalEmployees}</div>
          <p className="text-xs text-muted-foreground">
            {stats.activeEmployees} active employees
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Present Today</CardTitle>
          <User className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.present}</div>
          <p className="text-xs text-muted-foreground">
            {stats.present > 0 && stats.activeEmployees > 0
              ? `${Math.round((stats.present / stats.activeEmployees) * 100)}% attendance rate`
              : 'No attendance data yet'}
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.late}</div>
          <p className="text-xs text-muted-foreground">
            {stats.late > 0 && stats.present > 0
              ? `${Math.round((stats.late / stats.present) * 100)}% of present employees`
              : 'No late arrivals today'}
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Checked Out</CardTitle>
          <ClockCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.checkedOut}</div>
          <p className="text-xs text-muted-foreground">
            {stats.checkedOut > 0 && stats.present > 0
              ? `${Math.round((stats.checkedOut / stats.present) * 100)}% of present employees`
              : 'No check-outs today'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
