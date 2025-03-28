import { supabase } from '../integrations/supabase/client';
import { Employee } from '../types';
import { toast } from '@/components/ui/use-toast';

export const getEmployees = async (): Promise<Employee[]> => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        position,
        join_date,
        status,
        department_id,
        departments(name)
      `);
    
    if (error) {
      console.error('Error fetching employees:', error);
      toast({
        title: 'Error fetching employees',
        description: error.message,
        variant: 'destructive',
      });
      return [];
    }
    
    // Transform the data to match our Employee type
    return data.map(emp => ({
      id: emp.id,
      firstName: emp.first_name || '',
      lastName: emp.last_name || '',
      email: emp.email || '',
      department: emp.departments?.name || '',
      phone: emp.phone || '',
      position: emp.position || '',
      joinDate: emp.join_date,
      status: emp.status as 'active' | 'inactive',
    }));
  } catch (error) {
    console.error('Error fetching employees:', error);
    return [];
  }
};

export const addEmployee = async (employee: Omit<Employee, 'id'>): Promise<Employee | null> => {
  try {
    // Get department_id from department name
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .select('id')
      .eq('name', employee.department)
      .single();
    
    if (deptError) {
      console.error('Error finding department:', deptError);
      toast({
        title: 'Error',
        description: `Department "${employee.department}" not found`,
        variant: 'destructive',
      });
      return null;
    }
    
    const { data, error } = await supabase
      .from('employees')
      .insert({
        first_name: employee.firstName,
        last_name: employee.lastName,
        email: employee.email,
        department_id: deptData.id,
        phone: employee.phone,
        position: employee.position,
        join_date: employee.joinDate,
        status: employee.status,
        name: `${employee.firstName} ${employee.lastName}` // Keep name field updated for backward compatibility
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error adding employee:', error);
      toast({
        title: 'Error adding employee',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
    
    // Return the new employee with the department name
    return {
      id: data.id,
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      email: data.email || '',
      department: employee.department,
      phone: data.phone || '',
      position: data.position || '',
      joinDate: data.join_date,
      status: data.status as 'active' | 'inactive',
    };
  } catch (error) {
    console.error('Error adding employee:', error);
    return null;
  }
};

export const updateEmployee = async (updatedEmployee: Employee): Promise<Employee | null> => {
  try {
    // Get department_id from department name
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .select('id')
      .eq('name', updatedEmployee.department)
      .single();
    
    if (deptError) {
      console.error('Error finding department:', deptError);
      toast({
        title: 'Error',
        description: `Department "${updatedEmployee.department}" not found`,
        variant: 'destructive',
      });
      return null;
    }
    
    const { data, error } = await supabase
      .from('employees')
      .update({
        first_name: updatedEmployee.firstName,
        last_name: updatedEmployee.lastName,
        email: updatedEmployee.email,
        department_id: deptData.id,
        phone: updatedEmployee.phone,
        position: updatedEmployee.position,
        join_date: updatedEmployee.joinDate,
        status: updatedEmployee.status,
        name: `${updatedEmployee.firstName} ${updatedEmployee.lastName}`, // Keep name field updated
        updated_at: new Date().toISOString(),
      })
      .eq('id', updatedEmployee.id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating employee:', error);
      toast({
        title: 'Error updating employee',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
    
    // Return the updated employee with the department name
    return {
      id: data.id,
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      email: data.email || '',
      department: updatedEmployee.department,
      phone: updatedEmployee.phone || '',
      position: updatedEmployee.position || '',
      joinDate: data.join_date,
      status: data.status as 'active' | 'inactive',
    };
  } catch (error) {
    console.error('Error updating employee:', error);
    return null;
  }
};

export const deleteEmployee = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting employee:', error);
      toast({
        title: 'Error deleting employee',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting employee:', error);
    return false;
  }
};

export const getEmployeeById = async (id: string): Promise<Employee | null> => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        position,
        join_date,
        status,
        departments(name)
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching employee:', error);
      return null;
    }
    
    // Transform to match our Employee type
    return {
      id: data.id,
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      email: data.email || '',
      department: data.departments?.name || '',
      phone: data.phone || '',
      position: data.position || '',
      joinDate: data.join_date,
      status: data.status as 'active' | 'inactive',
    };
  } catch (error) {
    console.error('Error fetching employee:', error);
    return null;
  }
};

export const getDepartments = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('name')
      .order('name');
    
    if (error) {
      console.error('Error fetching departments:', error);
      return [];
    }
    
    return data.map(dept => dept.name);
  } catch (error) {
    console.error('Error fetching departments:', error);
    return [];
  }
};

// Adding the missing bulkImportEmployees function
export const bulkImportEmployees = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ total: number; success: number; failed: number; errors: string[] }> => {
  try {
    // Simulate file processing for now
    // In a real implementation, you would parse the CSV/XLSX file and process it
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Simulate some processing time
    await delay(1000);
    
    if (onProgress) onProgress(30);
    await delay(500);
    if (onProgress) onProgress(60);
    await delay(500);
    if (onProgress) onProgress(90);
    await delay(500);
    if (onProgress) onProgress(100);
    
    // In a real implementation, this would be the actual result
    // For now, return a simulated success result
    return {
      total: 5,
      success: 4,
      failed: 1,
      errors: ["Row 3: Invalid email format for john@example"]
    };
  } catch (error) {
    console.error('Error processing file:', error);
    return {
      total: 0,
      success: 0,
      failed: 0,
      errors: [(error as Error).message]
    };
  }
};
