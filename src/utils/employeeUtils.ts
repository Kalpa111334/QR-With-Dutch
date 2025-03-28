import { supabase } from '../integrations/supabase/client';
import { Employee } from '../types';
import { toast } from '@/components/ui/use-toast';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

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
      name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(), // Ensure name is always set
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
      name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), // Ensure name is set
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
      phone: data.phone || '',
      position: data.position || '',
      joinDate: data.join_date,
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
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      email: data.email || '',
      department: data.departments?.name || '',
      phone: data.phone || '',
      position: data.position || '',
      joinDate: data.join_date,
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

export const bulkImportEmployees = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ total: number; success: number; failed: number; errors: string[] }> => {
  try {
    if (onProgress) onProgress(10);
    const fileData = await parseFileToEmployeeData(file);
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
        if (!row.firstName) {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Missing first name`);
          continue;
        }
        
        if (!row.lastName) {
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
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          department: row.department,
          position: row.position || '',
          phone: row.phone || '',
          joinDate: row.joinDate || new Date().toISOString().split('T')[0],
          status: (row.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
          name: `${row.firstName} ${row.lastName}`
        });
        
        if (result) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`Row ${rowIndex}: Failed to add employee (${row.firstName} ${row.lastName})`);
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
async function parseFileToEmployeeData(file: File): Promise<Partial<Employee>[]> {
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
        },
        error: (error) => {
          reject(new Error(`CSV parsing error: ${error}`));
        }
      });
    } else if (file.name.endsWith('.xlsx')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first sheet
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          const employees = jsonData.map(mapRowToEmployee);
          resolve(employees);
        } catch (err) {
          reject(new Error(`Failed to parse Excel file: ${err}`));
        }
      };
      reader.onerror = () => reject(new Error('Error reading Excel file'));
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error('Unsupported file format. Please use CSV or XLSX.'));
    }
  });
}

// Map a row from the parsed file to an Employee object
function mapRowToEmployee(row: any): Partial<Employee> {
  // Handle different possible column names from import files
  return {
    firstName: row.firstName || row['First Name'] || row.first_name || row['First name'] || '',
    lastName: row.lastName || row['Last Name'] || row.last_name || row['Last name'] || '',
    email: row.email || row.Email || '',
    department: row.department || row.Department || '',
    position: row.position || row.Position || row.title || row.Title || '',
    phone: row.phone || row.Phone || row.phoneNumber || row['Phone Number'] || '',
    joinDate: row.joinDate || row['Join Date'] || row.join_date || '',
    status: row.status || row.Status || 'active'
  };
}
