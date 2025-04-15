import { supabase } from '../integrations/supabase/client';
import { Employee } from '../types';
import { toast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const getEmployees = async (): Promise<Employee[]> => {
  try {
    console.log('Fetching employees...');
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
        departments(name),
        created_at,
        updated_at
      `)
      .eq('status', 'active'); // Only fetch active employees
    
    if (error) {
      console.error('Error fetching employees:', error);
      throw new Error(`Failed to fetch employees: ${error.message}`);
    }
    
    if (!data) {
      console.log('No employees found');
      return [];
    }
    
    console.log('Fetched employees:', data);
    
    // Transform the data to match our Employee type
    return data.map(emp => ({
      id: emp.id,
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      email: emp.email,
      department: emp.departments?.name || null,
      phone: emp.phone,
      position: emp.position,
      join_date: emp.join_date || new Date().toISOString().split('T')[0],
      status: emp.status as 'active' | 'inactive',
      name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      created_at: emp.created_at,
      updated_at: emp.updated_at
    }));
  } catch (error) {
    console.error('Error in getEmployees:', error);
    throw error;
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
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        department_id: deptData.id,
        phone: employee.phone,
        position: employee.position,
        join_date: employee.join_date,
        status: employee.status,
        name: `${employee.first_name} ${employee.last_name}` // Keep name field updated for backward compatibility
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
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      email: data.email,
      department: employee.department,
      phone: data.phone,
      position: data.position,
      join_date: data.join_date,
      status: data.status as 'active' | 'inactive',
      name: `${data.first_name || ''} ${data.last_name || ''}`.trim()
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
        first_name: updatedEmployee.first_name,
        last_name: updatedEmployee.last_name,
        email: updatedEmployee.email,
        department_id: deptData.id,
        phone: updatedEmployee.phone,
        position: updatedEmployee.position,
        join_date: updatedEmployee.join_date,
        status: updatedEmployee.status,
        name: `${updatedEmployee.first_name} ${updatedEmployee.last_name}`,
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
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      email: data.email || '',
      department: updatedEmployee.department,
      phone: data.phone || '',
      position: data.position || '',
      join_date: data.join_date,
      status: data.status as 'active' | 'inactive',
      name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), // Ensure name is set
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
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      email: data.email || '',
      department: data.departments?.name || '',
      phone: data.phone || '',
      position: data.position || '',
      join_date: data.join_date,
      status: data.status as 'active' | 'inactive',
      name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), // Ensure name is set
    };
  } catch (error) {
    console.error('Error fetching employee:', error);
    return null;
  }
};

export const getDepartments = async (): Promise<string[]> => {
  try {
    console.log('Fetching departments from database...');
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Error fetching departments:', error);
      throw new Error(`Failed to fetch departments: ${error.message}`);
    }
    
    if (!data || data.length === 0) {
      console.log('No departments found in database');
      return [];
    }
    
    console.log('Fetched departments:', data);
    return data.map(dept => dept.name);
  } catch (error) {
    console.error('Error in getDepartments:', error);
    throw error;
  }
};

export const bulkImportEmployees = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ total: number; success: number; failed: number; errors: string[] }> => {
  try {
    if (onProgress) onProgress(10);
    const fileData = await parseFileToEmployees(file);
    if (onProgress) onProgress(30);
    
    const results = {
      total: fileData.length,
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Get all existing departments for validation
    const existingDepartments = await getDepartments();
    if (onProgress) onProgress(40);
    
    // Process each employee row
    for (let i = 0; i < fileData.length; i++) {
      const row = fileData[i];
      const rowIndex = i + 2; // +2 because of 0-indexing and header row
      
      try {
        // Validate required fields
        if (!row.first_name) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Missing first name`);
          continue;
        }
        
        if (!row.last_name) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Missing last name`);
          continue;
        }
        
        if (!row.email) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Missing email`);
          continue;
        }
        
        if (!row.department) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Missing department`);
          continue;
        }
        
        // Validate department exists
        if (!existingDepartments.includes(row.department)) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Department "${row.department}" does not exist`);
          continue;
        }
        
        // Add employee
        const result = await addEmployee({
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          department: row.department,
          position: row.position || '',
          phone: row.phone || '',
          join_date: row.join_date || new Date().toISOString().split('T')[0],
          status: (row.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
          name: `${row.first_name} ${row.last_name}`
        });
        
        if (result) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Failed to add employee (${row.first_name} ${row.last_name})`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${rowIndex}: ${(error as Error).message}`);
      }
      
      // Update progress periodically
      if (onProgress) {
        const progressValue = Math.floor(40 + ((i + 1) / fileData.length) * 50);
        onProgress(progressValue);
      }
    }
    
    if (onProgress) onProgress(100);
    return results;
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

// Helper function to parse either CSV or XLSX files
async function parseFileToEmployees(file: File): Promise<Partial<Employee>[]> {
  return new Promise((resolve, reject) => {
    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const employees = results.data.map(mapRowToEmployee);
            resolve(employees);
          } catch (err) {
            reject(new Error(`Failed to parse CSV: ${err}`));
          }
        }
      });
    } else if (file.name.endsWith('.xlsx')) {
      (async () => {
        try {
          const workbook = XLSX.read(await file.arrayBuffer());
          const employees = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).map(mapRowToEmployee);
          resolve(employees);
        } catch (error) {
          reject(error);
        }
      })();
    } else {
      reject(new Error('Unsupported file format'));
    }
  });
}

function mapRowToEmployee(row: any): Partial<Employee> {
  return {
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    email: row.email,
    department: row.department || '',
    phone: row.phone || '',
    position: row.position || '',
    join_date: row.join_date || new Date().toISOString().split('T')[0],
    status: row.status === 'inactive' ? 'inactive' : 'active' as 'active' | 'inactive',
    name: `${row.first_name || ''} ${row.last_name || ''}`.trim()
  };
}