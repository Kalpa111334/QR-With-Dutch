
import JSZip from 'jszip';
import { Employee } from '@/types';

// Helper function to generate QR code SVG data
const generateQRSVG = async (employee: Employee): Promise<string> => {
  // We need to dynamically import QRCode library here
  const QRCode = await import('qrcode');
  
  // Create QR code data that includes employee ID
  const qrCodeData = JSON.stringify({
    id: employee.id,
    name: employee.name,
    department: employee.department
  });
  
  // Generate SVG string directly using QRCode library
  try {
    // Use QRCode.toString to generate SVG string
    const svgString = await QRCode.toString(qrCodeData, {
      type: 'svg',
      width: 200,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    return svgString;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

// Generate a PNG from SVG string
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
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      // Convert the canvas to a blob and resolve
      canvas.toBlob(blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not convert canvas to blob'));
        }
      }, 'image/png');
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
  
  for (let i = 0; i < totalEmployees; i += batchSize) {
    const batch = employees.slice(i, i + batchSize);
    
    // Process each employee in the current batch
    await Promise.all(
      batch.map(async (employee) => {
        try {
          // Generate SVG QR code
          const svgData = await generateQRSVG(employee);
          
          // Convert SVG to PNG
          const pngBlob = await svgToPng(svgData);
          
          // Add to ZIP file - use a sanitized name for the file
          const safeFileName = employee.name.replace(/[^\w\s]/gi, '_').replace(/\s+/g, '_');
          zip.file(`${safeFileName}_QRCode.png`, pngBlob);
        } catch (error) {
          console.error(`Error generating QR code for ${employee.name}:`, error);
          // Continue with other employees even if one fails
        }
      })
    );
  }
  
  // Generate the ZIP file
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  
  // Create a download link and trigger download
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(zipBlob);
  downloadLink.download = 'employee_qr_codes.zip';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};
