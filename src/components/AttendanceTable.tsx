import React, { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Attendance } from '@/types';
import { Calendar, Download, Search, Clock, Timer, FileText, Share2, Loader2, Trash2, UserX } from 'lucide-react';
import { getAttendanceRecords, deleteAttendance } from '@/utils/attendanceUtils';
import { getDepartments } from '@/utils/employeeUtils';
import { Document, Page, Text, View, PDFDownloadLink } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer/lib/react-pdf.browser';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import Swal from 'sweetalert2';
import { supabase } from '@/integrations/supabase/client';
import AbsentEmployeeDownload from '@/components/AbsentEmployeeDownload';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface AttendanceTableProps {
  attendanceRecords?: Attendance[] | Promise<Attendance[]>;
}

// Define styles for PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    margin: 'auto',
    flexDirection: 'row',
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  tableCell: {
    width: '14.28%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 5,
    fontSize: 10,
  },
});

const AttendanceTable: React.FC<AttendanceTableProps> = ({ 
  attendanceRecords: propAttendanceRecords
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [department, setDepartment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [departments, setDepartments] = useState<string[]>(['all']);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [showAbsentDialog, setShowAbsentDialog] = useState(false);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch departments
        const deptData = await getDepartments();
        setDepartments(['all', ...deptData]);
        
        // Fetch attendance records if not provided as props
        let attendanceData: Attendance[];
        if (propAttendanceRecords) {
          attendanceData = await Promise.resolve(propAttendanceRecords);
        } else {
          attendanceData = await getAttendanceRecords();
        }
        setRecords(attendanceData);
      } catch (error) {
        console.error('Error loading attendance data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [propAttendanceRecords]);
  
  const filteredRecords = records.filter(record => {
    // Normalize dates for comparison
    const recordDate = new Date(record.date).toISOString().split('T')[0];
    const startISO = new Date(startDate).toISOString().split('T')[0];
    const endISO = new Date(endDate).toISOString().split('T')[0];
    
    const matchesDate = recordDate >= startISO && recordDate <= endISO;
    const matchesDepartment = department === 'all' || 
      (record.employee?.department || '').toLowerCase() === department.toLowerCase();
    const matchesSearch = searchTerm === '' || 
      (record.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesDate && matchesDepartment && matchesSearch;
  });

  const exportToCsv = () => {
    if (filteredRecords.length === 0) return;
    
    const headers = ['Date', 'Employee Name', 'Check In', 'Check Out', 'Status', 'Minutes Late', 'Working Duration'];
    
    const rows = filteredRecords.map(record => [
      record.date,
      record.employee_name || 'Unknown',
      new Date(record.check_in_time).toLocaleTimeString(),
      record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-',
      record.status,
      record.minutes_late || 0,
      record.working_duration || '-'
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPdf = () => {
    if (filteredRecords.length === 0) return;

    const AttendancePDF = () => (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>Attendance Records</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableCell}>Date</Text>
              <Text style={styles.tableCell}>Employee Name</Text>
              <Text style={styles.tableCell}>Check In</Text>
              <Text style={styles.tableCell}>Check Out</Text>
              <Text style={styles.tableCell}>Status</Text>
              <Text style={styles.tableCell}>Minutes Late</Text>
              <Text style={styles.tableCell}>Working Duration</Text>
            </View>
            
            {/* Table Body */}
            {filteredRecords.map((record, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={styles.tableCell}>{new Date(record.date).toLocaleDateString()}</Text>
                <Text style={styles.tableCell}>{record.employee_name}</Text>
                <Text style={styles.tableCell}>
                  {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : '-'}
                </Text>
                <Text style={styles.tableCell}>
                  {record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : '-'}
                </Text>
                <Text style={styles.tableCell}>{record.status}</Text>
                <Text style={styles.tableCell}>
                  {record.check_in_time ? (() => {
                    const checkIn = new Date(record.check_in_time);
                    const workStart = new Date(checkIn);
                    workStart.setHours(9, 0, 0, 0);
                    
                    if (checkIn > workStart) {
                      const lateMinutes = Math.round((checkIn.getTime() - workStart.getTime()) / (1000 * 60));
                      const hours = Math.floor(lateMinutes / 60);
                      const minutes = lateMinutes % 60;
                      
                      if (hours > 0) {
                        return `${hours}h ${minutes}m late`;
                      }
                      return `${minutes}m late`;
                    }
                    return '0';
                  })() : '0'}
                </Text>
                <Text style={styles.tableCell}>{record.working_duration || '-'}</Text>
              </View>
            ))}
          </View>
        </Page>
      </Document>
    );

    return (
      <PDFDownloadLink
        document={<AttendancePDF />}
        fileName={`attendance_${startDate}_to_${endDate}.pdf`}
      >
        {({ loading }) => (
          <Button disabled={loading}>
            <FileText className="mr-2 h-4 w-4" />
            Export to PDF
          </Button>
        )}
      </PDFDownloadLink>
    );
  };

  const handleSelectRecord = (id: string) => {
    setSelectedRecords(prev => 
      prev.includes(id) 
        ? prev.filter(recordId => recordId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      // Select all filtered records instead of all records
      const filteredIds = filteredRecords.map(record => record.id);
      setSelectedRecords(prev => {
        // Combine previously selected records that are not in the current filter
        // with newly selected filtered records
        const prevSelected = prev.filter(id => 
          !records.find(r => r.id === id) || // Keep records that don't exist in the current view
          !filteredRecords.find(r => r.id === id) // Keep records that aren't in the current filter
        );
        return [...new Set([...prevSelected, ...filteredIds])];
      });
    } else {
      // Deselect only the filtered records
      setSelectedRecords(prev => 
        prev.filter(id => !filteredRecords.find(r => r.id === id))
      );
    }
  };

  // Update the checkbox state to reflect partial selection
  const isAllFilteredSelected = filteredRecords.length > 0 && 
    filteredRecords.every(record => selectedRecords.includes(record.id));
  const isPartiallySelected = !isAllFilteredSelected && 
    filteredRecords.some(record => selectedRecords.includes(record.id));

  const formatRecordsForWhatsApp = (selectedRecords: Attendance[]) => {
    // Get the date range for the report
    const dates = selectedRecords.map(r => new Date(r.date));
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const dateRange = startDate.toLocaleDateString() === endDate.toLocaleDateString() 
      ? `for ${startDate.toLocaleDateString()}` 
      : `from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;

    // Group records by department
    const recordsByDept = selectedRecords.reduce((acc, record) => {
      const dept = record.employee?.department || 'Unassigned';
      if (!acc[dept]) {
        acc[dept] = [];
      }
      acc[dept].push(record);
      return acc;
    }, {} as { [key: string]: Attendance[] });

    // Calculate overall summary statistics
    const totalEmployees = selectedRecords.length;
    const onTime = selectedRecords.filter(r => {
      const checkIn = new Date(r.check_in_time);
      const workStart = new Date(checkIn);
      workStart.setHours(9, 0, 0, 0);
      return checkIn <= workStart;
    }).length;
    const late = totalEmployees - onTime;
    const checkedOut = selectedRecords.filter(r => r.status === 'checked-out').length;
    const stillWorking = selectedRecords.filter(r => r.status === 'present').length;

    // Create header with overall summary
    const header = `*ATTENDANCE REPORT ${dateRange.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
📊 *OVERALL SUMMARY*
• Total Employees: ${totalEmployees}
• On Time: ${onTime} (${((onTime/totalEmployees)*100).toFixed(1)}%) ✅
• Late: ${late} (${((late/totalEmployees)*100).toFixed(1)}%) ⚠️
• Checked Out: ${checkedOut} 🏃
• Still Working: ${stillWorking} 💼
━━━━━━━━━━━━━━━━━━━━━\n`;

    // Format department-wise records
    const departmentRecords = Object.entries(recordsByDept).map(([dept, records]) => {
      // Calculate department statistics
      const deptTotal = records.length;
      const deptOnTime = records.filter(r => {
        const checkIn = new Date(r.check_in_time);
        const workStart = new Date(checkIn);
        workStart.setHours(9, 0, 0, 0);
        return checkIn <= workStart;
      }).length;
      const deptLate = deptTotal - deptOnTime;
      const deptCheckedOut = records.filter(r => r.status === 'checked-out').length;
      const deptWorking = records.filter(r => r.status === 'present').length;

      // Department header with statistics
      const deptHeader = `\n🏛️ *DEPARTMENT: ${dept.toUpperCase()}*
📈 Department Statistics:
• Total Employees: ${deptTotal}
• On Time: ${deptOnTime} (${((deptOnTime/deptTotal)*100).toFixed(1)}%)
• Late: ${deptLate} (${((deptLate/deptTotal)*100).toFixed(1)}%)
• Checked Out: ${deptCheckedOut}
• Still Working: ${deptWorking}
──────────────────────`;

      // Format individual employee records for this department
      const employeeRecords = records.map(record => {
        const checkIn = new Date(record.check_in_time);
        const workStart = new Date(checkIn);
        workStart.setHours(9, 0, 0, 0);
        
        let lateStatus = '';
        let lateMinutes = 0;
        if (checkIn > workStart) {
          lateMinutes = Math.round((checkIn.getTime() - workStart.getTime()) / (1000 * 60));
          const hours = Math.floor(lateMinutes / 60);
          const minutes = lateMinutes % 60;
          
          if (hours > 0) {
            lateStatus = `⚠️ *${hours}h ${minutes}m late*`;
          } else {
            lateStatus = `⚠️ *${minutes}m late*`;
          }
        } else {
          lateStatus = '✅ *On Time*';
        }

        // Calculate working duration
        let workingTime = 'Still Working';
        let workingHours = 0;
        if (record.check_out_time) {
          const checkOut = new Date(record.check_out_time);
          workingHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
          const hours = Math.floor(workingHours);
          const minutes = Math.floor((workingHours - hours) * 60);
          workingTime = `${hours}h ${minutes}m`;
        }

        // Status emoji based on working hours and late minutes
        let statusEmoji = '🟡'; // Default - Still Working
        if (record.check_out_time) {
          if (workingHours >= 9) {
            statusEmoji = '🟢'; // Full day
          } else if (workingHours >= 4) {
            statusEmoji = '🟠'; // Half day
          } else {
            statusEmoji = '🔴'; // Less than half day
          }
        }
        if (lateMinutes > 120) {
          statusEmoji = '🔴'; // Very late
        }

        return `${statusEmoji} *${record.employee_name}*
⏰ Check In: ${formatTime(record.check_in_time)}
${record.check_out_time ? `🏃 Check Out: ${formatTime(record.check_out_time)}` : '💼 Status: Still Working'}
${lateStatus}
⏱️ Duration: ${workingTime}
📝 Status: ${record.status === 'checked-out' ? 'Shift Completed' : 'Shift In Progress'}
${record.overtime ? `💪 Overtime: ${record.overtime.toFixed(1)}h` : ''}`;
      }).join('\n───────────\n');

      return `${deptHeader}\n\n${employeeRecords}`;
    }).join('\n\n━━━━━━━━━━━━━━━━━━━━━\n');

    // Add footer with generation time and legend
    const footer = `\n━━━━━━━━━━━━━━━━━━━━━
📋 *STATUS LEGEND*
🟢 Full Day (9+ hours)
🟠 Half Day (4-9 hours)
🔴 Critical (Less than 4 hours/Very Late)
🟡 Still Working

🤖 Generated by QR Check-In System
🕒 Generated on: ${new Date().toLocaleString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })}
📱 For more details, check the dashboard`;

    return `${header}${departmentRecords}${footer}`;
  };

  const handleShare = async () => {
    try {
      setSharing(true);
      
      const selectedAttendanceRecords = records.filter(record => 
        selectedRecords.includes(record.id)
      );

      if (selectedAttendanceRecords.length === 0) {
        toast({
          title: "No Records Selected",
          description: "Please select at least one record to share.",
          variant: "destructive",
        });
        return;
      }

      const message = formatRecordsForWhatsApp(selectedAttendanceRecords);
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMessage}`;
      
      window.open(whatsappUrl, '_blank');
      
      toast({
        title: "Sharing Records",
        description: "WhatsApp has been opened with the selected records.",
      });
    } catch (error) {
      toast({
        title: "Sharing Failed",
        description: "An error occurred while sharing the records.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await Swal.fire({
        title: 'Delete Attendance Record',
        html: `
          <div class="text-center">
            <p>Are you sure you want to delete this attendance record?</p>
            <p class="text-red-600 mt-2">This action cannot be undone!</p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, Delete',
        cancelButtonText: 'Cancel',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          try {
            const deleteResult = await deleteAttendance([id]);
            if (!deleteResult.success) {
              throw new Error(deleteResult.error);
            }
            return deleteResult;
          } catch (error) {
            Swal.showValidationMessage(
              error instanceof Error ? error.message : 'Failed to delete record'
            );
          }
        },
        allowOutsideClick: () => !Swal.isLoading()
      });

      if (result.isConfirmed && result.value.success) {
        // Remove the deleted record from the local state
        setRecords(prevRecords => prevRecords.filter(record => record.id !== id));
        
        // Remove from selected records if it was selected
        setSelectedRecords(prev => prev.filter(recordId => recordId !== id));

        // Show success message
        toast({
          title: 'Record Deleted',
          description: 'The attendance record has been successfully deleted.',
          variant: 'default'
        });

        // Refresh the data to ensure consistency
        const updatedRecords = await getAttendanceRecords();
        setRecords(updatedRecords);
      }
    } catch (error) {
      console.error('Delete operation failed:', error);
      toast({
        title: 'Deletion Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.length === 0) {
      toast({
        title: 'No Records Selected',
        description: 'Please select records to delete.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const result = await Swal.fire({
        title: 'Delete Selected Records',
        html: `
          <div class="text-center">
            <p>You are about to delete <strong>${selectedRecords.length}</strong> attendance record(s).</p>
            <p class="text-red-600 mt-2">This action cannot be undone!</p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, Delete All',
        cancelButtonText: 'Cancel',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          try {
            const deleteResult = await deleteAttendance(selectedRecords);
            if (!deleteResult.success) {
              throw new Error(deleteResult.error);
            }
            return deleteResult;
          } catch (error) {
            Swal.showValidationMessage(
              error instanceof Error ? error.message : 'Failed to delete records'
            );
          }
        },
        allowOutsideClick: () => !Swal.isLoading()
      });

      if (result.isConfirmed && result.value.success) {
        // Remove deleted records from the local state
        setRecords(prevRecords => 
          prevRecords.filter(record => !selectedRecords.includes(record.id))
        );
        
        // Clear selected records
        setSelectedRecords([]);

        // Show success message
        toast({
          title: 'Records Deleted',
          description: `Successfully deleted ${result.value.deletedCount} attendance record(s).`,
          variant: 'default'
        });

        // Refresh the data to ensure consistency
        const updatedRecords = await getAttendanceRecords();
        setRecords(updatedRecords);
      }
    } catch (error) {
      console.error('Bulk delete operation failed:', error);
      toast({
        title: 'Deletion Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '-';
    const time = new Date(timeString);
    return time.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <span>Attendance Records</span>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Dialog open={showAbsentDialog} onOpenChange={setShowAbsentDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  <UserX className="mr-2 h-4 w-4" />
                  Absent Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Absent Employees Report</DialogTitle>
                  <DialogDescription>
                    Generate and share reports of absent employees
                  </DialogDescription>
                </DialogHeader>
                <AbsentEmployeeDownload />
              </DialogContent>
            </Dialog>
            <Button 
              onClick={exportToCsv} 
              disabled={filteredRecords.length === 0}
              className="w-full sm:w-auto"
            >
              <Download className="mr-2 h-4 w-4" />
              Export to CSV
            </Button>
            {filteredRecords.length > 0 && (
              <div className="w-full sm:w-auto">
                {exportToPdf()}
              </div>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="w-full">
              <label className="text-sm font-medium">Start Date</label>
              <div className="flex mt-1">
                <Calendar className="mr-2 h-4 w-4 mt-3" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={today}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="w-full">
              <label className="text-sm font-medium">End Date</label>
              <div className="flex mt-1">
                <Calendar className="mr-2 h-4 w-4 mt-3" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={today}
                  className="w-full"
                />
              </div>
            </div>
            
            <div className="w-full">
              <label className="text-sm font-medium">Department</label>
              <Select
                value={department}
                onValueChange={setDepartment}
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>
                      {dept === 'all' ? 'All Departments' : dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-full">
              <label className="text-sm font-medium">Search</label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search employee..."
                  className="pl-8 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Checkbox 
                checked={isPartiallySelected ? "indeterminate" : isAllFilteredSelected}
                onCheckedChange={handleSelectAll}
                aria-label="Select all filtered records"
                className="translate-y-[2px]"
              />
              <span className="text-sm text-gray-500">
                {selectedRecords.length} records selected 
                {filteredRecords.length !== records.length && 
                  ` (${filteredRecords.length} in current view)`
                }
              </span>
              {selectedRecords.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white ml-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete ({selectedRecords.length})
                </Button>
              )}
            </div>
            <Button
              onClick={handleShare}
              disabled={sharing || selectedRecords.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
              {sharing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Selected
                </>
              )}
            </Button>
          </div>
          
          <div className="rounded-md border">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] sticky left-0 bg-background">Select</TableHead>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[150px]">Employee Name</TableHead>
                      <TableHead className="min-w-[160px]">Check In</TableHead>
                      <TableHead className="min-w-[160px]">Check Out</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[140px]">
                        <div className="flex items-center">
                          <Clock className="mr-1 h-4 w-4" />
                          <span className="hidden sm:inline">Late Duration</span>
                          <span className="sm:hidden">Late</span>
                        </div>
                      </TableHead>
                      <TableHead className="min-w-[140px]">
                        <div className="flex items-center">
                          <Timer className="mr-1 h-4 w-4" />
                          <span className="hidden sm:inline">Working Time</span>
                          <span className="sm:hidden">Time</span>
                        </div>
                      </TableHead>
                      <TableHead className="min-w-[100px] sticky right-0 bg-background">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center h-24">
                          <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center h-24">
                          No attendance records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map((record) => (
                        <TableRow key={record.id} className="group">
                          <TableCell className="sticky left-0 bg-background group-hover:bg-muted/50">
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleSelectRecord(record.id);
                                } else {
                                  setSelectedRecords(prev => prev.filter(id => id !== record.id));
                                }
                              }}
                              aria-label={`Select record for ${record.employee_name}`}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                              <div className="font-medium">{new Date(record.date).toLocaleDateString()}</div>
                              <div className="text-sm text-muted-foreground hidden sm:block">
                                {new Date(record.date).toLocaleDateString('en-US', { weekday: 'short' })}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[150px] sm:max-w-[200px] truncate font-medium">
                              {record.employee_name}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                              <div>{formatTime(record.check_in_time)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                              <div>
                                {record.check_out_time ? formatTime(record.check_out_time) : (
                                  <span className="text-muted-foreground">Not Checked Out</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge 
                                variant={
                                  record.status === 'present' 
                                    ? 'default'
                                    : record.status === 'checked-out'
                                      ? 'secondary'
                                    : record.status === 'checked-out-overtime'
                                      ? 'secondary'
                                    : record.status === 'half-day'
                                      ? 'outline'
                                    : record.status === 'early-departure'
                                      ? 'outline'
                                      : 'destructive'
                                }
                                className="w-fit whitespace-nowrap"
                              >
                                {record.status === 'checked-out-overtime' 
                                  ? 'Overtime'
                                  : record.status === 'early-departure'
                                    ? 'Early Leave'
                                    : record.status.split('-').map(word => 
                                        word.charAt(0).toUpperCase() + word.slice(1)
                                      ).join(' ')
                                }
                              </Badge>
                              {typeof record.overtime === 'number' && record.overtime > 0 && (
                                <div className="text-xs text-blue-600 whitespace-nowrap">
                                  +{record.overtime.toFixed(1)}h overtime
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {record.check_in_time ? (
                              <div>
                                {(() => {
                                  const checkIn = new Date(record.check_in_time);
                                  const workStart = new Date(checkIn);
                                  workStart.setHours(9, 0, 0, 0);
                                  
                                  if (checkIn > workStart) {
                                    const lateMinutes = Math.round((checkIn.getTime() - workStart.getTime()) / (1000 * 60));
                                    const hours = Math.floor(lateMinutes / 60);
                                    const minutes = lateMinutes % 60;
                                    
                                    let lateText = '';
                                    if (hours > 0) {
                                      lateText = `${hours}h ${minutes}m late`;
                                    } else {
                                      lateText = `${minutes}m late`;
                                    }
                                    
                                    return (
                                      <div>
                                        <div className="text-red-600 font-medium whitespace-nowrap">
                                          {lateText}
                                        </div>
                                        <div className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                                          Expected: 9:00 AM
                                        </div>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className="text-green-600 font-medium whitespace-nowrap">
                                        On time
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className={`font-medium whitespace-nowrap ${
                                record.status === 'checked-out-overtime'
                                  ? 'text-blue-600'
                                  : record.status === 'half-day' || record.status === 'early-departure'
                                    ? 'text-yellow-600'
                                    : record.status === 'present'
                                      ? 'text-green-600'
                                    : ''
                              }`}>
                                {record.working_duration}
                              </div>
                              <div className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                                {record.full_time_range}
                                {record.status === 'early-departure' && (
                                  <span className="text-yellow-600 ml-1">
                                    (Early)
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-background">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(record.id)}
                              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="hidden sm:inline">Delete</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceTable;
