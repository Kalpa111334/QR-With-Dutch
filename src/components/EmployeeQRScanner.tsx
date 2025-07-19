import React from 'react';
import EnhancedQRScanner from './EnhancedQRScanner';

interface EmployeeQRScannerProps {
  onScanComplete?: () => void;
}

/**
 * Legacy EmployeeQRScanner component that now uses the enhanced scanner
 * with cooldown functionality and improved voice notifications.
 */
const EmployeeQRScanner: React.FC<EmployeeQRScannerProps> = ({ onScanComplete }) => {
  return (
    <EnhancedQRScanner onScanComplete={onScanComplete} />
  );
};

export default EmployeeQRScanner; 