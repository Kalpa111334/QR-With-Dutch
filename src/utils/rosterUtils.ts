
import { supabase } from '@/integrations/supabase/client';
import { Employee } from '@/types';

export interface Roster {
  id: string;
  employeeId: string;
  employeeName?: string;
  startDate: string;
  endDate: string;
  shift: 'morning' | 'evening' | 'night';
  status: 'active' | 'pending' | 'completed';
  createdAt?: string;
  updatedAt?: string;
}

// Fetch all rosters with employee names
export const getRosters = async (): Promise<Roster[]> => {
  try {
    const { data: rosters, error } = await supabase
      .from('rosters')
      .select(`
        id, 
        employee_id,
        start_date, 
        end_date, 
        shift, 
        status,
        created_at,
        updated_at,
        employees (id, first_name, last_name)
      `)
      .order('start_date', { ascending: false });

    if (error) throw error;

    return rosters.map(roster => ({
      id: roster.id,
      employeeId: roster.employee_id,
      employeeName: roster.employees ? 
        `${roster.employees.first_name || ''} ${roster.employees.last_name || ''}`.trim() : 
        'Unknown Employee',
      startDate: roster.start_date,
      endDate: roster.end_date,
      shift: roster.shift as 'morning' | 'evening' | 'night',
      status: roster.status as 'active' | 'pending' | 'completed',
      createdAt: roster.created_at,
      updatedAt: roster.updated_at
    }));
  } catch (error) {
    console.error('Error fetching rosters:', error);
    return [];
  }
};

// Create a new roster
export const createRoster = async (roster: Omit<Roster, 'id' | 'createdAt' | 'updatedAt'>): Promise<Roster | null> => {
  try {
    // Validate required fields
    if (!roster.employeeId) throw new Error('Employee ID is required');
    if (!roster.startDate) throw new Error('Start date is required');
    if (!roster.endDate) throw new Error('End date is required');
    if (!roster.shift) throw new Error('Shift is required');
    if (!roster.status) throw new Error('Status is required');

    // Validate date format and order
    const startDate = new Date(roster.startDate);
    const endDate = new Date(roster.endDate);
    if (isNaN(startDate.getTime())) throw new Error('Invalid start date format');
    if (isNaN(endDate.getTime())) throw new Error('Invalid end date format');
    if (startDate > endDate) throw new Error('Start date cannot be after end date');

    // Get employee name first
    const { data: employeeData, error: employeeError } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', roster.employeeId)
      .single();

    if (employeeError) {
      console.error('Error fetching employee:', employeeError);
      throw new Error('Failed to fetch employee details');
    }

    if (!employeeData) throw new Error(`Employee not found with ID: ${roster.employeeId}`);

    const employeeName = `${employeeData.first_name || ''} ${employeeData.last_name || ''}`.trim();
    if (!employeeName) throw new Error('Employee name is required');

    const { data, error } = await supabase
      .from('rosters')
      .insert({
        employee_id: roster.employeeId,
        employee_name: employeeName,
        start_date: roster.startDate,
        end_date: roster.endDate,
        shift: roster.shift,
        status: roster.status
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting roster:', error);
      throw new Error('Failed to create roster in database');
    }



    return {
      id: data.id,
      employeeId: data.employee_id,
      employeeName: employeeData ? 
        `${employeeData.first_name || ''} ${employeeData.last_name || ''}`.trim() : 
        'Unknown Employee',
      startDate: data.start_date,
      endDate: data.end_date,
      shift: data.shift as 'morning' | 'evening' | 'night',
      status: data.status as 'active' | 'pending' | 'completed',
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  } catch (error) {
    console.error('Error creating roster:', error);
    return null;
  }
};

// Delete a roster
export const deleteRoster = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('rosters')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting roster:', error);
    return false;
  }
};

// Update a roster's status
export const updateRosterStatus = async (id: string, status: 'active' | 'pending' | 'completed'): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('rosters')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating roster status:', error);
    return false;
  }
};
