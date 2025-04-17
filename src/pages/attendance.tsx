import { useState, useEffect } from 'react';
import { supabase } from '../integrations/supabase/client';
import { getAdminContactInfo, saveAdminContactInfo } from '../utils/attendanceUtils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'react-hot-toast';

export default function Attendance() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isWhatsappShareEnabled, setIsWhatsappShareEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

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