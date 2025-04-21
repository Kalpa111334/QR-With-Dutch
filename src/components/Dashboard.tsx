import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getAttendanceRecords, getAdminContactInfo, saveAdminContactInfo, autoShareAttendanceSummary, getTodayAttendanceSummary } from '@/utils/attendanceUtils';
import { getEmployees } from '@/utils/employeeUtils';
import { User, Users, Clock, CheckCircle, UploadCloud, Share2, AlertTriangle, Calendar, TestTube, Mail, UserCheck, LogOut, UserX } from 'lucide-react';
import { Attendance, Employee } from '@/types';
import { Button } from '@/components/ui/button';
import BulkEmployeeUpload from './BulkEmployeeUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// Error boundary component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Dashboard Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 p-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-4">The dashboard failed to load properly.</p>
          <Button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

const Dashboard: React.FC = () => {
  // Basic state
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  
  // WhatsApp settings state
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>([]);
  const [newWhatsappNumber, setNewWhatsappNumber] = useState('');
  const [isWhatsappShareEnabled, setIsWhatsappShareEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  // Today's summary
  const [summary, setSummary] = useState<any>(null);
  
  const today = new Date().toISOString().split('T')[0];
  
  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [attendanceData, employeesData, adminSettings, todaySummary] = await Promise.all([
          getAttendanceRecords(),
          getEmployees(),
          getAdminContactInfo(),
          getTodayAttendanceSummary()
        ]);
        
        setAttendanceRecords(attendanceData);
        setEmployees(employeesData);
        setSummary(todaySummary);
        
        // Set WhatsApp settings
        if (adminSettings) {
          // Split the stored numbers if they exist
          const numbers = adminSettings.whatsappNumber ? adminSettings.whatsappNumber.split('|').map(n => n.trim()) : [];
          setWhatsappNumbers(numbers);
          setIsWhatsappShareEnabled(adminSettings.isWhatsappShareEnabled || false);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load dashboard data. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Refresh data every 2 minutes
    const intervalId = setInterval(fetchData, 2 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);
  
  // Calculate stats from attendance records
  const stats = React.useMemo(() => {
    if (!summary) {
      return {
        totalEmployees: 0,
        present: 0,
        late: 0,
        absent: 0,
        checkedOut: 0,
        onTime: 0,
        stillWorking: 0,
        lateRate: '0',
        absentRate: '0'
      };
    }

    return {
      totalEmployees: summary.totalEmployees,
      present: summary.presentCount,
      late: summary.lateCount,
      absent: summary.absentCount,
      checkedOut: summary.checkedOutCount,
      onTime: summary.onTime,
      stillWorking: summary.stillWorking,
      lateRate: summary.lateRate,
      absentRate: summary.absentRate
    };
  }, [summary]);

  // Format WhatsApp number
  const formatWhatsAppNumber = (number: string): string => {
    let formatted = number.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
      formatted = '94' + formatted.substring(1);
    } else if (!formatted.startsWith('94')) {
      formatted = '94' + formatted;
    }
    return formatted;
  };

  // Handle adding new WhatsApp number
  const handleAddNumber = () => {
    if (!newWhatsappNumber) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a WhatsApp number',
        variant: 'destructive',
      });
      return;
    }

    const formatted = formatWhatsAppNumber(newWhatsappNumber);
    if (formatted.length < 11) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid WhatsApp number (minimum 11 digits)',
        variant: 'destructive',
      });
      return;
    }

    if (whatsappNumbers.includes(formatted)) {
      toast({
        title: 'Validation Error',
        description: 'This number is already added',
        variant: 'destructive',
      });
      return;
    }

    setWhatsappNumbers([...whatsappNumbers, formatted]);
    setNewWhatsappNumber('');
  };

  // Handle removing WhatsApp number
  const handleRemoveNumber = (numberToRemove: string) => {
    setWhatsappNumbers(whatsappNumbers.filter(num => num !== numberToRemove));
  };

  // Handle saving WhatsApp settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      if (isWhatsappShareEnabled && whatsappNumbers.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'Please add at least one WhatsApp number',
          variant: 'destructive',
        });
        return;
      }

      const info = {
        whatsappNumber: whatsappNumbers.join(' | '),
        isWhatsappShareEnabled
      };
      
      await saveAdminContactInfo(whatsappNumbers.join(' | '), isWhatsappShareEnabled, info);
      
      toast({
        title: 'Success',
        description: 'Settings saved successfully',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle WhatsApp sharing
  const handleShareNow = async () => {
    if (!whatsappNumbers.length) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one WhatsApp number',
        variant: 'destructive',
      });
      return;
    }

    setIsSharing(true);
    try {
      const result = await autoShareAttendanceSummary();
      
      if (result) {
        toast({
          title: 'Success',
          description: 'Opening WhatsApp to share the report...',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to share report. Please check your settings.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sharing report:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while sharing',
        variant: 'destructive',
      });
    } finally {
      // Short delay before resetting sharing state to show the loading state
      setTimeout(() => setIsSharing(false), 1000);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleBulkUploadComplete = () => {
    setShowBulkUpload(false);
  };

  if (showBulkUpload) {
    return <BulkEmployeeUpload onComplete={handleBulkUploadComplete} />;
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6 p-4">
        <Tabs defaultValue="overview" onValueChange={(value) => setActiveTab(value as 'overview' | 'settings')}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
            <h2 className="text-2xl font-semibold">{activeTab === 'overview' ? 'Dashboard Overview' : 'WhatsApp Report Settings'}</h2>
            <div className="flex flex-wrap gap-2">
              <TabsList className="bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
                <TabsTrigger value="settings" className="text-xs sm:text-sm">WhatsApp Settings</TabsTrigger>
              </TabsList>
              <Button 
                onClick={() => setShowBulkUpload(true)}
                className="flex items-center gap-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-md transition-all duration-300"
                size="sm"
              >
                <UploadCloud size={16} />
                <span className="text-xs sm:text-sm">Bulk Import</span>
              </Button>
            </div>
          </div>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalEmployees}</div>
                  <p className="text-xs text-muted-foreground">Active employees in system</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Present Today</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.present + stats.late}</div>
                  {stats.totalEmployees > 0 && (
                    <p className="text-xs text-green-600">
                      Present Rate: {((stats.present + stats.late) / stats.totalEmployees * 100).toFixed(1)}%
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Checked Out</CardTitle>
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.checkedOut}</div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Still Working: {stats.stillWorking}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
                  <UserX className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.absent}</div>
                  <div className="space-y-1">
                    <p className="text-xs text-red-600">
                      Absence Rate: {stats.absentRate}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Out of {stats.totalEmployees} total employees
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <Card className="border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-300">
                    <UserCheck size={16} className="text-green-500" />
                    Present Employees
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-green-700 dark:text-green-300">{stats.present + stats.late}</div>
                  <p className="text-xs text-green-600/80 dark:text-green-400/80">
                    {stats.totalEmployees > 0
                      ? `${((stats.present + stats.late) / stats.totalEmployees * 100).toFixed(1)}% present today`
                      : 'No employees in the system'}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <Card className="border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertTriangle size={16} className="text-red-500" />
                    Absent Employees
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold text-red-700 dark:text-red-300">{stats.absent}</div>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    {stats.totalEmployees > 0
                      ? `${stats.absentRate}% absence rate today (${stats.absent} out of ${stats.totalEmployees} employees)`
                      : 'No employees in the system'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            {isSharing && (
              <Alert className="mb-4">
                <Share2 className="h-4 w-4" />
                <AlertTitle>Sharing in progress</AlertTitle>
                <AlertDescription>Opening WhatsApp to share the attendance report...</AlertDescription>
              </Alert>
            )}
            
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-800/30 border-none shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-green-600" />
                  WhatsApp Attendance Reports
                </CardTitle>
                <CardDescription>
                  Configure super admin WhatsApp numbers for attendance reports
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="whatsapp-share"
                      checked={isWhatsappShareEnabled}
                      onCheckedChange={setIsWhatsappShareEnabled}
                    />
                    <Label htmlFor="whatsapp-share" className="font-medium">
                      Enable WhatsApp Sharing
                    </Label>
                  </div>

                  {isWhatsappShareEnabled && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Super Admin WhatsApp Numbers</Label>
                        <div className="flex flex-wrap gap-2">
                          {whatsappNumbers.map((number, index) => (
                            <div key={index} className="flex items-center gap-2 bg-green-100 dark:bg-green-900/40 rounded-full px-3 py-1">
                              <span className="text-sm">+{number}</span>
                              <button
                                onClick={() => handleRemoveNumber(number)}
                                className="text-red-500 hover:text-red-700"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="whatsapp-number">Add New Number</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="whatsapp-number"
                              type="tel"
                              value={newWhatsappNumber}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '');
                                if (value.length <= 15) {
                                  setNewWhatsappNumber(value);
                                }
                              }}
                              placeholder="Enter WhatsApp number (e.g., 94741233252)"
                              className="pl-8"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                              +
                            </span>
                          </div>
                          <Button
                            onClick={handleAddNumber}
                            variant="outline"
                            className="border-green-600 text-green-600"
                          >
                            Add
                          </Button>
                        </div>
                        <p className="text-sm text-gray-500">
                          Enter number with or without country code (e.g., 0741233252 or 94741233252)
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={isSaving || (isWhatsappShareEnabled && whatsappNumbers.length === 0)}
                      className={cn(
                        "flex-1 transition-all duration-200",
                        isSaving 
                          ? "bg-gray-400"
                          : "bg-green-600 hover:bg-green-700"
                      )}
                    >
                      {isSaving ? (
                        <>
                          <span className="animate-spin mr-2">⏳</span>
                          Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </Button>
                    {isWhatsappShareEnabled && whatsappNumbers.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={handleShareNow}
                        disabled={isSharing}
                        className="flex-1 border-green-600 text-green-600 hover:bg-green-50 flex items-center justify-center gap-2"
                      >
                        <Share2 className="h-4 w-4" />
                        {isSharing ? 'Opening WhatsApp...' : 'Share Now'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-medium mb-2">About WhatsApp Reports</h3>
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-sm space-y-2">
                    <div className="flex items-start gap-2">
                      <Clock className="h-4 w-4 text-green-600 mt-0.5" />
                      <p>Daily attendance summary will be shared at 6:00 PM</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <p>The summary includes late arrivals, check-ins, and check-outs</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Users className="h-4 w-4 text-green-600 mt-0.5" />
                      <p>Reports show detailed statistics of employee attendance</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-green-600 mt-0.5" />
                      <p>Get insights into late arrivals and absence rates</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Share2 className="h-4 w-4 text-green-600 mt-0.5" />
                      <p>Messages are sent directly to your WhatsApp</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default Dashboard;
