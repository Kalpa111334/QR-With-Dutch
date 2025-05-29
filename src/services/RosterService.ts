import { supabase } from '@/integrations/supabase/client';
import { Roster, DailyShift } from '@/integrations/supabase/types';

export class RosterService {
  static async checkTableExists() {
    const { error } = await supabase.from('rosters').select('*').limit(1);
    if (error && error.message.includes('relation "rosters" does not exist')) {
      throw new Error('Rosters table does not exist. Please run the database migrations first.');
    }
  }

  static async getRosters(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    department?: string;
  }): Promise<Roster[]> {
    await this.checkTableExists();
    let query = supabase.from('rosters').select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.startDate) {
      query = query.gte('start_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('end_date', filters.endDate);
    }
    if (filters?.department) {
      query = query.eq('department', filters.department);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  static async getRosterById(id: string): Promise<Roster | null> {
    await this.checkTableExists();
    const { data, error } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  static async createRoster(roster: Omit<Roster, 'id' | 'created_at' | 'updated_at'>): Promise<Roster> {
    await this.checkTableExists();

    // Ensure shift_pattern is never null by providing a default empty array
    const shiftPattern = roster.shift_pattern || [];

    // If start_date and end_date are provided but shift_pattern is empty,
    // create a default pattern with 'off' shifts for each day
    if (roster.start_date && roster.end_date && shiftPattern.length === 0) {
      const startDate = new Date(roster.start_date);
      const endDate = new Date(roster.end_date);
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        shiftPattern.push({
          date: currentDate.toISOString().split('T')[0],
          shift: 'off'
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    const { data, error } = await supabase
      .from('rosters')
      .insert([{
        employee_id: roster.employee_id,
        department: roster.department || 'Unassigned',
        position: roster.position || 'Unassigned',
        start_date: roster.start_date,
        end_date: roster.end_date,
        shift_pattern: shiftPattern,
        notes: roster.notes,
        status: roster.status || 'active',
        created_by: roster.created_by,
        updated_by: roster.updated_by,
        assignment_time: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw new Error(error.message);
    }
    
    if (!data) {
      throw new Error('No data returned from roster creation');
    }

    return data;
  }

  static async updateRoster(id: string, updates: Partial<Omit<Roster, 'id' | 'created_at'>>): Promise<Roster> {
    await this.checkTableExists();

    // Ensure shift_pattern is never null when updating
    if (updates.shift_pattern === null) {
      updates.shift_pattern = [];
    }

    const { data, error } = await supabase
      .from('rosters')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async deleteRoster(id: string): Promise<void> {
    await this.checkTableExists();
    const { error } = await supabase
      .from('rosters')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
} 