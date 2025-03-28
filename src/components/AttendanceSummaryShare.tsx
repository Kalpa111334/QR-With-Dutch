import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Attendance } from '@/types';
import { getAttendanceRecords } from '@/utils/attendanceUtils';
import { CalendarIcon, Send, Phone, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const AttendanceSummaryShare: React.FC = () => {
  const [date, setDate] = useState<Date>(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sendingMethod, setSendingMethod] = useState<'whatsapp' | 'sms'>('whatsapp');
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

  const generateSummaryText = () => {
    const dateStr = format(date, 'dd MMM yyyy');
    let summary = `*Attendance Summary for ${dateStr}*\n\n`;
    
    const present = attendanceRecords.length;
    const late = attendanceRecords.filter(r => r.status === 'late').length;
    const checkedOut = attendanceRecords.filter(r => r.checkOutTime).length;
    
    summary += `Total Present: ${present}\n`;
    summary += `On Time: ${present - late}\n`;
    summary += `Late Arrivals: ${late}\n`;
    summary += `Checked Out: ${checkedOut}\n\n`;
    
    summary += `*Employee Details:*\n`;
    attendanceRecords.forEach((record, index) => {
      const checkinTime = new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkoutTime = record.checkOutTime 
        ? new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Not checked out';
      
      summary += `${index + 1}. ${record.employeeName} - ${record.status === 'late' ? '⚠️ Late' : '✅ On Time'}\n`;
      summary += `   In: ${checkinTime} | Out: ${checkoutTime}\n`;
    });
    
    return encodeURIComponent(summary);
  };

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

    const summaryText = generateSummaryText();
    
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

  return (
    <Card className="w-full max-w-2xl mx-auto bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/40 dark:to-purple-900/40 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Share Attendance Summary
        </CardTitle>
        <CardDescription>
          Send today's attendance summary to supervisors via WhatsApp or SMS
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Date</label>
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
          <label className="text-sm font-medium">Attendance Summary</label>
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
          <label className="text-sm font-medium">Recipient Phone Number</label>
          <Input 
            value={phoneNumber} 
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Enter phone number with country code (e.g. +1234567890)"
            className="bg-white dark:bg-black/20"
          />
          <p className="text-xs text-muted-foreground">Include country code without spaces or special characters</p>
        </div>
        
        <Button 
          onClick={handleShare} 
          disabled={loading || attendanceRecords.length === 0} 
          className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
        >
          Send Summary
        </Button>
      </CardContent>
    </Card>
  );
};

export default AttendanceSummaryShare;
