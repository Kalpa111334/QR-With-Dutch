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
import { Calendar, Download, Search, Clock, Timer, FileText, Share2, Loader2, Trash2 } from 'lucide-react';
import { getAttendanceRecords, deleteAttendance } from '@/utils/attendanceUtils';
import { getDepartments } from '@/utils/employeeUtils';
import { Document, Page, Text, View, PDFDownloadLink } from '@react-pdf/renderer';
import { StyleSheet } from '@react-pdf/renderer/lib/react-pdf.browser';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import Swal from 'sweetalert2';
import { supabase } from '@/integrations/supabase/client';

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
      setSelectedRecords(records.map(record => record.id));
    } else {
      setSelectedRecords([]);
    }
  };

  const formatRecordsForWhatsApp = (selectedRecords: Attendance[]) => {
    // Get the date range for the report
    const dates = selectedRecords.map(r => new Date(r.date));
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const dateRange = startDate.toLocaleDateString() === endDate.toLocaleDateString() 
      ? `for ${startDate.toLocaleDateString()}` 
      : `from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;

    // Calculate summary statistics
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

    // Create header with summary
    const header = `🏢 *ATTENDANCE REPORT ${dateRange.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━━
📊 *SUMMARY*
• Total Records: ${totalEmployees}
• On Time: ${onTime} (${((onTime/totalEmployees)*100).toFixed(1)}%) ✅
• Late: ${late} (${((late/totalEmployees)*100).toFixed(1)}%) ⚠️
• Checked Out: ${checkedOut} 🏃
• Still Working: ${stillWorking} 💼
━━━━━━━━━━━━━━━━━━━━━\n`;

    // Format individual records with more detail
    const records = selectedRecords.map(record => {
      const checkIn = new Date(record.check_in_time);
      const workStart = new Date(checkIn);
      workStart.setHours(9, 0, 0, 0);
      
      let lateStatus = '';
      if (checkIn > workStart) {
        const lateMinutes = Math.round((checkIn.getTime() - workStart.getTime()) / (1000 * 60));
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

      // Calculate working duration if checked out
      let workingTime = 'Still Working';
      if (record.check_out_time) {
        const checkOut = new Date(record.check_out_time);
        const hours = Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60));
        const minutes = Math.floor(((checkOut.getTime() - checkIn.getTime()) / (1000 * 60)) % 60);
        workingTime = `${hours}h ${minutes}m`;
      }

      return `👤 *${record.employee_name}*
📅 Date: ${new Date(record.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}
⏰ Check In: ${formatTime(record.check_in_time)}
${record.check_out_time ? `🏃 Check Out: ${formatTime(record.check_out_time)}` : '💼 Status: Still Working'}
${lateStatus}
⏱️ Duration: ${workingTime}
${record.status === 'checked-out' ? '✔️ Shift Completed' : '🔄 Shift In Progress'}`;
    }).join('\n\n───────────────\n\n');

    // Add footer with generation time
    const footer = `\n━━━━━━━━━━━━━━━━━━━━━
🤖 Generated by QR Check-In System
🕒 Generated on: ${new Date().toLocaleString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}
📱 For more details, check the dashboard`;

    return `${header}${records}${footer}`;
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
        <CardTitle className="flex justify-between items-center">
          <span>Attendance Records</span>
          <div className="flex gap-2">
            <Button onClick={exportToCsv} disabled={filteredRecords.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export to CSV
            </Button>
            {filteredRecords.length > 0 && exportToPdf()}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <div className="flex mt-1">
                <Calendar className="mr-2 h-4 w-4 mt-3" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={today}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">End Date</label>
              <div className="flex mt-1">
                <Calendar className="mr-2 h-4 w-4 mt-3" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={today}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Department</label>
              <Select
                value={department}
                onValueChange={setDepartment}
              >
                <SelectTrigger className="mt-1">
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
            
            <div>
              <label className="text-sm font-medium">Search</label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search employee..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                checked={selectedRecords.length === records.length}
                onCheckedChange={handleSelectAll}
                aria-label="Select all records"
              />
              <span className="text-sm text-gray-500">
                {selectedRecords.length} records selected
              </span>
              {selectedRecords.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected ({selectedRecords.length})
                </Button>
              )}
            </div>
            <Button
              onClick={handleShare}
              disabled={sharing || selectedRecords.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
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
          
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Select</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <div className="flex items-center">
                      <Clock className="mr-1 h-4 w-4" />
                      Late Duration
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center">
                      <Timer className="mr-1 h-4 w-4" />
                      Working Time
                    </div>
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24">
                      No attendance records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
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
                      <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{record.employee_name}</TableCell>
                      <TableCell>{formatTime(record.check_in_time)}</TableCell>
                      <TableCell>
                        {record.check_out_time ? formatTime(record.check_out_time) : 'Not Checked Out'}
                      </TableCell>
                      <TableCell>
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
                          <div className="text-xs text-blue-600 mt-1">
                            +{record.overtime.toFixed(1)}h overtime
                          </div>
                        )}
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
                                    <div className="text-red-600 font-medium">
                                      {lateText}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Expected: 9:00 AM
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="text-green-600 font-medium">
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
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {record.full_time_range}
                            {record.status === 'early-departure' && (
                              <span className="text-yellow-600 ml-1">
                                (Early Leave)
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(record.id)}
                          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceTable;
