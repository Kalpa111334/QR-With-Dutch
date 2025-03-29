
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Attendance } from '@/types';
import { 
  getAttendanceRecords, 
  generateAttendanceSummaryText,
  getAdminContactInfo,
  saveAdminContactInfo,
  autoShareAttendanceSummary
} from '@/utils/attendanceUtils';
import { CalendarIcon, Send, Phone, MessageSquare, Clock, Save } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from "@/components/ui/label";
import { 
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from "@/components/ui/form";
import { useForm } from "react-hook-form";

const AttendanceSummaryShare: React.FC = () => {
  const [date, setDate] = useState<Date>(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sendingMethod, setSendingMethod] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [autoShareEnabled, setAutoShareEnabled] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
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
      const contactInfo = await getAdminContactInfo();
      setPhoneNumber(contactInfo.phoneNumber);
      setSendingMethod(contactInfo.sendMethod);
      setAutoShareEnabled(contactInfo.isAutoShareEnabled);
    };

    loadAdminContactInfo();
  }, []);

  // Setup auto-sharing interval checker
  useEffect(() => {
    // Check every 5 minutes if it's time to send the report
    const intervalId = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      
      // Send report at 6 PM (18:00)
      if (hour === 18 && minute >= 0 && minute < 5) {
        if (autoShareEnabled && phoneNumber) {
          autoShareAttendanceSummary()
            .then(success => {
              if (success) {
                toast({
                  title: 'Auto-Share Success',
                  description: `Attendance summary automatically shared via ${sendingMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'}`,
                });
              }
            })
            .catch(err => {
              console.error('Error in auto-sharing:', err);
            });
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(intervalId);
  }, [autoShareEnabled, phoneNumber, sendingMethod, toast]);

  const handleShare = () => {
    if (!phoneNumber) {
      toast({
        title: 'Missing Information',
        description: 'Please enter a phone number',
        variant: 'destructive'
      });
      return;
    }

    // Clean the phone number to keep only digits
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 10) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid phone number',
        variant: 'destructive'
      });
      return;
    }

    const summaryText = encodeURIComponent(generateAttendanceSummaryText(date, attendanceRecords));
    
    if (sendingMethod === 'whatsapp') {
      // WhatsApp URL scheme
      window.open(`https://wa.me/${cleanNumber}?text=${summaryText}`, '_blank');
    } else {
      // SMS URL scheme - works on most mobile browsers
      window.open(`sms:${cleanNumber}?body=${summaryText}`, '_blank');
    }

    toast({
      title: 'Sharing Summary',
      description: `Opening ${sendingMethod === 'whatsapp' ? 'WhatsApp' : 'SMS'} with the attendance summary`,
    });
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const success = await saveAdminContactInfo(
        phoneNumber,
        sendingMethod,
        autoShareEnabled
      );
      
      if (success) {
        setSettingsSaved(true);
        toast({
          title: 'Settings Saved',
          description: `Admin contact information saved successfully. Auto-sharing is ${autoShareEnabled ? 'enabled' : 'disabled'}.`,
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
    <Card className="w-full max-w-2xl mx-auto bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/40 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Share Attendance Summary
        </CardTitle>
        <CardDescription>
          Set up automatic daily attendance summary sharing to supervisors
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
            <PopoverContent className="w-auto p-0" align="start">
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
            <Clock className="h-5 w-5" />
            Automatic Sharing Settings
          </h3>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Send Method</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sendingMethod === 'whatsapp' ? 'default' : 'outline'}
                className={cn("flex-1", sendingMethod === 'whatsapp' && "bg-green-600 hover:bg-green-700")}
                onClick={() => setSendingMethod('whatsapp')}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
              <Button
                type="button"
                variant={sendingMethod === 'sms' ? 'default' : 'outline'}
                className={cn("flex-1", sendingMethod === 'sms' && "bg-blue-600 hover:bg-blue-700")}
                onClick={() => setSendingMethod('sms')}
              >
                <Phone className="mr-2 h-4 w-4" />
                SMS
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Admin Phone Number</label>
            <Input 
              value={phoneNumber} 
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter phone number with country code (e.g. +1234567890)"
              className="bg-white dark:bg-black/20"
            />
            <p className="text-xs text-muted-foreground">Include country code without spaces or special characters</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch 
              id="auto-share" 
              checked={autoShareEnabled}
              onCheckedChange={setAutoShareEnabled}
            />
            <Label htmlFor="auto-share">Enable automatic daily sharing at 6:00 PM</Label>
          </div>
          
          <div className="flex gap-3">
            <Button 
              onClick={saveSettings} 
              disabled={loading} 
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Settings
              {settingsSaved && <span className="ml-2 text-green-200">✓</span>}
            </Button>
            
            <Button 
              onClick={handleShare} 
              disabled={loading || attendanceRecords.length === 0} 
              className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
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
