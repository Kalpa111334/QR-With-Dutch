
import React, { useState } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScannerOverlayProps {
  scanStatus: 'idle' | 'processing' | 'success' | 'error';
  errorMessage?: string;
  successMessage?: string;
  onClose?: () => void;
}

const ScannerOverlay: React.FC<ScannerOverlayProps> = ({
  scanStatus,
  errorMessage = 'Failed to process scan',
  successMessage = 'Scan successful',
  onClose
}) => {
  const [visible, setVisible] = useState(scanStatus !== 'idle');

  React.useEffect(() => {
    if (scanStatus !== 'idle') {
      setVisible(true);
    }

    // Auto-hide success message after 2 seconds
    if (scanStatus === 'success') {
      const timer = setTimeout(() => {
        setVisible(false);
        if (onClose) onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [scanStatus, onClose]);

  if (!visible) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && scanStatus !== 'processing') {
          setVisible(false);
          if (onClose) onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full p-6 shadow-xl">
        {scanStatus === 'processing' && (
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-lg font-medium text-center">Processing scan...</p>
          </div>
        )}

        {scanStatus === 'success' && (
          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-lg font-medium text-center">{successMessage}</p>
          </div>
        )}

        {scanStatus === 'error' && (
          <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/30">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-lg font-medium text-center">{errorMessage}</p>
            <button 
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md text-sm"
              onClick={() => {
                setVisible(false);
                if (onClose) onClose();
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScannerOverlay;
