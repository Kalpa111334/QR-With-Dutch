import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAttendanceRecords, getAdminContactInfo, saveAdminContactInfo, autoShareAttendanceSummary } from '@/utils/attendanceUtils';
import { getEmployees } from '@/utils/employeeUtils';
import { User, Users, Clock, CheckCircle, UploadCloud, Share2, AlertTriangle } from 'lucide-react';
import { Attendance, Employee } from '@/types';
import { Button } from '@/components/ui/button';
import BulkEmployeeUpload from './BulkEmployeeUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Dashboard: React.FC = () => {
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Admin contact settings
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sendMethod, setSendMethod] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [isAutoShareEnabled, setIsAutoShareEnabled] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  
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
        setPhoneNumber(adminSettings.phoneNumber);
        setSendMethod(adminSettings.sendMethod);
        setIsAutoShareEnabled(adminSettings.isAutoShareEnabled);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
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
    
    try {
      if (!phoneNumber || phoneNumber.trim().length < 10) {
        setSharingError("Please enter a valid phone number with country code (e.g. +1234567890)");
        setSavingSettings(false);
        return;
      }
      
      const success = await saveAdminContactInfo(
        phoneNumber,
        sendMethod,
        isAutoShareEnabled
      );
      
      if (success) {
        toast({
          title: 'Settings saved',
          description: 'Automatic sharing settings have been updated',
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
    
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      setSharingError("Please enter a valid phone number with country code (e.g. +1234567890)");
      return;
    }
    
    try {
      const result = await autoShareAttendanceSummary();
      
      if (!result) {
        setSharingError("Sharing failed. This might be due to a popup blocker or an invalid phone number. Please check your browser settings and ensure your phone number includes the country code.");
        toast({
          title: 'Sharing failed',
          description: 'Please check your settings and try again',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Sharing initiated',
          description: `Report is being shared via ${sendMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
        });
      }
    } catch (error) {
      console.error('Error sharing report:', error);
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

  if (showSettings) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Automatic Sharing Settings</h2>
          <Button 
            variant="outline" 
            onClick={() => setShowSettings(false)}
          >
            Back to Dashboard
          </Button>
        </div>
        
        {sharingError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Sharing Error</AlertTitle>
            <AlertDescription>{sharingError}</AlertDescription>
          </Alert>
        )}
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-none shadow-md">
          <CardHeader>
            <CardTitle>Configure Automatic Attendance Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="phone-number">Admin Phone Number</Label>
              <Input 
                id="phone-number" 
                placeholder="e.g. +1234567890" 
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Enter the phone number including country code (e.g., +1 for US)
              </p>
            </div>
            
            <div className="space-y-3">
              <Label>Sharing Method</Label>
              <RadioGroup value={sendMethod} onValueChange={(value) => setSendMethod(value as 'whatsapp' | 'sms')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="whatsapp" id="whatsapp" />
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sms" id="sms" />
                  <Label htmlFor="sms">SMS</Label>
                </div>
              </RadioGroup>
            </div>
            
            <div className="flex items-center space-x-2 pt-4">
              <Switch 
                id="auto-share" 
                checked={isAutoShareEnabled}
                onCheckedChange={setIsAutoShareEnabled}
              />
              <Label htmlFor="auto-share">Enable Automatic Daily Sharing (at 6:00 PM)</Label>
            </div>
            
            <div className="flex space-x-2 pt-4">
              <Button
                className="flex-1"
                onClick={handleSaveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleShareNow}
                disabled={!phoneNumber || phoneNumber.length < 10}
              >
                Share Now (Test)
              </Button>
            </div>
            
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium mb-2">Troubleshooting</h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Make sure your phone number includes the country code</li>
                <li>Check if your browser blocks popups</li>
                <li>WhatsApp Web needs to be authenticated on your browser</li>
                <li>SMS sharing works best on mobile devices</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white shadow-md transition-all duration-300"
          >
            <Share2 size={18} />
            <span>Auto-Share Settings</span>
          </Button>
          <Button 
            onClick={() => setShowBulkUpload(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-md transition-all duration-300"
          >
            <UploadCloud size={18} />
            <span>Bulk Import</span>
          </Button>
        </div>
      </div>
      
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
    </div>
  );
};

export default Dashboard;
