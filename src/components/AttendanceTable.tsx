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
import { StyleSheet, Image as PDFImage } from '@react-pdf/renderer/lib/react-pdf';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
import { formatDistanceStrict, format } from 'date-fns';

interface AttendanceTableProps {
  attendanceRecords?: Attendance[] | Promise<Attendance[]>;
}

// Company logo as base64 string
const COMPANY_LOGO = 'data:image/png;base64,YOUR_BASE64_STRING_HERE';

// Define styles for PDF
const styles = StyleSheet.create({
  page: {
    padding: 30,
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
    borderBottom: '2px solid #e0e0e0',
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 4,
  },
  dateRange: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
  },
  summarySection: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
  },
  summaryTitle: {
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 15,
    fontWeight: 'bold',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryBox: {
    width: '30%',
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    color: '#1a1a1a',
    fontWeight: 'bold',
  },
  summaryPercent: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  table: {
    marginTop: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 2,
    borderBottomColor: '#e0e0e0',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  tableHeaderCell: {
    flex: 1,
    padding: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    fontSize: 10,
    color: '#666666',
    fontWeight: 'bold',
    textAlign: 'left',
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 32,
    backgroundColor: '#ffffff',
    marginVertical: 2,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: '#f8f9fa',
  },
  tableCell: {
    flex: 1,
    padding: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    fontSize: 9,
    color: '#333333',
    textAlign: 'left',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 10,
  },
  footerText: {
    fontSize: 8,
    color: '#888888',
    textAlign: 'center',
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: 8,
  },
  statusPresent: {
    backgroundColor: '#dcf7dc',
    color: '#0a5f0a',
  },
  statusLate: {
    backgroundColor: '#fff3cd',
    color: '#856404',
  },
  statusAbsent: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  companyName: {
    fontSize: 28,
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 5,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
  },
  companyTagline: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 15,
    fontStyle: 'italic',
  },
});

// Add a helper function to format the status badge
const getStatusStyle = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'present':
      return styles.statusPresent;
    case 'late':
      return styles.statusLate;
    case 'absent':
      return styles.statusAbsent;
    default:
      return {};
  }
};

// Add new interface for deletion type after the AttendanceTableProps interface
interface DeletionType {
  type: 'check_in' | 'check_out' | null;
}

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
  const [deletionType, setDeletionType] = useState<DeletionType>({ type: null });
  
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
    
    const headers = [
      'Date', 
      'Employee Name', 
      'First Check-In', 
      'First Check-Out', 
      'Second Check-In', 
      'Second Check-Out', 
      'Break Duration', 
      'Status', 
      'Minutes Late', 
      'Working Duration'
    ];
    
    const rows = filteredRecords.map(record => [
      record.date,
      record.employee_name || 'Unknown',
      record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : 'N/A',
      record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : 'N/A',
      record.second_check_in_time ? new Date(record.second_check_in_time).toLocaleTimeString() : 'N/A',
      record.second_check_out_time ? new Date(record.second_check_out_time).toLocaleTimeString() : 'N/A',
      formatBreakDuration(record.break_duration),
      record.status,
      record.minutes_late || 0,
      record.working_duration || 'N/A'
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

    // Calculate summary statistics
    const totalEmployees = filteredRecords.length;
    const onTimeEmployees = filteredRecords.filter(r => {
      const checkIn = new Date(r.check_in_time);
      const workStart = new Date(checkIn);
      workStart.setHours(9, 0, 0, 0);
      return checkIn <= workStart;
    }).length;
    const lateEmployees = totalEmployees - onTimeEmployees;
    const checkedOutEmployees = filteredRecords.filter(r => r.status === 'checked-out').length;
    const stillWorkingEmployees = filteredRecords.filter(r => r.status === 'present').length;

    const AttendancePDF = () => (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Attendance Report</Text>
            <Text style={styles.headerSubtitle}>QR Attendance System</Text>
            <Text style={styles.dateRange}>
              {startDate === endDate 
                ? format(new Date(startDate), 'MMMM d, yyyy')
                : `${format(new Date(startDate), 'MMM d, yyyy')} - ${format(new Date(endDate), 'MMM d, yyyy')}`}
            </Text>
            </View>
            
          {/* Summary Section */}
          <View style={styles.summarySection}>
            <Text style={styles.summaryTitle}>Attendance Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Total Employees</Text>
                <Text style={styles.summaryValue}>{totalEmployees}</Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>On Time</Text>
                <Text style={styles.summaryValue}>{onTimeEmployees}</Text>
                <Text style={styles.summaryPercent}>
                  {((onTimeEmployees/totalEmployees)*100).toFixed(1)}%
                </Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Late Arrivals</Text>
                <Text style={styles.summaryValue}>{lateEmployees}</Text>
                <Text style={styles.summaryPercent}>
                  {((lateEmployees/totalEmployees)*100).toFixed(1)}%
                </Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Average Break</Text>
                <Text style={styles.summaryValue}>
                  {calculateAverageBreakDuration(filteredRecords)}
                </Text>
              </View>
              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Average Working Time</Text>
                <Text style={styles.summaryValue}>
                  {calculateAverageWorkingTime(filteredRecords)}
                </Text>
              </View>
            </View>
          </View>

          {/* Attendance Table */}
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Date</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Employee</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>First Check-In</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>First Check-Out</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Second Check-In</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Second Check-Out</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Break</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.6 }]}>Status</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.6 }]}>Late</Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Working Time</Text>
            </View>

            {filteredRecords.map((record, index) => (
              <View key={index} style={[
                styles.tableRow,
                index % 2 === 1 && styles.tableRowAlt
              ]}>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {format(new Date(record.date), 'MMM d, yyyy')}
                </Text>
                <Text style={[styles.tableCell, { flex: 1.2 }]}>
                  {record.employee_name}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {record.check_in_time 
                    ? format(new Date(record.check_in_time), 'h:mm a')
                    : 'N/A'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {record.check_out_time
                    ? format(new Date(record.check_out_time), 'h:mm a')
                    : 'N/A'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {record.second_check_in_time
                    ? format(new Date(record.second_check_in_time), 'h:mm a')
                    : 'N/A'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {record.second_check_out_time
                    ? format(new Date(record.second_check_out_time), 'h:mm a')
                    : 'N/A'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {formatBreakDuration(record.break_duration)}
                </Text>
                <Text style={[
                  styles.tableCell,
                  { flex: 0.6 },
                  styles.statusBadge,
                  getStatusStyle(record.status)
                ]}>
                  {record.status || 'N/A'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.6 }]}>
                  {record.minutes_late ? `${record.minutes_late}m` : '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]}>
                  {record.working_duration || 'N/A'}
                </Text>
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Generated on {format(new Date(), 'MMMM d, yyyy h:mm a')} • QR Attendance System
            </Text>
          </View>
        </Page>
      </Document>
    );

    return (
      <PDFDownloadLink
        document={<AttendancePDF />}
        fileName={`attendance_report_${startDate}_to_${endDate}.pdf`}
      >
        {({ loading }) => (
          <Button 
            disabled={loading} 
            className="w-full sm:w-auto flex items-center justify-center"
          >
            <FileText className="mr-2 h-4 w-4" />
            {loading ? 'Generating...' : 'Export to PDF'}
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

  const handleDeleteSingleRecord = async (recordId: string) => {
    // Create the custom dialog content
    const { value: formValues } = await Swal.fire({
      title: 'Delete Attendance Record',
      html: `
        <div class="text-center">
          <p class="mb-4">Select what you want to delete:</p>
          <div class="flex flex-col items-start gap-4 text-left">
            <div class="flex items-center space-x-2">
              <input type="radio" id="check_in" name="deletion_type" value="check_in" class="w-4 h-4">
              <label for="check_in">Delete Check-in Record</label>
            </div>
            <div class="flex items-center space-x-2">
              <input type="radio" id="check_out" name="deletion_type" value="check_out" class="w-4 h-4">
              <label for="check_out">Delete Check-out Record</label>
            </div>
            <div class="flex items-center space-x-2">
              <input type="radio" id="complete" name="deletion_type" value="complete" class="w-4 h-4">
              <label for="complete">Delete Complete Record</label>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      preConfirm: () => {
        const selectedType = document.querySelector('input[name="deletion_type"]:checked') as HTMLInputElement;
        if (!selectedType) {
          Swal.showValidationMessage('Please select a deletion type');
          return false;
        }
        return selectedType.value;
      }
    });

    if (!formValues) {
      return; // User cancelled
    }

    try {
      let result;
      
      if (formValues === 'complete') {
        // Complete deletion
        result = await deleteAttendance([recordId]);
      } else {
        // Selective deletion
        const { data, error } = await supabase
          .rpc('handle_selective_deletion', {
            p_record_id: recordId,
            p_deletion_type: formValues
          });

        if (error) throw error;
        result = data;
      }

      if (result.success) {
        // Refresh the records
        const updatedRecords = await getAttendanceRecords();
        setRecords(updatedRecords);

        toast({
          title: 'Success',
          description: result.message || 'Record updated successfully',
          variant: 'default'
        });
      } else {
        throw new Error(result.error || 'Failed to update record');
      }
    } catch (error) {
      console.error('Delete operation failed:', error);
      toast({
        title: 'Error',
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

  const formatBreakDuration = (duration: string | null | undefined) => {
    if (!duration) return 'N/A';
    
    try {
      // Handle numeric input (assuming minutes)
      if (typeof duration === 'number') {
        const minutes = Math.floor(duration);
        if (minutes === 0) return 'N/A';
        
        // Convert to hours and minutes if needed
        if (minutes >= 60) {
          const hours = Math.floor(minutes / 60);
          const remainingMinutes = minutes % 60;
          return `${hours}h ${remainingMinutes}m`;
        }
        
        return `${minutes}m`;
      }

      // Parse string input
      const trimmedDuration = duration.trim().toLowerCase();
      
      // Handle 'N/A' or empty string cases
      if (trimmedDuration === 'n/a' || trimmedDuration === '') return 'N/A';
      
      // Parse minutes from string (e.g., '30 minutes', '45 mins')
      const minutesMatch = trimmedDuration.match(/(\d+)\s*(?:minutes?|mins?)/);
      if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1], 10);
        if (minutes === 0) return 'N/A';
        
        // Convert to hours and minutes if needed
        if (minutes >= 60) {
          const hours = Math.floor(minutes / 60);
          const remainingMinutes = minutes % 60;
          return `${hours}h ${remainingMinutes}m`;
        }
        
        return `${minutes}m`;
      }
      
      // Handle direct hour:minute format
      const hourMinuteMatch = trimmedDuration.match(/(\d+):(\d+)/);
      if (hourMinuteMatch) {
        const hours = parseInt(hourMinuteMatch[1], 10);
        const minutes = parseInt(hourMinuteMatch[2], 10);
        
        if (hours === 0 && minutes === 0) return 'N/A';
        
        if (hours > 0 && minutes > 0) {
          return `${hours}h ${minutes}m`;
        } else if (hours > 0) {
          return `${hours}h`;
        } else {
          return `${minutes}m`;
        }
      }
      
      // Fallback: return the original duration if no parsing worked
      return duration || 'N/A';
    } catch {
      return 'N/A';
    }
  };

  const calculateAverageBreakDuration = (records: Attendance[]): string => {
    if (records.length === 0) return 'N/A';
    
    const totalMinutes = records.reduce((total, record) => {
      const duration = record.break_duration;
      if (duration) {
        const minutes = parseInt(duration.split('m')[0] || '0', 10);
        return total + minutes;
      }
      return total;
    }, 0);
    
    const averageMinutes = totalMinutes / records.length;
    return `${Math.round(averageMinutes)}m`;
  };

  const calculateAverageWorkingTime = (records: Attendance[]): string => {
    if (records.length === 0) return 'N/A';
    
    const totalMinutes = records.reduce((total, record) => {
      const duration = record.working_duration;
      if (duration) {
        const minutes = parseInt(duration.split('m')[0] || '0', 10);
        return total + minutes;
      }
      return total;
    }, 0);
    
    const averageMinutes = totalMinutes / records.length;
    return `${Math.round(averageMinutes)}m`;
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
                      <TableHead className="min-w-[160px]">First Check-In</TableHead>
                      <TableHead className="min-w-[160px]">First Check-Out</TableHead>
                      <TableHead className="min-w-[160px]">Second Check-In</TableHead>
                      <TableHead className="min-w-[160px]">Second Check-Out</TableHead>
                      <TableHead className="min-w-[120px]">Break Duration</TableHead>
                      <TableHead className="min-w-[140px]">Status</TableHead>
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
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                              <div>{record.second_check_in_time ? formatTime(record.second_check_in_time) : 'N/A'}</div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                              <div>{record.second_check_out_time ? formatTime(record.second_check_out_time) : 'N/A'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="whitespace-nowrap">
                              {formatBreakDuration(record.break_duration)}
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
                              onClick={() => handleDeleteSingleRecord(record.id)}
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
