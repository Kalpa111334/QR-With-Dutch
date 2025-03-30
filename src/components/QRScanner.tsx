import React, { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import Swal from 'sweetalert2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getEmployeeById } from '@/utils/employeeUtils';
import { SwitchCamera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { verifyGatePass } from '@/utils/gatePassUtils';

interface QRScannerProps {
  onScan?: (result: string) => void; // Making this prop optional
  mode?: 'attendance' | 'gatepass'; // New prop to determine scanner mode
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, mode = 'attendance' }) => {
  const webcamRef = useRef<Webcam>(null);
  const [scanning, setScanning] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment'); 
  const { toast } = useToast();
  const rafId = useRef<number | null>(null);
  const lastScanTime = useRef<number>(0);
  const scanCooldown = 3000; // 3 seconds between scans

  useEffect(() => {
    // Get available cameras
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error accessing cameras:", error);
        toast({
          title: "Camera Error",
          description: "Unable to access camera devices",
          variant: "destructive",
        });
      }
    };

    getCameras();

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [toast]);

  const processQRCode = useCallback(async (qrData: any) => {
    // If onScan is provided, use it instead of the default attendance processing
    if (onScan && typeof qrData === 'string') {
      onScan(qrData);
      return;
    }
    
    try {
      // Handle different scanner modes
      if (mode === 'gatepass') {
        // For gate pass scanning
        let passIdentifier = typeof qrData === 'string' ? qrData : '';
        
        try {
          // Try to parse as JSON if it's a string
          if (typeof qrData === 'string') {
            const parsedData = JSON.parse(qrData);
            passIdentifier = parsedData.passId || parsedData.passCode || parsedData.id || qrData;
          } else if (qrData && typeof qrData === 'object') {
            passIdentifier = qrData.passId || qrData.passCode || qrData.id || '';
          }
        } catch (e) {
          // If parsing fails, use the raw string
          console.log('Not a JSON QR code, using raw value');
        }
        
        if (!passIdentifier) {
          throw new Error("Invalid gate pass QR code");
        }
        
        // Verify the gate pass
        const verification = await verifyGatePass(passIdentifier);
        
        if (verification.verified) {
          // Show success message
          Swal.fire({
            title: 'Success!',
            text: 'Successfully, you can leave now.',
            icon: 'success',
            timer: 3000,
            showConfirmButton: false,
          });
        } else {
          // Show error for invalid pass
          Swal.fire({
            title: 'Invalid Pass',
            text: verification.message,
            icon: 'error',
            timer: 3000,
            showConfirmButton: false,
          });
        }
        
      } else {
        // Default attendance processing
        const employeeData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
        
        // Add attendance record
        const { data: attendance, error } = await supabase
          .from('attendance')
          .insert({
            employee_id: employeeData.id,
            date: new Date().toISOString().split('T')[0],
            check_in_time: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (error) {
          throw error;
        }
        
        if (!attendance) {
          throw new Error("Failed to record attendance");
        }
        
        const employee = await getEmployeeById(employeeData.id);
        
        if (!employee) {
          throw new Error("Employee not found");
        }
        
        // Show success message using SweetAlert
        Swal.fire({
          title: 'Attendance Recorded!',
          text: `${employee.firstName} ${employee.lastName} checked in successfully at ${new Date().toLocaleTimeString()}`,
          icon: 'success',
          timer: 3000,
          showConfirmButton: false,
        });
      }
      
      // Pause scanning briefly
      setScanning(false);
      setTimeout(() => setScanning(true), 3000);
      
    } catch (error) {
      console.error("Error processing QR code:", error);
      
      Swal.fire({
        title: 'Error!',
        text: error instanceof Error ? error.message : 'Failed to process QR code',
        icon: 'error',
        timer: 3000,
        showConfirmButton: false,
      });
    }
  }, [onScan, mode]);

  const scanQRCode = useCallback(() => {
    if (!scanning || !webcamRef.current) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }
    
    const now = Date.now();
    if (now - lastScanTime.current < scanCooldown) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }
    
    const webcam = webcamRef.current;
    const video = webcam.video;
    
    if (!video || video.readyState !== 4) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }
    
    // Create a virtual canvas to process the video frame
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Process frame with jsQR
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    
    if (code) {
      try {
        lastScanTime.current = now;
        
        if (onScan) {
          // If we have an onScan callback, use the raw QR code data
          onScan(code.data);
        } else {
          // Otherwise process the QR code data directly
          processQRCode(code.data);
        }
      } catch (error) {
        console.error("Error processing scan result:", error);
      }
    }
    
    rafId.current = requestAnimationFrame(scanQRCode);
  }, [scanning, processQRCode, onScan, scanCooldown]);

  useEffect(() => {
    rafId.current = requestAnimationFrame(scanQRCode);
    
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [scanQRCode]);

  const handleToggleScanning = () => {
    setScanning(prev => !prev);
  };

  const handleFlipCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const videoConstraints = {
    deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
    facingMode: facingMode,
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>QR Code Scanner</span>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleFlipCamera}
              className="flex items-center gap-1 bg-white dark:bg-slate-800"
            >
              <SwitchCamera className="h-4 w-4" />
              <span className="hidden sm:inline">{facingMode === 'user' ? 'Rear Camera' : 'Front Camera'}</span>
            </Button>
            <Button 
              variant={scanning ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleScanning}
            >
              {scanning ? "Pause" : "Resume"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {cameras.length > 1 && (
            <select
              className="w-full p-2 border rounded-md"
              onChange={(e) => setSelectedCamera(e.target.value)}
              value={selectedCamera}
            >
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `Camera ${cameras.indexOf(camera) + 1}`}
                </option>
              ))}
            </select>
          )}
          
          <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl">
            <Webcam
              ref={webcamRef}
              audio={false}
              videoConstraints={videoConstraints}
              className="w-full h-full object-cover"
            />
            
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 border-4 border-blue-500 opacity-50 animate-pulse"></div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-blue-500"></div>
              </div>
            )}
            
            {!scanning && (
              <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                <p className="text-white text-xl font-bold">Scanner Paused</p>
              </div>
            )}
          </div>
          
          <p className="text-center text-sm text-muted-foreground">
            Position the QR code within the scanning area
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default QRScanner;
