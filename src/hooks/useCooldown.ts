// React Hook for Cooldown Management
import { useState, useEffect } from 'react';
import { cooldownManager, CooldownState } from '@/utils/cooldownUtils';

export const useCooldown = () => {
  const [cooldownState, setCooldownState] = useState<CooldownState | null>(
    cooldownManager.getCooldownState()
  );

  useEffect(() => {
    const unsubscribe = cooldownManager.subscribe(setCooldownState);
    return unsubscribe;
  }, []);

  return {
    // Current cooldown state
    cooldownState,
    
    // Computed properties
    isInCooldown: cooldownState !== null && cooldownState.isActive,
    remainingTime: cooldownState?.remainingTime || 0,
    cooldownType: cooldownState?.type || null,
    
    // Helper functions
    canPerformAction: (action: string) => cooldownManager.canPerformAction(action),
    formatRemainingTime: () => cooldownManager.formatRemainingTime(),
    startCooldown: (action: 'first_check_in' | 'second_check_in') => 
      cooldownManager.startCooldown(action),
    
    // Formatted display helpers
    getRemainingTimeDisplay: () => {
      if (!cooldownState) return '';
      const remainingSeconds = Math.max(0, Math.ceil(cooldownState.remainingTime));
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },
    
    getCooldownMessage: () => {
      if (!cooldownState) return '';
      return cooldownState.type === 'first_session'
        ? 'Please wait before checking out from your first session'
        : 'Please wait before checking out from your second session';
    },
    
    getProgressPercentage: () => {
      if (!cooldownState) return 0;
      const totalSeconds = cooldownState.duration * 60;
      const elapsed = totalSeconds - cooldownState.remainingTime;
      return Math.min(100, (elapsed / totalSeconds) * 100);
    }
  };
};

export default useCooldown;