import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getEmployeeById } from '@/utils/employeeUtils';
import { SwitchCamera, Loader2, Camera, Power, Scan } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { verifyGatePass } from '@/utils/gatePassUtils';
import { recordAttendanceCheckIn, recordAttendanceCheckOut } from '@/utils/attendanceUtils';
import { Employee } from '@/types';

// Types
interface QRScannerProps {
  onScan: (data: { id: string; name?: string }) => void;
  onError?: (error: Error) => void;
  className?: string;
  mode?: 'attendance' | 'gatepass';
}

interface ScanResult {
  id: string;
  name?: string;
  type?: string;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onError, mode = 'attendance' }) => {
  // Performance optimized refs
  const webcamRef = useRef<Webcam>(null);
  const rafId = useRef<number | null>(null);
  const lastScanTime = useRef<number>(0);
  const processingTimeout = useRef<NodeJS.Timeout | null>(null);
  const scanAttempts = useRef<number>(0);
  const lastProcessedData = useRef<string | null>(null);

  // State management
  const [scanning, setScanning] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { toast } = useToast();
  const scanCooldown = 100; // Reduced cooldown for faster scanning
  const maxScanAttempts = 3; // Maximum attempts to scan the same QR code

  // Initialize camera with optimal settings
  useEffect(() => {
    const initializeCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);

        // Prioritize back camera for better scanning
        const backCamera = videoDevices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear')
        );
        
        if (backCamera) {
          setSelectedCamera(backCamera.deviceId);
          setFacingMode('environment');
        } else if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        } else {
          setCameraError('No cameras found');
        }
      } catch (error) {
        console.error('Camera initialization error:', error);
        setCameraError('Camera access error');
      }
    };

    initializeCameras();
    return () => cleanup();
  }, []);

  const cleanup = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    if (processingTimeout.current) clearTimeout(processingTimeout.current);
    rafId.current = null;
    processingTimeout.current = null;
    scanAttempts.current = 0;
    lastProcessedData.current = null;
  }, []);

  // Optimized QR code processing with debouncing and caching
  const processQRCode = useCallback(async (qrData: string) => {
    if (!qrData?.trim() || qrData === lastProcessedData.current || isProcessing) return;
    
    try {
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

      if (!employeeId) {
        throw new Error('Invalid QR code format');
      }

      // Optimized database operations
      const [employee, attendanceRecord] = await Promise.all([
        getEmployeeById(employeeId),
        supabase
          .from('attendance')
          .select('check_in_time, check_out_time')
          .eq('employee_id', employeeId)
          .eq('date', new Date().toISOString().split('T')[0])
          .maybeSingle()
      ]);

      if (!employee) {
        throw new Error('Employee not found');
      }

      if (!attendanceRecord.data && !attendanceRecord.error) {
        // Check-in flow
        const checkInResult = await recordAttendanceCheckIn(employeeId);
        if (!checkInResult || checkInResult.status !== 'present') {
          throw new Error('Check-in failed');
        }

        // Immediate success feedback
        Swal.fire({
          title: 'Checked In',
          text: `Welcome, ${employee.first_name} ${employee.last_name}!`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          position: 'top-end',
          toast: true
        });

        new Audio('/success.mp3').play().catch(() => {});
        return;
      }

      if (attendanceRecord.data && !attendanceRecord.data.check_out_time) {
        // Check-out flow
        try {
          const checkOutResult = await recordAttendanceCheckOut(employeeId);
          if (!checkOutResult || checkOutResult.status !== 'checked-out') {
            throw new Error('Check-out failed');
          }

          // Immediate success feedback
          Swal.fire({
            title: 'Checked Out',
            text: `Goodbye, ${employee.first_name} ${employee.last_name}!`,
            icon: 'success',
            timer: 1500,
            showConfirmButton: false,
            position: 'top-end',
            toast: true
          });

          new Audio('/success.mp3').play().catch(() => {});
          return;
        } catch (error) {
          // Check if it's the 5-minute cooldown error
          if (error instanceof Error && error.message.includes('Please wait at least 5 minutes')) {
            Swal.fire({
              title: 'Error',
              text: 'Please wait at least 5 minutes after logging in before logging out. Please come back after your work hours and check again.',
              icon: 'error',
              confirmButtonText: 'OK',
              confirmButtonColor: '#3085d6',
              showCloseButton: true,
              timer: 5000
            });
            return;
          }
          throw error;
        }
      }

      if (attendanceRecord.data?.check_out_time) {
        Swal.fire({
          title: 'Already Recorded',
          text: 'Attendance already recorded for today',
          icon: 'info',
          timer: 1500,
          showConfirmButton: false,
          position: 'top-end',
          toast: true
        });
        return;
      }

    } catch (error) {
      console.error('Attendance recording error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to record attendance',
        variant: 'destructive',
        duration: 2000,
      });
    } finally {
      setIsProcessing(false);
      // Reset for next scan after a short delay
      setTimeout(() => {
        lastProcessedData.current = null;
      }, 1000);
    }
  }, [toast, isProcessing]);

  // Optimized QR scanning with better performance
  const scanQRCode = useCallback(() => {
    if (!scanning || !webcamRef.current?.video || isProcessing) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }

    const now = Date.now();
    if (now - lastScanTime.current < scanCooldown) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }

    const video = webcamRef.current.video;
    if (video.readyState !== 4) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;  // Optimal size for QR scanning
      canvas.height = 480;

      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
        alpha: false,
        desynchronized: true
      });

      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code?.data) {
        lastScanTime.current = now;
        processQRCode(code.data);
      }
    } catch (error) {
      console.error('QR scanning error:', error);
    }

    rafId.current = requestAnimationFrame(scanQRCode);
  }, [scanning, processQRCode, scanCooldown, isProcessing]);

  // Start/Stop scanning
  useEffect(() => {
    cleanup();
    if (scanning) {
      rafId.current = requestAnimationFrame(scanQRCode);
    }
    return cleanup;
  }, [scanQRCode, scanning, cleanup]);

  // Optimized video constraints for fast scanning
  const videoConstraints = {
    deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
    facingMode,
    width: 1280,
    height: 720,
    frameRate: { ideal: 30, min: 15 },
    focusMode: 'continuous',
    exposureMode: 'continuous',
    whiteBalanceMode: 'continuous',
  };

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
            onUserMediaError={(err) => {
              console.error('Camera error:', err);
              setCameraError('Camera access error');
            }}
          />
          
          {scanning && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-blue-500 rounded-md">
                <div className="absolute inset-0 border border-blue-500 opacity-20"></div>
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500 opacity-50 transform -translate-y-1/2 animate-pulse"></div>
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

export default QRScanner; 