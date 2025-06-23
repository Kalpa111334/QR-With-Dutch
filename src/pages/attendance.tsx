import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { getAdminContactInfo, saveAdminContactInfo, recordAttendanceCheckIn, determineNextAttendanceAction, singleScanAttendance } from '../utils/attendanceUtils';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { 
  FileSpreadsheet, 
  FileText, 
  Filter, 
  Search,
  Trash2,
  X,
  Clock,
  Calendar,
  Loader2,
  Download
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  getAttendanceRecords, 
  deleteAttendance 
} from '@/utils/attendanceUtils';
import { format } from 'date-fns';
import AbsentEmployeeDownload from '@/components/AbsentEmployeeDownload';
import { PDFDownloadLink } from '@react-pdf/renderer';
import EnhancedAttendanceReport from '@/components/EnhancedAttendanceReport';
import QRScanner from '@/components/QRScanner';
import { useToast } from '@/components/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AbsentEmployeeReport } from '@/components/AbsentEmployeeReport';
import { PresentEmployeeReport } from '@/components/PresentEmployeeReport';

// Dynamically import QR Scanner to avoid SSR issues
const QrScanner = dynamic(() => import('react-qr-scanner'), {
  ssr: false
});

// Add this function before the Attendance component
const extractEmployeeId = (qrData: string): string | null => {
  // Assuming QR code contains either an employee ID or email
  // You might need to adjust this logic based on your exact QR code format
  const trimmedData = qrData.trim();
  
  // If it looks like an email, return it
  if (trimmedData.includes('@')) {
    return trimmedData;
  }
  
  // If it looks like an ID (assuming IDs are alphanumeric)
  if (/^[a-zA-Z0-9]+$/.test(trimmedData)) {
    return trimmedData;
  }
  
  return null;
};

// Add this before any function that uses fetchRecords
const fetchRecords = async () => {
  try {
    setIsLoading(true);
    const records = await getAttendanceRecords();
    console.log('Fetched Attendance Records:', records);
    setAttendanceRecords(records);
  } catch (error) {
    console.error('Error fetching records:', error);
    toast.error('Failed to fetch attendance records');
  } finally {
    setIsLoading(false);
  }
};

// Load initial data
useEffect(() => {
  fetchRecords();
}, []);

export default function Attendance() {
  const router = useRouter();
  const { toast } = useToast();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isWhatsappShareEnabled, setIsWhatsappShareEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(true);
  const [showAnimation, setShowAnimation] = useState<'success' | 'error' | null>(null);
  const [actionType, setActionType] = useState<string>('');
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [department, setDepartment] = useState('All Departments');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Enhanced filtering with more options
  const [advancedFilters, setAdvancedFilters] = useState({
    status: 'All',
    minWorkHours: '',
    maxWorkHours: '',
    lateArrivals: false,
    earlyDepartures: false
  });

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Try to refresh the session first
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (!session) {
          // Try anonymous sign in if no session
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) {
            console.error('Anonymous sign in failed:', signInError);
            toast.error("Failed to initialize session");
            return;
          }
        }

        // At this point we either have an existing session or a new anonymous session
        console.log('Session initialized successfully');
        setIsLoading(false);
        loadSettings();
      } catch (error) {
        console.error('Session initialization failed:', error);
        toast.error("Failed to initialize session");
      }
    };

    checkSession();

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const loadSettings = async () => {
    try {
      const settings = await getAdminContactInfo();
      setWhatsappNumber(settings.whatsapp_number || '');
      setIsWhatsappShareEnabled(settings.is_whatsapp_share_enabled || false);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load WhatsApp settings');
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsLoading(true);
      await saveAdminContactInfo(
        whatsappNumber,
        isWhatsappShareEnabled,
        {
          whatsapp_number: whatsappNumber,
          is_whatsapp_share_enabled: isWhatsappShareEnabled
        }
      );
      toast.success('WhatsApp settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save WhatsApp settings');
    } finally {
      setIsLoading(false);
    }
  };

  const formatWhatsAppNumber = (number: string) => {
    // Remove all non-digit characters
    const digits = number.replace(/\D/g, '');
    
    // Add country code if not present
    if (digits.startsWith('0')) {
      return '62' + digits.substring(1);
    }
    
    return digits;
  };

  const handleWhatsAppShare = () => {
    if (!whatsappNumber) {
      toast.error('Please set WhatsApp number first');
      return;
    }

    const formattedNumber = formatWhatsAppNumber(whatsappNumber);
    const message = encodeURIComponent('Attendance Report');
    const whatsappUrl = `https://wa.me/${formattedNumber}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  const formatTime = (date: string | Date | undefined) => {
    if (!date) return 'N/A';
    const parsedDate = typeof date === 'string' ? new Date(date) : date;
    return parsedDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatHours = (hours: number | string | undefined) => {
    if (hours === undefined) return 'N/A';
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    const h = Math.floor(numHours);
    const m = Math.round((numHours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Function to trigger success animation
  const triggerSuccessAnimation = (action: string) => {
    setActionType(action);
    setShowAnimation('success');
    
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Hide animation after 2 seconds
    setTimeout(() => {
      setShowAnimation(null);
      setActionType('');
    }, 2000);
  };

  // Function to trigger error animation
  const triggerErrorAnimation = () => {
    setShowAnimation('error');
    
    // Hide animation after 2 seconds
    setTimeout(() => {
      setShowAnimation(null);
    }, 2000);
  };

  const handleScan = async (qrData: string) => {
    try {
      const parsedData = JSON.parse(qrData);
      
      if (!parsedData.id) {
        // Try legacy format
        const legacyMatch = qrData.match(/^EMP:([^:]+):(.+)$/);
        if (!legacyMatch) {
          triggerErrorAnimation();
          toast({
            variant: "destructive",
            title: "Invalid QR Code",
            description: "Please scan a valid employee QR code"
          });
          return;
        }
        parsedData.id = legacyMatch[1];
      }

      setIsLoading(true);
      const result = await markAttendance(parsedData.id);
      
      if (result.success) {
        // Show success animation with action type
        triggerSuccessAnimation(result.action);
        
        toast({
          title: "Success",
          description: result.message
        });
      } else {
        triggerErrorAnimation();
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message
        });
      }
    } catch (error) {
      console.error('Error processing scan:', error);
      triggerErrorAnimation();
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to process QR code"
      });
    } finally {
      setIsLoading(false);
      // Don't stop scanning immediately to allow animation to play
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  // Helper function to perform attendance action - THIS WILL NOW ONLY BE FOR CHECK-IN VIA QR
  const performAttendanceAction = async (employeeId: string) => {
    try {
      // This function in attendanceUtils.ts should now strictly be for check-in
      const attendanceInfo = await recordAttendanceCheckIn(employeeId);
      return { ...attendanceInfo, action: 'check-in' }; // Explicitly set action as check-in
    } catch (error) {
      console.error('Attendance Action Error:', error);
      throw error;
    }
  };

  // Helper function to display success message
  const displayAttendanceSuccessMessage = async (attendanceResult: any, action: 'check-in' /* removed 'check-out' */) => {
    const { employeeName, timestamp, status, lateMinutes } = attendanceResult;

    if (action === 'check-in') {
      const lateText = lateMinutes > 0 
        ? `<p class="text-warning">You are ${lateMinutes} minutes late</p>` 
        : '<p class="text-success">You are on time!</p>';

      await Swal.fire({
        icon: 'success',
        title: 'Check-in Successful',
        html: `
          <div class="text-left">
            <p>Employee: ${employeeName}</p>
            <p>Check-in time: ${formatTime(timestamp)}</p>
            <p>Status: ${status}</p>
            ${lateText}
          </div>
        `,
        showConfirmButton: true,
        timer: 5000
      });
    } 
    // Removed the 'else' block that handled check-out messages
  };

  const handleError = (err: any) => {
    console.error('QR Scanner error:', err);
    toast.error('Error accessing camera. Please check permissions.', {
      duration: 3000,
      style: {
        background: '#ef4444',
        color: '#fff',
        padding: '16px'
      }
    });
  };

  // Modify the handleDeleteRecords function to reset dashboard count
  const handleDeleteRecords = async () => {
    if (selectedRecords.length === 0) {
      toast.error('Please select records to delete');
      return;
    }

    try {
    // Show confirmation dialog
    const confirmDelete = await Swal.fire({
      title: 'Clear Selected Attendance Records?',
      html: `
        <div class="text-center">
          <p>You are about to permanently delete <strong>${selectedRecords.length}</strong> selected attendance record(s).</p>
          <p class="text-red-600 mt-2">This action cannot be undone!</p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, Clear Selected',
      cancelButtonText: 'Cancel'
    });

    // If user confirms deletion
    if (confirmDelete.isConfirmed) {
        // Show loading state
        toast.loading('Deleting records...');

        const result = await deleteAttendance(selectedRecords);
        
        if (result.success) {
          // Remove deleted records from the list
          const updatedRecords = attendanceRecords.filter(
            (record) => !selectedRecords.includes(record.id)
          );
          setAttendanceRecords(updatedRecords);
          
          // Clear selected records
          setSelectedRecords([]);
          
          toast.success(`Successfully deleted ${result.deletedCount} attendance record(s)`);

          // Refresh the records
          await fetchRecords();
        } else {
          toast.error(result.message || 'Failed to clear records');
        }
        }
      } catch (error) {
        console.error('Bulk delete error:', error);
      toast.error(error instanceof Error ? error.message : 'An unexpected error occurred while clearing records.');
    }
  };

  // Add a new function to handle individual record deletion
  const handleDeleteSingleRecord = async (recordId: string) => {
    try {
      const result = await Swal.fire({
        title: 'Delete Attendance Record',
      text: 'Do you want to delete this attendance record?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel'
    });

      if (result.isConfirmed) {
        const result = await deleteAttendanceRecord(recordId, 'complete');
        
        if (result.success) {
          await fetchRecords();
          toast.success('Record deleted successfully');
        } else {
          toast.error(result.message || 'Failed to delete record');
        }
        }
      } catch (error) {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  };

  // Handle record selection
  const handleSelectRecord = (recordId: string) => {
    setSelectedRecords(prev => 
      prev.includes(recordId) 
        ? prev.filter(id => id !== recordId)
        : [...prev, recordId]
    );
  };

  // Select all records
  const handleSelectAll = () => {
    if (selectedRecords.length === attendanceRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(attendanceRecords.map(record => record.id));
    }
  };

  // Enhanced filter function
  const filteredRecords = attendanceRecords.filter(record => {
    // Basic filters
    const matchesSearch = record.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = department === 'All Departments' || record.employee?.department === department;
    const recordDate = new Date(record.date);
    const matchesDateRange = 
      recordDate >= new Date(startDate) && 
      recordDate <= new Date(endDate);
    
    // Advanced filters
    const matchesStatus = 
      advancedFilters.status === 'All' || 
      record.status === advancedFilters.status;

    const workHours = parseFloat(record.workingDuration) || 0;
    const matchesMinWorkHours = 
      !advancedFilters.minWorkHours || 
      workHours >= parseFloat(advancedFilters.minWorkHours);
    
    const matchesMaxWorkHours = 
      !advancedFilters.maxWorkHours || 
      workHours <= parseFloat(advancedFilters.maxWorkHours);

    const matchesLateArrivals = 
      !advancedFilters.lateArrivals || 
      (record.lateDuration && parseInt(record.lateDuration) > 0);

    const matchesEarlyDepartures = 
      !advancedFilters.earlyDepartures || 
      record.status === 'early-departure';

    return (
      matchesSearch && 
      matchesDepartment && 
      matchesDateRange &&
      matchesStatus &&
      matchesMinWorkHours &&
      matchesMaxWorkHours &&
      matchesLateArrivals &&
      matchesEarlyDepartures
    );
  });

  // Calculate summary statistics
  const attendanceSummary = {
    total: filteredRecords.length,
    present: filteredRecords.filter(r => r.status === 'present').length,
    late: filteredRecords.filter(r => r.lateDuration && parseInt(r.lateDuration) > 0).length,
    earlyDepartures: filteredRecords.filter(r => r.status === 'early-departure').length,
    averageWorkHours: filteredRecords.reduce((sum, r) => sum + (parseFloat(r.workingDuration) || 0), 0) / filteredRecords.length || 0
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Employee Name', 
      'Date', 
      'Check-In Time', 
      'Check-Out Time', 
      'Status', 
      'Working Duration'
    ];
    
    const csvData = filteredRecords.map(record => [
      record.employeeName,
      record.date,
      record.checkInTime,
      record.checkOutTime || 'Not Checked Out',
      record.status,
      record.workingDuration
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_records_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF
  const handleExportPDF = () => {
    return (
      <PDFDownloadLink
        document={
          <EnhancedAttendanceReport
            attendanceRecords={filteredRecords}
            absentEmployees={absentEmployees}
            startDate={new Date(startDate)}
            endDate={new Date(endDate)}
          />
        }
        fileName={`attendance_report_${format(new Date(startDate), 'yyyy-MM-dd')}_to_${format(new Date(endDate), 'yyyy-MM-dd')}.pdf`}
      >
        {({ loading }) => (
          <Button
            variant="default"
            className="flex items-center gap-2"
            disabled={loading || filteredRecords.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Export to PDF
              </>
            )}
          </Button>
        )}
      </PDFDownloadLink>
    );
  };

  // Function to clear all filters and selections
  const handleClearFilters = () => {
    // Reset all filter states
    setSearchTerm('');
    setDepartment('All Departments');
    
    // Reset date to today
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    
    // Clear selected records
    setSelectedRecords([]);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold mb-6">Attendance Management</h1>
      
      <div className="grid gap-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Generate Reports</h2>
      <div className="space-y-6">
              <div className="flex flex-col space-y-4">
                <h3 className="text-sm font-medium">Present Employee Report</h3>
                <PresentEmployeeReport />
              </div>
              <div className="flex flex-col space-y-4">
                <h3 className="text-sm font-medium">Absent Employee Report</h3>
                <AbsentEmployeeReport />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR Code Scanner</CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {isScanning && !isLoading && (
              <div className="aspect-square max-w-md mx-auto">
                <QRScanner
                  onScanComplete={handleScan}
                />
              </div>
            )}
            
            {/* Success Animation */}
            <AnimatePresence>
              {showAnimation === 'success' && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                >
                  <motion.div
                    initial={{ y: 20 }}
                    animate={{ y: 0 }}
                    className="bg-white rounded-lg p-6 text-center"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.5 }}
                      className="mb-4"
                    >
                      <Check className="w-16 h-16 text-green-500 mx-auto" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-green-500 mb-2">Success!</h3>
                    <p className="text-gray-600">{actionType.replace(/_/g, ' ').toUpperCase()}</p>
                  </motion.div>
                </motion.div>
              )}

              {/* Error Animation */}
              {showAnimation === 'error' && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                >
                  <motion.div
                    initial={{ y: 20 }}
                    animate={{ y: 0 }}
                    className="bg-white rounded-lg p-6 text-center"
                  >
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 0.5 }}
                      className="mb-4"
                    >
                      <X className="w-16 h-16 text-red-500 mx-auto" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-red-500">Invalid QR Code</h3>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {!isScanning && (
              <Button 
                onClick={() => setIsScanning(true)}
                className="w-full"
              >
                Scan Again
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>WhatsApp Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="whatsapp-share"
                  checked={isWhatsappShareEnabled}
                  onCheckedChange={setIsWhatsappShareEnabled}
                />
                <Label htmlFor="whatsapp-share">Enable WhatsApp Sharing</Label>
              </div>

              {isWhatsappShareEnabled && (
                <>
                  <div className="space-y-2">
                    <Label>WhatsApp Number</Label>
                    <Input
                      type="tel"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="Enter WhatsApp number (e.g., 081234567890)"
                    />
                    <p className="text-sm text-gray-500">
                      Enter number with country code (e.g., 081234567890)
                    </p>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : 'Save Settings'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleWhatsAppShare}
                      disabled={!whatsappNumber}
                    >
                      Share via WhatsApp
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Attendance Management</h1>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExportCSV} disabled={filteredRecords.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            {handleExportPDF()}
            <Button onClick={handleClearFilters} variant="outline">
              Clear Filters
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex space-x-2 p-4">
              <Input 
                placeholder="Search employee..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <Select 
                value={department} 
                onValueChange={setDepartment}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Departments">All Departments</SelectItem>
                  {/* Add department options dynamically */}
                </SelectContent>
              </Select>
              <Input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleClearFilters}
                title="Clear Filters"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Advanced Filtering Section */}
            <div className="p-4 bg-gray-50 border-t">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Status Filter */}
                <div>
                  <Label>Status</Label>
                  <Select 
                    value={advancedFilters.status}
                    onValueChange={(value) => setAdvancedFilters(prev => ({...prev, status: value}))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Statuses</SelectItem>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                      <SelectItem value="early-departure">Early Departure</SelectItem>
                      <SelectItem value="half-day">Half Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Work Hours Range */}
                <div className="flex space-x-2">
                  <div className="flex-1">
                    <Label>Min Hours</Label>
                    <Input 
                      type="number" 
                      placeholder="Min" 
                      value={advancedFilters.minWorkHours}
                      onChange={(e) => setAdvancedFilters(prev => ({...prev, minWorkHours: e.target.value}))}
                      min="0" 
                      step="0.5"
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Max Hours</Label>
                    <Input 
                      type="number" 
                      placeholder="Max" 
                      value={advancedFilters.maxWorkHours}
                      onChange={(e) => setAdvancedFilters(prev => ({...prev, maxWorkHours: e.target.value}))}
                      min="0" 
                      step="0.5"
                    />
                  </div>
                </div>

                {/* Additional Filters */}
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="lateArrivals"
                      checked={advancedFilters.lateArrivals}
                      onCheckedChange={(checked) => setAdvancedFilters(prev => ({...prev, lateArrivals: !!checked}))}
                    />
                    <Label htmlFor="lateArrivals">Late Arrivals</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="earlyDepartures"
                      checked={advancedFilters.earlyDepartures}
                      onCheckedChange={(checked) => setAdvancedFilters(prev => ({...prev, earlyDepartures: !!checked}))}
                    />
                    <Label htmlFor="earlyDepartures">Early Departures</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Attendance Summary */}
            <div className="p-4 bg-gray-100 grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">Total Records</p>
                <p className="text-2xl font-bold">{attendanceSummary.total}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-green-600">Present</p>
                <p className="text-2xl font-bold text-green-700">{attendanceSummary.present}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-yellow-600">Late Arrivals</p>
                <p className="text-2xl font-bold text-yellow-700">{attendanceSummary.late}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-red-600">Early Departures</p>
                <p className="text-2xl font-bold text-red-700">{attendanceSummary.earlyDepartures}</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-blue-600">Avg. Work Hours</p>
                <p className="text-2xl font-bold text-blue-700">{attendanceSummary.averageWorkHours.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox 
                  checked={selectedRecords.length === filteredRecords.length && filteredRecords.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Employee Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Check-In Time</TableHead>
              <TableHead>Check-Out Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Working Duration</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  Loading records...
                </TableCell>
              </TableRow>
            ) : filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  No attendance records found
                </TableCell>
              </TableRow>
            ) : (
              filteredRecords.map((record) => {
                console.log('Rendering Record:', JSON.stringify(record, null, 2)); // More detailed logging
                
                // Validate record has all required properties
                if (!record.id) {
                  console.error('Record missing ID:', record);
                  return null; // Skip rendering this record
                }

                return (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedRecords.includes(record.id)}
                        onCheckedChange={() => handleSelectRecord(record.id)}
                      />
                    </TableCell>
                    <TableCell>{(record.employeeName || record.employee_name || record.employee?.name || 'Unknown')}</TableCell>
                    <TableCell>{record.date || 'N/A'}</TableCell>
                    <TableCell>{formatTime(record.checkInTime)}</TableCell>
                    <TableCell>{formatTime(record.checkOutTime)}</TableCell>
                    <TableCell>{record.status || 'N/A'}</TableCell>
                    <TableCell>{formatHours(record.workingDuration)}</TableCell>
                    <TableCell>
                      {record.id ? (
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => {
                            console.log('Delete Button Clicked for Record:', record.id);
                            handleDeleteSingleRecord(record.id);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span>No Action</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }).filter(Boolean) // Remove any null entries
            )}
          </TableBody>
        </Table>

        <div className="p-4 text-sm text-gray-500">
          {selectedRecords.length > 0 && (
            <p>{selectedRecords.length} record(s) selected</p>
          )}
        </div>

        <AbsentEmployeeDownload />
      </div>
    </div>
  );
} 