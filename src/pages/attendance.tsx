import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { getAdminContactInfo, saveAdminContactInfo } from '../utils/attendanceUtils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/router';

export default function Attendance() {
  const router = useRouter();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isWhatsappShareEnabled, setIsWhatsappShareEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Try to refresh the session first
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshData?.session) {
          console.log('Session refreshed successfully');
          setIsLoading(false);
          loadSettings();
          return;
        }

        // If refresh failed, try to get current session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!session || error) {
          console.error('No valid session found:', error);
          toast.error("Session expired. Please log in again to continue.");
          router.push('/login');
          return;
        }

        setIsLoading(false);
        loadSettings();
      } catch (error) {
        console.error('Session check failed:', error);
        toast.error("Authentication error. Please try logging in again.");
        router.push('/login');
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

  return (
    <div className="container mx-auto p-4">
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