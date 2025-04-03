
import JSZip from 'jszip';
import { Employee, GatePass } from '@/types';

// Helper function to generate QR code SVG data with improved error handling
const generateQRSVG = async (data: string | Record<string, any>): Promise<string> => {
  // We need to dynamically import QRCode library here
  const QRCode = await import('qrcode');
  
  // Convert object to JSON string if needed
  const qrCodeData = typeof data === 'string' ? data : JSON.stringify(data);
  
  // Generate SVG string directly using QRCode library with better settings
  try {
    // Use QRCode.toString to generate SVG string with improved settings
    const svgString = await QRCode.toString(qrCodeData, {
      type: 'svg',
      width: 300, // Increased size for better scanning
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H' // Higher error correction for better scanning
    });
    
    return svgString;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

// Generate QR code for employee with improved data
export const generateEmployeeQRSVG = async (employee: Employee): Promise<string> => {
  // Create QR code data that includes employee ID and more reliable data
  const qrCodeData = {
    id: employee.id,
    type: 'employee',
    name: employee.name || `${employee.firstName} ${employee.lastName}`,
    department: employee.department
  };
  
  return generateQRSVG(qrCodeData);
};

// Generate QR code for gate pass with improved data
export const generateGatePassQRSVG = async (pass: GatePass): Promise<string> => {
  // Create QR code data that includes pass ID and code with clear type identification
  const qrCodeData = {
    passId: pass.id,
    type: 'gatepass',
    passCode: pass.passCode,
    employeeId: pass.employeeId,
    validity: pass.validity
  };
  
  return generateQRSVG(qrCodeData);
};

// Generate a PNG from SVG string with improved quality
const svgToPng = async (svgString: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }
    
    // When the image is loaded, draw it on the canvas
    img.onload = () => {
      // Set higher resolution for better quality
      const scale = 2;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      
      // Convert the canvas to a blob and resolve
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not convert canvas to blob'));
        }
      }, 'image/png', 1.0); // Use highest quality
    };
    
    // Handle load errors
    img.onerror = () => {
      reject(new Error('Failed to load SVG as image'));
    };
    
    // Set the image source to the SVG
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    img.src = url;
  });
};

// Download all QR codes as a ZIP file
export const downloadAllQRCodes = async (employees: Employee[]): Promise<void> => {
  // Create a new ZIP file
  const zip = new JSZip();
  
  // Process employees in batches to avoid memory issues
  const batchSize = 10;
  const totalEmployees = employees.length;
  
  // Show progress to user
  let processedCount = 0;
  const progressElement = document.createElement('div');
  progressElement.style.position = 'fixed';
  progressElement.style.top = '50%';
  progressElement.style.left = '50%';
  progressElement.style.transform = 'translate(-50%, -50%)';
  progressElement.style.padding = '20px';
  progressElement.style.background = 'rgba(0,0,0,0.7)';
  progressElement.style.color = 'white';
  progressElement.style.borderRadius = '5px';
  progressElement.style.zIndex = '9999';
  document.body.appendChild(progressElement);
  
  for (let i = 0; i < totalEmployees; i += batchSize) {
    const batch = employees.slice(i, i + batchSize);
    
    // Process each employee in the current batch
    await Promise.all(
      batch.map(async (employee) => {
        try {
          // Generate SVG QR code
          const svgData = await generateEmployeeQRSVG(employee);
          
          // Convert SVG to PNG
          const pngBlob = await svgToPng(svgData);
          
          // Add to ZIP file - use a sanitized name for the file
          const safeFileName = (employee.name || `${employee.firstName}_${employee.lastName}`)
            .replace(/[^\w\s]/gi, '_').replace(/\s+/g, '_');
          zip.file(`${safeFileName}_QRCode.png`, pngBlob);
          processedCount++;
          progressElement.textContent = `Processing QR Codes: ${processedCount}/${totalEmployees}`;
        } catch (error) {
          console.error(`Error generating QR code for ${employee.name || `${employee.firstName} ${employee.lastName}`}:`, error);
          // Continue with other employees even if one fails
        }
      })
    );
  }
  
  // Generate the ZIP file
  progressElement.textContent = 'Creating ZIP file...';
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  
  // Remove progress indicator
  document.body.removeChild(progressElement);
  
  // Create a download link and trigger download
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(zipBlob);
  downloadLink.download = 'employee_qr_codes.zip';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

// Generate and download QR code for a single gate pass with improved output
export const generateQRCodeForPass = async (pass: GatePass): Promise<Blob | null> => {
  try {
    // Generate SVG QR code
    const svgData = await generateGatePassQRSVG(pass);
    
    // Convert SVG to PNG
    const pngBlob = await svgToPng(svgData);
    return pngBlob;
  } catch (error) {
    console.error('Error generating gate pass QR code:', error);
    return null;
  }
};
