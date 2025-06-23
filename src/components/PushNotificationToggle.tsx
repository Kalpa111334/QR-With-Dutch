import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import {
  registerServiceWorker,
  requestNotificationPermission,
  subscribeUserToPush,
  unsubscribeFromPush,
  checkBrowserSupport
} from '../utils/notificationUtils';

export const PushNotificationToggle: React.FC = () => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkSupport();
    if (isSupported) {
      checkSubscriptionStatus();
    }
  }, [isSupported]);

  const checkSupport = () => {
    const support = checkBrowserSupport();
    setIsSupported(support.supported);
    if (!support.supported) {
      setErrorMessage(support.reason || 'Push notifications are not supported');
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      toast({
        title: 'Error',
        description: 'Failed to check notification status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscriptionToggle = async () => {
    try {
      setIsLoading(true);

      if (isSubscribed) {
        await unsubscribeFromPush();
        setIsSubscribed(false);
        toast({
          title: 'Notifications Disabled',
          description: 'You will no longer receive push notifications.',
        });
      } else {
        // Register service worker if not already registered
        const registration = await registerServiceWorker();
        if (!registration) {
          throw new Error('Failed to register service worker');
        }

        // Request notification permission
        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
          throw new Error('Notification permission denied');
        }

        // Subscribe to push notifications
        await subscribeUserToPush();
        setIsSubscribed(true);
        toast({
          title: 'Notifications Enabled',
          description: 'You will now receive push notifications for attendance updates.',
        });
      }
    } catch (error) {
      console.error('Error toggling subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle notifications';
      setErrorMessage(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <Button disabled variant="outline" className="opacity-60">
        {errorMessage || 'Notifications Not Supported'}
      </Button>
    );
  }

  if (isLoading) {
    return <Button disabled>Loading...</Button>;
  }

  if (errorMessage) {
    return (
      <Button 
        variant="destructive" 
        onClick={() => {
          setErrorMessage(null);
          checkSupport();
        }}
      >
        Try Again
      </Button>
    );
  }

  return (
    <Button
      onClick={handleSubscriptionToggle}
      variant={isSubscribed ? 'destructive' : 'default'}
      disabled={isLoading}
    >
      {isLoading ? 'Processing...' : (isSubscribed ? 'Disable Notifications' : 'Enable Notifications')}
    </Button>
  );
}; 