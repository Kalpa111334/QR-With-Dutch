import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import { Bell, BellOff } from 'lucide-react';
import { notificationService } from '@/utils/realTimeNotificationService';

export const RealTimeNotificationToggle: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    try {
      const permission = Notification.permission;
      setIsEnabled(permission === 'granted');
    } catch (error) {
      console.error('Error checking notification status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    try {
      setIsLoading(true);

      if (isEnabled) {
        // Cleanup subscriptions
        notificationService.cleanup();
        setIsEnabled(false);
        toast({
          title: 'Notifications Disabled',
          description: 'You will no longer receive real-time notifications.',
        });
      } else {
        // Request permission and initialize service
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          await notificationService.initialize();
          setIsEnabled(true);
          toast({
            title: 'Notifications Enabled',
            description: 'You will now receive real-time notifications.',
          });
        } else {
          toast({
            title: 'Permission Denied',
            description: 'Please enable notifications in your browser settings.',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to toggle notifications. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!('Notification' in window)) {
    return (
      <Button disabled variant="outline" className="opacity-60">
        Notifications Not Supported
      </Button>
    );
  }

  return (
    <Button
      onClick={handleToggle}
      variant={isEnabled ? "default" : "outline"}
      disabled={isLoading}
      className="flex items-center gap-2"
    >
      {isLoading ? (
        'Processing...'
      ) : (
        <>
          {isEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          {isEnabled ? 'Disable Notifications' : 'Enable Notifications'}
        </>
      )}
    </Button>
  );
}; 