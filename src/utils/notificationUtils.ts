import { supabase } from '../lib/supabase';

// Check if the browser supports service workers and push notifications
export const checkBrowserSupport = (): { supported: boolean; reason?: string } => {
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'Service Workers are not supported in this browser' };
  }
  
  if (!('Notification' in window)) {
    return { supported: false, reason: 'Notifications are not supported in this browser' };
  }

  if (!('PushManager' in window)) {
    return { supported: false, reason: 'Push notifications are not supported in this browser' };
  }

  // Check if running in a secure context (HTTPS or localhost)
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Service Worker requires a secure context (HTTPS or localhost)' };
  }

  return { supported: true };
};

const convertUint8ArrayToBase64 = (u8a: Uint8Array): string => {
  return btoa(String.fromCharCode.apply(null, Array.from(u8a)));
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const registerServiceWorker = async () => {
  const support = checkBrowserSupport();
  if (!support.supported) {
    throw new Error(support.reason);
  }

  try {
    // First check if there's an existing registration
    const existingRegistration = await navigator.serviceWorker.getRegistration();
    if (existingRegistration) {
      return existingRegistration;
    }

    // If no existing registration, register the service worker
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      type: 'module'
    });

    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    
    console.log('Service Worker registered successfully:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    throw new Error('Failed to register service worker: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
};

export const subscribeUserToPush = async () => {
  const support = checkBrowserSupport();
  if (!support.supported) {
    throw new Error(support.reason);
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      return subscription;
    }

    // TODO: Replace with your VAPID public key
    const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY';
    
    // Subscribe the user
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    // Store subscription in Supabase
    const { data, error } = await supabase
      .from('push_subscriptions')
      .insert([
        {
          endpoint: subscription.endpoint,
          auth: convertUint8ArrayToBase64(new Uint8Array(subscription.getKey('auth'))),
          p256dh: convertUint8ArrayToBase64(new Uint8Array(subscription.getKey('p256dh'))),
          user_id: supabase.auth.user()?.id
        }
      ]);

    if (error) throw error;
    
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
};

export const unsubscribeFromPush = async () => {
  const support = checkBrowserSupport();
  if (!support.supported) {
    throw new Error(support.reason);
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      // Remove from Supabase
      await supabase
        .from('push_subscriptions')
        .delete()
        .match({ endpoint: subscription.endpoint });
      
      // Unsubscribe
      await subscription.unsubscribe();
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    throw error;
  }
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  const support = checkBrowserSupport();
  if (!support.supported) {
    throw new Error(support.reason);
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    throw new Error('Notification permission was denied');
  }

  const permission = await Notification.requestPermission();
  return permission;
}; 