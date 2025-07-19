import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Employee } from '@/types';
import { useOnlineStatus } from './useOnlineStatus';

// Cache duration constants
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STALE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

interface EmployeeCache {
  data: Employee[];
  timestamp: number;
  isStale?: boolean;
}

interface UseEmployeesOptions {
  enableStaleCache?: boolean;
  autoRefreshInterval?: number;
  department?: string;
  status?: 'active' | 'inactive' | 'all';
}

export function useEmployees(options: UseEmployeesOptions = {}) {
  const {
    enableStaleCache = true,
    autoRefreshInterval = 0,
    department,
    status = 'active'
  } = options;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { isOnline } = useOnlineStatus();

  // Cache and controller refs
  const cacheRef = useRef<EmployeeCache | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if cache is valid
  const isCacheValid = useCallback((cache: EmployeeCache) => {
    const now = Date.now();
    const age = now - cache.timestamp;

    // Fresh cache
    if (age < CACHE_DURATION) return true;

    // Stale cache (only if enabled and offline)
    if (enableStaleCache && !isOnline && age < STALE_CACHE_DURATION) {
      cache.isStale = true;
      return true;
    }

    return false;
  }, [isOnline, enableStaleCache]);

  // Normalize employee data
  const normalizeEmployeeData = useCallback((data: any[]): Employee[] => {
    return data.map(emp => ({
          id: emp.id,
        name: emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
          first_name: emp.first_name || '',
          last_name: emp.last_name || '',
          email: emp.email,
          phone: emp.phone,
        position: emp.position,
        status: emp.status as 'active' | 'inactive',
          join_date: emp.join_date,
        department: emp.department_name || 'Unknown'
    }));
  }, []);

  // Filter employees based on options
  const filterEmployees = useCallback((employees: Employee[]) => {
    return employees.filter(emp => {
      if (status !== 'all' && emp.status !== status) return false;
      if (department && department !== 'all' && emp.department !== department) return false;
      return true;
    });
  }, [department, status]);

  const fetchEmployees = useCallback(async () => {
    try {
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);

      // Check cache first
      if (cacheRef.current && isCacheValid(cacheRef.current)) {
        const filteredData = filterEmployees(cacheRef.current.data);
        setEmployees(filteredData);
        setLoading(false);
        return;
      }

      // Fetch fresh data
      const { data: employeeData, error: empError } = await supabase
        .rpc('get_employees_with_departments', {}, {
          abortSignal: abortControllerRef.current.signal
        });

      if (empError) {
        throw empError;
      }

      if (!employeeData) {
        throw new Error('No employee data received');
      }

      // Process and cache data
      const normalizedData = normalizeEmployeeData(employeeData);
      cacheRef.current = {
        data: normalizedData,
        timestamp: Date.now()
      };

      // Apply filters and update state
      const filteredData = filterEmployees(normalizedData);
      setEmployees(filteredData);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore aborted requests
      }

      console.error('Error fetching employees:', err);

      // Use stale cache if available
      if (enableStaleCache && cacheRef.current?.data) {
        cacheRef.current.isStale = true;
        const filteredData = filterEmployees(cacheRef.current.data);
        setEmployees(filteredData);
        return;
      }

      setError(err instanceof Error ? err : new Error('Failed to fetch employees'));
    } finally {
      setLoading(false);
    }
  }, [isCacheValid, filterEmployees, normalizeEmployeeData, enableStaleCache]);

  // Setup auto-refresh if enabled
  useEffect(() => {
    if (autoRefreshInterval > 0 && isOnline) {
      autoRefreshTimerRef.current = setInterval(fetchEmployees, autoRefreshInterval);
      
      return () => {
        if (autoRefreshTimerRef.current) {
          clearInterval(autoRefreshTimerRef.current);
        }
      };
    }
  }, [autoRefreshInterval, isOnline, fetchEmployees]);

  // Initial fetch
  useEffect(() => {
    fetchEmployees();

    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [fetchEmployees]);

  // Memoized data processing
  const processedEmployees = useMemo(() => {
    // Add any complex data processing here
    return employees;
  }, [employees]);

  const forceRefresh = useCallback(() => {
    // Clear cache
    cacheRef.current = null;
    
    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Fetch fresh data
    fetchEmployees();
  }, [fetchEmployees]);

  return {
    employees: processedEmployees,
    loading,
    error,
    refetch: forceRefresh,
    isStale: cacheRef.current?.isStale
  };
} 