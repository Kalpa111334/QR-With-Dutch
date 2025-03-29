
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PlusCircle, QrCode, Users, FileText, Clock, Calendar, BarChartHorizontal } from 'lucide-react';
import { Employee } from '@/types';
import { getEmployees, deleteEmployee } from '@/utils/employeeUtils';
import EmployeeTable from '@/components/EmployeeTable';
import EmployeeForm from '@/components/EmployeeForm';
import QRScanner from '@/components/QRScanner';
import AttendanceTable from '@/components/AttendanceTable';
import Dashboard from '@/components/Dashboard';
import { useToast } from '@/components/ui/use-toast';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  useEffect(() => {
    // Load employees from Supabase
    const fetchEmployees = async () => {
      setLoading(true);
      try {
        const data = await getEmployees();
        setEmployees(data);
      } catch (error) {
        console.error('Error fetching employees:', error);
        toast({
          title: 'Error',
          description: 'Failed to load employees',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchEmployees();
  }, [toast]);
  
  const refreshEmployees = async () => {
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Error refreshing employees:', error);
    }
  };
  
  const handleAddEmployee = () => {
    setSelectedEmployee(undefined);
    setShowEmployeeForm(true);
    setActiveTab('employees');
  };
  
  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowEmployeeForm(true);
    setActiveTab('employees');
  };
  
  const handleDeleteEmployee = async (id: string) => {
    const success = await deleteEmployee(id);
    if (success) {
      toast({
        title: 'Employee Deleted',
        description: 'Employee has been removed successfully',
      });
      await refreshEmployees();
    }
  };
  
  const handleFormClose = () => {
    setShowEmployeeForm(false);
    setSelectedEmployee(undefined);
    refreshEmployees();
  };

  return (
    <div className="container mx-auto py-6 px-4 md:px-6 min-h-screen">
      <header className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            QR Attendance System
          </h1>
          <p className="text-muted-foreground">
            Manage employee attendance with QR code tracking
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleAddEmployee}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </header>
      
      {/* Quick Access Menu for New Features */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/roster">
          <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center gap-2">
            <Calendar className="h-6 w-6" />
            <span>Roster Management</span>
          </Button>
        </Link>
        <Link to="/gate-pass">
          <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center gap-2">
            <BarChartHorizontal className="h-6 w-6" />
            <span>Gate Pass System</span>
          </Button>
        </Link>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 md:w-auto">
          <TabsTrigger value="dashboard" className="flex items-center">
            <Clock className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="scan" className="flex items-center">
            <QrCode className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Scan QR</span>
          </TabsTrigger>
          <TabsTrigger value="employees" className="flex items-center">
            <Users className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Employees</span>
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Attendance</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="space-y-4">
          <Dashboard />
        </TabsContent>
        
        <TabsContent value="scan" className="space-y-4">
          <QRScanner />
        </TabsContent>
        
        <TabsContent value="employees" className="space-y-4">
          {showEmployeeForm ? (
            <EmployeeForm 
              employee={selectedEmployee} 
              onSave={handleFormClose} 
            />
          ) : (
            <EmployeeTable 
              employees={employees} 
              onEdit={handleEditEmployee} 
              onDelete={handleDeleteEmployee}
              loading={loading}
            />
          )}
        </TabsContent>
        
        <TabsContent value="attendance" className="space-y-4">
          <AttendanceTable />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
