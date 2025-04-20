import { supabase } from '@/integrations/supabase/client';
import { Roster, ShiftType } from '@/integrations/supabase/types';

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

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(roster => ({
      ...roster,
      shift: roster.shift as ShiftType,
      status: roster.status as 'active' | 'completed'
    }));
  }

  static async getRosterById(id: string): Promise<Roster | null> {
    await this.checkTableExists();
    const { data, error } = await supabase
      .from('rosters')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? {
      ...data,
      shift: data.shift as ShiftType,
      status: data.status as 'active' | 'completed'
    } : null;
  }

  static async createRoster(roster: Omit<Roster, 'id' | 'created_at' | 'updated_at'>): Promise<Roster> {
    await this.checkTableExists();
    const { data, error } = await supabase
      .from('rosters')
      .insert([{
        employee_id: roster.employee_id,
        start_date: roster.start_date,
        end_date: roster.end_date,
        shift: roster.shift,
        status: roster.status
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

    return {
      ...data,
      shift: data.shift as ShiftType,
      status: data.status as 'active' | 'completed'
    };
  }

  static async updateRoster(id: string, updates: Partial<Roster>): Promise<Roster> {
    await this.checkTableExists();
    const { data, error } = await supabase
      .from('rosters')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return {
      ...data,
      shift: data.shift as ShiftType,
      status: data.status as 'active' | 'completed'
    };
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