import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Attendance } from '@/types';
import { getAttendanceRecords } from '@/utils/attendanceUtils';
import { getDepartments } from '@/utils/employeeUtils';
import { useOnlineStatus } from './useOnlineStatus';

// Increased cache duration for better performance
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache
const STALE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes stale cache

interface AttendanceCache {
  data: Attendance[];
  timestamp: number;
  isStale?: boolean;
}

interface DepartmentCache {
  data: string[];
  timestamp: number;
  isStale?: boolean;
}

interface UseAttendanceDataOptions {
  enableStaleCache?: boolean;
  autoRefreshInterval?: number;
}

export function useAttendanceData(refreshTrigger = 0, options: UseAttendanceDataOptions = {}) {
  const { enableStaleCache = true, autoRefreshInterval = 0 } = options;
  
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [departments, setDepartments] = useState<string[]>(['all']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useOnlineStatus();

  // Cache refs
  const attendanceCacheRef = useRef<AttendanceCache | null>(null);
  const departmentCacheRef = useRef<DepartmentCache | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if cache is valid
  const isCacheValid = useCallback((cache: { timestamp: number, isStale?: boolean }) => {
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

  // Normalize attendance data
  const normalizeAttendanceData = useCallback((data: any[]): Attendance[] => {
    return data.map(record => ({
      ...record,
      date: record.date || new Date(record.check_in_time || record.first_check_in_time).toISOString().split('T')[0],
      // Add any other normalization logic here
    }));
  }, []);

  // Fetch departments with caching and error handling
  const fetchDepartments = useCallback(async () => {
    try {
      // Check cache first
      if (departmentCacheRef.current && isCacheValid(departmentCacheRef.current)) {
        setDepartments(['all', ...departmentCacheRef.current.data]);
        return;
      }

      const deptData = await getDepartments();
      
      // Validate and normalize department data
      const validDepartments = deptData.filter(Boolean).map(dept => dept.trim());
      
      departmentCacheRef.current = {
        data: validDepartments,
        timestamp: Date.now()
      };
      
      setDepartments(['all', ...validDepartments]);
    } catch (error) {
      console.error('Error fetching departments:', error);
      
      // Use stale cache if available
      if (enableStaleCache && departmentCacheRef.current?.data) {
        departmentCacheRef.current.isStale = true;
        setDepartments(['all', ...departmentCacheRef.current.data]);
        return;
      }
      
      setError('Failed to load departments');
    }
  }, [isCacheValid, enableStaleCache]);

  // Fetch attendance records with caching and optimizations
  const fetchAttendance = useCallback(async () => {
    try {
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Check cache first
      if (attendanceCacheRef.current && isCacheValid(attendanceCacheRef.current)) {
        setAttendanceRecords(attendanceCacheRef.current.data);
        return;
      }

      const data = await getAttendanceRecords();
      const processedData = normalizeAttendanceData(data);

      // Update cache
      attendanceCacheRef.current = {
        data: processedData,
        timestamp: Date.now()
      };

      setAttendanceRecords(processedData);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Ignore aborted requests
      }

      console.error('Error fetching attendance records:', error);
      
      // Use stale cache if available
      if (enableStaleCache && attendanceCacheRef.current?.data) {
        attendanceCacheRef.current.isStale = true;
        setAttendanceRecords(attendanceCacheRef.current.data);
        return;
      }
      
      setError('Failed to load attendance records');
    }
  }, [isCacheValid, normalizeAttendanceData, enableStaleCache]);

  // Fetch all data with optimized concurrency
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchDepartments(),
        fetchAttendance()
      ]);
    } finally {
      setLoading(false);
    }
  }, [fetchDepartments, fetchAttendance]);

  // Setup auto-refresh if enabled
  useEffect(() => {
    if (autoRefreshInterval > 0 && isOnline) {
      autoRefreshTimerRef.current = setInterval(fetchData, autoRefreshInterval);
      
      return () => {
        if (autoRefreshTimerRef.current) {
          clearInterval(autoRefreshTimerRef.current);
        }
      };
    }
  }, [autoRefreshInterval, isOnline, fetchData]);

  // Initial fetch and refresh handling
  useEffect(() => {
    fetchData();

    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [fetchData, refreshTrigger]);

  // Memoized data processing
  const processedData = useMemo(() => {
    // Add any complex data processing here
    return attendanceRecords;
  }, [attendanceRecords]);

  // Force refresh method with optimizations
  const forceRefresh = useCallback(() => {
    // Clear caches
    attendanceCacheRef.current = null;
    departmentCacheRef.current = null;
    
    // Cancel any ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Fetch fresh data
    fetchData();
  }, [fetchData]);

  return {
    attendanceRecords: processedData,
    departments,
    loading,
    error,
    forceRefresh,
    isStale: attendanceCacheRef.current?.isStale || departmentCacheRef.current?.isStale
  };
} 