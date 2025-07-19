import React from 'react';
import { Clock, Timer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cooldownManager, CooldownState } from '@/utils/cooldownUtils';

interface CooldownTimerProps {
  className?: string;
}

export const CooldownTimer: React.FC<CooldownTimerProps> = ({ className }) => {
  const [cooldownState, setCooldownState] = React.useState<CooldownState | null>(
    cooldownManager.getCooldownState()
  );

  React.useEffect(() => {
    const unsubscribe = cooldownManager.subscribe(setCooldownState);
    return unsubscribe;
  }, []);

  if (!cooldownState) {
    return null;
  }

  const formatTime = () => {
    const remainingSeconds = Math.max(0, Math.ceil(cooldownState.remainingTime));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    const totalSeconds = cooldownState.duration * 60;
    const elapsed = totalSeconds - cooldownState.remainingTime;
    return Math.min(100, (elapsed / totalSeconds) * 100);
  };

  const getCooldownTypeText = () => {
    return cooldownState.type === 'first_session' 
      ? 'First Session Cooldown' 
      : 'Second Session Cooldown';
  };

  const getCooldownMessage = () => {
    return cooldownState.type === 'first_session'
      ? 'Please wait before checking out from your first session'
      : 'Please wait before checking out from your second session';
  };

  return (
    <Card className={`w-full max-w-md mx-auto border-2 border-orange-200 bg-orange-50 ${className}`}>
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Header */}
          <div className="flex items-center space-x-2">
            <Timer className="h-6 w-6 text-orange-600" />
            <Badge variant="secondary" className="bg-orange-100 text-orange-800">
              {getCooldownTypeText()}
            </Badge>
          </div>

          {/* Timer Display */}
          <div className="text-center">
            <div className="text-4xl font-bold text-orange-800 font-mono">
              {formatTime()}
            </div>
            <p className="text-sm text-orange-600 mt-1">
              Time remaining
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-orange-200 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-orange-400 to-orange-600 h-3 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>

          {/* Message */}
          <div className="text-center">
            <p className="text-sm text-orange-700">
              {getCooldownMessage()}
            </p>
            <div className="flex items-center justify-center mt-2 space-x-1">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-orange-500">
                QR scanning is disabled during cooldown
              </span>
            </div>
          </div>

          {/* Animation */}
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1s'
                }}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CooldownTimer;