import JSZip from 'jszip';
import { Employee, GatePass } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// Cache for QR code validation results
const validationCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Optimized QR code generation with caching
const qrCodeCache = new Map<string, { svg: string; timestamp: number }>();

// Helper function to generate QR code SVG data with improved error handling and caching
const generateQRSVG = async (data: string | Record<string, any>): Promise<string> => {
  const cacheKey = typeof data === 'string' ? data : JSON.stringify(data);
  const cached = qrCodeCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.svg;
  }
  
  try {
    const QRCode = await import('qrcode');
    const qrCodeData = typeof data === 'string' ? data : JSON.stringify(data);
    
    const svgString = await QRCode.toString(qrCodeData, {
      type: 'svg',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H',
      rendererOpts: {
        quality: 1
      }
    });
    
    qrCodeCache.set(cacheKey, { svg: svgString, timestamp: Date.now() });
    return svgString;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

// Optimized employee QR code generation
export const generateEmployeeQRSVG = async (employee: Employee): Promise<string> => {
  const qrCodeData = generateLegacyQR(employee);
  return generateQRSVG(qrCodeData);
};

// Optimized gate pass QR code generation
export const generateGatePassQRSVG = async (pass: GatePass): Promise<string> => {
  const qrCodeData = JSON.stringify({
    type: 'gatepass',
    id: pass.id,
    passCode: pass.passCode,
    employeeId: pass.employeeId
  });
  return generateQRSVG(qrCodeData);
};

// Optimized legacy QR format generation
const generateLegacyQR = (employee: { id: string; name: string }): string => {
  return `EMP:${employee.id}:${employee.name.replace(/[^a-zA-Z0-9 ]/g, '')}`;
};

export const generateEmployeeQR = (employee: { id: string; name: string; email: string; department: string }): string => {
  return generateLegacyQR(employee);
};

// Optimized QR code validation with caching
export const validateEmployeeQR = async (qrData: string): Promise<boolean> => {
  // Check cache first
  const cached = validationCache.get(qrData);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.result;
  }

  try {
    const legacyMatch = qrData.match(/^EMP:([^:]+):(.+)$/);
    if (!legacyMatch) {
      validationCache.set(qrData, { result: false, timestamp: Date.now() });
      return false;
    }

      const [, employeeId] = legacyMatch;
      
      const { data: employee, error } = await supabase
        .from('employees')
        .select('id, status')
        .eq('id', employeeId)
        .eq('status', 'active')
        .single();

    const isValid = !error && !!employee;
    validationCache.set(qrData, { result: isValid, timestamp: Date.now() });
    return isValid;
  } catch (error) {
    console.error('Error validating QR code:', error);
    return false;
  }
};

// Optimized QR code parsing with validation
export const parseQRCodeData = (qrData: string): { type: 'employee' | 'unknown', id: string } => {
  try {
    const legacyMatch = qrData.match(/^EMP:([^:]+):(.+)$/);
    if (legacyMatch) {
      return { type: 'employee', id: legacyMatch[1] };
    }
    return { type: 'unknown', id: '' };
  } catch (error) {
    console.error('Error parsing QR code:', error);
    return { type: 'unknown', id: '' };
  }
};

// Optimized PNG conversion with WebWorker support
const createWorkerBlob = () => {
  const workerCode = `
    self.onmessage = function(e) {
      const { svgString, width, height, scale } = e.data;
      const img = new Image();
      img.onload = function() {
        const canvas = new OffscreenCanvas(width * scale, height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        
        canvas.convertToBlob({ type: 'image/png', quality: 1 })
          .then(blob => self.postMessage({ blob }))
          .catch(error => self.postMessage({ error: error.message }));
      };
      img.onerror = function() {
        self.postMessage({ error: 'Failed to load SVG' });
      };
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
      img.src = URL.createObjectURL(svgBlob);
    };
  `;
  return new Blob([workerCode], { type: 'application/javascript' });
};

const svgToPng = async (svgString: string): Promise<Blob> => {
  if (typeof Worker !== 'undefined') {
    return new Promise((resolve, reject) => {
      const workerBlob = createWorkerBlob();
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      
      worker.onmessage = (e) => {
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.blob);
        }
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
      
      worker.postMessage({
        svgString,
        width: 400,
        height: 400,
        scale: 2
      });
    });
  }
  
  // Fallback for environments without Worker support
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }
    
    img.onload = () => {
      const scale = 2;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Could not convert canvas to blob')),
        'image/png',
        1.0
      );
    };
    
    img.onerror = () => reject(new Error('Failed to load SVG'));
    
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    img.src = URL.createObjectURL(svgBlob);
  });
};

// Optimized batch processing for QR code generation
export const downloadAllQRCodes = async (employees: Employee[]): Promise<void> => {
  const zip = new JSZip();
  const batchSize = 10;
  const totalEmployees = employees.length;
  let processedCount = 0;
  
  const progressElement = document.createElement('div');
  Object.assign(progressElement.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '20px',
    background: 'rgba(0,0,0,0.7)',
    color: 'white',
    borderRadius: '5px',
    zIndex: '9999'
  });
  document.body.appendChild(progressElement);
  
  try {
  for (let i = 0; i < totalEmployees; i += batchSize) {
    const batch = employees.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (employee) => {
        try {
          const svgData = await generateEmployeeQRSVG(employee);
          const pngBlob = await svgToPng(svgData);
          
            const safeFileName = `${employee.id}_${(employee.name || `${employee.first_name}_${employee.last_name}`)
              .replace(/[^\w\s]/gi, '_')
              .replace(/\s+/g, '_')}_QRCode.png`;
            
            zip.file(safeFileName, pngBlob);
          processedCount++;
          progressElement.textContent = `Processing QR Codes: ${processedCount}/${totalEmployees}`;
        } catch (error) {
            console.error(`Error processing QR code for employee ${employee.id}:`, error);
        }
      })
    );
  }
  
  progressElement.textContent = 'Creating ZIP file...';
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });
    
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(zipBlob);
    downloadLink.download = `employee_qr_codes_${Date.now()}.zip`;
  downloadLink.click();
    URL.revokeObjectURL(downloadLink.href);
  } finally {
    document.body.removeChild(progressElement);
  }
};

// Optimized gate pass QR code generation
export const generateQRCodeForPass = async (pass: GatePass): Promise<Blob | null> => {
  try {
    const svgData = await generateGatePassQRSVG(pass);
    return await svgToPng(svgData);
  } catch (error) {
    console.error('Error generating gate pass QR code:', error);
    return null;
  }
};
