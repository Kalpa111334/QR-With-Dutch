
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
  const scanCooldown = 300; // Faster response but prevent duplicate scans
  const [isProcessing, setIsProcessing] = useState(false);
  const processingTimeout = useRef<NodeJS.Timeout | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    // Get available cameras
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setCameras(videoDevices);
        
        if (videoDevices.length > 0) {
          // Try to find a back camera first
          const backCamera = videoDevices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear')
          );
          
          setSelectedCamera(backCamera?.deviceId || videoDevices[0].deviceId);
          setCameraError(null);
        } else {
          setCameraError("No cameras found on your device");
        }
      } catch (error) {
        console.error("Error accessing cameras:", error);
        setCameraError("Unable to access camera devices. Please check permissions.");
        toast({
          title: "Camera Error",
          description: "Unable to access camera devices. Please check your permissions.",
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
      if (processingTimeout.current) {
        clearTimeout(processingTimeout.current);
        processingTimeout.current = null;
      }
    };
  }, []);

  // Reset and restart scanning when camera or facing mode changes
  useEffect(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    
    if (scanning) {
      rafId.current = requestAnimationFrame(scanQRCode);
    }
    
    // Reset last result when changing camera
    setLastResult(null);
  }, [selectedCamera, facingMode]);

  const processQRCode = useCallback(async (qrData: any) => {
    // Avoid duplicate scans with same content
    if (qrData === lastResult) {
      return;
    }
    
    // If already processing a scan, don't start another
    if (isProcessing) return;
    
    setIsProcessing(true);
    setLastResult(qrData);
    console.log("Processing QR code data:", qrData);
    
    // Setup a timeout to reset processing state after 5 seconds as a failsafe
    if (processingTimeout.current) {
      clearTimeout(processingTimeout.current);
    }
    
    processingTimeout.current = setTimeout(() => {
      console.log("Processing timeout reached, resetting state");
      setIsProcessing(false);
      setLastResult(null);
    }, 5000);
    
    try {
      // If onScan is provided, use it instead of the default processing
      if (onScan && typeof qrData === 'string') {
        onScan(qrData);
        setScanning(false);
        setTimeout(() => {
          setScanning(true);
          setIsProcessing(false);
          setLastResult(null);
        }, 1500);
        return;
      }
      
      try {
        // Handle different scanner modes
        if (mode === 'gatepass') {
          // For gate pass scanning
          let passIdentifier = typeof qrData === 'string' ? qrData : '';
          
          // The QR code might contain a JSON object with passId or passCode
          if (typeof qrData === 'string') {
            try {
              // Check if it's a valid JSON string
              if (qrData.trim().startsWith('{') && qrData.trim().endsWith('}')) {
                const parsedData = JSON.parse(qrData);
                // Use either passId or passCode, whichever is available
                if (parsedData.passId) {
                  passIdentifier = parsedData.passId;
                  console.log("Using passId from QR data:", passIdentifier);
                } else if (parsedData.id) {
                  passIdentifier = parsedData.id;
                  console.log("Using id from QR data:", passIdentifier);
                } else if (parsedData.passCode) {
                  passIdentifier = parsedData.passCode;
                  console.log("Using passCode from QR data:", passIdentifier);
                }
              } else {
                console.log('Not a JSON QR code, using raw value:', qrData);
              }
            } catch (e) {
              console.log('Error parsing QR code JSON:', e);
              // Try to find UUID pattern in the string
              const uuidMatch = qrData.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
              if (uuidMatch) {
                passIdentifier = uuidMatch[0];
                console.log('Found UUID in QR string:', passIdentifier);
              }
            }
          }
          
          if (!passIdentifier) {
            throw new Error("Invalid gate pass QR code");
          }
          
          console.log("Verifying gate pass with identifier:", passIdentifier);
          
          // Verify the gate pass
          const verification = await verifyGatePass(passIdentifier);
          console.log("Gate pass verification result:", verification);
          
          if (verification.verified) {
            // Show success message
            Swal.fire({
              title: 'Success!',
              text: verification.message || 'Gate pass verified successfully.',
              icon: 'success',
              timer: 3000,
              showConfirmButton: false,
            });
          } else {
            // Show error for invalid pass
            Swal.fire({
              title: 'Invalid Pass',
              text: verification.message || 'Pass verification failed',
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
                if (qrData.trim().startsWith('{') && qrData.trim().endsWith('}')) {
                  employeeData = JSON.parse(qrData);
                  employeeId = employeeData.id;
                  console.log("Parsed employee data from QR:", employeeData);
                } else {
                  // Try to find UUID pattern in the string
                  const uuidMatch = qrData.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
                  if (uuidMatch) {
                    employeeId = uuidMatch[0];
                    console.log('Found UUID in QR string:', employeeId);
                  } else {
                    console.log("Not a UUID format, checking if it's a valid employee ID:", qrData);
                    // If not UUID, check if the string itself might be a valid identifier
                    const employee = await getEmployeeById(qrData);
                    if (employee) {
                      employeeId = employee.id;
                      console.log("Found employee by ID lookup:", employeeId);
                    }
                  }
                }
              } catch (e) {
                console.log("Error parsing QR data:", e);
              }
            } else if (qrData && typeof qrData === 'object') {
              employeeId = qrData.id;
              console.log("Extracted employee ID from object:", employeeId);
            }
            
            if (!employeeId) {
              throw new Error("Invalid employee QR code or employee not found");
            }
          } catch (error) {
            console.error("Error processing QR data:", error);
            throw new Error("Invalid QR code format or employee not found");
          }
          
          // Check if employee exists before proceeding
          const employee = await getEmployeeById(employeeId);
          if (!employee) {
            throw new Error("Employee not found");
          }
          console.log("Found employee:", employee);
          
          // Check if employee has already checked in today
          const today = new Date().toISOString().split('T')[0];
          const { data: existingRecord, error } = await supabase
            .from('attendance')
            .select('check_in_time, check_out_time')
            .eq('employee_id', employeeId)
            .eq('date', today)
            .maybeSingle();
          
          console.log("Existing attendance record:", existingRecord);
          
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
            Swal.fire({
              title: "Already Completed",
              text: "You have already checked in and out today.",
              icon: "info",
              timer: 3000,
              showConfirmButton: false,
            });
            setIsProcessing(false);
            if (processingTimeout.current) {
              clearTimeout(processingTimeout.current);
              processingTimeout.current = null;
            }
            setTimeout(() => {
              setLastResult(null); // Reset after timeout to allow rescanning
            }, 2000);
            return;
          }
          
          if (!success) {
            // Failed to record attendance
            Swal.fire({
              title: "Error",
              text: `Failed to ${actionMessage === 'checked in' ? 'check in' : 'check out'}. Please try again.`,
              icon: "error",
              timer: 3000,
              showConfirmButton: false,
            });
            setIsProcessing(false);
            if (processingTimeout.current) {
              clearTimeout(processingTimeout.current);
              processingTimeout.current = null;
            }
            setTimeout(() => {
              setLastResult(null); // Reset after timeout to allow rescanning
            }, 2000);
            return;
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
        if (processingTimeout.current) {
          clearTimeout(processingTimeout.current);
          processingTimeout.current = null;
        }
        setLastResult(null); // Reset last result to allow rescanning
      }, 1500);
    } catch (error) {
      console.error("Unexpected error processing QR code:", error);
      setIsProcessing(false);
      if (processingTimeout.current) {
        clearTimeout(processingTimeout.current);
        processingTimeout.current = null;
      }
      setLastResult(null);
    }
  }, [onScan, mode, toast, isProcessing, lastResult]);

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
        rafId.current = requestAnimationFrame(scanQRCode);
        return;
      }
      
      // Create a virtual canvas to process the video frame
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      
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
      
      // Process frame with jsQR with increased inversionAttempts for better detection
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      
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
    // Reset last result when toggling scanning
    setLastResult(null);
  };

  const handleFlipCamera = () => {
    // Reset last result when changing camera
    setLastResult(null);
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const videoConstraints = {
    deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
    facingMode: facingMode,
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 shadow-lg border border-slate-200 dark:border-slate-700">
      <CardHeader className="px-4 py-3 md:px-6 md:py-4">
        <CardTitle className="flex justify-between items-center text-base md:text-lg flex-wrap gap-2">
          <span className="flex items-center">
            <Scan className="h-4 w-4 mr-2" />
            {mode === 'gatepass' ? 'Gate Pass Scanner' : 'Attendance Scanner'}
          </span>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleFlipCamera}
              className="flex items-center gap-1 bg-white dark:bg-slate-800 h-8 px-2 md:px-3"
            >
              <SwitchCamera className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">{facingMode === 'user' ? 'Rear' : 'Front'}</span>
            </Button>
            <Button 
              variant={scanning ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleScanning}
              className="h-8 px-2 md:px-3"
            >
              <Power className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">{scanning ? "Pause" : "Resume"}</span>
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 md:p-6">
        <div className="space-y-3 md:space-y-4">
          {cameras.length > 1 && (
            <select
              className="w-full p-1.5 md:p-2 text-xs md:text-sm border rounded-md bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white p-4 text-center">
                <div className="space-y-3">
                  <Camera className="h-8 w-8 mx-auto text-red-500" />
                  <p>{cameraError}</p>
                  <Button 
                    size="sm" 
                    onClick={() => window.location.reload()}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : (
              <Webcam
                ref={webcamRef}
                audio={false}
                videoConstraints={videoConstraints}
                className="w-full h-full object-cover"
                onUserMediaError={(err) => {
                  console.error("Webcam error:", err);
                  setCameraError("Unable to access camera. Please check permissions.");
                  toast({
                    title: "Camera Error",
                    description: "Unable to access camera. Please check permissions.",
                    variant: "destructive",
                  });
                }}
              />
            )}
            
            {scanning && !cameraError && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 border-4 border-blue-500 opacity-20"></div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-blue-500 rounded-md">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-500"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-500"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-500"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-500"></div>
                </div>
                <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500 opacity-50 transform -translate-y-1/2 animate-pulse"></div>
              </div>
            )}
            
            {!scanning && !cameraError && (
              <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                <p className="text-white text-xl font-bold">Scanner Paused</p>
              </div>
            )}
            
            {isProcessing && (
              <div className="absolute bottom-4 right-4 p-2 bg-black/70 rounded-md text-white flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Processing...</span>
              </div>
            )}
          </div>
          
          <p className="text-center text-xs md:text-sm text-muted-foreground">
            Position the QR code within the scanning area
          </p>
          {mode === 'attendance' && (
            <p className="text-center text-xs md:text-sm font-medium">
              <span className="font-bold text-primary">Automatic Check-In/Out</span> - Scan your QR code to record attendance
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default QRScanner;
