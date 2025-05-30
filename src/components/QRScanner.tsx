import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import 'animate.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getEmployeeById } from '@/utils/employeeUtils';
import { SwitchCamera, Loader2, Camera, Power, Scan, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { verifyGatePass } from '@/utils/gatePassUtils';
import { singleScanAttendance } from '@/utils/attendanceUtils';
import { Employee } from '@/types';

// Performance optimized settings
const SCAN_INTERVAL = 100; // Scan every 100ms for better performance
const PROCESS_TIMEOUT = 2000;
const ALERT_DURATION = 2000;
const SCAN_RESOLUTION = { width: 480, height: 360 }; // Reduced resolution for faster processing
const SCAN_QUALITY = 0.6; // Reduced quality for better performance

// Cache settings
const CACHE_DURATION = 30 * 1000; // 30 seconds cache
const employeeCache = new Map<string, { data: EmployeeData; timestamp: number }>();

// Speech synthesis settings
const SPEECH_SETTINGS = {
  lang: 'en-US',
  pitch: 1,
  rate: 0.8,
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
  action: 'check-in' | 'check-out';
}

interface EmployeeData {
  first_name: string;
  last_name: string;
  id: string;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onError, mode = 'attendance' }) => {
  const webcamRef = useRef<Webcam>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedData = useRef<string | null>(null);
  const processingLock = useRef<boolean>(false);
  const speechSynthesis = useRef<SpeechSynthesis | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [scanning, setScanning] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(true);
  const { toast } = useToast();

  // Initialize canvas once
  useEffect(() => {
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

  // Memoized video constraints
  const videoConstraints = useMemo(() => ({
    facingMode,
    width: { ideal: SCAN_RESOLUTION.width * 2 },
    height: { ideal: SCAN_RESOLUTION.height * 2 },
    frameRate: { ideal: 30, min: 15 },
    aspectRatio: { ideal: 1.777778 },
  }), [facingMode]);

  // Optimized QR scanning function
  const scanQRCode = useCallback(() => {
    if (!scanning || !webcamRef.current?.video || isProcessing || !ctxRef.current || !canvasRef.current) return;

    const video = webcamRef.current.video;
    if (video.readyState !== 4) return;

    const ctx = ctxRef.current;
    const canvas = canvasRef.current;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Process QR code in worker
    qrWorker.postMessage({
      data: imageData.data,
      width: canvas.width,
      height: canvas.height
    });
  }, [scanning, isProcessing]);

  // Handle worker response
  useEffect(() => {
    const handleWorkerMessage = (e: MessageEvent) => {
      if (e.data) {
        processQRCode(e.data);
      }
    };

    qrWorker.addEventListener('message', handleWorkerMessage);
    return () => qrWorker.removeEventListener('message', handleWorkerMessage);
  }, []);

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
        singleScanAttendance(employeeId) as Promise<AttendanceResult>
      ]);

      if (!employee) throw new Error('Employee not found');

      const isCheckOut = result.action === 'check-out';
      const timestamp = isCheckOut && result.check_out_time ? result.check_out_time : result.check_in_time;
      const currentTime = new Date(timestamp).toLocaleTimeString();
      const fullName = `${employee.first_name} ${employee.last_name}`;
      
      // Prepare speech text
      const speechText = isCheckOut
        ? `Goodbye ${fullName}. You have successfully checked out at ${currentTime}. Have a great evening!`
        : `Welcome ${fullName}. You have successfully checked in at ${currentTime}. Have a great day!`;

      // Speak the message
      speak(speechText);
      
      // Show quick success message
      Swal.fire({
        title: isCheckOut ? 'Check-Out Successful!' : 'Check-In Successful!',
        html: `
          <div class="text-center">
            <h2 class="text-2xl font-bold ${isCheckOut ? 'text-blue-600' : 'text-green-600'} mb-4">
              ${isCheckOut ? 'Goodbye' : 'Hello'}, ${fullName}!
            </h2>
            <p class="text-lg">
              ${isCheckOut ? 'Checked out' : 'Checked in'} at 
              <strong>${currentTime}</strong>
            </p>
          </div>
        `,
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
          type: result.action
        });
      }

    } catch (error) {
      console.error('Attendance recording error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to record attendance';
      const alreadyCheckedIn = errorMessage.includes('already checked in');

      // Speak error message
      speak(alreadyCheckedIn 
        ? "You have already checked in today. Please check out instead." 
        : "Sorry, there was an error recording your attendance. Please try again.");

      // Quick error message
      Swal.fire({
        title: alreadyCheckedIn ? 'Already Checked In' : 'Error',
        text: errorMessage,
        icon: alreadyCheckedIn ? 'info' : 'error',
        timer: ALERT_DURATION,
        timerProgressBar: true,
        showConfirmButton: false,
        background: alreadyCheckedIn ? '#f0f9ff' : '#fff0f0',
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

  // Optimized scanning interval
  useEffect(() => {
    cleanup();
    if (scanning) {
      scanIntervalRef.current = setInterval(scanQRCode, SCAN_INTERVAL);
    }
    return cleanup;
  }, [scanQRCode, scanning, cleanup]);

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