// Enhanced Speech Utilities with Cooldown Support
import { SpeechUtility } from './speechUtils';

export interface CooldownSpeechOptions {
  enabled?: boolean;
  voice?: SpeechSynthesisVoice;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export class EnhancedSpeechUtility extends SpeechUtility {
  private cooldownMessages = {
    first_session: 'You will not be able to do anything for three minutes',
    second_session: 'You will not be able to do anything for two minutes',
    cooldown_ended: 'Cooldown period has ended. You may now proceed.',
    scanning_disabled: 'QR scanning is currently disabled due to cooldown period.',
  };

  /**
   * Play cooldown start notification
   */
  public async playCooldownStartNotification(
    sessionType: 'first_session' | 'second_session',
    options?: CooldownSpeechOptions
  ): Promise<void> {
    try {
      const message = this.cooldownMessages[sessionType];
      await this.speak(message, options);
    } catch (error) {
      console.warn('Failed to play cooldown start notification:', error);
    }
  }

  /**
   * Play cooldown end notification
   */
  public async playCooldownEndNotification(
    options?: CooldownSpeechOptions
  ): Promise<void> {
    try {
      await this.speak(this.cooldownMessages.cooldown_ended, options);
    } catch (error) {
      console.warn('Failed to play cooldown end notification:', error);
    }
  }

  /**
   * Play scanning disabled notification
   */
  public async playScanningDisabledNotification(
    options?: CooldownSpeechOptions
  ): Promise<void> {
    try {
      await this.speak(this.cooldownMessages.scanning_disabled, options);
    } catch (error) {
      console.warn('Failed to play scanning disabled notification:', error);
    }
  }

  /**
   * Enhanced attendance result speech with cooldown awareness
   */
  public async speakAttendanceResultWithCooldown(
    attendanceResult: any,
    willStartCooldown: boolean = false,
    cooldownDuration?: number
  ): Promise<void> {
    try {
      // First speak the regular attendance result
      await this.speakAttendanceResult(attendanceResult);
      
      // If cooldown will start, announce it
      if (willStartCooldown && cooldownDuration) {
        const cooldownMessage = cooldownDuration === 3 
          ? this.cooldownMessages.first_session
          : this.cooldownMessages.second_session;
        
        // Add a small delay before cooldown announcement
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.speak(cooldownMessage);
      }
    } catch (error) {
      console.warn('Failed to speak attendance result with cooldown:', error);
    }
  }

  /**
   * Check if voice settings allow cooldown notifications
   */
  private isCooldownVoiceEnabled(): boolean {
    try {
      const stored = localStorage.getItem('attendanceVoiceSettings');
      if (stored) {
        const settings = JSON.parse(stored);
        return settings.enabled && settings.cooldownNotifications !== false;
      }
    } catch (error) {
      console.warn('Failed to check cooldown voice settings:', error);
    }
    return true; // Default to enabled
  }

  /**
   * Override parent speak method to check cooldown settings
   */
  public async speak(text: string, options?: any): Promise<void> {
    if (!this.isCooldownVoiceEnabled()) {
      return;
    }
    return super.speak(text, options);
  }
}

// Create singleton instance
export const enhancedSpeechUtility = new EnhancedSpeechUtility();

// Export convenience functions
export const announceCooldownStart = async (
  sessionType: 'first_session' | 'second_session'
): Promise<void> => {
  return enhancedSpeechUtility.playCooldownStartNotification(sessionType);
};

export const announceCooldownEnd = async (): Promise<void> => {
  return enhancedSpeechUtility.playCooldownEndNotification();
};

export const announceScanningDisabled = async (): Promise<void> => {
  return enhancedSpeechUtility.playScanningDisabledNotification();
};