import { supabase } from '@/integrations/supabase/client';
import { Employee, GatePass } from '@/types';
import { generateQRCodeForPass as generateQRCode } from './qrCodeUtils';

// Generate a unique pass code with better uniqueness guarantee
export const generatePassCode = (): string => {
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const timestampPart = Date.now().toString(36).substring(-4).toUpperCase();
  return `${randomPart}-${timestampPart}`;
};

// Calculate expiration date based on validity with more precise timing
export const calculateExpirationDate = (validity: 'single' | 'day' | 'week' | 'month'): Date => {
  const expirationDate = new Date();
  
  switch (validity) {
    case 'single':
      // Single use passes expire in 24 hours
      expirationDate.setHours(expirationDate.getHours() + 24);
      break;
    case 'day':
      // Set to end of current day (23:59:59.999)
      expirationDate.setHours(23, 59, 59, 999);
      break;
    case 'week':
      // Add 7 days and set to end of that day
      expirationDate.setDate(expirationDate.getDate() + 7);
      expirationDate.setHours(23, 59, 59, 999);
      break;
    case 'month':
      // Add 1 month and set to end of that day
      expirationDate.setMonth(expirationDate.getMonth() + 1);
      expirationDate.setHours(23, 59, 59, 999);
      break;
  }
  
  return expirationDate;
};

// Create a new gate pass with improved error handling
export const createGatePass = async (
  employeeId: string,
  validity: 'single' | 'day' | 'week' | 'month',
  type: 'entry' | 'exit' | 'both',
  reason: string
): Promise<GatePass | null> => {
  try {
    const passCode = generatePassCode();
    const expirationDate = calculateExpirationDate(validity);
    
    // First get the employee's name with better error handling
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('first_name, last_name')
      .eq('id', employeeId)
      .maybeSingle();
    
    if (employeeError) {
      console.error('Error fetching employee:', employeeError);
      throw new Error('Error fetching employee data');
    }
    
    if (!employee) {
      throw new Error('Employee not found');
    }
    
    const employeeName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
    
    // Use a default system UUID for created_by since we don't have authentication yet
    // This is a temporary solution until authentication is implemented
    const systemUserId = '00000000-0000-0000-0000-000000000000'; // Default system user ID
    
    console.log('Creating gate pass with data:', {
      employeeId,
      passCode,
      employeeName,
      validity,
      type,
      reason,
      systemUserId,
      expirationDate
    });
    
    // Insert directly using RPC function to bypass RLS temporarily
    const { data, error } = await supabase.rpc('create_gate_pass', {
      p_employee_id: employeeId,
      p_pass_code: passCode,
      p_employee_name: employeeName,
      p_validity: validity,
      p_type: type,
      p_reason: reason,
      p_created_by: systemUserId,
      p_expires_at: expirationDate.toISOString()
    });
      
    if (error) {
      console.error('Error creating gate pass:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to create gate pass');
    }
    
    console.log('Gate pass created successfully:', data);
    
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

// Fetch all gate passes with improved performance
export const getGatePasses = async (): Promise<GatePass[]> => {
  try {
    console.log('Fetching gate passes');
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
      
    if (error) {
      console.error('Error fetching gate passes:', error);
      throw error;
    }
    
    console.log(`Retrieved ${passes.length} gate passes`);
    
    // Check for expired passes and update them in the database
    const now = new Date();
    const passesToUpdate = [];
    const passesWithStatus = passes.map(pass => {
      const expirationDate = new Date(pass.expires_at);
      if (pass.status === 'active' && expirationDate < now) {
        // Mark for update
        passesToUpdate.push(pass.id);
        return { ...pass, status: 'expired' };
      }
      return pass;
    });
    
    // Batch update expired passes
    if (passesToUpdate.length > 0) {
      console.log(`Updating ${passesToUpdate.length} expired passes`);
      const { error: updateError } = await supabase
        .from('gate_passes')
        .update({ status: 'expired' })
        .in('id', passesToUpdate);
      
      if (updateError) {
        console.error('Error updating expired passes:', updateError);
      }
    }
    
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
      status: pass.status as 'active' | 'used' | 'expired' | 'revoked',
      createdAt: pass.created_at,
      expiresAt: pass.expires_at,
      usedAt: pass.used_at
    }));
  } catch (error) {
    console.error('Error fetching gate passes:', error);
    return [];
  }
};

// Verify a gate pass by code - completely rewritten for more reliable verification
export const verifyGatePass = async (passCode: string): Promise<{
  verified: boolean;
  message: string;
  pass?: GatePass;
}> => {
  try {
    console.log('Verifying gate pass with code:', passCode);
    
    if (!passCode || passCode.trim() === '') {
      return {
        verified: false,
        message: 'Invalid gate pass code. Please enter a valid code.'
      };
    }
    
    // Clean up the pass code to handle potential formatting issues
    const cleanPassCode = passCode.trim().toUpperCase();
    console.log('Cleaned pass code for verification:', cleanPassCode);
    
    // First try exact match (case insensitive)
    let { data: passes, error } = await supabase
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
      .ilike('pass_code', cleanPassCode);
    
    if (error) {
      console.error('Error querying gate pass:', error);
      return {
        verified: false,
        message: 'Error verifying gate pass. Please try again.'
      };
    }
    
    console.log('Gate pass query results:', passes);
    
    // If no passes found with exact match, try with more flexible matching
    if (!passes || passes.length === 0) {
      console.log('No exact match found, trying flexible match');
      
      // Try with more flexible matching (removing dashes, spaces)
      const flexibleCode = cleanPassCode.replace(/[-\s]/g, '');
      
      const { data: flexiblePasses, error: flexError } = await supabase
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
      
      if (flexError) {
        console.error('Error in flexible query:', flexError);
        return {
          verified: false,
          message: 'Error verifying gate pass. Please try again.'
        };
      }
      
      // Filter passes manually to find potential matches
      passes = flexiblePasses?.filter(pass => {
        const dbPassCode = pass.pass_code.replace(/[-\s]/g, '').toUpperCase();
        return dbPassCode === flexibleCode;
      }) || [];
      
      console.log('Flexible match results:', passes);
    }
    
    if (!passes || passes.length === 0) {
      console.log('No pass found with code:', cleanPassCode);
      return {
        verified: false,
        message: 'Invalid gate pass. This pass does not exist.'
      };
    }
    
    // Get the first matching pass
    const pass = passes[0];
    console.log('Found pass:', pass);
    
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
    
    // Check statuses
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
    
    if (pass.status === 'revoked') {
      return {
        verified: false,
        message: 'Revoked gate pass. This pass has been revoked by security.',
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
