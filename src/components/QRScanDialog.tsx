
import React, { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, XCircle } from 'lucide-react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import { parseQRCodeData } from '@/utils/qrCodeUtils';
import { useToast } from '@/components/ui/use-toast';

interface QRScanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (data: { type: 'employee' | 'gatepass' | 'unknown', id: string, additionalInfo?: string, employeeId?: string }) => void;
}

const QRScanDialog: React.FC<QRScanDialogProps> = ({ isOpen, onClose, onScanComplete }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const requestRef = useRef<number>();
  const { toast } = useToast();

  // Setup the QR code scanning
  useEffect(() => {
    if (isOpen) {
      setScanning(true);
      setError(null);
      
      // Reset camera permission state
      setCameraPermission('pending');
      
      // Check for camera permission
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(() => {
          setCameraPermission('granted');
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          setCameraPermission('denied');
          setError('Camera access denied. Please allow camera access and try again.');
        });
    } else {
      setScanning(false);
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isOpen]);

  // The scanning function
  const scanQRCode = () => {
    if (!scanning || !webcamRef.current || !canvasRef.current || cameraPermission !== 'granted') {
      return;
    }
    
    const webcam = webcamRef.current;
    const canvas = canvasRef.current;
    
    if (webcam.video && webcam.video.readyState === 4) {
      const videoWidth = webcam.video.videoWidth;
      const videoHeight = webcam.video.videoHeight;

      // Set canvas dimensions to match video dimensions
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      
      const context = canvas.getContext('2d');
      if (!context) return;
      
      // Draw the current frame from the webcam onto the canvas
      context.drawImage(webcam.video, 0, 0, videoWidth, videoHeight);
      
      // Get the image data from the canvas
      const imageData = context.getImageData(0, 0, videoWidth, videoHeight);
      
      // Scan for QR code
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        // Successfully found a QR code
        try {
          console.log("QR Code detected:", code.data);
          
          // Parse the QR code data
          const parsedData = parseQRCodeData(code.data);
          
          if (parsedData.type !== 'unknown') {
            // Stop scanning and close dialog
            setScanning(false);
            onScanComplete(parsedData);
            
            // Close the dialog after a brief delay to give visual feedback
            setTimeout(onClose, 500);
            
            return; // Stop the scanning loop
          } else {
            toast({
              title: "Invalid QR Code",
              description: "The scanned QR code is not valid for this application.",
              variant: "destructive"
            });
          }
        } catch (err) {
          console.error("Error processing QR code:", err);
        }
      }
    }
    
    // Continue scanning in the next animation frame
    requestRef.current = requestAnimationFrame(scanQRCode);
  };

  // Start scanning when camera is ready
  useEffect(() => {
    if (cameraPermission === 'granted' && scanning) {
      requestRef.current = requestAnimationFrame(scanQRCode);
    }
  }, [cameraPermission, scanning]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden bg-white dark:bg-gray-900">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Scan QR Code</DialogTitle>
        </DialogHeader>
        
        <div className="relative">
          {cameraPermission === 'granted' ? (
            <>
              <div className="relative w-full aspect-square">
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/png"
                  videoConstraints={{
                    facingMode: "environment"
                  }}
                  className="w-full h-full object-cover"
                />
                
                {/* Overlay scanner UI */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2/3 h-2/3 border-2 border-primary rounded-lg relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg"></div>
                  </div>
                </div>
                
                {/* Hidden canvas used for QR code detection */}
                <canvas ref={canvasRef} className="hidden" />
              </div>
              
              <div className="p-4 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Position the QR code within the frame to scan
                </p>
                <Button 
                  variant="outline" 
                  onClick={onClose}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : cameraPermission === 'denied' ? (
            <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
              <XCircle className="h-12 w-12 text-destructive" />
              <h3 className="text-lg font-semibold">Camera Access Denied</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Please allow camera access in your browser settings and try again.
              </p>
              <Button variant="default" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <div className="p-8 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p>Requesting camera access...</p>
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 flex items-center gap-2 text-red-800 dark:text-red-300">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRScanDialog;
