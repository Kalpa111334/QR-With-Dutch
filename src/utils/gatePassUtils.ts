import { supabase } from '@/integrations/supabase/client';
import { Employee } from '@/types';
import { generateQRCodeForPass as generateQRCode } from './qrCodeUtils';

export interface GatePass {
  id: string;
  employeeId: string;
  employeeName?: string;
  passCode: string;
  validity: 'single' | 'day' | 'week' | 'month';
  type: 'entry' | 'exit' | 'both';
  reason: string;
  status: 'active' | 'used' | 'expired';
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
}

// Generate a unique pass code
export const generatePassCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Calculate expiration date based on validity
export const calculateExpirationDate = (validity: 'single' | 'day' | 'week' | 'month'): Date => {
  const expirationDate = new Date();
  
  switch (validity) {
    case 'single':
      // Single use passes expire in 24 hours
      expirationDate.setHours(expirationDate.getHours() + 24);
      break;
    case 'day':
      expirationDate.setHours(23, 59, 59, 999);
      break;
    case 'week':
      expirationDate.setDate(expirationDate.getDate() + 7);
      break;
    case 'month':
      expirationDate.setMonth(expirationDate.getMonth() + 1);
      break;
  }
  
  return expirationDate;
};

// Create a new gate pass
export const createGatePass = async (
  employeeId: string,
  validity: 'single' | 'day' | 'week' | 'month',
  type: 'entry' | 'exit' | 'both',
  reason: string
): Promise<GatePass | null> => {
  try {
    const passCode = generatePassCode();
    const expirationDate = calculateExpirationDate(validity);
    
    const { data, error } = await supabase
      .from('gate_passes')
      .insert({
        employee_id: employeeId,
        pass_code: passCode,
        validity,
        type,
        reason,
        status: 'active',
        expires_at: expirationDate.toISOString()
      })
      .select()
      .single();
      
    if (error) throw error;
    
    // Get employee name
    const { data: employee } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', employeeId)
      .single();
      
    return {
      id: data.id,
      employeeId: data.employee_id,
      employeeName: employee ? 
        `${employee.first_name || ''} ${employee.last_name || ''}`.trim() : 
        'Unknown Employee',
      passCode: data.pass_code,
      validity: data.validity as 'single' | 'day' | 'week' | 'month',
      type: data.type as 'entry' | 'exit' | 'both',
      reason: data.reason,
      status: data.status as 'active' | 'used' | 'expired',
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      usedAt: data.used_at
    };
  } catch (error) {
    console.error('Error creating gate pass:', error);
    return null;
  }
};

// Fetch all gate passes
export const getGatePasses = async (): Promise<GatePass[]> => {
  try {
    const { data: passes, error } = await supabase
      .from('gate_passes')
      .select(`
        id,
        employee_id,
        pass_code,
        validity,
        type,
        reason,
        status,
        created_at,
        expires_at,
        used_at,
        employees (id, first_name, last_name)
      `)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    // Check for expired passes and update them in the database
    const now = new Date();
    const passesWithStatus = passes.map(pass => {
      const expirationDate = new Date(pass.expires_at);
      if (pass.status === 'active' && expirationDate < now) {
        // Mark as expired in the database
        supabase
          .from('gate_passes')
          .update({ status: 'expired' })
          .eq('id', pass.id)
          .then(() => console.log(`Pass ${pass.id} marked as expired`));
          
        return { ...pass, status: 'expired' };
      }
      return pass;
    });
    
    return passesWithStatus.map(pass => ({
      id: pass.id,
      employeeId: pass.employee_id,
      employeeName: pass.employees ? 
        `${pass.employees.first_name || ''} ${pass.employees.last_name || ''}`.trim() : 
        'Unknown Employee',
      passCode: pass.pass_code,
      validity: pass.validity as 'single' | 'day' | 'week' | 'month',
      type: pass.type as 'entry' | 'exit' | 'both',
      reason: pass.reason,
      status: pass.status as 'active' | 'used' | 'expired',
      createdAt: pass.created_at,
      expiresAt: pass.expires_at,
      usedAt: pass.used_at
    }));
  } catch (error) {
    console.error('Error fetching gate passes:', error);
    return [];
  }
};

// Verify a gate pass by ID or code
export const verifyGatePass = async (passIdentifier: string): Promise<{
  verified: boolean;
  message: string;
  pass?: GatePass;
}> => {
  try {
    // Try to find the pass by ID first, then by pass code
    const { data: pass, error } = await supabase
      .from('gate_passes')
      .select(`
        id,
        employee_id,
        pass_code,
        validity,
        type,
        reason,
        status,
        created_at,
        expires_at,
        used_at,
        employees (id, first_name, last_name)
      `)
      .or(`id.eq.${passIdentifier},pass_code.eq.${passIdentifier}`)
      .single();
      
    if (error || !pass) {
      return {
        verified: false,
        message: 'Invalid gate pass. This pass does not exist.'
      };
    }
    
    const now = new Date();
    const expirationDate = new Date(pass.expires_at);
    
    // Check if expired
    if (expirationDate < now && pass.status === 'active') {
      // Mark as expired in the database
      await supabase
        .from('gate_passes')
        .update({ status: 'expired' })
        .eq('id', pass.id);
        
      return {
        verified: false,
        message: 'Expired gate pass. This pass is no longer valid.',
        pass: {
          id: pass.id,
          employeeId: pass.employee_id,
          employeeName: pass.employees ? 
            `${pass.employees.first_name || ''} ${pass.employees.last_name || ''}`.trim() : 
            'Unknown Employee',
          passCode: pass.pass_code,
          validity: pass.validity as 'single' | 'day' | 'week' | 'month',
          type: pass.type as 'entry' | 'exit' | 'both',
          reason: pass.reason,
          status: 'expired',
          createdAt: pass.created_at,
          expiresAt: pass.expires_at,
          usedAt: pass.used_at
        }
      };
    }
    
    // Check if already used (for single-use passes)
    if (pass.validity === 'single' && pass.status === 'used') {
      return {
        verified: false,
        message: 'Pass already used. This single-use pass has already been scanned.',
        pass: {
          id: pass.id,
          employeeId: pass.employee_id,
          employeeName: pass.employees ? 
            `${pass.employees.first_name || ''} ${pass.employees.last_name || ''}`.trim() : 
            'Unknown Employee',
          passCode: pass.pass_code,
          validity: pass.validity as 'single' | 'day' | 'week' | 'month',
          type: pass.type as 'entry' | 'exit' | 'both',
          reason: pass.reason,
          status: pass.status as 'active' | 'used' | 'expired',
          createdAt: pass.created_at,
          expiresAt: pass.expires_at,
          usedAt: pass.used_at
        }
      };
    }
    
    // If expired
    if (pass.status === 'expired') {
      return {
        verified: false,
        message: 'Expired gate pass. This pass is no longer valid.',
        pass: {
          id: pass.id,
          employeeId: pass.employee_id,
          employeeName: pass.employees ? 
            `${pass.employees.first_name || ''} ${pass.employees.last_name || ''}`.trim() : 
            'Unknown Employee',
          passCode: pass.pass_code,
          validity: pass.validity as 'single' | 'day' | 'week' | 'month',
          type: pass.type as 'entry' | 'exit' | 'both',
          reason: pass.reason,
          status: pass.status as 'active' | 'used' | 'expired',
          createdAt: pass.created_at,
          expiresAt: pass.expires_at,
          usedAt: pass.used_at
        }
      };
    }
    
    // Valid pass - mark as used if single-use
    if (pass.validity === 'single') {
      await supabase
        .from('gate_passes')
        .update({ 
          status: 'used', 
          used_at: new Date().toISOString() 
        })
        .eq('id', pass.id);
    }
    
    return {
      verified: true,
      message: 'Valid gate pass. Employee may proceed.',
      pass: {
        id: pass.id,
        employeeId: pass.employee_id,
        employeeName: pass.employees ? 
          `${pass.employees.first_name || ''} ${pass.employees.last_name || ''}`.trim() : 
          'Unknown Employee',
        passCode: pass.pass_code,
        validity: pass.validity as 'single' | 'day' | 'week' | 'month',
        type: pass.type as 'entry' | 'exit' | 'both',
        reason: pass.reason,
        status: pass.validity === 'single' ? 'used' : pass.status as 'active' | 'used' | 'expired',
        createdAt: pass.created_at,
        expiresAt: pass.expires_at,
        usedAt: pass.validity === 'single' ? new Date().toISOString() : pass.used_at
      }
    };
  } catch (error) {
    console.error('Error verifying gate pass:', error);
    return {
      verified: false,
      message: 'Error verifying pass. Please try again.',
    };
  }
};

// Export the QR code generation function
export { generateQRCode as generateQRCodeForPass };
