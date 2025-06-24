import { supabase } from '../lib/supabase';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
  renotify?: boolean;
  silent?: boolean;
  actions?: NotificationAction[];
}

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

class NotificationService {
  private static instance: NotificationService;
  private readonly DEFAULT_ICON = '/Logo.png';
  private isInitialized = false;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  private constructor() {
    // Private constructor to enforce singleton
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  public async initialize(): Promise<boolean> {
    try {
      console.log('Initializing notification service...');
      
      if (this.isInitialized) {
        console.log('Already initialized');
        return true;
      }

      if (!this.checkBrowserSupport()) {
        console.warn('Push notifications are not supported');
        return false;
      }

      // Request notification permission first
      console.log('Requesting notification permission...');
      const permission = await this.requestNotificationPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted:', permission);
        return false;
      }

      // Then register service worker
      console.log('Registering service worker...');
      this.serviceWorkerRegistration = await this.registerServiceWorker();
      
      this.isInitialized = true;
      console.log('Notification service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
      return false;
    }
  }

  private async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      throw new Error('Notifications not supported');
    }

    if (Notification.permission === 'granted') {
      return 'granted';
    }

    if (Notification.permission === 'denied') {
      throw new Error('Notification permission previously denied');
    }

    return await Notification.requestPermission();
  }

  private checkBrowserSupport(): boolean {
    const supported = 'serviceWorker' in navigator && 
                     'Notification' in window && 
                     'PushManager' in window;
    
    console.log('Browser support check:', {
      serviceWorker: 'serviceWorker' in navigator,
      notification: 'Notification' in window,
      pushManager: 'PushManager' in window,
      supported
    });
    
    return supported;
  }

  private async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    try {
      console.log('Registering service worker...');
      
      // Unregister any existing service workers first
      const existingRegistrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of existingRegistrations) {
        await reg.unregister();
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      await navigator.serviceWorker.ready;
      console.log('Service Worker registered successfully:', registration);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  }

  public async subscribeToNotifications(): Promise<boolean> {
    try {
      console.log('Subscribing to notifications...');
      
      if (!this.isInitialized || !this.serviceWorkerRegistration) {
        console.log('Initializing before subscription...');
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize notification service');
        }
      }

      // Check for existing subscription
      const existingSubscription = await this.serviceWorkerRegistration!.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('Already subscribed to notifications');
        return true;
      }

      console.log('Creating new push subscription...');
      const subscription = await this.serviceWorkerRegistration!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: undefined // No VAPID key needed
      });

      console.log('Push subscription created:', subscription);

      // Store subscription in Supabase
      const { error } = await supabase
        .from('push_subscriptions')
        .insert([{
          endpoint: subscription.endpoint,
          user_id: supabase.auth.user()?.id
        }]);

      if (error) {
        console.error('Failed to store subscription in database:', error);
        throw error;
      }

      console.log('Subscription stored in database');
      return true;
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
      if (error instanceof Error) {
        // Check for specific error types
        if (error.name === 'NotAllowedError') {
          console.error('Permission denied by user');
        } else if (error.name === 'InvalidStateError') {
          console.error('Service worker not properly registered');
        }
      }
      return false;
    }
  }

  public async unsubscribeFromNotifications(): Promise<boolean> {
    try {
      console.log('Unsubscribing from notifications...');
      
      if (!this.serviceWorkerRegistration) {
        console.warn('No service worker registration found');
        return false;
      }

      const subscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remove from Supabase
        await supabase
          .from('push_subscriptions')
          .delete()
          .match({ endpoint: subscription.endpoint });

        console.log('Successfully unsubscribed from notifications');
      }
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from notifications:', error);
      return false;
    }
  }

  public async showNotification(options: NotificationOptions): Promise<void> {
    try {
      console.log('Showing notification:', options);
      
      if (!this.isInitialized) {
        console.log('Initializing before showing notification...');
        await this.initialize();
      }

      if (Notification.permission !== 'granted') {
        console.warn('Notification permission not granted');
        return;
      }

      const notificationOptions: NotificationOptions = {
        ...options,
        icon: options.icon || this.DEFAULT_ICON,
        badge: options.badge || this.DEFAULT_ICON,
        requireInteraction: options.requireInteraction ?? true,
        renotify: options.renotify ?? false,
        silent: options.silent ?? false
      };

      if (!this.serviceWorkerRegistration) {
        // Fallback to regular notifications if service worker is not available
        new Notification(options.title, notificationOptions);
      } else {
        await this.serviceWorkerRegistration.showNotification(
          options.title,
          notificationOptions
        );
      }
      
      console.log('Notification shown successfully');
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  public async showAttendanceNotification(
    employeeName: string,
    status: 'check-in' | 'check-out',
    timestamp: Date
  ): Promise<void> {
    const title = `Attendance ${status === 'check-in' ? 'Check-In' : 'Check-Out'}`;
    const body = `${employeeName} ${status === 'check-in' ? 'checked in' : 'checked out'} at ${timestamp.toLocaleTimeString()}`;
    
    await this.showNotification({
      title,
      body,
      tag: `attendance-${employeeName}-${status}`,
      data: {
        type: 'attendance',
        employeeName,
        status,
        timestamp: timestamp.toISOString()
      },
      actions: [
        {
          action: 'view-details',
          title: 'View Details'
        }
      ]
    });
  }

  public async showLateArrivalNotification(
    employeeName: string,
    minutesLate: number
  ): Promise<void> {
    await this.showNotification({
      title: 'Late Arrival',
      body: `${employeeName} arrived ${minutesLate} minutes late`,
      tag: `late-${employeeName}`,
      data: {
        type: 'late-arrival',
        employeeName,
        minutesLate
      }
    });
  }

  public async showAbsenceNotification(
    employeeName: string,
    date: Date
  ): Promise<void> {
    await this.showNotification({
      title: 'Employee Absent',
      body: `${employeeName} is absent today (${date.toLocaleDateString()})`,
      tag: `absence-${employeeName}-${date.toISOString().split('T')[0]}`,
      data: {
        type: 'absence',
        employeeName,
        date: date.toISOString()
      }
    });
  }
}

export const notificationService = NotificationService.getInstance(); 