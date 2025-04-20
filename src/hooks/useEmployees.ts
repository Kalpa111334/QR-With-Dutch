import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Employee {
  id: string;
  name: string;
  department: string;
  position: string;
}

export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, department_id(name), position')
        .eq('status', 'active');

      if (error) throw error;

      setEmployees(
        data.map((emp) => ({
          id: emp.id,
          name: emp.name,
          department: emp.department_id?.name || '',
          position: emp.position || '',
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch employees'));
    } finally {
      setLoading(false);
    }
  };

  return { employees, loading, error, refetch: fetchEmployees };
} 