import { supabase } from '../lib/supabase';

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  data?: any;
  tag?: string;
  requireInteraction?: boolean;
  actions?: NotificationAction[];
}

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

class RealTimeNotificationService {
  private static instance: RealTimeNotificationService;
  private subscriptions: { [key: string]: () => void } = {};
  private readonly defaultIcon = '/Logo.png';
  private isInitialized = false;

  private constructor() {}

  static getInstance(): RealTimeNotificationService {
    if (!RealTimeNotificationService.instance) {
      RealTimeNotificationService.instance = new RealTimeNotificationService();
    }
    return RealTimeNotificationService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.setupRealtimeSubscriptions();
      this.isInitialized = true;
      console.log('Real-time notification service initialized');
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
      throw error;
    }
  }

  private async setupRealtimeSubscriptions(): Promise<void> {
    // Subscribe to attendance changes
    this.subscriptions.attendance = supabase
      .channel('attendance_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance'
        },
        async (payload) => {
          await this.handleAttendanceChange(payload);
        }
      )
      .subscribe();

    // Subscribe to employee changes
    this.subscriptions.employees = supabase
      .channel('employee_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'employees'
        },
        async (payload) => {
          await this.handleEmployeeChange(payload);
        }
      )
      .subscribe();
  }

  private async handleAttendanceChange(payload: any): Promise<void> {
    const { new: newRecord, old: oldRecord, eventType } = payload;
    
    let notification: NotificationPayload | null = null;

    switch (eventType) {
      case 'INSERT':
        notification = {
          title: 'New Attendance Record',
          body: `New attendance record created for employee ID: ${newRecord.employee_id}`,
          icon: this.defaultIcon,
          tag: `attendance-${newRecord.id}`,
          requireInteraction: true
        };
        break;

      case 'UPDATE':
        notification = {
          title: 'Attendance Updated',
          body: `Attendance record updated for employee ID: ${newRecord.employee_id}`,
          icon: this.defaultIcon,
          tag: `attendance-${newRecord.id}`
        };
        break;

      case 'DELETE':
        notification = {
          title: 'Attendance Record Deleted',
          body: `Attendance record deleted for employee ID: ${oldRecord.employee_id}`,
          icon: this.defaultIcon,
          tag: `attendance-${oldRecord.id}`
        };
        break;
    }

    if (notification) {
      await this.showNotification(notification);
    }
  }

  private async handleEmployeeChange(payload: any): Promise<void> {
    const { new: newRecord, eventType } = payload;
    
    let notification: NotificationPayload | null = null;

    switch (eventType) {
      case 'INSERT':
        notification = {
          title: 'New Employee Added',
          body: `${newRecord.name} has been added to the system`,
          icon: this.defaultIcon,
          tag: `employee-${newRecord.id}`
        };
        break;

      case 'UPDATE':
        notification = {
          title: 'Employee Details Updated',
          body: `${newRecord.name}'s information has been updated`,
          icon: this.defaultIcon,
          tag: `employee-${newRecord.id}`
        };
        break;

      case 'DELETE':
        notification = {
          title: 'Employee Removed',
          body: `An employee has been removed from the system`,
          icon: this.defaultIcon
        };
        break;
    }

    if (notification) {
      await this.showNotification(notification);
    }
  }

  async showNotification(payload: NotificationPayload): Promise<void> {
    try {
      if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return;
      }

      if (Notification.permission === 'denied') {
        console.warn('Notification permission denied');
        return;
      }

      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('Notification permission not granted');
          return;
        }
      }

      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon || this.defaultIcon,
        tag: payload.tag,
        requireInteraction: payload.requireInteraction,
        actions: payload.actions
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  cleanup(): void {
    Object.values(this.subscriptions).forEach(unsubscribe => unsubscribe());
    this.subscriptions = {};
    this.isInitialized = false;
  }
}

export const notificationService = RealTimeNotificationService.getInstance(); 