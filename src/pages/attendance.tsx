import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { getAdminContactInfo, saveAdminContactInfo, recordAttendanceCheckIn } from '../utils/attendanceUtils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Dynamically import QR Scanner to avoid SSR issues
const QrReader = dynamic(() => import('react-qr-reader'), {
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
      await saveAdminContactInfo({
        whatsappNumber,
        isWhatsappShareEnabled
      });
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

  const handleScan = async (data: string | null) => {
    if (data) {
      setIsScanning(false);
      setIsLoading(true);
      try {
        // Try to ensure we have a session before proceeding
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Try anonymous sign in
          const { error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) {
            console.error('Anonymous sign in failed:', signInError);
            throw new Error('Failed to initialize session');
          }
          // Wait briefly for the session to be established
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const success = await recordAttendanceCheckIn(data);
        if (success) {
          setLastScannedData(data);
          toast.success('Attendance recorded successfully');
        }
      } catch (error) {
        console.error('Error processing QR code:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to process QR code');
      } finally {
        setIsLoading(false);
        setIsScanning(true);
      }
    }
  };

  const handleError = (err: any) => {
    console.error('QR Scanner error:', err);
    toast.error("Error accessing camera. Please check permissions.");
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
              <QrReader
                delay={300}
                onError={handleError}
                onScan={handleScan}
                style={{ width: '100%' }}
                facingMode="environment"
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