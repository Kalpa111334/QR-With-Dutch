import React, { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Download, 
  Calendar as CalendarIcon, 
  Users, 
  Clock, 
  Search,
  FileText,
  Loader2,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { format, startOfDay, endOfDay, parseISO, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateLateDuration, formatLateDuration, getRosterBasedLateDuration } from '@/utils/lateDurationUtils';
import { getEffectiveStatus } from '@/utils/attendanceUtils';

interface PresentEmployee {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  first_check_in: string | null;
  first_check_out: string | null;
  second_check_in: string | null;
  second_check_out: string | null;
  late_minutes: number;
  break_hours: number;
  working_duration: number; // in minutes
  department: string;
  position: string;
  status: string;
}

interface Department {
  id: string;
  name: string;
}

interface PresentEmployeeReportProps {
  className?: string;
  onSuccess?: () => void;
}

interface RosterInfo {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_duration: number;
  grace_period: number;
  early_departure_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  first_check_in_time: string | null;
  first_check_out_time: string | null;
  second_check_in_time: string | null;
  second_check_out_time: string | null;
  break_duration_minutes: number | null;
  working_duration_minutes: number | null;
  status: string;
  minutes_late: number;
  departmentGroup?: string;
  employee: {
    id: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    department_id: string;
    position: string;
    department: {
      id: string;
      name: string;
    };
  };
  roster: RosterInfo | null;
}

export function PresentEmployeeReport({ className, onSuccess }: PresentEmployeeReportProps) {
  const [presentEmployees, setPresentEmployees] = useState<PresentEmployee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<PresentEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [departments, setDepartments] = useState<Department[]>([]);
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reportData, setReportData] = useState<AttendanceRecord[]>([]);

  // Function to validate department selection
  const validateDepartment = (departmentId: string): Department | { id: 'all', name: 'All Departments' } | null => {
    if (departmentId === 'all') {
      return { id: 'all', name: 'All Departments' };
    }
    const dept = departments.find(d => d.id === departmentId);
    if (!dept) {
      console.error('Invalid department selected:', departmentId);
      console.log('Available departments:', departments);
      toast({
        title: 'Error',
        description: 'Invalid department selected',
        variant: 'destructive',
      });
      return null;
    }
    return dept;
  };

  // Function to handle department selection
  const handleDepartmentChange = (value: string) => {
    console.log('Department selected:', value);
    console.log('Available departments:', departments);
    const dept = validateDepartment(value);
    if (dept) {
      console.log('Selected department data:', dept);
      setSelectedDepartment(value);
      // Clear any existing report data when department changes
      setReportData([]);
    }
  };

  // Function to ensure department exists
  const ensureDepartmentExists = async (departmentName: string): Promise<Department | null> => {
    try {
      // First try to find the department
      const { data: existingDept, error: findError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('name', departmentName)
        .single();

      if (existingDept) {
        console.log('Found existing department:', existingDept);
        return existingDept;
      }

      // If not found, create it
      console.log('Department not found, creating:', departmentName);
      const { data: newDept, error: createError } = await supabase
        .from('departments')
        .insert({ name: departmentName })
        .select()
        .single();

      if (createError) {
        console.error('Error creating department:', createError);
        toast({
          title: 'Error',
          description: `Failed to create department "${departmentName}"`,
          variant: 'destructive',
        });
        return null;
      }

      console.log('Created new department:', newDept);
      return newDept;
    } catch (error) {
      console.error('Error in ensureDepartmentExists:', error);
      return null;
    }
  };

  // Fetch departments on component mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        // First ensure Dutch Activity department exists
        const dutchActivityDept = await ensureDepartmentExists('Dutch Activity');
        
        // Then fetch all departments
        const { data, error } = await supabase
          .from('departments')
          .select('id, name')
          .order('name');

        if (error) throw error;

        if (data) {
          // Log departments for debugging
          console.log('Fetched departments:', data.map(d => ({ id: d.id, name: d.name })));
          
          // Filter out any null or undefined values
          const validDepartments = data.filter(d => d && d.id && d.name);
          
          if (validDepartments.length === 0) {
            console.warn('No valid departments found');
            toast({
              title: 'Warning',
              description: 'No departments found',
              variant: 'default',
            });
          }
          
          setDepartments(validDepartments);
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch departments',
          variant: 'destructive',
        });
      }
    };

    fetchDepartments();
  }, []);

  // Fetch present employees data
  const fetchPresentEmployees = async (date: Date) => {
    try {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Query attendance records for the selected date
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          id,
          employee_id,
          date,
          first_check_in_time,
          first_check_out_time,
          second_check_in_time,
          second_check_out_time,
          status,
          working_duration_minutes,
          minutes_late,
          break_duration_minutes,
          employees:employee_id (
            name,
            first_name,
            last_name,
            department_id,
            position,
            departments:department_id (
              name
            )
          )
        `)
        .eq('date', dateStr)
        .in('status', ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT', 'FIRST_SESSION_ACTIVE', 'FIRST_CHECK_OUT', 'SECOND_SESSION_ACTIVE', 'SECOND_CHECK_OUT', 'COMPLETED']);

      if (attendanceError) {
        console.error('Error fetching attendance:', attendanceError);
        throw attendanceError;
      }

      // Process the data to calculate required metrics
      const processedData: PresentEmployee[] = (attendanceData || []).map((record: any) => {
        const employee = record.employees;
        const employeeName = employee ? 
          (employee.first_name && employee.last_name 
            ? `${employee.first_name} ${employee.last_name}` 
            : employee.name || 'Unknown') 
          : 'Unknown';

        // Calculate late minutes using roster-based calculation if available
        let lateMinutes = record.minutes_late || 0;
        const firstCheckIn = record.first_check_in_time;
        
        // If we have roster information and check-in time, recalculate late duration properly
        if (firstCheckIn && employee?.departments) {
          // For now, use stored value but this could be enhanced with actual roster lookup
          // In a full implementation, you would fetch the employee's roster here
          lateMinutes = record.minutes_late || 0;
        }

        // Calculate break hours - use stored value or calculate
        let breakMinutes = record.break_duration_minutes || 0;
        if (!breakMinutes && record.first_check_out_time && record.second_check_in_time) {
          const firstCheckOut = parseISO(record.first_check_out_time);
          const secondCheckIn = parseISO(record.second_check_in_time);
          breakMinutes = differenceInMinutes(secondCheckIn, firstCheckOut);
        }

        // Calculate working duration - use stored value or calculate
        let workingMinutes = record.working_duration_minutes || 0;
        if (!workingMinutes && firstCheckIn) {
          // Calculate manually if not stored
          const checkInTime = parseISO(firstCheckIn);
          let totalWorked = 0;

          // First session
          if (record.first_check_out_time) {
            const firstCheckOut = parseISO(record.first_check_out_time);
            totalWorked += differenceInMinutes(firstCheckOut, checkInTime);
          } else {
            // Still working
            totalWorked += differenceInMinutes(new Date(), checkInTime);
          }

          // Second session
          if (record.second_check_in_time) {
            const secondCheckIn = parseISO(record.second_check_in_time);
            if (record.second_check_out_time) {
              const secondCheckOut = parseISO(record.second_check_out_time);
              totalWorked += differenceInMinutes(secondCheckOut, secondCheckIn);
            } else {
              // Still in second session
              totalWorked += differenceInMinutes(new Date(), secondCheckIn);
            }
          }

          workingMinutes = totalWorked;
        }

        return {
          id: record.id,
          employee_id: record.employee_id,
          employee_name: employeeName,
          date: record.date,
          first_check_in: record.first_check_in_time,
          first_check_out: record.first_check_out_time,
          second_check_in: record.second_check_in_time,
          second_check_out: record.second_check_out_time,
          late_minutes: Math.max(0, lateMinutes),
          break_hours: breakMinutes / 60,
          working_duration: workingMinutes,
          department: employee?.departments?.name || 'Unassigned',
          position: employee?.position || 'Unassigned',
          status: record.status
        };
      });

      setPresentEmployees(processedData);

      toast({
        title: 'Success',
        description: `Found ${processedData.length} present employees for ${format(date, 'PP')}`,
      });

    } catch (error) {
      console.error('Error fetching present employees:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch present employees data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter employees based on search and department
  useEffect(() => {
    let filtered = presentEmployees;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(emp =>
        emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.position.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by department
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(emp => emp.department === departmentFilter);
    }

    setFilteredEmployees(filtered);
  }, [presentEmployees, searchQuery, departmentFilter]);

  // Load data when component mounts or date changes
  useEffect(() => {
    fetchPresentEmployees(selectedDate);
  }, [selectedDate]);

  // Format time display
  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-';
    try {
      return format(parseISO(timeString), 'HH:mm');
    } catch {
      return '-';
    }
  };

  // Format duration display
  const formatDuration = (minutes: number | null) => {
    if (!minutes || minutes === 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    // For durations less than an hour, only show minutes
    if (hours === 0) {
      return `${mins}M`;
    }
    
    // For durations with hours, pad minutes with leading zero if needed
    return `${hours}H ${mins.toString().padStart(2, '0')}M`;
  };

  const fetchAttendanceData = async () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Validation Error',
        description: 'Please select date range',
        variant: 'destructive',
      });
      return null;
    }

    try {
      // Log query parameters for debugging
      console.log('Fetching attendance with params:', {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        departmentId: selectedDepartment,
        availableDepartments: departments
      });

      // First get all active employees with their department info
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, name, first_name, last_name, department_id, position')
        .eq('status', 'active');

      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        throw new Error(`Failed to fetch employees: ${employeesError.message}`);
      }

      // Get departments info separately
      const { data: departmentsData, error: departmentsError } = await supabase
        .from('departments')
        .select('id, name');

      if (departmentsError) {
        console.error('Error fetching departments:', departmentsError);
        throw new Error(`Failed to fetch departments: ${departmentsError.message}`);
      }

      // Create a map of department IDs to department names
      const departmentMap = departmentsData.reduce((map, dept) => {
        map[dept.id] = dept.name;
        return map;
      }, {} as Record<string, string>);

      // Add department names to employees data
      const employeesWithDept = employeesData.map(emp => ({
        ...emp,
        department: {
          id: emp.department_id,
          name: departmentMap[emp.department_id] || 'Unassigned'
        }
      }));

      // Filter employees based on department selection
      const validEmployees = selectedDepartment === 'all'
        ? employeesWithDept
        : employeesWithDept?.filter(emp => emp.department_id === selectedDepartment) || [];

      if (!validEmployees || validEmployees.length === 0) {
        console.log('No active employees found', selectedDepartment === 'all' ? 'across all departments' : `in department: ${selectedDepartment}`);
        toast({
          title: 'No Employees',
          description: 'No active employees found in the selected department(s)',
          variant: 'default',
        });
        return [];
      }

      const employeeIds = validEmployees.map(emp => emp.id);
      console.log(`Found ${employeeIds.length} active employees ${selectedDepartment === 'all' ? 'across all departments' : 'in department'}`);

      // Fetch attendance records for these employees
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          id,
          date,
          first_check_in_time,
          first_check_out_time,
          second_check_in_time,
          second_check_out_time,
          break_duration_minutes,
          working_duration_minutes,
          status,
          minutes_late,
          employee_id,
          roster:roster_id (
            id,
            name,
            start_time,
            end_time,
            break_duration,
            grace_period,
            early_departure_threshold,
            is_active,
            created_at,
            updated_at
          )
        `)
        .in('employee_id', employeeIds)
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .order('date', { ascending: true });

      if (attendanceError) {
        console.error('Attendance fetch error:', attendanceError);
        throw new Error(`Failed to fetch attendance: ${attendanceError.message}`);
      }

      if (!attendanceData || attendanceData.length === 0) {
        toast({
          title: 'No Data',
          description: 'No attendance records found for the selected criteria',
          variant: 'default',
        });
        return [];
      }

      // Add employee and department info to attendance records
      const enrichedAttendanceData: AttendanceRecord[] = attendanceData.map(record => {
        const employee = validEmployees.find(emp => emp.id === record.employee_id);
        const rosterData = Array.isArray(record.roster) ? record.roster[0] : record.roster;
        
        return {
          ...record,
          employee: {
            id: employee?.id || '',
            name: employee?.name || '',
            first_name: employee?.first_name || '',
            last_name: employee?.last_name || '',
            department_id: employee?.department_id || '',
            position: employee?.position || 'Unassigned',
            department: employee?.department || { id: '', name: 'Unassigned' }
          },
          roster: rosterData ? {
            id: rosterData.id,
            name: rosterData.name,
            start_time: rosterData.start_time,
            end_time: rosterData.end_time,
            break_duration: rosterData.break_duration,
            grace_period: rosterData.grace_period,
            early_departure_threshold: rosterData.early_departure_threshold,
            is_active: rosterData.is_active,
            created_at: rosterData.created_at,
            updated_at: rosterData.updated_at
          } : null
        };
      });

      // Group attendance data by department for "All Departments" case
      if (selectedDepartment === 'all') {
        const departmentGroups = enrichedAttendanceData.reduce((groups, record) => {
          const deptId = record.employee?.department_id || 'unassigned';
          const deptName = record.employee?.department?.name || 'Unassigned';
          if (!groups[deptId]) {
            groups[deptId] = {
              name: deptName,
              records: []
            };
          }
          groups[deptId].records.push(record);
          return groups;
        }, {} as Record<string, { name: string; records: typeof enrichedAttendanceData }>);

        // Add department grouping to the records
        enrichedAttendanceData.forEach(record => {
          record.departmentGroup = record.employee?.department?.name || 'Unassigned';
        });
      }

      // Log successful data fetch
      console.log('Successfully fetched attendance data:', {
        recordCount: enrichedAttendanceData.length,
        dateRange: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`,
        employeeCount: employeeIds.length,
        departments: departments
      });

      return enrichedAttendanceData;
    } catch (error) {
      console.error('Error in fetchAttendanceData:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch attendance data',
        variant: 'destructive',
      });
      return null;
    }
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const attendanceData = await fetchAttendanceData();
      if (!attendanceData || attendanceData.length === 0) {
        setLoading(false);
        return;
      }

      // Initialize PDF with A4 portrait
      const doc = new jsPDF('portrait', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - (2 * margin);

      // Add header
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.line(margin, 47, pageWidth - margin, 47);

      doc.setFontSize(32);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('DUTCH TRAILS', pageWidth / 2, 20, { align: 'center' });

      doc.setFontSize(20);
      doc.setFont('helvetica', 'normal');
      doc.text('ATTENDANCE REPORT', pageWidth / 2, 32, { align: 'center' });

      doc.setFontSize(16);
      doc.text(selectedDepartment === 'all' ? 'ALL DEPARTMENTS' : departments.find(d => d.id === selectedDepartment)?.name?.toUpperCase() || 'UNKNOWN DEPARTMENT', pageWidth / 2, 44, { align: 'center' });

      // Add date range and generation info
      doc.setFontSize(10);
      doc.setTextColor(44, 62, 80);
      const dateRange = `Period: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`;
      const generatedAt = `Generated on: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
      doc.text(dateRange, margin, 60);
      doc.text(generatedAt, pageWidth - margin, 60, { align: 'right' });

      // If "All Departments" is selected, create a department breakdown
      if (selectedDepartment === 'all') {
        // Group data by department
        const departmentGroups = attendanceData.reduce((groups, record) => {
          const deptName = record.employee?.department?.name || 'Unassigned';
          if (!groups[deptName]) {
            groups[deptName] = [];
          }
          groups[deptName].push(record);
          return groups;
        }, {} as Record<string, typeof attendanceData>);

        let currentY = 70;

        // Add department summaries
        Object.entries(departmentGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([deptName, records]) => {
          // Check if we need a new page
          if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = 20;
          }

          // Add department header
          doc.setFillColor(240, 244, 248);
          doc.rect(margin, currentY, contentWidth, 10, 'F');
          doc.setFontSize(12);
          doc.setTextColor(41, 128, 185);
          doc.setFont('helvetica', 'bold');
          doc.text(deptName.toUpperCase(), margin + 2, currentY + 7);
          currentY += 15;

          // Calculate department statistics
          const totalEmployees = new Set(records.map(r => r.employee?.id)).size;
          const onTimeCount = records.filter(r => r.minutes_late === 0).length;
          const lateCount = records.filter(r => r.minutes_late > 0).length;
          const totalHours = records.reduce((sum, r) => sum + (r.working_duration_minutes || 0), 0) / 60;

          // Add department statistics
          doc.setFontSize(10);
          doc.setTextColor(44, 62, 80);
          doc.setFont('helvetica', 'normal');
          doc.text([
            `Total Employees: ${totalEmployees}`,
            `On Time: ${onTimeCount} (${Math.round((onTimeCount/records.length)*100)}%)`,
            `Late: ${lateCount} (${Math.round((lateCount/records.length)*100)}%)`,
            `Total Hours: ${Math.round(totalHours * 10) / 10}h`
          ], margin + 5, currentY, { lineHeightFactor: 1.5 });

          currentY += 25;

          // Add department records table
          (doc as any).autoTable({
            head: [['Date', 'Employee Name', 'First In', 'First Out', 'Second In', 'Second Out', 'Break', 'Hours', 'Late', 'Status']],
            body: records.map(record => {
              // Calculate late duration
              let lateDuration = '-';
              if (record.first_check_in_time) {
                const checkInTime = new Date(record.first_check_in_time);
                const startTime = new Date(checkInTime);
                startTime.setHours(9, 0, 0, 0); // Assuming 9 AM start time
                
                if (checkInTime > startTime) {
                  const lateMinutes = Math.round((checkInTime.getTime() - startTime.getTime()) / (1000 * 60));
                  lateDuration = formatDuration(lateMinutes);
                }
              }

              return [
              format(new Date(record.date), 'dd/MM/yyyy'),
              record.employee?.first_name && record.employee?.last_name 
                ? `${record.employee.first_name} ${record.employee.last_name}`
                : record.employee?.name || 'Unknown',
              record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-',
              record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-',
              record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-',
              record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-',
              formatDuration(record.break_duration_minutes),
              formatDuration(record.working_duration_minutes),
                lateDuration,
              record.status?.toUpperCase() || 'UNKNOWN'
              ];
            }),
            startY: currentY,
            theme: 'grid',
            styles: {
              font: 'helvetica',
              fontSize: 8,
              cellPadding: 2,
              lineColor: [200, 200, 200],
              lineWidth: 0.1,
            },
            headStyles: {
              fillColor: [41, 128, 185],
              textColor: 255,
              fontSize: 8,
              fontStyle: 'bold',
            },
            alternateRowStyles: {
              fillColor: [245, 245, 245],
            },
            margin: { left: margin, right: margin },
          });

          currentY = (doc as any).lastAutoTable.finalY + 20;
        });
      } else {
        // Original single department table
        (doc as any).autoTable({
          head: [['Date', 'Employee Name', 'First In', 'First Out', 'Second In', 'Second Out', 'Break', 'Hours', 'Late', 'Status']],
          body: attendanceData.map(record => [
            format(new Date(record.date), 'dd/MM/yyyy'),
            record.employee?.first_name && record.employee?.last_name 
              ? `${record.employee.first_name} ${record.employee.last_name}`
              : record.employee?.name || 'Unknown',
            record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-',
            record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-',
            record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-',
            record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-',
            formatDuration(record.break_duration_minutes),
            formatDuration(record.working_duration_minutes),
            record.first_check_in_time && record.roster ? 
              getRosterBasedLateDuration(record, record.roster as RosterInfo) : 
              (record.minutes_late > 0 ? formatDuration(record.minutes_late) : '-'),
            record.status?.toUpperCase() || 'UNKNOWN'
          ]),
          startY: 115,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: 2,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
          },
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontSize: 8,
            fontStyle: 'bold',
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245],
          },
          margin: { left: margin, right: margin },
        });
      }

      // Add footer
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        'This report is system generated and does not require signature.',
        pageWidth / 2,
        pageHeight - margin,
        { align: 'center' }
      );

      // Save the PDF
      const filename = `attendance_report_${selectedDepartment === 'all' ? 'all_departments' : departments.find(d => d.id === selectedDepartment)?.name?.toLowerCase()}_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.pdf`;
      doc.save(filename);

      toast({
        title: 'Success',
        description: 'PDF report generated successfully',
      });

      setIsDialogOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error generating PDF report:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate PDF report',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    const data = await fetchAttendanceData();
    if (data) {
      setReportData(data);
    }
  };

  const renderPreviewTable = (data: AttendanceRecord[]) => {
    // Get the department title - handle "All Departments" case
    const departmentTitle = selectedDepartment === 'all' 
      ? 'All Departments' 
      : departments.find(d => d.id === selectedDepartment)?.name || 'Unknown Department';
    
    // Calculate statistics
    const totalEmployees = new Set(data.map(record => record.employee?.id)).size;
    const totalDays = new Set(data.map(record => record.date)).size;
    const onTimeCount = data.filter(record => record.minutes_late === 0).length;
    const lateCount = data.filter(record => record.minutes_late > 0).length;
    const totalHours = data.reduce((sum, record) => sum + (record.working_duration_minutes || 0), 0) / 60;

    return (
      <div className="space-y-4">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEmployees}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Total Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDays}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">On Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onTimeCount}</div>
              <div className="text-xs text-muted-foreground">
                {Math.round((onTimeCount/data.length)*100)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Late</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lateCount}</div>
              <div className="text-xs text-muted-foreground">
                {Math.round((lateCount/data.length)*100)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(totalHours * 10) / 10}h</div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile Card View */}
        <div className="block sm:hidden">
          {data.slice(0, 5).map((record) => (
            <Card key={record.id} className="mb-4">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Date:</span>
                    <span className="text-sm">{format(new Date(record.date), 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Employee:</span>
                    <span className="text-sm">
                      {record.employee?.first_name && record.employee?.last_name 
                        ? `${record.employee.first_name} ${record.employee.last_name}`
                        : record.employee?.name || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Department:</span>
                    <span className="text-sm">
                      {record.employee?.department?.name || departmentTitle || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">First In:</span>
                    <span className="text-sm">
                      {record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">First Out:</span>
                    <span className="text-sm">
                      {record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Second In:</span>
                    <span className="text-sm">
                      {record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Second Out:</span>
                    <span className="text-sm">
                      {record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Break:</span>
                    <span className="text-sm">{formatDuration(record.break_duration_minutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Duration:</span>
                    <span className="text-sm">{formatDuration(record.working_duration_minutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Late:</span>
                    <span className="text-sm">
                      {record.first_check_in_time && record.roster ? 
                        getRosterBasedLateDuration(record, record.roster as RosterInfo) : 
                        (record.minutes_late > 0 ? formatDuration(record.minutes_late) : '-')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <span className="text-sm">{getEffectiveStatus(record).toUpperCase()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {data.length > 5 && (
            <div className="text-center text-xs text-muted-foreground">
              Showing 5 of {data.length} records. Download PDF for complete list.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-center text-xs font-medium">Date</th>
                  <th className="p-2 text-left text-xs font-medium">Employee</th>
                  <th className="p-2 text-center text-xs font-medium">Department</th>
                  <th className="p-2 text-center text-xs font-medium">First In</th>
                  <th className="p-2 text-center text-xs font-medium">First Out</th>
                  <th className="p-2 text-center text-xs font-medium">Second In</th>
                  <th className="p-2 text-center text-xs font-medium">Second Out</th>
                  <th className="p-2 text-center text-xs font-medium">Break</th>
                  <th className="p-2 text-center text-xs font-medium">Duration</th>
                  <th className="p-2 text-center text-xs font-medium">Late</th>
                  <th className="p-2 text-center text-xs font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((record) => (
                  <tr key={record.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 text-center text-xs">
                      {format(new Date(record.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="p-2 text-left text-xs">
                      {record.employee?.first_name && record.employee?.last_name 
                        ? `${record.employee.first_name} ${record.employee.last_name}`
                        : record.employee?.name || 'Unknown'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.employee?.department?.name || departmentTitle || '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {formatDuration(record.break_duration_minutes)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {formatDuration(record.working_duration_minutes)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.first_check_in_time && record.roster ? 
                        getRosterBasedLateDuration(record, record.roster as RosterInfo) : 
                        (record.minutes_late > 0 ? formatDuration(record.minutes_late) : '-')}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {getEffectiveStatus(record).toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="flex items-center gap-2 w-full sm:w-auto"
        variant="outline"
        size="sm"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Present Report</span>
        <span className="sm:hidden">Present</span>
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Generate Present Employee Report</DialogTitle>
          </DialogHeader>

          <div className={cn("space-y-4", className)}>
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Date Range</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Start Date</label>
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && setStartDate(date)}
                      className="rounded-md border w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">End Date</label>
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => date && setEndDate(date)}
                      className="rounded-md border w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Department</label>
                <Select value={selectedDepartment} onValueChange={handleDepartmentChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department">
                      {departments.find(d => d.id === selectedDepartment)?.name || 'Select department'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  size="sm"
                  disabled={loading || !startDate || !endDate}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sm:hidden">Refresh</span>
                </Button>
                <div className="text-sm text-muted-foreground">
                  {reportData.length > 0 && `${reportData.length} records found`}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                <Button
                  onClick={generatePDF}
                  disabled={loading || !startDate || !endDate}
                  className="flex items-center gap-2 w-full sm:w-auto"
                  size="sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
            </div>

            {reportData.length > 0 && renderPreviewTable(reportData)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
