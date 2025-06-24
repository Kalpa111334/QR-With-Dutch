'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { notificationService } from '@/utils/notificationService';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface WelcomeNotificationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const WelcomeNotificationDialog = ({
  isOpen,
  onOpenChange,
}: WelcomeNotificationDialogProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First check if notifications are supported
      if (!('Notification' in window)) {
        throw new Error('Your browser does not support notifications');
      }

      // Check if permission is already denied
      if (Notification.permission === 'denied') {
        throw new Error('Notification permission was denied. Please enable notifications in your browser settings.');
      }

      const success = await notificationService.subscribeToNotifications();
      if (success) {
        toast({
          title: 'Notifications Enabled',
          description: 'You will now receive real-time attendance updates.',
        });

        // Show a welcome notification
        await notificationService.showNotification({
          title: 'Welcome to Dutch Trails Attendance',
          body: 'You will receive real-time updates about attendance, late arrivals, and absences.',
          requireInteraction: false
        });

        // Store the user's preference
        localStorage.setItem('notificationPreferenceSet', 'true');
        onOpenChange(false);
      } else {
        throw new Error('Failed to enable notifications. Please try again.');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      setError(error instanceof Error ? error.message : 'Failed to enable notifications');
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to enable notifications',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = () => {
    localStorage.setItem('notificationPreferenceSet', 'true');
    onOpenChange(false);
    toast({
      title: 'Notifications Declined',
      description: 'You can enable notifications later in Settings if you change your mind.',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Enable Real-Time Updates
          </DialogTitle>
          <DialogDescription>
            Would you like to receive instant notifications about employee attendance,
            late arrivals, and important updates?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-start space-x-4">
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">Stay Informed with:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Real-time check-in/out notifications</li>
                <li>• Late arrival alerts</li>
                <li>• Absence notifications</li>
                <li>• Important system updates</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleDecline}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <BellOff className="h-4 w-4" />
            No, Thanks
          </Button>
          <Button
            onClick={handleEnableNotifications}
            disabled={isLoading}
            className="flex items-center gap-2 bg-primary"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {isLoading ? 'Enabling...' : 'Yes, Enable'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WelcomeNotificationDialog; 