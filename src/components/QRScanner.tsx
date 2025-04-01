
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
import { recordAttendanceCheckIn, recordAttendanceCheckOut } from '@/utils/attendanceUtils';

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
  const scanCooldown = 1500; // Reduced from 3000ms to 1500ms for faster response
  const [isProcessing, setIsProcessing] = useState(false); // Added to prevent multiple scans being processed simultaneously

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

    // Start scanning as soon as component mounts
    if (scanning && !rafId.current) {
      rafId.current = requestAnimationFrame(scanQRCode);
    }

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []);

  const processQRCode = useCallback(async (qrData: any) => {
    // If already processing a scan, don't start another
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // If onScan is provided, use it instead of the default processing
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
            if (typeof qrData === 'string' && qrData.trim() !== '') {
              try {
                const parsedData = JSON.parse(qrData);
                passIdentifier = parsedData.passId || parsedData.passCode || parsedData.id || qrData;
              } catch (e) {
                // If parsing fails, use the raw string
                console.log('Not a JSON QR code, using raw value:', qrData);
                passIdentifier = qrData;
              }
            } else if (qrData && typeof qrData === 'object') {
              passIdentifier = qrData.passId || qrData.passCode || qrData.id || '';
            }
          } catch (e) {
            // If any error occurs, use the raw string if it's a string
            console.log('Error processing QR code data, using raw value:', qrData);
            if (typeof qrData === 'string') {
              passIdentifier = qrData;
            }
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
          // Attendance processing - auto determine check-in or check-out
          let employeeData: any = null;
          let employeeId: string | null = null;
          
          try {
            // Handle both string and object QR codes
            if (typeof qrData === 'string' && qrData.trim() !== '') {
              // First try to parse as JSON
              try {
                employeeData = JSON.parse(qrData);
                employeeId = employeeData.id;
              } catch (e) {
                console.log("Not a JSON format, checking if it's a valid employee ID:", qrData);
                // If not JSON, check if the string itself might be a valid UUID
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qrData)) {
                  employeeId = qrData;
                } else {
                  // Last resort: check if the string contains any employee info
                  const employee = await getEmployeeById(qrData);
                  if (employee) {
                    employeeId = employee.id;
                  } else {
                    throw new Error("Invalid employee QR code");
                  }
                }
              }
            } else if (qrData && typeof qrData === 'object') {
              employeeId = qrData.id;
            }
            
            if (!employeeId) {
              throw new Error("Invalid employee QR code");
            }
          } catch (error) {
            console.error("Error processing QR data:", error);
            throw new Error("Invalid QR code format or employee not found");
          }
          
          // Check if employee has already checked in today
          const today = new Date().toISOString().split('T')[0];
          const { data: existingRecord, error } = await supabase
            .from('attendance')
            .select('check_in_time, check_out_time')
            .eq('employee_id', employeeId)
            .eq('date', today)
            .maybeSingle();
          
          let success = false;
          let actionMessage = '';
          
          // Determine action based on existing records
          if (!existingRecord) {
            // No record today - do check in
            success = await recordAttendanceCheckIn(employeeId);
            actionMessage = 'checked in';
          } else if (existingRecord && !existingRecord.check_out_time) {
            // Record exists but no check-out time - do check out
            success = await recordAttendanceCheckOut(employeeId);
            actionMessage = 'checked out';
          } else if (existingRecord && existingRecord.check_out_time) {
            // Already checked in and out
            toast({
              title: "Already Completed",
              description: "You have already checked in and out today.",
              variant: "destructive",
            });
            setIsProcessing(false);
            return;
          }
          
          if (!success) {
            // The recordAttendance functions handle their own toast notifications
            setIsProcessing(false);
            return;
          }
          
          const employee = await getEmployeeById(employeeId);
          
          if (!employee) {
            throw new Error("Employee not found");
          }
          
          // Show success message using SweetAlert
          Swal.fire({
            title: `${actionMessage === 'checked in' ? 'Check-in' : 'Check-out'} Successful!`,
            text: `${employee.firstName} ${employee.lastName} ${actionMessage} successfully at ${new Date().toLocaleTimeString()}`,
            icon: 'success',
            timer: 3000,
            showConfirmButton: false,
          });
        }
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
      
      // Pause scanning briefly
      setScanning(false);
      setTimeout(() => {
        setScanning(true);
        setIsProcessing(false);
      }, 2000);
    } catch (error) {
      console.error("Unexpected error processing QR code:", error);
      setIsProcessing(false);
    }
  }, [onScan, mode, toast, isProcessing]);

  const scanQRCode = useCallback(() => {
    if (!scanning || !webcamRef.current || isProcessing) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }
    
    const now = Date.now();
    if (now - lastScanTime.current < scanCooldown) {
      rafId.current = requestAnimationFrame(scanQRCode);
      return;
    }
    
    try {
      const webcam = webcamRef.current;
      const video = webcam.video;
      
      if (!video || video.readyState !== 4) {
        rafId.current = requestAnimationFrame(scanQRCode);
        return;
      }
      
      // Make sure video dimensions are valid before proceeding
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      if (!videoWidth || !videoHeight) {
        console.log("Video dimensions not ready yet");
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
      
      // Set canvas dimensions to match video
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get the image data from the canvas
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      // Process frame with jsQR
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        console.log("QR Code detected:", code.data);
        lastScanTime.current = now;
        processQRCode(code.data);
      }
    } catch (error) {
      console.error("Error in scanQRCode:", error);
    }
    
    rafId.current = requestAnimationFrame(scanQRCode);
  }, [scanning, processQRCode, scanCooldown, isProcessing]);

  // Make sure to update the scanQRCode dependency when related states change
  useEffect(() => {
    // Cancel existing animation frame before setting a new one
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    
    // Start scanning animation frame
    if (scanning) {
      rafId.current = requestAnimationFrame(scanQRCode);
    }
    
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [scanQRCode, scanning]);

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
          <span>{mode === 'gatepass' ? 'Gate Pass Scanner' : 'Attendance Scanner'}</span>
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
              onUserMediaError={(err) => {
                console.error("Webcam error:", err);
                toast({
                  title: "Camera Error",
                  description: "Unable to access camera. Please check permissions.",
                  variant: "destructive",
                });
              }}
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
            
            {isProcessing && (
              <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg">
                  <div className="h-6 w-6 border-2 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                  <p className="mt-2 text-sm">Processing...</p>
                </div>
              </div>
            )}
          </div>
          
          <p className="text-center text-sm text-muted-foreground">
            Position the QR code within the scanning area
          </p>
          {mode === 'attendance' && (
            <p className="text-center font-medium">
              <span className="font-bold text-primary">Automatic Check-In/Out</span> - Scan your QR code to record attendance
            </p>
          )}
          
          {/* Debug information - hidden in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
              <p>Camera: {selectedCamera || 'None selected'}</p>
              <p>Facing mode: {facingMode}</p>
              <p>Status: {scanning ? 'Scanning' : 'Paused'}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default QRScanner;
