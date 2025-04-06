
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { toast as sonnerToast } from "sonner";
import { Attendance } from '@/types';
import { 
  getAttendanceRecords, 
  generateAttendanceSummaryHTML,
  getAdminContactInfo,
  saveAdminContactInfo,
  autoShareAttendanceSummary
} from '@/utils/attendanceUtils';
import { CalendarIcon, Send, MessageSquare, Clock, Save, Check, AlertTriangle, Mail, Share2, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const AttendanceSummaryShare: React.FC = () => {
  const [date, setDate] = useState<Date>(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [emailShareEnabled, setEmailShareEnabled] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('email');
  const { toast } = useToast();

  useEffect(() => {
    const fetchAttendance = async () => {
      setLoading(true);
      try {
        const records = await getAttendanceRecords();
        // Filter for selected date
        const dateStr = format(date, 'yyyy-MM-dd');
        const filtered = records.filter(record => record.date === dateStr);
        setAttendanceRecords(filtered);
      } catch (error) {
        console.error('Error fetching attendance:', error);
        toast({
          title: 'Error',
          description: 'Failed to load attendance records',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [date, toast]);

  useEffect(() => {
    // Load admin contact information
    const loadAdminContactInfo = async () => {
      try {
        const contactInfo = await getAdminContactInfo();
        setEmail(contactInfo.email || '');
        setEmailShareEnabled(contactInfo.isEmailShareEnabled || false);
      } catch (error) {
        console.error('Error loading admin contact info:', error);
        toast({
          title: 'Error',
          description: 'Failed to load sharing settings',
          variant: 'destructive'
        });
      }
    };

    loadAdminContactInfo();
  }, [toast]);

  // Setup auto-sharing interval checker
  useEffect(() => {
    // Check every 5 minutes if it's time to send the report
    const intervalId = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      
      // Send report at 6 PM (18:00)
      if (hour === 18 && minute >= 0 && minute < 5) {
        if (emailShareEnabled && email) {
          autoShareAttendanceSummary()
            .then(success => {
              if (success) {
                sonnerToast.success('Auto-Share Success', {
                  description: 'Attendance summary automatically shared',
                });
              }
            })
            .catch(err => {
              console.error('Error in auto-sharing:', err);
              sonnerToast.error('Auto-Share Failed', {
                description: 'Could not send attendance summary automatically',
              });
            });
        }
      }
      
      // Set a reminder at 5 PM if auto-share is enabled
      if (hour === 17 && minute >= 0 && minute < 5 && !reminderSet) {
        if (emailShareEnabled && email) {
          sonnerToast('Auto-Share Reminder', {
            description: 'Daily attendance report will be automatically shared in 1 hour',
            duration: 10000,
          });
          setReminderSet(true);
          
          // Reset the reminder flag after 10 minutes
          setTimeout(() => setReminderSet(false), 10 * 60 * 1000);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(intervalId);
  }, [emailShareEnabled, email, reminderSet]);

  const handleShare = () => {
    if (!email) {
      toast({
        title: 'Missing Information',
        description: 'Please enter an email address',
        variant: 'destructive'
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address',
        variant: 'destructive'
      });
      return;
    }

    // Create HTML summary (not plain text)
    const subject = `Attendance Summary for ${format(date, 'MMMM d, yyyy')}`;
    
    try {
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}`, '_blank');
      
      toast({
        title: 'Sharing Summary',
        description: 'Opening email client with the attendance summary',
      });
    } catch (error) {
      console.error('Error opening email client:', error);
      toast({
        title: 'Error',
        description: 'Failed to open email client. Check your browser settings.',
        variant: 'destructive'
      });
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      // Basic validation for Email
      if (emailShareEnabled && email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          toast({
            title: 'Invalid Email',
            description: 'Please enter a valid email address',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }
      }

      const success = await saveAdminContactInfo(
        email,
        emailShareEnabled
      );
      
      if (success) {
        setSettingsSaved(true);
        toast({
          title: 'Settings Saved',
          description: `Admin contact information saved successfully.`,
        });

        // Reset the saved status after 3 seconds
        setTimeout(() => setSettingsSaved(false), 3000);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save admin contact information',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while saving settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/40 dark:to-blue-900/40 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-green-600" />
          Attendance Summary Sharing
        </CardTitle>
        <CardDescription>
          Set up automatic daily attendance summary sharing to super admin
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Date for Preview</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className="w-full justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "PPP")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-white dark:bg-gray-800" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(newDate) => newDate && setDate(newDate)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Attendance Summary Preview</label>
          <Card className="bg-white/80 dark:bg-black/20">
            <CardContent className="p-4 max-h-60 overflow-y-auto">
              {loading ? (
                <div className="py-8 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : attendanceRecords.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-sm font-medium py-1">
                    <div>Employee</div>
                    <div>Status</div>
                    <div>Hours</div>
                  </div>
                  {attendanceRecords.map((record) => {
                    // Calculate hours worked if checked out
                    let hoursWorked = '';
                    if (record.checkOutTime) {
                      const checkIn = new Date(record.checkInTime);
                      const checkOut = new Date(record.checkOutTime);
                      const diffMs = checkOut.getTime() - checkIn.getTime();
                      const diffHrs = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
                      hoursWorked = `${diffHrs} hrs`;
                    } else {
                      hoursWorked = 'Not checked out';
                    }
                    
                    return (
                      <div key={record.id} className="grid grid-cols-3 gap-2 py-1 text-sm border-t">
                        <div className="truncate">{record.employeeName}</div>
                        <div className={cn(
                          "px-1.5 py-0.5 rounded text-xs inline-flex items-center w-fit",
                          record.status === 'present' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                          record.status === 'late' && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        )}>
                          {record.status}
                        </div>
                        <div>{hoursWorked}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No attendance records for this date
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div className="space-y-6 pt-2 border-t">
          <h3 className="text-lg font-medium flex items-center gap-2 mt-4">
            <Settings className="h-5 w-5" />
            Super Admin Sharing Settings
          </h3>
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="email" className="flex items-center gap-1.5">
                <Mail className="h-4 w-4" />
                Email
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="email" className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Email Address</label>
                <Input 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address (e.g. admin@company.com)"
                  className="bg-white dark:bg-black/20"
                />
                <p className="text-xs text-muted-foreground">Daily attendance summary will be sent to this email</p>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="email-auto-share" 
                  checked={emailShareEnabled}
                  onCheckedChange={setEmailShareEnabled}
                />
                <Label htmlFor="email-auto-share">Enable automatic Email sharing at 6:00 PM</Label>
              </div>
              
              {emailShareEnabled && !email && (
                <Alert variant="default" className="bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  <AlertDescription>
                    Please enter an email address to enable automatic sharing
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
            <Button
              className="bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white"
              onClick={saveSettings}
              disabled={loading}
            >
              {settingsSaved ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
            
            <Button 
              onClick={handleShare} 
              disabled={loading || attendanceRecords.length === 0 || !email} 
              className="flex-1 bg-gradient-to-r from-teal-500 to-green-600 hover:from-teal-600 hover:to-green-700 text-white"
            >
              <Send className="mr-2 h-4 w-4" />
              Send Now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceSummaryShare;
