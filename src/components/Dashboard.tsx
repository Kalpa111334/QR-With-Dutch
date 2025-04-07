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
  const [whatsappNumber, setWhatsappNumber] = useState('');
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
          setWhatsappNumber(adminSettings.whatsappNumber || '');
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
    if (!summary || !employees.length) {
      return {
        totalEmployees: 0,
        activeEmployees: 0,
        present: 0,
        late: 0,
        absent: 0,
        checkedOut: 0,
        lateRate: '0',
        absentRate: '0',
        summary: {
          present: 0,
          late: 0,
          absent: 0,
          checkedOut: 0,
          onTime: 0,
          stillWorking: 0,
          totalEmployees: 0,
          activeEmployees: 0,
          presentCount: 0,
          lateCount: 0,
          absentCount: 0,
          checkedOutCount: 0,
          onTimeCount: 0,
          stillWorkingCount: 0,
          lateRate: '0',
          absentRate: '0'
        }
      };
    }

    return {
      totalEmployees: summary.totalEmployees,
      activeEmployees: summary.totalEmployees,
      present: summary.presentCount,
      late: summary.lateCount,
      absent: summary.absentCount,
      checkedOut: summary.checkedOutCount,
      lateRate: summary.lateRate,
      absentRate: summary.absentRate,
      summary: summary
    };
  }, [summary, employees]);

  // Handle saving WhatsApp settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      if (isWhatsappShareEnabled && !whatsappNumber) {
        toast({
          title: 'Validation Error',
          description: 'Please enter a WhatsApp number',
          variant: 'destructive',
        });
        return;
      }

      await saveAdminContactInfo(whatsappNumber, isWhatsappShareEnabled);
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
    if (!whatsappNumber) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a WhatsApp number',
        variant: 'destructive',
      });
      return;
    }

    // Validate number format
    const cleanNumber = whatsappNumber.replace(/\D/g, '');
    if (cleanNumber.length < 10) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid WhatsApp number',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSharing(true);
    try {
      const result = await autoShareAttendanceSummary('evening');
      
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
                  <div className="text-2xl font-bold">{stats.present}</div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {stats.summary.present}
                    </p>
                    <div className="text-xs">
                      <span className="text-green-600">On Time: {stats.summary.onTime}</span>
                      <br />
                      <span className="text-amber-600">Late: {stats.summary.late}</span>
                    </div>
                  </div>
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
                      {stats.summary.checkedOut}
                    </p>
                    <p className="text-xs">
                      Still Working: {stats.summary.stillWorking}
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
                  <p className="text-xs text-muted-foreground">
                    {stats.summary.absent}
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
                    {stats.absent > 0 && stats.activeEmployees > 0
                      ? `${stats.absentRate}% absence rate today`
                      : 'All employees present today!'}
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
                  Configure how attendance reports are shared via WhatsApp
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="whatsapp-share"
                      checked={isWhatsappShareEnabled}
                      onCheckedChange={(checked) => {
                        setIsWhatsappShareEnabled(checked);
                        if (!checked) {
                          setWhatsappNumber('');
                        }
                      }}
                    />
                    <Label htmlFor="whatsapp-share" className="font-medium">
                      Enable WhatsApp Sharing
                    </Label>
                  </div>

                  {isWhatsappShareEnabled && (
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-number">WhatsApp Number</Label>
                      <div className="relative">
                        <Input
                          id="whatsapp-number"
                          type="tel"
                          value={whatsappNumber}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9]/g, '');
                            setWhatsappNumber(value);
                          }}
                          placeholder="Enter WhatsApp number (e.g., 081234567890)"
                          className="pl-8"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                          +
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        Enter number with country code (e.g., 081234567890)
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Button
                      onClick={handleSaveSettings}
                      disabled={isSaving || (isWhatsappShareEnabled && !whatsappNumber)}
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
                    {isWhatsappShareEnabled && whatsappNumber && (
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
