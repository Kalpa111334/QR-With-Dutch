import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { getAdminContactInfo, saveAdminContactInfo, recordAttendanceCheckIn, recordAttendanceCheckOut } from '../utils/attendanceUtils';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Dynamically import QR Scanner to avoid SSR issues
const QrScanner = dynamic(() => import('react-qr-scanner'), {
  ssr: false
});

export default function Attendance() {
  const router = useRouter();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isWhatsappShareEnabled, setIsWhatsappShareEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(true);
  const [lastScannedData, setLastScannedData] = useState<string | null>(null);

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
      setWhatsappNumber(settings.whatsappNumber || '');
      setIsWhatsappShareEnabled(settings.isWhatsappShareEnabled || false);
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
          whatsappNumber,
          isWhatsappShareEnabled
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

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const handleScan = async (data: string | null) => {
    if (data) {
      console.log('Scanned QR code data:', data);
      setIsScanning(false);
      setIsLoading(true);
      try {
        // Try to ensure we have a session before proceeding
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) {
            console.error('Anonymous sign in failed:', signInError);
            throw new Error('Failed to initialize session');
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Parse QR code data
        let employeeId: string;
        const cleanData = data.trim();
        
        // Log the scanned data for debugging
        console.log('Raw QR data:', cleanData);
        
        // Check if the QR code matches our format (EMP:id:name)
        if (cleanData.startsWith('EMP:')) {
          const parts = cleanData.split(':');
          if (parts.length >= 2) {
            employeeId = parts[1]; // Get the ID part
            console.log('Extracted employee ID:', employeeId);
          } else {
            throw new Error('Invalid QR code format');
          }
        } else {
          // Try parsing as JSON
          try {
            const parsedData = JSON.parse(cleanData);
            employeeId = parsedData.id || parsedData.employeeId;
            if (!employeeId) throw new Error();
          } catch (e) {
            // If both formats fail, use the raw data
            employeeId = cleanData;
          }
        }
        
        // Validate the extracted ID
        if (!employeeId || employeeId.trim().length === 0) {
          throw new Error('Could not extract valid employee ID from QR code');
        }

        // Try check-out first, if fails, try check-in
        try {
          const checkOutInfo = await recordAttendanceCheckOut(employeeId);
          setLastScannedData(employeeId);
          
          await Swal.fire({
            icon: 'success',
            title: 'Check-out Successful',
            html: `
              <div class="text-left">
                <p>Check-in: ${formatTime(checkOutInfo.checkInTime)}</p>
                <p>Check-out: ${formatTime(checkOutInfo.checkOutTime!)}</p>
                <p>Total Hours: ${formatHours(checkOutInfo.totalHours!)}</p>
              </div>
            `,
            showConfirmButton: true,
            timer: 5000
          });
        } catch (checkOutError) {
          // If check-out fails, try check-in
          const checkInInfo = await recordAttendanceCheckIn(employeeId);
          setLastScannedData(employeeId);

          const lateText = checkInInfo.late_duration! > 0 
            ? `<p class="text-warning">You are ${checkInInfo.late_duration} minutes late</p>` 
            : '<p class="text-success">You are on time!</p>';

          await Swal.fire({
            icon: 'success',
            title: 'Check-in Successful',
            html: `
              <div class="text-left">
                <p>Check-in time: ${formatTime(checkInInfo.checkInTime)}</p>
                ${lateText}
              </div>
            `,
            showConfirmButton: true,
            timer: 5000
          });
        }
      } catch (error) {
        console.error('Error processing QR code:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error instanceof Error ? error.message : 'Failed to process QR code',
          timer: 3000
        });
      } finally {
        setIsLoading(false);
        setIsScanning(true);
      }
    }
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
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Attendance Check-In</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="max-w-md mx-auto">
              <QrScanner
                delay={500}
                onError={handleError}
                onScan={(data: string | null) => handleScan(data)}
                style={{ width: '100%', height: '300px' }}
                constraints={{
                  facingMode: 'environment',
                  aspectRatio: 1
                }}
                className="border-2 border-gray-300 rounded-lg"
              />
              <p className="text-sm text-gray-500 text-center mt-2">
                Position the QR code within the scanning area
              </p>
            </div>
          </div>
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
    </div>
  );
} 