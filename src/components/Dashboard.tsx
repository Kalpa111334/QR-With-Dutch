import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getAttendanceRecords, getAdminContactInfo, saveAdminContactInfo, autoShareAttendanceSummary } from '@/utils/attendanceUtils';
import { getEmployees } from '@/utils/employeeUtils';
import { User, Users, Clock, CheckCircle, UploadCloud, Share2, AlertTriangle, MessageSquare, Smartphone, Calendar, TestTube, Mail } from 'lucide-react';
import { Attendance, Employee } from '@/types';
import { Button } from '@/components/ui/button';
import BulkEmployeeUpload from './BulkEmployeeUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Dashboard: React.FC = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  
  // Admin contact settings
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isAutoShareEnabled, setIsAutoShareEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  
  const today = new Date().toISOString().split('T')[0];
  
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [attendanceData, employeesData, adminSettings] = await Promise.all([
          getAttendanceRecords(),
          getEmployees(),
          getAdminContactInfo()
        ]);
        
        setAttendanceRecords(attendanceData);
        setEmployees(employeesData);
        
        // Set admin settings
        setPhoneNumber(adminSettings.phoneNumber || '');
        setIsAutoShareEnabled(adminSettings.isAutoShareEnabled || false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();

    // Set up polling to refresh data every 2 minutes
    const intervalId = setInterval(fetchData, 2 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  const stats = React.useMemo(() => {
    const todayRecords = attendanceRecords.filter(record => record.date === today);
    const activeEmployees = employees.filter(emp => emp.status === 'active');
    
    const presentCount = todayRecords.length;
    const lateCount = todayRecords.filter(record => record.status === 'late').length;
    const absentCount = activeEmployees.length - presentCount;
    
    return {
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      checkedOut: todayRecords.filter(record => record.checkOutTime).length
    };
  }, [attendanceRecords, employees, today]);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSharingError(null);
    setTestResult(null);
    
    try {
      if (!phoneNumber || phoneNumber.trim().length < 10) {
        setSharingError("Please enter a valid phone number with country code (e.g. +1234567890)");
        setSavingSettings(false);
        return;
      }
      
      // Always use WhatsApp as the send method
      const success = await saveAdminContactInfo(
        phoneNumber,
        'whatsapp', // Force WhatsApp as requested
        isAutoShareEnabled
      );
      
      if (success) {
        toast({
          title: 'Settings saved',
          description: 'Automatic WhatsApp sharing settings have been updated',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save settings',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };
  
  const handleShareNow = async () => {
    setSharingError(null);
    setTestResult(null);
    
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      setSharingError("Please enter a valid phone number with country code (e.g. +1234567890)");
      return;
    }
    
    try {
      const result = await autoShareAttendanceSummary();
      
      if (result) {
        setTestResult('success');
        toast({
          title: 'WhatsApp sharing initiated',
          description: 'Check your WhatsApp for the attendance report',
        });
      } else {
        setTestResult('error');
        setSharingError("Sharing failed. This might be due to a popup blocker or an invalid phone number.");
        toast({
          title: 'Sharing failed',
          description: 'Please check your settings and try again',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error sharing report:', error);
      setTestResult('error');
      setSharingError("An unexpected error occurred while sharing");
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while sharing',
        variant: 'destructive',
      });
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
    <div className="space-y-6">
      <Tabs defaultValue="overview" onValueChange={(value) => setActiveTab(value as 'overview' | 'settings')}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
          <h2 className="text-2xl font-semibold">{activeTab === 'overview' ? 'Dashboard Overview' : 'WhatsApp Settings'}</h2>
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
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-none shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.activeEmployees} active employees
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-none shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Present Today</CardTitle>
                <User className="h-4 w-4 text-green-600 dark:text-green-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.present}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.present > 0 && stats.activeEmployees > 0
                    ? `${Math.round((stats.present / stats.activeEmployees) * 100)}% attendance rate`
                    : 'No attendance data yet'}
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30 border-none shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.late}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.late > 0 && stats.present > 0
                    ? `${Math.round((stats.late / stats.present) * 100)}% of present employees`
                    : 'No late arrivals today'}
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 border-none shadow-md hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Checked Out</CardTitle>
                <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.checkedOut}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.checkedOut > 0 && stats.present > 0
                    ? `${Math.round((stats.checkedOut / stats.present) * 100)}% of present employees`
                    : 'No check-outs today'}
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
                    ? `${Math.round((stats.absent / stats.activeEmployees) * 100)}% absence rate today`
                    : 'All employees present today!'}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          {sharingError && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sharing Error</AlertTitle>
              <AlertDescription>{sharingError}</AlertDescription>
            </Alert>
          )}
          
          {testResult === 'success' && (
            <Alert className="mb-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-500">Test Successful</AlertTitle>
              <AlertDescription>WhatsApp share test was successful! Check your WhatsApp for the message.</AlertDescription>
            </Alert>
          )}
          
          <Card className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/30 dark:to-blue-800/30 border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                WhatsApp Attendance Reports
              </CardTitle>
              <CardDescription>
                Configure how and when attendance reports are shared via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 mt-1 flex-shrink-0 text-slate-500" />
                  <div className="space-y-1 w-full">
                    <Label htmlFor="phone-number" className="text-sm font-medium">Admin WhatsApp Number</Label>
                    <Input 
                      id="phone-number" 
                      placeholder="+1234567890 (include country code)" 
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="border-slate-300 dark:border-slate-700"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the phone number including country code (e.g., +1 for US)
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-2 pt-2">
                  <Calendar className="h-4 w-4 mt-1 flex-shrink-0 text-slate-500" />
                  <div className="space-y-1">
                    <Label htmlFor="auto-share" className="text-sm font-medium">Automatic Daily Sharing</Label>
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="auto-share" 
                        checked={isAutoShareEnabled}
                        onCheckedChange={setIsAutoShareEnabled}
                      />
                      <Label htmlFor="auto-share" className="text-sm">Enable daily reports at 6:00 PM</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When enabled, a daily attendance summary will be sent automatically
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                <Button
                  className="bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button
                  variant="outline"
                  className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 flex gap-1 items-center"
                  onClick={handleShareNow}
                  disabled={!phoneNumber || phoneNumber.length < 10}
                >
                  <TestTube size={16} />
                  <span>Test WhatsApp Share</span>
                </Button>
              </div>
              
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium mb-2">About WhatsApp Sharing</h3>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-xs space-y-1">
                  <p>• Daily attendance summary will be sent at 6:00 PM</p>
                  <p>• The summary includes late arrivals, check-ins, and check-outs</p>
                  <p>• You must grant permission when the WhatsApp web page opens</p>
                  <p>• If you receive an error, check for popup blockers in your browser</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
