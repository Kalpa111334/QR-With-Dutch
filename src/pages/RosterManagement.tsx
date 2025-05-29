import { useState, useEffect } from 'react';
import { format, isAfter, isBefore, isToday } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { RosterService } from '@/services/RosterService';
import { RosterReportService } from '@/services/RosterReportService';
import { Roster, ShiftType } from '@/integrations/supabase/types';
import { useEmployees } from '@/hooks/useEmployees';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Calendar as CalendarIcon,
  Users,
  Clock,
  Filter,
  Download,
  Share2,
} from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { cn } from "@/lib/utils";
import { supabase } from '../integrations/supabase/client';
import Swal from 'sweetalert2';

const SHIFT_TYPES: ShiftType[] = ['morning', 'evening', 'night', 'off'];

interface FormValues {
  employee: string;
  startDate: Date;
  endDate: Date;
  shift: ShiftType;
  startTime?: string;
  endTime?: string;
}

const getShiftColor = (shift: string) => {
  const colors = {
    morning: 'bg-blue-100 text-blue-800',
    evening: 'bg-purple-100 text-purple-800',
    night: 'bg-indigo-100 text-indigo-800',
    off: 'bg-gray-100 text-gray-800',
  };
  return colors[shift as keyof typeof colors] || 'bg-gray-100 text-gray-800';
};

const getRosterStatus = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();

  if (isBefore(end, now)) return { label: 'Completed', color: 'bg-gray-100 text-gray-800' };
  if (isAfter(start, now)) return { label: 'Upcoming', color: 'bg-yellow-100 text-yellow-800' };
  if (isToday(start) || isToday(end) || (isBefore(start, now) && isAfter(end, now))) {
    return { label: 'Active', color: 'bg-green-100 text-green-800' };
  }
  return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };
};

const formSchema = z.object({
  employee: z.string().min(1, { message: "Employee is required" }),
  startDate: z.date(),
  endDate: z.date(),
  shift: z.enum(['morning', 'evening', 'night', 'off'] as const),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Please enter a valid time in 24-hour format (HH:mm)",
  }).optional(),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: "Please enter a valid time in 24-hour format (HH:mm)",
  }).optional(),
});

export default function RosterManagement() {
  const [formValues, setFormValues] = useState<FormValues>({
    employee: '',
    startDate: new Date(),
    endDate: new Date(),
    shift: 'morning'
  });
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { toast } = useToast();
  const { employees, loading: employeesLoading } = useEmployees();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedStartDate, setSelectedStartDate] = useState<Date>();
  const [selectedEndDate, setSelectedEndDate] = useState<Date>();
  const [selectedShift, setSelectedShift] = useState<ShiftType>('morning');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee: '',
      startDate: new Date(),
      endDate: new Date(),
      shift: 'morning'
    }
  });

  useEffect(() => {
    loadRosters();
  }, []);

  // Auto-fill department and position when employee is selected
  useEffect(() => {
    if (selectedEmployee) {
      const employee = employees.find(emp => emp.id === selectedEmployee);
      if (employee) {
        setSelectedDepartment(employee.department);
        setSelectedPosition(employee.position);
      }
    }
  }, [selectedEmployee, employees]);

  const loadRosters = async () => {
    try {
      setLoading(true);
      const data = await RosterService.getRosters();
      if (!data) {
        throw new Error('No roster data received');
      }
      setRosters(data);
    } catch (error) {
      console.error('Error loading rosters:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load rosters',
        variant: 'destructive',
      });
      setRosters([]); // Set empty array on error to prevent undefined state
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    try {
      setLoading(true);
      setError(null);
      
      const timeSlot = data.shift !== 'off' && data.startTime && data.endTime ? {
        start_time: data.startTime,
        end_time: data.endTime
      } : undefined;

      const newRoster: Omit<Roster, 'id' | 'created_at' | 'updated_at'> = {
        employee_id: data.employee,
        department: selectedDepartment,
        position: selectedPosition,
        start_date: format(data.startDate, 'yyyy-MM-dd'),
        end_date: format(data.endDate, 'yyyy-MM-dd'),
        shift_pattern: [{
          date: format(data.startDate, 'yyyy-MM-dd'),
          shift: data.shift,
          time_slot: timeSlot
        }],
        status: 'active' as const,
      };

      const result = await RosterService.createRoster(newRoster);
      console.log('Roster creation result:', result);
      
      // Update local state immediately with the new roster
      setRosters(prevRosters => [...prevRosters, result]);
      
      setIsCreateDialogOpen(false);
      resetForm();
      form.reset();
      
      // Refresh the roster list to ensure we have the latest data
      await loadRosters();
      
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: 'Roster has been created successfully',
        showConfirmButton: false,
        timer: 1500
      });
    } catch (err) {
      console.error('Error creating roster:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      await Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: err instanceof Error ? err.message : 'An error occurred while creating the roster',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoster = async (id: string) => {
    try {
      await RosterService.deleteRoster(id);
      loadRosters();
        toast({
        title: 'Success',
        description: 'Roster deleted successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete roster',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setSelectedEmployee('');
    setSelectedDepartment('');
    setSelectedPosition('');
    setSelectedStartDate(undefined);
    setSelectedEndDate(undefined);
    setSelectedShift('morning');
  };

  const filteredRosters = rosters.filter(roster => {
    // Get the first shift from the shift pattern
    const currentShift = roster.shift_pattern?.[0]?.shift || 'off';
    
    // Handle search filtering
    const matchesSearch = 
      (employees.find(emp => emp.id === roster.employee_id)?.name || '')
        .toLowerCase().includes(searchTerm.toLowerCase()) ||
      currentShift.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Handle shift filtering
    const matchesShift = filterShift === 'all' || currentShift === filterShift;

    // Handle date filtering
    if (!selectedStartDate) return matchesSearch && matchesShift;

    const rosterStart = new Date(roster.start_date);
    const rosterEnd = new Date(roster.end_date);
    const filterStartDate = new Date(selectedStartDate);
    
    const matchesDate = rosterEnd >= filterStartDate && 
      rosterStart <= filterStartDate;

    return matchesSearch && matchesShift && matchesDate;
  });

  const stats = {
    total: rosters.length,
    active: rosters.filter(r => getRosterStatus(r.start_date, r.end_date).label === 'Active').length,
    upcoming: rosters.filter(r => getRosterStatus(r.start_date, r.end_date).label === 'Upcoming').length,
    completed: rosters.filter(r => getRosterStatus(r.start_date, r.end_date).label === 'Completed').length,
  };

  const renderShiftCell = (shift: ShiftType) => {
    return (
      <div className="p-2 border">
        {shift}
      </div>
    );
  };

  const handleDownloadReport = async (rosterId: string) => {
    try {
      setGeneratingPdf(true);
      const pdfBase64 = await RosterReportService.generateRosterReport(rosterId);
      
      // Create a link element and trigger download
      const link = document.createElement('a');
      link.href = pdfBase64;
      link.download = `roster-report-${rosterId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({
        title: 'Error',
        description: 'Failed to download roster report',
        variant: 'destructive',
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleShareViaWhatsApp = (rosterId: string, employeeName: string) => {
    const shareLink = RosterReportService.getWhatsAppShareLink(rosterId, employeeName);
    window.open(shareLink, '_blank');
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Roster Management</h1>
            <p className="text-gray-500 mt-1">Manage employee schedules and shifts</p>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="whitespace-nowrap"
            size="lg"
          >
            Create New Roster
          </Button>
            </div>
            
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center p-4">
              <div className="rounded-full p-3 bg-blue-100">
                <Users className="h-6 w-6 text-blue-700" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Rosters</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center p-4">
              <div className="rounded-full p-3 bg-green-100">
                <Clock className="h-6 w-6 text-green-700" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center p-4">
              <div className="rounded-full p-3 bg-yellow-100">
                <CalendarIcon className="h-6 w-6 text-yellow-700" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Upcoming</p>
                <p className="text-2xl font-bold">{stats.upcoming}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center p-4">
              <div className="rounded-full p-3 bg-gray-100">
                <Filter className="h-6 w-6 text-gray-700" />
            </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
          </CardContent>
        </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Roster List</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by employee or shift..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterShift} onValueChange={setFilterShift}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shifts</SelectItem>
                  {SHIFT_TYPES.map((shift) => (
                    <SelectItem key={shift} value={shift}>
                      {shift.charAt(0).toUpperCase() + shift.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex justify-center items-center min-h-[200px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredRosters.map((roster) => {
                  const status = getRosterStatus(roster.start_date, roster.end_date);
                  const currentShift = roster.shift_pattern?.[0]?.shift || 'off';
                  const timeSlot = roster.shift_pattern?.[0]?.time_slot;
                  const employee = employees.find(emp => emp.id === roster.employee_id);
                  
                  return (
                    <Card key={roster.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold">
                                {employee?.name || roster.employee_id}
                              </h3>
                              <p className="text-sm text-gray-500">
                                {format(new Date(roster.start_date), 'PP')} - {format(new Date(roster.end_date), 'PP')}
                              </p>
                              {timeSlot && (
                                <p className="text-sm text-gray-600">
                                  Time: {timeSlot.start_time} - {timeSlot.end_time}
                                </p>
                              )}
                              {roster.assignment_time && (
                                <p className="text-xs text-gray-400">
                                  Assigned: {format(new Date(roster.assignment_time), 'PPp')}
                                </p>
                              )}
                              {roster.completion_time && (
                                <p className="text-xs text-gray-400">
                                  Completed: {format(new Date(roster.completion_time), 'PPp')}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                              <Badge className={getShiftColor(currentShift)}>
                                {currentShift.charAt(0).toUpperCase() + currentShift.slice(1)}
                              </Badge>
                              <Badge className={status.color}>
                                {status.label}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            {status.label === 'Completed' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadReport(roster.id)}
                                  disabled={generatingPdf}
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleShareViaWhatsApp(roster.id, employee?.name || roster.employee_id)}
                                >
                                  <Share2 className="h-4 w-4 mr-1" />
                                  Share
                                </Button>
                              </>
                            )}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteRoster(roster.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Create New Roster</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Accordion type="single" collapsible defaultValue="employee">
                <AccordionItem value="employee">
                  <AccordionTrigger className="text-lg font-semibold">
                    Employee Details
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 pb-2">
                    <div className="grid gap-4">
                      <FormField
                        control={form.control}
                        name="employee"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employee</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedEmployee(value);
                              }}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select employee" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {employees.map((employee) => (
                                  <SelectItem key={employee.id} value={employee.id}>
                                    {employee.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <Input value={selectedDepartment} readOnly disabled />
                        </FormItem>
                        <FormItem>
                          <FormLabel>Position</FormLabel>
                          <Input value={selectedPosition} readOnly disabled />
                        </FormItem>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="schedule">
                  <AccordionTrigger className="text-lg font-semibold">
                    Schedule Details
                  </AccordionTrigger>
                  <AccordionContent className="pt-4 pb-2">
                    <div className="grid gap-6">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="startDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Date</FormLabel>
                              <div className="border rounded-md p-2">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={(date) => {
                                    field.onChange(date);
                                    setSelectedStartDate(date);
                                  }}
                                  disabled={(date) =>
                                    date < new Date() || (form.watch("endDate") && date > form.watch("endDate"))
                                  }
                                  className="rounded-md border"
                                />
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="endDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Date</FormLabel>
                              <div className="border rounded-md p-2">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={(date) => {
                                    field.onChange(date);
                                    setSelectedEndDate(date);
                                  }}
                                  disabled={(date) =>
                                    date < (form.watch("startDate") || new Date())
                                  }
                                  className="rounded-md border"
                                />
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="shift"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shift Type</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedShift(value as ShiftType);
                              }}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select shift type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {SHIFT_TYPES.map((shift) => (
                                  <SelectItem key={shift} value={shift}>
                                    <div className="flex items-center gap-2">
                                      <Badge className={cn("w-2 h-2 rounded-full", getShiftColor(shift))} />
                                      {shift.charAt(0).toUpperCase() + shift.slice(1)}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {form.watch("shift") !== "off" && (
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="startTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Start Time</FormLabel>
                                <FormControl>
                                  <Input
                                    type="time"
                                    {...field}
                                    placeholder="HH:mm"
                                  />
                                </FormControl>
                                <FormDescription>
                                  24-hour format (e.g., 09:00)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="endTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>End Time</FormLabel>
                                <FormControl>
                                  <Input
                                    type="time"
                                    {...field}
                                    placeholder="HH:mm"
                                  />
                                </FormControl>
                                <FormDescription>
                                  24-hour format (e.g., 17:00)
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateDialogOpen(false);
                    resetForm();
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Roster</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 