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
    
    // First get the employee's name
    const { data: employee } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', employeeId)
      .single();
    
    if (!employee) {
      throw new Error('Employee not found');
    }
    
    const employeeName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
    
    // Use a default system UUID for created_by since we don't have authentication yet
    // This is a temporary solution until authentication is implemented
    const systemUserId = '00000000-0000-0000-0000-000000000000'; // Default system user ID
    
    // Insert directly into the gate_passes table instead of using RPC function
    const { data, error } = await supabase
      .from('gate_passes')
      .insert({
        employee_id: employeeId,
        pass_code: passCode,
        employee_name: employeeName,
        validity: validity,
        type: type,
        reason: reason,
        created_by: systemUserId, // Use the system user ID
        expires_at: expirationDate.toISOString(),
        status: 'active'
      })
      .select('*')
      .single();
      
    if (error) {
      console.error('Error creating gate pass:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to create gate pass');
    }
    
    return {
      id: data.id,
      employeeId: data.employee_id,
      employeeName: employeeName,
      passCode: data.pass_code,
      validity: data.validity,
      type: data.type,
      reason: data.reason,
      status: data.status,
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
    console.log('Verifying gate pass with identifier:', passIdentifier);
    
    if (!passIdentifier || passIdentifier.trim() === '') {
      return {
        verified: false,
        message: 'Invalid gate pass identifier. No pass ID or code provided.'
      };
    }
    
    // Determine if the passIdentifier is a UUID or a pass code
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(passIdentifier);
    
    // Build the query based on the identifier type
    let query = supabase
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
      `);
    
    if (isUUID) {
      query = query.eq('id', passIdentifier);
    } else {
      query = query.eq('pass_code', passIdentifier);
    }
    
    // Execute the query
    const { data: pass, error } = await query.maybeSingle();
    
    console.log('Gate pass query result:', { pass, error });
      
    if (error) {
      console.error('Error querying gate pass:', error);
      return {
        verified: false,
        message: 'Error verifying gate pass. Please try again.'
      };
    }
    
    if (!pass) {
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
          validity: pass.validity,
          type: pass.type,
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
          validity: pass.validity,
          type: pass.type,
          reason: pass.reason,
          status: pass.status,
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
          validity: pass.validity,
          type: pass.type,
          reason: pass.reason,
          status: pass.status,
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
        validity: pass.validity,
        type: pass.type,
        reason: pass.reason,
        status: pass.validity === 'single' ? 'used' : pass.status,
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
