import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Users, MoreVertical, Pencil, Trash } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { format, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { Employee } from '@/types';
import { getEmployees } from '@/utils/employeeUtils';
import { getRosters, createRoster, deleteRoster, updateRosterStatus, Roster } from '@/utils/rosterUtils';

const RosterManagement: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addDays(new Date(), 6)
  });
  const [selectedShift, setSelectedShift] = useState<'morning' | 'evening' | 'night'>('morning');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Load employees and rosters from the database
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch employees
        const employeesData = await getEmployees();
        setEmployees(employeesData);
        
        // Fetch rosters
        const rostersData = await getRosters();
        setRosters(rostersData);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load roster data',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  const handleCreateRoster = async () => {
    if (!selectedEmployee || !dateRange?.from || !dateRange?.to) {
      toast({
        title: 'Missing Information',
        description: 'Please select an employee and date range',
        variant: 'destructive',
      });
      return;
    }

    // Find the selected employee to get the name
    const employee = employees.find(emp => emp.id === selectedEmployee);
    
    if (!employee) {
      toast({
        title: 'Error',
        description: 'Selected employee not found',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      
      // Create a new roster
      const newRoster = await createRoster({
        employeeId: selectedEmployee,
        startDate: format(dateRange.from, 'yyyy-MM-dd'),
        endDate: format(dateRange.to || dateRange.from, 'yyyy-MM-dd'),
        shift: selectedShift,
        status: 'active'
      });
      
      if (newRoster) {
        // Add to rosters state
        setRosters(prev => [newRoster, ...prev]);
        
        toast({
          title: 'Roster Created',
          description: `Schedule created for ${employee.first_name} ${employee.last_name}`,
        });
        
        // Reset form
        setSelectedEmployee('');
        setDateRange({
          from: new Date(),
          to: addDays(new Date(), 6)
        });
        setSelectedShift('morning');
      } else {
        toast({
          title: 'Error',
          description: 'Failed to create roster',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating roster:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoster = async (id: string) => {
    try {
      setLoading(true);
      const success = await deleteRoster(id);
      
      if (success) {
        setRosters(rosters.filter(roster => roster.id !== id));
        
        toast({
          title: 'Roster Deleted',
          description: 'The schedule has been removed',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete roster',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting roster:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'active' | 'pending' | 'completed') => {
    try {
      setLoading(true);
      const success = await updateRosterStatus(id, status);
      
      if (success) {
        // Update roster in state
        setRosters(prev => 
          prev.map(roster => 
            roster.id === id ? { ...roster, status } : roster
          )
        );
        
        toast({
          title: 'Status Updated',
          description: `Roster status changed to ${status}`,
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update roster status',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating roster status:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter rosters by status
  const activeRosters = rosters.filter(roster => roster.status !== 'completed');
  const completedRosters = rosters.filter(roster => roster.status === 'completed');

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Roster Creation Form */}
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Create New Roster</CardTitle>
            <CardDescription>Schedule shifts for your employees</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Employee Selection */}
            <div className="space-y-2">
              <label htmlFor="employee-select" className="text-sm font-medium">Select Employee</label>
              <select 
                id="employee-select"
                className="w-full border rounded-md p-2 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                disabled={loading}
                aria-label="Select employee"
              >
                <option value="">Select an employee</option>
                {employees.map(employee => (
                  <option key={employee.id} value={employee.id}>
                    {employee.first_name} {employee.last_name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Date Range Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Date Range</label>
              <div className="grid gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      disabled={loading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "LLL dd, y")} -{" "}
                            {format(dateRange.to, "LLL dd, y")}
                          </>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Shift Selection */}
            <div className="space-y-2">
              <label htmlFor="shift-select" className="text-sm font-medium">Select Shift</label>
              <select 
                id="shift-select"
                className="w-full border rounded-md p-2"
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as 'morning' | 'evening' | 'night')}
                disabled={loading}
                aria-label="Select shift"
              >
                <option value="morning">Morning Shift (6AM - 2PM)</option>
                <option value="evening">Evening Shift (2PM - 10PM)</option>
                <option value="night">Night Shift (10PM - 6AM)</option>
              </select>
            </div>
            
            <Button 
              className="w-full" 
              onClick={handleCreateRoster}
              disabled={!selectedEmployee || !dateRange?.from || loading}
            >
              {loading ? 'Creating...' : 'Create Roster'}
            </Button>
          </CardContent>
        </Card>
        
        {/* Active Rosters */}
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Rosters</CardTitle>
              <CardDescription>Current and upcoming employee schedules</CardDescription>
            </div>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center">Loading roster data...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRosters.length > 0 ? (
                    activeRosters.map(roster => (
                      <TableRow key={roster.id}>
                        <TableCell className="font-medium">{roster.employeeName}</TableCell>
                        <TableCell>
                          {format(new Date(roster.startDate), 'MMM d')} - {format(new Date(roster.endDate), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className={`capitalize ${
                            roster.shift === 'morning' ? 'text-blue-600' :
                            roster.shift === 'evening' ? 'text-orange-600' : 'text-purple-600'
                          }`}>
                            {roster.shift}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            roster.status === 'active' ? 'bg-green-100 text-green-800' :
                            roster.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {roster.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleUpdateStatus(roster.id, 'completed')}>
                                <Pencil className="mr-2 h-4 w-4" />
                                <span>Mark Completed</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteRoster(roster.id)}>
                                <Trash className="mr-2 h-4 w-4" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                        No active rosters found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Historical Rosters */}
      <Card>
        <CardHeader>
          <CardTitle>Roster History</CardTitle>
          <CardDescription>Past employee schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center">Loading roster data...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedRosters.length > 0 ? (
                  completedRosters.map(roster => (
                    <TableRow key={roster.id}>
                      <TableCell className="font-medium">{roster.employeeName}</TableCell>
                      <TableCell>
                        {format(new Date(roster.startDate), 'MMM d')} - {format(new Date(roster.endDate), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className={`capitalize ${
                          roster.shift === 'morning' ? 'text-blue-600' :
                          roster.shift === 'evening' ? 'text-orange-600' : 'text-purple-600'
                        }`}>
                          {roster.shift}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                          {roster.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                      No historical rosters found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RosterManagement;
