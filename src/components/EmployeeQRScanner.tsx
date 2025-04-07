import React from 'react';
import QrReader from 'react-qr-reader';
import { toast } from '@/components/ui/use-toast';

interface EmployeeQRData {
  id: string;
  type: 'employee';
  name: string;
  department: string;
}

interface Props {
  onScan: (data: EmployeeQRData) => void;
  onError?: (error: string) => void;
}

const EmployeeQRScanner: React.FC<Props> = ({ onScan, onError }) => {
  const handleScan = (data: string | null) => {
    if (data) {
      try {
        const parsedData = JSON.parse(data);
        
        // Validate that this is an employee QR code
        if (!isValidEmployeeQR(parsedData)) {
          throw new Error('Invalid employee QR code format');
        }

        onScan(parsedData as EmployeeQRData);
      } catch (error) {
        const errorMessage = 'Invalid employee QR code';
        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
        if (onError) {
          onError(errorMessage);
        }
      }
    }
  };

  const handleError = (err: any) => {
    const errorMessage = 'Error accessing camera';
    toast({
      title: 'Error',
      description: errorMessage,
      variant: 'destructive',
    });
    if (onError) {
      onError(errorMessage);
    }
  };

  const isValidEmployeeQR = (data: any): data is EmployeeQRData => {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.id === 'string' &&
      data.type === 'employee' &&
      typeof data.name === 'string' &&
      typeof data.department === 'string'
    );
  };

  return (
    <div className="relative">
      <QrReader
        delay={300}
        onError={handleError}
        onScan={handleScan}
        style={{ width: '100%' }}
        className="rounded-lg overflow-hidden"
      />
      <div className="absolute inset-0 border-2 border-dashed border-primary/50 rounded-lg pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-48 h-48 border-2 border-primary rounded-lg" />
      </div>
    </div>
  );
};

export default EmployeeQRScanner; 