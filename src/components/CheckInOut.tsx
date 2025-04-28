import React, { useState } from 'react';
import { Tab } from '@headlessui/react';
import Swal from 'sweetalert2';
import { QrReader } from 'react-qr-reader';

interface CheckInOutProps {
  onScan: (data: string, type: 'check-in' | 'check-out', hasGatePass: boolean) => void;
}

const CheckInOut: React.FC<CheckInOutProps> = ({ onScan }) => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [hasGatePass, setHasGatePass] = useState(false);

  const handleScan = (data: string | null) => {
    if (data) {
      const type = selectedTab === 0 ? 'check-in' : 'check-out';
      onScan(data, type, hasGatePass);
      
      // Show success message with SweetAlert2
      Swal.fire({
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Successful!`,
        text: hasGatePass ? 'Gate pass recorded' : 'Regular access recorded',
        icon: 'success',
        confirmButtonColor: '#3085d6',
        background: hasGatePass ? '#e6f3ff' : '#ffffff'
      });
    }
  };

  const handleError = (err: any) => {
    console.error(err);
    Swal.fire({
      title: 'Error',
      text: 'Failed to scan QR code',
      icon: 'error',
      confirmButtonColor: '#d33'
    });
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
        <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1">
          <Tab
            className={({ selected }) =>
              `w-full rounded-lg py-2.5 text-sm font-medium leading-5
              ${selected
                ? 'bg-white text-blue-700 shadow'
                : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
              }`
            }
          >
            Check In
          </Tab>
          <Tab
            className={({ selected }) =>
              `w-full rounded-lg py-2.5 text-sm font-medium leading-5
              ${selected
                ? 'bg-white text-blue-700 shadow'
                : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
              }`
            }
          >
            Check Out
          </Tab>
        </Tab.List>

        <div className="mt-4">
          <label className="flex items-center space-x-2 mb-4">
            <input
              type="checkbox"
              checked={hasGatePass}
              onChange={(e) => setHasGatePass(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-700">Gate Pass Required</span>
          </label>

          <div className={`p-4 rounded-lg ${hasGatePass ? 'bg-blue-50' : 'bg-white'}`}>
            <Tab.Panels>
              <Tab.Panel>
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold text-gray-800">Scan QR Code to Check In</h2>
                  {hasGatePass && (
                    <p className="text-blue-600 mt-2">Gate pass mode active</p>
                  )}
                </div>
                <div className="w-full">
                  <QrReader
                    constraints={{ facingMode: 'environment' }}
                    onResult={(result, error) => {
                      if (result?.getText()) {
                        handleScan(result.getText());
                      }
                      if (error) {
                        handleError(error);
                      }
                    }}
                  />
                </div>
              </Tab.Panel>
              <Tab.Panel>
                <div className="text-center mb-4">
                  <h2 className="text-xl font-bold text-gray-800">Scan QR Code to Check Out</h2>
                  {hasGatePass && (
                    <p className="text-blue-600 mt-2">Gate pass mode active</p>
                  )}
                </div>
                <div className="w-full">
                  <QrReader
                    constraints={{ facingMode: 'environment' }}
                    onResult={(result, error) => {
                      if (result?.getText()) {
                        handleScan(result.getText());
                      }
                      if (error) {
                        handleError(error);
                      }
                    }}
                  />
                </div>
              </Tab.Panel>
            </Tab.Panels>
          </div>
        </div>
      </Tab.Group>
    </div>
  );
};

export default CheckInOut; 