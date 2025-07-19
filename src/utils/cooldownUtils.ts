// Cooldown Management Utilities
import { SpeechUtility } from './speechUtils';

export interface CooldownState {
  isActive: boolean;
  type: 'first_session' | 'second_session' | null;
  startTime: number;
  duration: number; // in minutes
  remainingTime: number; // in seconds
}

export interface CooldownConfig {
  firstSessionCooldown: number; // 3 minutes
  secondSessionCooldown: number; // 2 minutes
}

const COOLDOWN_CONFIG: CooldownConfig = {
  firstSessionCooldown: 3, // 3 minutes
  secondSessionCooldown: 2, // 2 minutes
};

const COOLDOWN_STORAGE_KEY = 'qr_attendance_cooldown';

class CooldownManager {
  private static instance: CooldownManager;
  private cooldownState: CooldownState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private callbacks: Set<(state: CooldownState | null) => void> = new Set();
  private speechUtility: SpeechUtility;

  private constructor() {
    this.speechUtility = new SpeechUtility();
    this.loadCooldownFromStorage();
    this.startPeriodicCheck();
  }

  public static getInstance(): CooldownManager {
    if (!CooldownManager.instance) {
      CooldownManager.instance = new CooldownManager();
    }
    return CooldownManager.instance;
  }

  private loadCooldownFromStorage(): void {
    try {
      const stored = localStorage.getItem(COOLDOWN_STORAGE_KEY);
      if (stored) {
        const cooldown: CooldownState = JSON.parse(stored);
        const now = Date.now();
        const elapsed = (now - cooldown.startTime) / 1000; // seconds
        const totalDuration = cooldown.duration * 60; // convert to seconds
        
        if (elapsed < totalDuration) {
          cooldown.remainingTime = totalDuration - elapsed;
          this.cooldownState = cooldown;
        } else {
          // Cooldown has expired, clear it
          this.clearCooldown();
        }
      }
    } catch (error) {
      console.error('Error loading cooldown from storage:', error);
      this.clearCooldown();
    }
  }

  private saveCooldownToStorage(): void {
    try {
      if (this.cooldownState) {
        localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(this.cooldownState));
      } else {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Error saving cooldown to storage:', error);
    }
  }

  private startPeriodicCheck(): void {
    // Update cooldown state every second
    this.timer = setInterval(() => {
      if (this.cooldownState) {
        this.cooldownState.remainingTime -= 1;
        
        if (this.cooldownState.remainingTime <= 0) {
          // Cooldown finished
          this.clearCooldown();
        } else {
          // Update callbacks with new remaining time
          this.notifyCallbacks();
          this.saveCooldownToStorage();
        }
      }
    }, 1000);
  }

  private clearCooldown(): void {
    this.cooldownState = null;
    this.saveCooldownToStorage();
    this.notifyCallbacks();
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.cooldownState);
      } catch (error) {
        console.error('Error in cooldown callback:', error);
      }
    });
  }

  public startCooldown(attendanceAction: 'first_check_in' | 'second_check_in'): void {
    // Determine cooldown type and duration
    let type: 'first_session' | 'second_session';
    let duration: number;
    let voiceMessage: string;

    if (attendanceAction === 'first_check_in') {
      type = 'first_session';
      duration = COOLDOWN_CONFIG.firstSessionCooldown;
      voiceMessage = 'You will not be able to do anything for three minutes';
    } else {
      type = 'second_session';
      duration = COOLDOWN_CONFIG.secondSessionCooldown;
      voiceMessage = 'You will not be able to do anything for two minutes';
    }

    // Create cooldown state
    this.cooldownState = {
      isActive: true,
      type,
      startTime: Date.now(),
      duration,
      remainingTime: duration * 60, // convert to seconds
    };

    // Save to storage
    this.saveCooldownToStorage();
    
    // Play voice notification
    this.speechUtility.speak(voiceMessage).catch(error => {
      console.warn('Failed to play cooldown voice notification:', error);
    });

    // Notify callbacks
    this.notifyCallbacks();
    
    console.log(`Cooldown started: ${type} for ${duration} minutes`);
  }

  public getCooldownState(): CooldownState | null {
    return this.cooldownState ? { ...this.cooldownState } : null;
  }

  public isInCooldown(): boolean {
    return this.cooldownState !== null && this.cooldownState.isActive;
  }

  public canPerformAction(nextAction: string): boolean {
    if (!this.isInCooldown()) {
      return true;
    }

    // During first session cooldown, only allow second_check_in when cooldown ends
    if (this.cooldownState!.type === 'first_session') {
      return nextAction !== 'first_check_out';
    }

    // During second session cooldown, only allow final actions when cooldown ends
    if (this.cooldownState!.type === 'second_session') {
      return nextAction !== 'second_check_out';
    }

    return true;
  }

  public formatRemainingTime(): string {
    if (!this.cooldownState) {
      return '';
    }

    const remainingSeconds = Math.max(0, Math.ceil(this.cooldownState.remainingTime));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  public subscribe(callback: (state: CooldownState | null) => void): () => void {
    this.callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callbacks.clear();
    this.clearCooldown();
  }
}

// Export singleton instance
export const cooldownManager = CooldownManager.getInstance();

// Helper functions
export const useCooldown = () => {
  const [cooldownState, setCooldownState] = React.useState<CooldownState | null>(
    cooldownManager.getCooldownState()
  );

  React.useEffect(() => {
    const unsubscribe = cooldownManager.subscribe(setCooldownState);
    return unsubscribe;
  }, []);

  return {
    cooldownState,
    isInCooldown: cooldownManager.isInCooldown(),
    canPerformAction: (action: string) => cooldownManager.canPerformAction(action),
    formatRemainingTime: () => cooldownManager.formatRemainingTime(),
    startCooldown: (action: 'first_check_in' | 'second_check_in') => 
      cooldownManager.startCooldown(action),
  };
};

// Import React for the hook
import React from 'react';