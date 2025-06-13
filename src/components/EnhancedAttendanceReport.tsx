import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format, differenceInMinutes } from 'date-fns';
import { Attendance, Employee } from '@/types';
import { calculateTotalWorkingTime } from '../utils/attendanceUtils';

const styles = StyleSheet.create({
  page: {
    padding: 20,
    backgroundColor: '#ffffff'
  },
  headerContainer: {
    marginBottom: 20,
    borderBottom: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 10
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5
  },
  headerLeft: {
    flex: 1
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end'
  },
  title: {
    fontSize: 16,
    color: '#111827',
    fontWeight: 'bold',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 10,
    color: '#6b7280'
  },
  dateRange: {
    fontSize: 9,
    color: '#374151',
    marginBottom: 2
  },
  generatedAt: {
    fontSize: 8,
    color: '#6b7280'
  },
  table: {
    width: '100%'
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    padding: '8 6',
    gap: 2,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4
  },
  tableHeaderCell: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    padding: '6 6',
    gap: 2,
    minHeight: 24
  },
  tableCell: {
    fontSize: 8,
    color: '#334155',
    alignSelf: 'center'
  },
  durationCell: {
    fontSize: 8,
    color: '#334155',
    alignSelf: 'center',
    textAlign: 'center',
    fontWeight: 'bold'
  },
  statusBadge: {
    padding: '2 4',
    borderRadius: 3,
    fontSize: 7,
    textAlign: 'center'
  },
  presentBadge: {
    backgroundColor: '#dcfce7',
    color: '#15803d'
  },
  lateBadge: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c'
  },
  absentBadge: {
    backgroundColor: '#fef2f2',
    color: '#991b1b'
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10
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
  // Filter records for yesterday (2025-05-13)
  const targetDate = '2025-05-13';
  const filteredRecords = attendanceRecords.filter(record => 
    record.date.split('T')[0] === targetDate
  );

  // Sort records by employee name
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const nameA = (a.employee?.name || a.employee_name || '').toLowerCase();
    const nameB = (b.employee?.name || b.employee_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Daily Attendance Report</Text>
              <Text style={styles.subtitle}>QR Attendance System</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.dateRange}>
                {format(new Date(targetDate), 'MMMM d, yyyy')}
              </Text>
              <Text style={styles.generatedAt}>
                Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}
              </Text>
            </View>
          </View>
        </View>

        {/* Attendance Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 2 }]}>EMPLOYEE</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>1ST IN</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>1ST OUT</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>2ND IN</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>2ND OUT</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>BREAK</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>STATUS</Text>
            <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>LATE</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>DURATION</Text>
          </View>

          {/* Present Employees */}
          {sortedRecords.map((record, index) => {
            const workingDuration = calculateTotalWorkingTime(record);

            return (
              <View key={record.id} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }]}>
                <Text style={[styles.tableCell, { flex: 2 }]}>
                  {record.employee?.name || record.employee_name}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                  {record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                  {record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                  {record.check_in_time && record.is_second_session ? format(new Date(record.check_in_time), 'HH:mm') : '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                  {record.check_out_time && record.is_second_session ? format(new Date(record.check_out_time), 'HH:mm') : '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                  {record.break_duration || '-'}
                </Text>
                <Text style={[
                  styles.tableCell,
                  styles.statusBadge,
                  { flex: 0.8 },
                  record.status === 'late' ? styles.lateBadge : styles.presentBadge
                ]}>
                  {record.status}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>
                  {record.late_duration || '-'}
                </Text>
                <Text style={[styles.durationCell, { flex: 1 }]}>
                  {workingDuration}
                </Text>
              </View>
            );
          })}

          {/* Absent Employees */}
          {absentEmployees.map((employee, index) => (
            <View key={employee.id} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8fafc' }]}>
              <Text style={[styles.tableCell, { flex: 2 }]}>
                {employee.name}
              </Text>
              <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>-</Text>
              <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>-</Text>
              <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>-</Text>
              <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>-</Text>
              <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>-</Text>
              <Text style={[styles.tableCell, styles.statusBadge, { flex: 0.8 }, styles.absentBadge]}>
                absent
              </Text>
              <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>-</Text>
              <Text style={[styles.durationCell, { flex: 1 }]}>-</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Dutch Activity Management System • QR Attendance Report
        </Text>
      </Page>
    </Document>
  );
};

export default EnhancedAttendanceReport;