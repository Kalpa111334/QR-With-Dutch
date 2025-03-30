
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
    const { data, error } = await supabase
      .from('rosters')
      .insert({
        employee_id: roster.employeeId,
        start_date: roster.startDate,
        end_date: roster.endDate,
        shift: roster.shift,
        status: roster.status
      })
      .select()
      .single();

    if (error) throw error;

    // Get employee name
    const { data: employee } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', roster.employeeId)
      .single();

    return {
      id: data.id,
      employeeId: data.employee_id,
      employeeName: employee ? 
        `${employee.first_name || ''} ${employee.last_name || ''}`.trim() : 
        'Unknown Employee',
      startDate: data.start_date,
      endDate: data.end_date,
      shift: data.shift,
      status: data.status,
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
