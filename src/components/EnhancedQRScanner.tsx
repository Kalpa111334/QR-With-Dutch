import React, { useState, useEffect } from 'react';
import { QRScanner } from './QRScanner';
import { parseQRCodeData } from '@/utils/qrCodeUtils';
import { recordAttendance, getNextAttendanceAction } from '@/utils/attendanceUtils';
import { useToast } from '@/hooks/use-toast';
import { ScannerOverlay } from './ScannerOverlay';
import { enhancedSpeechUtility } from '@/utils/enhancedSpeechUtils';
import { cooldownManager } from '@/utils/cooldownUtils';
import { useCooldown } from '@/hooks/useCooldown';
import { CooldownTimer } from './CooldownTimer';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Timer, AlertTriangle } from 'lucide-react';

interface EnhancedQRScannerProps {
  onScanComplete?: () => void;
}

const EnhancedQRScanner: React.FC<EnhancedQRScannerProps> = ({ onScanComplete }) => {
  const [isScanning, setIsScanning] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  
  const {
    isInCooldown,
    cooldownState,
    canPerformAction,
    startCooldown,
    getCooldownMessage
  } = useCooldown();

  // Disable scanning when in cooldown
  useEffect(() => {
    if (isInCooldown) {
      setIsScanning(false);
    } else {
      setIsScanning(true);
    }
  }, [isInCooldown]);

  const handleScan = async (detectedCodes: any[]) => {
    if (!detectedCodes.length || isLoading) return;

    const result = detectedCodes[0].rawValue;
    if (!result) return;

    try {
      setIsLoading(true);
      setIsScanning(false);

      // Parse QR code data
      const qrData = parseQRCodeData(result);
      if (qrData.type !== 'employee' || !qrData.id) {
        throw new Error('Invalid QR code format');
      }

      // Check if action is allowed during cooldown
      const nextAction = await getNextAttendanceAction(qrData.id);
      
      if (isInCooldown && !canPerformAction(nextAction)) {
        // Play scanning disabled notification
        await enhancedSpeechUtility.playScanningDisabledNotification();
        
        toast({
          variant: 'destructive',
          title: 'Action Not Allowed',
          description: getCooldownMessage(),
          duration: 4000,
        });
        
        return;
      }

      // Record attendance
      const attendanceResult = await recordAttendance(qrData.id);

      // Determine if cooldown should start
      const shouldStartCooldown = 
        nextAction === 'first_check_in' || nextAction === 'second_check_in';
      
      let cooldownDuration = 0;
      if (shouldStartCooldown) {
        cooldownDuration = nextAction === 'first_check_in' ? 3 : 2;
        startCooldown(nextAction as 'first_check_in' | 'second_check_in');
      }

      // Play success sound and speak feedback with cooldown awareness
      await enhancedSpeechUtility.playSuccessSound();
      await enhancedSpeechUtility.speakAttendanceResultWithCooldown(
        attendanceResult,
        shouldStartCooldown,
        cooldownDuration
      );

      // Show success message
      toast({
        title: 'Attendance Recorded',
        description: `Successfully recorded attendance for ${attendanceResult.employeeName}${
          shouldStartCooldown ? ` (${cooldownDuration}-minute cooldown started)` : ''
        }`,
        duration: 3000,
      });

      // Call completion callback
      if (onScanComplete) {
        onScanComplete();
      }

    } catch (error) {
      console.error('QR Scan Error:', error);
      
      // Play error sound
      await enhancedSpeechUtility.playErrorSound();

      // Determine error message and speak it
      let errorMessage = 'Failed to record attendance';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Special handling for roster-related errors
        if (errorMessage.includes('No active roster')) {
          errorMessage = 'No active roster found. Please contact your supervisor.';
          await enhancedSpeechUtility.speak('No active roster found. Please contact your supervisor.');
        } else {
          await enhancedSpeechUtility.speak('Error recording attendance');
        }
      }

      // Show error toast
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
      // Resume scanning after a short delay (unless in cooldown)
      setTimeout(() => {
        if (!isInCooldown) {
          setIsScanning(true);
        }
      }, 2000);
    }
  };

  const handleScanAttemptDuringCooldown = async () => {
    if (isInCooldown) {
      await enhancedSpeechUtility.playScanningDisabledNotification();
      toast({
        variant: 'destructive',
        title: 'Scanning Disabled',
        description: getCooldownMessage(),
        duration: 3000,
      });
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto space-y-4">
      {/* Cooldown Timer - shown when in cooldown */}
      {isInCooldown && (
        <CooldownTimer className="mb-4" />
      )}
      
      {/* QR Scanner */}
      <div className="relative">
        <QRScanner
          onScan={isInCooldown ? [] : handleScan} // Disable scan callback during cooldown
          scanning={isScanning && !isInCooldown}
          className="w-full aspect-square rounded-lg overflow-hidden"
        />
        
        {/* Overlay for cooldown state */}
        {isInCooldown && (
          <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center rounded-lg">
            <Card className="bg-orange-100 border-orange-300">
              <CardContent className="p-4 text-center">
                <Timer className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                <p className="text-orange-800 font-medium">Scanner Disabled</p>
                <p className="text-orange-600 text-sm">
                  Cooldown in progress
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        
        <ScannerOverlay 
          isScanning={isScanning && !isInCooldown} 
          isLoading={isLoading} 
        />
      </div>
      
      {/* Cooldown Alert */}
      {isInCooldown && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            {getCooldownMessage()}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Info Message when not in cooldown */}
      {!isInCooldown && (
        <p className="text-center text-sm text-gray-600">
          Position the QR code within the scanner area
        </p>
      )}
    </div>
  );
};

export default EnhancedQRScanner;