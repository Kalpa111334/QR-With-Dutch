import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { useToast } from './ui/use-toast';
import LoadingSpinner from './LoadingSpinner';
import { AttendanceStateIndicator } from './AttendanceStateIndicator';
import { getCurrentAttendanceState, getNextAttendanceAction, recordAttendance } from '@/utils/attendanceUtils';
import { parseQRCodeData } from '@/utils/qrCodeUtils';
import { AlertTriangle, CheckCircle, Clock, Volume2, VolumeX } from 'lucide-react';
import { Badge } from './ui/badge';
import { attendanceSpeechService } from '@/utils/speechUtils';
import { Switch } from './ui/switch';
import { Label } from './ui/label';

interface QRScannerProps {
  onScanSuccess?: (result: any) => void;
  onScanError?: (error: any) => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attendanceState, setAttendanceState] = useState<'not_checked_in' | 'first_checked_in' | 'first_checked_out' | 'second_checked_in' | 'second_checked_out'>('not_checked_in');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [lastScanTime, setLastScanTime] = useState(0);
  const { toast } = useToast();
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processingRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);

  // Optimized video constraints
  const videoConstraints = useMemo(() => ({
    facingMode: 'environment',
    width: { min: 640, ideal: 1280, max: 1920 },
    height: { min: 480, ideal: 720, max: 1080 },
    aspectRatio: { ideal: 1.7777777778 },
    frameRate: { ideal: 30, min: 15 },
    focusMode: 'continuous',
    exposureMode: 'continuous',
    whiteBalanceMode: 'continuous'
  }), []);

  // Optimized scanner settings
  const scannerSettings = useMemo(() => ({
    scanDelay: 100,
    constraints: videoConstraints,
    formats: ['qr_code'],
    components: {
      audio: false,
      finder: true,
      onOff: false,
      torch: true,
      zoom: false
    },
    styles: {
      container: {
        width: '100%',
        height: '300px'
      },
      finderBorder: 40
    }
  }), [videoConstraints]);

  const handleScan = useCallback(async (detectedCodes: any[]) => {
    if (!detectedCodes.length || isLoading || processingRef.current) return;

    const result = detectedCodes[0].rawValue;
    if (!result || result === lastScannedCodeRef.current) return;

    // Debounce scanning with improved timing
    const currentTime = Date.now();
    if (currentTime - lastScanTime < 1500) return;
    
    processingRef.current = true;
    lastScannedCodeRef.current = result;
    setLastScanTime(currentTime);

    try {
      setIsLoading(true);
      setIsScanning(false);

      // Parse QR code data with error handling
      const qrData = parseQRCodeData(result);
      if (qrData.type !== 'employee' || !qrData.id) {
        throw new Error('Invalid QR code format');
      }

      // Record attendance with optimized error handling
      const attendanceResult = await recordAttendance(qrData.id);

      // Update attendance state asynchronously
      const newState = await getCurrentAttendanceState(qrData.id);
      setAttendanceState(newState);

      // Optimized voice feedback
      if (voiceEnabled && attendanceSpeechService.isSupported()) {
        attendanceSpeechService.speakAttendanceResult(attendanceResult)
          .catch(console.warn);
      }

      // Show optimized success message
      toast({
        title: `${attendanceResult.action.split('_').map((word: string) => 
          word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Successful`,
        description: (
          <div className="mt-2 space-y-2">
            <p className="font-medium">{attendanceResult.employeeName}</p>
            {attendanceResult.isLate ? (
              <div className="flex items-center text-destructive">
                <AlertTriangle className="w-4 h-4 mr-1" />
                <span>{attendanceResult.lateMinutes} minutes late</span>
              </div>
            ) : (
              <div className="flex items-center text-success">
                <CheckCircle className="w-4 h-4 mr-1" />
                <span>On time</span>
              </div>
            )}
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              <span>{attendanceResult.actualHours?.toFixed(1) || 0} / {attendanceResult.expectedHours?.toFixed(1)} hours</span>
            </div>
            <Badge 
              variant={attendanceResult.complianceRate >= 90 ? "default" : "destructive"} 
              className="mt-1"
            >
              {attendanceResult.complianceRate?.toFixed(1)}% Compliance
            </Badge>
              </div>
        ),
        duration: 3000
      });

      if (onScanSuccess) {
        onScanSuccess(attendanceResult);
      }
    } catch (error) {
      console.error('Scan error:', error);
      
      // Optimized error handling with voice feedback
      if (voiceEnabled && attendanceSpeechService.isSupported()) {
          const errorMessage = error instanceof Error ? error.message : "Failed to process attendance";
        attendanceSpeechService.speak(errorMessage)
          .catch(console.warn);
      }

      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process attendance",
        duration: 2000
      });

      if (onScanError) {
        onScanError(error);
      }
    } finally {
      setIsLoading(false);
      processingRef.current = false;
      
      // Clear existing timeout and restart scanning
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      scanTimeoutRef.current = setTimeout(() => {
        setIsScanning(true);
        lastScannedCodeRef.current = null;
      }, 1500);
    }
  }, [isLoading, lastScanTime, voiceEnabled, onScanSuccess, onScanError, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      attendanceSpeechService.stop();
      processingRef.current = false;
      lastScannedCodeRef.current = null;
    };
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <AttendanceStateIndicator currentState={attendanceState} />
          <div className="flex items-center space-x-2">
            {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <Switch
              checked={voiceEnabled}
              onCheckedChange={setVoiceEnabled}
              disabled={!attendanceSpeechService.isSupported()}
            />
            <Label htmlFor="voice-toggle" className="text-sm">
              Voice Feedback
            </Label>
          </div>
        </div>
        
        {!attendanceSpeechService.isSupported() && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-orange-500 mr-2" />
              <span className="text-sm text-orange-700">
                Voice feedback is not supported in this browser
              </span>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <LoadingSpinner />
          </div>
        )}
        
        <div className="relative">
        {isScanning ? (
            <>
            <Scanner
              onScan={handleScan}
                onError={console.error}
                {...scannerSettings}
            />
            <Button
              onClick={() => {
                setIsScanning(false);
                if (scanTimeoutRef.current) {
                  clearTimeout(scanTimeoutRef.current);
                }
              }}
              variant="destructive"
              className="w-full mt-4"
            >
              Stop Scanning
            </Button>
            </>
        ) : (
          <Button
              onClick={() => {
                setIsScanning(true);
                processingRef.current = false;
                lastScannedCodeRef.current = null;
              }}
            className="w-full mt-4"
          >
            Start Scanning
          </Button>
        )}
        </div>
      </div>
    </Card>
  );
};

export default React.memo(QRScanner);