import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format, differenceInMinutes } from 'date-fns';
import { Attendance, Employee } from '@/types';
import { calculateTotalWorkingTime } from '../utils/attendanceUtils';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica'
  },
  headerContainer: {
    marginBottom: 25,
    borderBottom: 2,
    borderBottomColor: '#2c3e50',
    paddingBottom: 15
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  headerLeft: {
    flex: 1
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end'
  },
  companyName: {
    fontSize: 22,
    color: '#2c3e50',
    fontWeight: 'bold',
    marginBottom: 5
  },
  title: {
    fontSize: 18,
    color: '#34495e',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 12,
    color: '#7f8c8d'
  },
  dateRange: {
    fontSize: 11,
    color: '#34495e',
    marginBottom: 3
  },
  generatedAt: {
    fontSize: 9,
    color: '#95a5a6'
  },
  summarySection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    padding: 15,
    marginBottom: 25
  },
  summaryTitle: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center'
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10
  },
  summaryBox: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 4,
    width: '23%',
    alignItems: 'center'
  },
  summaryLabel: {
    fontSize: 9,
    color: '#7f8c8d',
    marginBottom: 4,
    textAlign: 'center'
  },
  summaryValue: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: 'bold',
    marginBottom: 2
  },
  summaryPercent: {
    fontSize: 10,
    color: '#3498db'
  },
  table: {
    width: '100%'
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#34495e',
    padding: '8 6',
    marginBottom: 1
  },
  tableHeaderCell: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ecf0f1',
    padding: '7 6',
    backgroundColor: '#ffffff'
  },
  tableRowAlt: {
    backgroundColor: '#f8f9fa'
  },
  tableCell: {
    fontSize: 8,
    color: '#2c3e50'
  },
  statusBadge: {
    padding: '2 6',
    borderRadius: 3,
    fontSize: 8
  },
  presentBadge: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32'
  },
  lateBadge: {
    backgroundColor: '#fff3e0',
    color: '#f57c00'
  },
  absentBadge: {
    backgroundColor: '#ffebee',
    color: '#c62828'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    borderTop: 1,
    borderTopColor: '#ecf0f1',
    paddingTop: 10
  },
  footerText: {
    fontSize: 8,
    color: '#95a5a6',
    textAlign: 'center'
  },
  pageNumber: {
    fontSize: 8,
    color: '#95a5a6',
    textAlign: 'center',
    marginTop: 4
  },
  departmentSection: {
    marginTop: 15,
    marginBottom: 10
  },
  departmentTitle: {
    fontSize: 11,
    color: '#2c3e50',
    fontWeight: 'bold',
    marginBottom: 8,
    backgroundColor: '#ecf0f1',
    padding: '4 8',
    borderRadius: 2
  }
});

interface EnhancedAttendanceReportProps {
  attendanceRecords: Attendance[];
  absentEmployees: Employee[];
  startDate: Date;
  endDate: Date;
}

const EnhancedAttendanceReport: React.FC<EnhancedAttendanceReportProps> = ({
  attendanceRecords,
  absentEmployees,
  startDate,
  endDate
}) => {
  // Calculate statistics
  const totalEmployees = attendanceRecords.length + absentEmployees.length;
  const presentEmployees = attendanceRecords.length;
  const onTimeEmployees = attendanceRecords.filter(record => !record.late_duration).length;
  const lateEmployees = attendanceRecords.filter(record => record.late_duration).length;
  
  // Group records by department
  const recordsByDepartment = attendanceRecords.reduce((acc, record) => {
    const dept = record.employee?.department || 'Unassigned';
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(record);
    return acc;
  }, {} as { [key: string]: Attendance[] });

  // Sort departments alphabetically
  const sortedDepartments = Object.keys(recordsByDepartment).sort();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.companyName}>Dutch Activity Management System</Text>
              <Text style={styles.title}>Attendance Report</Text>
              <Text style={styles.subtitle}>QR Attendance System</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.dateRange}>
                {format(startDate, 'MMMM d, yyyy')}
                {startDate.toDateString() !== endDate.toDateString() && 
                  ` - ${format(endDate, 'MMMM d, yyyy')}`}
              </Text>
              <Text style={styles.generatedAt}>
                Generated on {format(new Date(), 'MMM d, yyyy HH:mm')}
              </Text>
            </View>
          </View>
        </View>

        {/* Summary Section */}
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>Attendance Overview</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Employees</Text>
              <Text style={styles.summaryValue}>{totalEmployees}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Present</Text>
              <Text style={styles.summaryValue}>{presentEmployees}</Text>
              <Text style={styles.summaryPercent}>
                {((presentEmployees/totalEmployees)*100).toFixed(1)}%
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>On Time</Text>
              <Text style={styles.summaryValue}>{onTimeEmployees}</Text>
              <Text style={styles.summaryPercent}>
                {((onTimeEmployees/totalEmployees)*100).toFixed(1)}%
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Late</Text>
              <Text style={styles.summaryValue}>{lateEmployees}</Text>
              <Text style={styles.summaryPercent}>
                {((lateEmployees/totalEmployees)*100).toFixed(1)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Department-wise Attendance */}
        {sortedDepartments.map((department, deptIndex) => (
          <View key={department} style={styles.departmentSection}>
            <Text style={styles.departmentTitle}>{department}</Text>
            
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Employee ID</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Name</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Check In</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Check Out</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.6 }]}>Late By</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Duration</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Status</Text>
              </View>

              {recordsByDepartment[department].map((record, index) => (
                <View 
                  key={record.id} 
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt
                  ]}
                >
                  <Text style={[styles.tableCell, { flex: 0.8 }]}>
                    {record.employee?.id || '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1.4 }]}>
                    {record.employee?.name || record.employee_name || '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 0.8 }]}>
                    {record.check_in_time ? format(new Date(record.check_in_time), 'HH:mm') : '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 0.8 }]}>
                    {record.check_out_time ? format(new Date(record.check_out_time), 'HH:mm') : '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 0.6 }]}>
                    {record.late_duration ? `${record.late_duration}m` : '-'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 0.8 }]}>
                    {record.working_duration || '-'}
                  </Text>
                  <Text 
                    style={[
                      styles.tableCell,
                      styles.statusBadge,
                      { flex: 0.8 },
                      record.status === 'present' ? styles.presentBadge :
                      record.status === 'late' ? styles.lateBadge :
                      styles.absentBadge
                    ]}
                  >
                    {record.status}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Absent Employees Section */}
        {absentEmployees.length > 0 && (
          <View style={styles.departmentSection}>
            <Text style={styles.departmentTitle}>Absent Employees</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Employee ID</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1.4 }]}>Name</Text>
                <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Department</Text>
                <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>Status</Text>
              </View>

              {absentEmployees.map((employee, index) => (
                <View 
                  key={employee.id}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt
                  ]}
                >
                  <Text style={[styles.tableCell, { flex: 0.8 }]}>{employee.id}</Text>
                  <Text style={[styles.tableCell, { flex: 1.4 }]}>{employee.name}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{employee.department}</Text>
                  <Text 
                    style={[
                      styles.tableCell,
                      styles.statusBadge,
                      styles.absentBadge,
                      { flex: 0.8 }
                    ]}
                  >
                    Absent
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Dutch Activity Management System • QR Attendance Report
          </Text>
          <Text style={styles.pageNumber}>
            Page 1
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export default EnhancedAttendanceReport;