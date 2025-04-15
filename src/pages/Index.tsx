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
import { toast as sonnerToast } from "sonner";
import QRScanDialog from '@/components/QRScanDialog';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showQRScanDialog, setShowQRScanDialog] = useState(false);
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
    
    // Set up subscription for live employee data updates
    const employeesChannel = supabase
      .channel('public:employees')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'employees' }, 
        () => {
          fetchEmployees();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(employeesChannel);
    };
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
    // Switch tab after state updates
    setTimeout(() => {
      setActiveTab('employees');
    }, 0);
  };
  
  const handleEditEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowEmployeeForm(true);
    setActiveTab('employees');
  };
  
  const handleDeleteEmployee = async (id: string) => {
    try {
      const success = await deleteEmployee(id);
      if (success) {
        toast({
          title: 'Employee Deleted',
          description: 'Employee has been removed successfully',
        });
        await refreshEmployees();
      }
    } catch (error) {
      console.error('Error deleting employee:', error);
      sonnerToast.error('Delete Failed', {
        description: 'Could not delete the employee. Please try again.'
      });
    }
  };
  
  const handleFormClose = () => {
    setShowEmployeeForm(false);
    setSelectedEmployee(undefined);
    refreshEmployees();
  };
  
  const handleQuickScan = () => {
    setShowQRScanDialog(true);
  };
  
  const handleScanComplete = (data: { type: string, id: string }) => {
    if (data.type === 'employee') {
      sonnerToast.success('Employee QR Scanned', {
        description: 'Employee ID: ' + data.id
      });
      // You could add more functionality here based on the scan
    } else if (data.type === 'gatepass') {
      sonnerToast.info('Gate Pass QR Scanned', {
        description: 'Pass ID: ' + data.id
      });
      // You could redirect to gate pass page or perform an action
    }
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
          <Button onClick={handleQuickScan} variant="secondary" className="flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            Quick Scan
          </Button>
          <Button onClick={handleAddEmployee}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </header>
      
      {/* Quick Access Menu for New Features */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/roster" className="block">
          <Button variant="outline" className="w-full h-20 flex flex-col items-center justify-center gap-2">
            <Calendar className="h-6 w-6" />
            <span>Roster Management</span>
          </Button>
        </Link>
        <Link to="/gate-pass" className="block">
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
      
      {/* Quick scan dialog */}
      <QRScanDialog 
        isOpen={showQRScanDialog}
        onClose={() => setShowQRScanDialog(false)}
        onScanComplete={handleScanComplete}
      />
    </div>
  );
};

export default Index;
