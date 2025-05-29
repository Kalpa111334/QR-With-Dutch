import React from 'react';
import { QrScanner } from 'react-qr-scanner';
import { useToast } from "@/components/ui/use-toast";

interface EmployeeQRData {
  id: string;
  name: string;
  email: string;
  department: string;
}

interface EmployeeQRScannerProps {
  onScan: (data: EmployeeQRData) => void;
  className?: string;
}

export function EmployeeQRScanner({ onScan, className }: EmployeeQRScannerProps) {
  const { toast } = useToast();

  const handleError = (error: Error) => {
    console.error('QR Scanner error:', error);
    toast({
      variant: "destructive",
      title: "Scanner Error",
      description: error.message || "Failed to access camera"
    });
  };

  const handleScan = (data: string | null) => {
    if (data) {
      try {
        const parsedData = JSON.parse(data) as EmployeeQRData;
        onScan(parsedData);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Invalid QR Code",
          description: "The scanned QR code is not in the correct format"
        });
      }
    }
  };

  return (
    <div className={className}>
      <QrScanner
        delay={300}
        onError={handleError}
        onScan={handleScan}
        style={{ width: '100%', height: '100%' }}
        constraints={{
          audio: false,
          video: { facingMode: "environment" }
        }}
      />
    </div>
  );
}

export default EmployeeQRScanner; 