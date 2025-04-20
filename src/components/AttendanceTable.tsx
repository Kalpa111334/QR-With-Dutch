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
import { Calendar, Download, Search, Clock, Timer, FileText } from 'lucide-react';
import { getAttendanceRecords } from '@/utils/attendanceUtils';
import { getDepartments } from '@/utils/employeeUtils';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';

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
    const matchesDate = record.date >= startDate && record.date <= endDate;
    const matchesDepartment = department === 'all' || record.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSearch = searchTerm === '' || 
      record.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesDate && matchesDepartment && matchesSearch;
  });

  const exportToCsv = () => {
    if (filteredRecords.length === 0) return;
    
    const headers = ['Date', 'Employee Name', 'Check In', 'Check Out', 'Status', 'Minutes Late', 'Working Duration'];
    
    const rows = filteredRecords.map(record => [
      record.date,
      record.employeeName,
      new Date(record.checkInTime).toLocaleTimeString(),
      record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : '-',
      record.status,
      record.minutesLate || 0,
      record.workingDuration || '-'
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
                <Text style={styles.tableCell}>{record.employeeName}</Text>
                <Text style={styles.tableCell}>
                  {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}
                </Text>
                <Text style={styles.tableCell}>
                  {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : '-'}
                </Text>
                <Text style={styles.tableCell}>{record.status}</Text>
                <Text style={styles.tableCell}>
                  {record.checkInTime ? (() => {
                    const checkIn = new Date(record.checkInTime);
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
                <Text style={styles.tableCell}>{record.workingDuration || '-'}</Text>
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
          
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                      <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{record.employeeName}</TableCell>
                      <TableCell>
                        {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}
                      </TableCell>
                      <TableCell>
                        {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            record.status === 'present' 
                              ? 'default' 
                              : record.status === 'checked-out' 
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.checkInTime ? (
                          <div>
                            {(() => {
                              const checkIn = new Date(record.checkInTime);
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
                          <div className="font-medium whitespace-nowrap">
                            {record.workingDuration}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {record.fullTimeRange}
                          </div>
                        </div>
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
