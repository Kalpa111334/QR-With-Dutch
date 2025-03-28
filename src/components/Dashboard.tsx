
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAttendanceRecords } from '@/utils/attendanceUtils';
import { getEmployees } from '@/utils/employeeUtils';
import { User, Users, Clock, CheckCircle } from 'lucide-react';
import { Attendance, Employee } from '@/types';

const Dashboard: React.FC = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  const today = new Date().toISOString().split('T')[0];
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [attendanceData, employeesData] = await Promise.all([
          getAttendanceRecords(),
          getEmployees()
        ]);
        
        setAttendanceRecords(attendanceData);
        setEmployees(employeesData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const stats = React.useMemo(() => {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
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
