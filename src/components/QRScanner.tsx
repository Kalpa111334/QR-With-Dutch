import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import 'animate.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getEmployeeById } from '@/utils/employeeUtils';
import { SwitchCamera, Loader2, Camera, Power, Scan, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { verifyGatePass } from '@/utils/gatePassUtils';
import { singleScanAttendance } from '@/utils/attendanceUtils';
import { Employee } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';

// Performance optimized settings
const SCAN_INTERVAL = 100; // Scan every 100ms for better performance
const PROCESS_TIMEOUT = 2000;
const ALERT_DURATION = 2500; // 2.5 seconds for alert display
const SCAN_RESOLUTION = { width: 480, height: 360 }; // Reduced resolution for faster processing
const SCAN_QUALITY = 0.6; // Reduced quality for better performance

// Cache settings
const CACHE_DURATION = 30 * 1000; // 30 seconds cache
const employeeCache = new Map<string, { data: EmployeeData; timestamp: number }>();

// Speech synthesis settings
const SPEECH_SETTINGS = {
  lang: 'en-US',
  pitch: 1,
  rate: 0.6,
  volume: 1,
  voice: null as SpeechSynthesisVoice | null
};

// Optimized QR processing worker setup
const qrWorker = new Worker(
  URL.createObjectURL(
    new Blob([
      `
      importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js');
      
      self.onmessage = function(e) {
        const { data, width, height } = e.data;
        const code = jsQR(data, width, height, {
          inversionAttempts: 'dontInvert'
        });
        self.postMessage(code ? code.data : null);
      };
      `
    ], { type: 'text/javascript' })
  )
);

// Types
interface QRScannerProps {
  onScan: (data: { 
    id: string; 
    name?: string; 
    type?: 'check-in' | 'check-out' 
  }) => void;
  onError?: (error: Error) => void;
  className?: string;
  mode?: 'attendance' | 'gatepass';
}

interface AttendanceResult {
  check_in_time: string;
  check_out_time?: string;
  action: 'first_check_in' | 'first_check_out' | 'second_check_in' | 'second_check_out';
  break_duration?: number;
  cooldown_remaining?: number;
  timestamp: string;
  total_worked_time?: number;
  first_check_in_time?: string;
  first_check_out_time?: string;
  second_check_in_time?: string;
  second_check_out_time?: string;
  total_hours?: number;
}

interface EmployeeData {
  first_name: string;
  last_name: string;
  id: string;
}

const formatTime = (timestamp: string | null | undefined) => {
  if (!timestamp) return '-';
  return format(new Date(timestamp), 'hh:mm:ss a');
};

// Memoize video constraints
const createVideoConstraints = (facingMode: 'environment' | 'user') => ({
  facingMode,
  width: { ideal: SCAN_RESOLUTION.width * 2 },
  height: { ideal: SCAN_RESOLUTION.height * 2 },
  frameRate: { ideal: 30, min: 15 },
  aspectRatio: { ideal: 1.777778 },
});

// Optimized QR Scanner component
const QRScanner: React.FC<QRScannerProps> = ({ onScan, onError, mode = 'attendance' }) => {
  // Refs for better performance
  const webcamRef = useRef<Webcam>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedData = useRef<string | null>(null);
  const processingLock = useRef<boolean>(false);
  const speechSynthesis = useRef<SpeechSynthesis | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // States
  const [scanning, setScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(true);
  const [cooldownTimer, setCooldownTimer] = useState<number | null>(null);

  // Memoize video constraints
  const videoConstraints = useMemo(() => createVideoConstraints(facingMode), [facingMode]);

  // Initialize canvas once
  useEffect(() => {
    if (!canvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = SCAN_RESOLUTION.width;
      canvas.height = SCAN_RESOLUTION.height;
      canvasRef.current = canvas;
      
      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
        alpha: false,
        desynchronized: true
      });
      ctxRef.current = ctx;
    }
  }, []);

  // Initialize speech synthesis with preferred voice
  useEffect(() => {
    if (typeof window !== 'undefined') {
      speechSynthesis.current = window.speechSynthesis;
      
      // Wait for voices to be loaded
      const setVoice = () => {
        const voices = speechSynthesis.current?.getVoices() || [];
        // Try to find a clear, natural-sounding voice
        const preferredVoice = voices.find(voice => 
          voice.name.includes('Daniel') || // Windows
          voice.name.includes('Samantha') || // macOS
          voice.name.includes('Google US English') || // Chrome
          voice.lang === 'en-US'
        );
        if (preferredVoice) {
          SPEECH_SETTINGS.voice = preferredVoice;
        }
      };

      // Chrome requires this event
      speechSynthesis.current.addEventListener('voiceschanged', setVoice);
      setVoice(); // Initial attempt

      return () => {
        speechSynthesis.current?.removeEventListener('voiceschanged', setVoice);
      };
    }
  }, []);

  // Speak function with pause between sentences
  const speak = useCallback((text: string) => {
    if (!isSpeechEnabled || !speechSynthesis.current) return;

    // Cancel any ongoing speech
    speechSynthesis.current.cancel();

    // Split text into sentences and add pauses
    const sentences = text.split(/[.!?]/).filter(Boolean);
    
    sentences.forEach((sentence, index) => {
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(sentence.trim() + '.');
        Object.assign(utterance, SPEECH_SETTINGS);
        speechSynthesis.current?.speak(utterance);
      }, index * 1000); // 1 second pause between sentences
    });
  }, [isSpeechEnabled]);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    if (speechSynthesis.current) speechSynthesis.current.cancel();
    scanIntervalRef.current = null;
    processingTimeoutRef.current = null;
    lastProcessedData.current = null;
    processingLock.current = false;
  }, []);

  // Optimized employee data fetching with caching
  const getEmployeeWithCache = useCallback(async (employeeId: string): Promise<EmployeeData> => {
    const now = Date.now();
    const cached = employeeCache.get(employeeId);
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }

    const employee = await getEmployeeById(employeeId) as EmployeeData;
    employeeCache.set(employeeId, { data: employee, timestamp: now });
    return employee;
  }, []);

  // Optimized QR scanning function with debouncing
  const scanQRCode = useCallback(
    debounce(() => {
      if (!scanning || !webcamRef.current?.video || isProcessing || !ctxRef.current || !canvasRef.current) return;

      const video = webcamRef.current.video;
      if (video.readyState !== 4) return;

      const ctx = ctxRef.current;
      const canvas = canvasRef.current;

      // Use requestAnimationFrame for smoother rendering
      requestAnimationFrame(() => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Process QR code in worker
        qrWorker.postMessage({
          data: imageData.data,
          width: canvas.width,
          height: canvas.height
        });
      });
    }, 50),
    [scanning, isProcessing]
  );

  // Optimized QR processing
  const processQRCode = useCallback(async (qrData: string) => {
    if (!qrData?.trim() || qrData === lastProcessedData.current || processingLock.current) return;
    
    try {
      processingLock.current = true;
      setIsProcessing(true);
      lastProcessedData.current = qrData;

      // Fast employee ID extraction
      let employeeId = qrData;
      if (qrData.startsWith('EMP:')) {
        employeeId = qrData.split(':')[1];
      } else if (qrData.includes('"id"')) {
        try {
          const parsed = JSON.parse(qrData);
          employeeId = parsed.id;
        } catch {
          const uuidMatch = qrData.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
          employeeId = uuidMatch?.[0] || qrData;
        }
      }

      if (!employeeId) throw new Error('Invalid QR code format');

      // Parallel processing of employee validation and attendance
      const [employee, result] = await Promise.all([
        getEmployeeWithCache(employeeId),
        singleScanAttendance(employeeId)
      ]);

      if (!employee) throw new Error('Employee not found');

      const isCheckOut = result.action.includes('check-out');
      const isSecondSequence = result.action.includes('second');
      const timestamp = new Date(result.timestamp);
      const currentTime = format(timestamp, 'hh:mm:ss a');
      const fullName = `${employee.first_name} ${employee.last_name}`;
      
      // Handle cooldown timer if present
      if (result.cooldown_remaining && result.cooldown_remaining > 0) {
        setCooldownTimer(result.cooldown_remaining);
        const minutes = Math.ceil(result.cooldown_remaining / 60);
        throw new Error(
          result.action === 'first_check_out' 
            ? `Must wait ${minutes} minutes after first check-in before checking out`
            : `Please wait ${minutes} minutes before next scan`
        );
      }

      // Prepare speech text and display message based on action
      let speechText = '';
      let title = '';
      let html = '';

      switch (result.action) {
        case 'first_check_in':
          speechText = `Welcome ${fullName}. First check-in recorded at ${currentTime}. Have a great day!`;
          title = 'First Check-In Successful!';
          html = `
            <div class="text-center">
              <h2 class="text-2xl font-bold text-green-600 mb-4">Welcome, ${fullName}!</h2>
              <p class="mb-2">First Check-In recorded at <strong>${currentTime}</strong></p>
              <p class="text-sm text-gray-600">You must wait 5 minutes before checking out.</p>
            </div>
          `;
          break;

        case 'first_check_out':
          const firstSessionDuration = result.total_worked_time 
            ? Math.floor(result.total_worked_time / 60)
            : 0;
          
          speechText = `${fullName}, your first check-out has been recorded at ${currentTime}. Enjoy your break!`;
          title = 'First Check-Out Successful!';
          html = `
            <div class="text-center">
              <h2 class="text-2xl font-bold text-blue-600 mb-4">Break Time, ${fullName}!</h2>
              <p class="mb-2">First Check-Out recorded at <strong>${currentTime}</strong></p>
              <div class="text-sm text-gray-600 mt-4">
                <p>First Check-In: ${formatTime(result.first_check_in_time)}</p>
                <p>First Session Duration: ${firstSessionDuration} minutes</p>
              </div>
            </div>
          `;
          break;

        case 'second_check_in':
          const breakDuration = Math.round(result.break_duration || 0);
          speechText = `Welcome back ${fullName}. Second check-in recorded at ${currentTime}.`;
          title = 'Second Check-In Successful!';
          html = `
            <div class="text-center">
              <h2 class="text-2xl font-bold text-green-600 mb-4">Welcome Back, ${fullName}!</h2>
              <p class="mb-2">Second Check-In recorded at <strong>${currentTime}</strong></p>
              <div class="text-sm text-gray-600 mt-4">
                <p>Break Duration: ${breakDuration} minutes</p>
                <p>First Check-In: ${formatTime(result.first_check_in_time)}</p>
                <p>First Check-Out: ${formatTime(result.first_check_out_time)}</p>
              </div>
            </div>
          `;
          break;

        case 'second_check_out':
          const totalWorkedHours = result.total_hours?.toFixed(2) || '0.00';
          const totalWorkedMinutes = Math.round((result.total_worked_time || 0) / 60);
          
          speechText = `Goodbye ${fullName}. Your second check-out has been recorded at ${currentTime}. Have a great evening!`;
          title = 'Second Check-Out Successful!';
          html = `
            <div class="text-center">
              <h2 class="text-2xl font-bold text-blue-600 mb-4">Goodbye, ${fullName}!</h2>
              <p class="mb-2">Second Check-Out recorded at <strong>${currentTime}</strong></p>
              <div class="text-sm text-gray-600 mt-4">
                <p>First Check-In: ${formatTime(result.first_check_in_time)}</p>
                <p>First Check-Out: ${formatTime(result.first_check_out_time)}</p>
                <p>Second Check-In: ${formatTime(result.second_check_in_time)}</p>
                <p>Break Duration: ${Math.round(result.break_duration || 0)} minutes</p>
                <p class="mt-2 font-semibold">Total Time Worked: ${totalWorkedHours} hours (${totalWorkedMinutes} minutes)</p>
              </div>
            </div>
          `;
          break;
      }

      // Speak the message
      speak(speechText);
      
      // Show success message
      Swal.fire({
        title,
        html,
        icon: 'success',
        timer: ALERT_DURATION,
        timerProgressBar: true,
        showConfirmButton: false,
        background: isCheckOut ? '#f0f9ff' : '#f0fdf4',
        showClass: {
          popup: 'animate__animated animate__fadeInDown animate__faster'
        },
        hideClass: {
          popup: 'animate__animated animate__fadeOutUp animate__faster'
        }
      });

      // Quick success sound
      new Audio('/success.mp3').play().catch(() => {});
      
      if (onScan) {
        onScan({
          id: employeeId,
          name: fullName,
          type: isCheckOut ? 'check-out' : 'check-in'
        });
      }

    } catch (error) {
      console.error('Attendance recording error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to record attendance';
      const cooldownError = errorMessage.includes('wait') || errorMessage.includes('minutes');
      const completedError = errorMessage.includes('All attendance for today already marked');

      // Speak error message
      speak(cooldownError 
        ? errorMessage 
        : completedError
          ? "You have already completed all attendance actions for today"
        : "Sorry, there was an error recording your attendance. Please try again.");

      // Show error message
      Swal.fire({
        title: cooldownError ? 'Please Wait' : completedError ? 'Already Completed' : 'Error',
        text: errorMessage,
        icon: cooldownError || completedError ? 'info' : 'error',
        timer: ALERT_DURATION,
        timerProgressBar: true,
        showConfirmButton: false,
        background: cooldownError || completedError ? '#f0f9ff' : '#fff0f0',
        showClass: {
          popup: 'animate__animated animate__shakeX animate__faster'
        },
        hideClass: {
          popup: 'animate__animated animate__fadeOut animate__faster'
        }
      });

    } finally {
      // Reset processing state after timeout
      processingTimeoutRef.current = setTimeout(() => {
        setIsProcessing(false);
        processingLock.current = false;
        lastProcessedData.current = null;
      }, PROCESS_TIMEOUT);
    }
  }, [onScan, speak, getEmployeeWithCache]);

  // Handle worker response
  useEffect(() => {
    const handleWorkerMessage = (e: MessageEvent) => {
      if (e.data) {
        processQRCode(e.data);
      }
    };

    qrWorker.addEventListener('message', handleWorkerMessage);
    return () => qrWorker.removeEventListener('message', handleWorkerMessage);
  }, [processQRCode]);

  // Optimized scanning interval
  useEffect(() => {
    cleanup();
    if (scanning) {
      scanIntervalRef.current = setInterval(scanQRCode, SCAN_INTERVAL);
    }
    return cleanup;
  }, [scanQRCode, scanning, cleanup]);

  // Update cooldown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (cooldownTimer && cooldownTimer > 0) {
      interval = setInterval(() => {
        setCooldownTimer(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cooldownTimer]);

  // Utility function for debouncing
  function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    
    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  // Optimized render with minimal state updates
  return (
    <Card className="w-full max-w-2xl mx-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 shadow-lg border border-slate-200 dark:border-slate-700">
      <CardHeader className="px-4 py-2">
        <CardTitle className="flex justify-between items-center text-base">
          <span className="flex items-center">
            <Scan className="h-4 w-4 mr-2" />
            {mode === 'gatepass' ? 'Gate Pass Scanner' : 'Quick Attendance Scanner'}
          </span>
          <div className="flex gap-2">
            {cooldownTimer && cooldownTimer > 0 && (
              <span className="text-sm font-medium text-yellow-600">
                Cooldown: {Math.floor(cooldownTimer / 60)}:{(cooldownTimer % 60).toString().padStart(2, '0')}
              </span>
            )}
            <Button 
              variant="outline"
              size="sm"
              onClick={() => setIsSpeechEnabled(prev => !prev)}
              className="h-8"
              title={isSpeechEnabled ? "Disable voice announcements" : "Enable voice announcements"}
            >
              {isSpeechEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button 
              variant="outline"
              size="sm"
              onClick={() => {
                setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
                cleanup();
              }}
              className="h-8"
            >
              <SwitchCamera className="h-4 w-4" />
            </Button>
            <Button 
              variant={scanning ? "destructive" : "default"}
              size="sm"
              onClick={() => {
                setScanning(prev => !prev);
                cleanup();
              }}
              className="h-8"
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-2">
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          <Webcam
            ref={webcamRef}
            audio={false}
            videoConstraints={videoConstraints}
            className="w-full h-full object-cover"
            screenshotQuality={SCAN_QUALITY}
            screenshotFormat="image/jpeg"
          />
          
          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-blue-500 rounded-md">
                <div className="absolute inset-0 border border-blue-500 opacity-20"></div>
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500 opacity-50 transform -translate-y-1/2 animate-[scan_2s_ease-in-out_infinite]"></div>
              </div>
            </div>
          )}
          
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}
        </div>
        
        <p className="text-center text-sm mt-2 text-muted-foreground">
          Position QR code in the scanning area
        </p>
      </CardContent>
    </Card>
  );
};

export default React.memo(QRScanner); 