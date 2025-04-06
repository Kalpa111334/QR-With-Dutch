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

// Completely rewritten verification function for better reliability
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
    
    // Sanitize the pass code input
    const cleanPassCode = passCode.trim().toUpperCase();
    console.log('Cleaned pass code for verification:', cleanPassCode);
    
    // First get all active passes and filter client-side
    // This approach works better than relying on exact DB matches
    const { data: allPasses, error } = await supabase
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
    
    if (error) {
      console.error('Error querying gate passes:', error);
      return {
        verified: false,
        message: 'Error verifying gate pass. Please try again.'
      };
    }
    
    console.log(`Retrieved ${allPasses?.length || 0} passes to check against`);
    
    // Find matching pass, try exact match first
    let matchingPass = allPasses?.find(pass => 
      pass.pass_code.toUpperCase() === cleanPassCode
    );
    
    // If no exact match, try more flexible matching
    if (!matchingPass) {
      console.log('No exact match found, trying flexible match');
      
      // Remove dashes and spaces for comparison
      const normalizedInput = cleanPassCode.replace(/[-\s]/g, '');
      
      matchingPass = allPasses?.find(pass => {
        const normalizedPassCode = pass.pass_code.replace(/[-\s]/g, '').toUpperCase();
        return normalizedPassCode === normalizedInput;
      });
    }
    
    // If still no match, try partial match (last 6 chars)
    if (!matchingPass && cleanPassCode.length >= 6) {
      console.log('Trying partial match with last 6 characters');
      const lastSixChars = cleanPassCode.slice(-6);
      
      matchingPass = allPasses?.find(pass => {
        return pass.pass_code.toUpperCase().endsWith(lastSixChars);
      });
    }
    
    if (!matchingPass) {
      console.log('No matching pass found for:', cleanPassCode);
      return {
        verified: false,
        message: 'Invalid gate pass. This pass does not exist.'
      };
    }
    
    console.log('Found matching pass:', matchingPass);
    
    const now = new Date();
    const expirationDate = new Date(matchingPass.expires_at);
    
    // Format the pass object
    const formattedPass: GatePass = {
      id: matchingPass.id,
      employeeId: matchingPass.employee_id,
      employeeName: matchingPass.employees ? 
        `${matchingPass.employees.first_name || ''} ${matchingPass.employees.last_name || ''}`.trim() : 
        'Unknown Employee',
      passCode: matchingPass.pass_code,
      validity: matchingPass.validity,
      type: matchingPass.type,
      reason: matchingPass.reason,
      status: matchingPass.status,
      createdAt: matchingPass.created_at,
      expiresAt: matchingPass.expires_at,
      usedAt: matchingPass.used_at
    };
    
    // Check if expired
    if (expirationDate < now && matchingPass.status === 'active') {
      // Mark as expired in the database
      await supabase
        .from('gate_passes')
        .update({ status: 'expired' })
        .eq('id', matchingPass.id);
        
      return {
        verified: false,
        message: 'Expired gate pass. This pass is no longer valid.',
        pass: { ...formattedPass, status: 'expired' }
      };
    }
    
    // Check other statuses
    if (matchingPass.status === 'used' && matchingPass.validity === 'single') {
      return {
        verified: false,
        message: 'Pass already used. This single-use pass has already been scanned.',
        pass: formattedPass
      };
    }
    
    if (matchingPass.status === 'expired') {
      return {
        verified: false,
        message: 'Expired gate pass. This pass is no longer valid.',
        pass: formattedPass
      };
    }
    
    if (matchingPass.status === 'revoked') {
      return {
        verified: false,
        message: 'Revoked gate pass. This pass has been revoked by security.',
        pass: formattedPass
      };
    }
    
    // Valid pass - mark as used if single-use
    if (matchingPass.validity === 'single' && matchingPass.status === 'active') {
      await supabase
        .from('gate_passes')
        .update({ 
          status: 'used', 
          used_at: new Date().toISOString() 
        })
        .eq('id', matchingPass.id);
        
      return {
        verified: true,
        message: 'Valid gate pass. Employee may proceed.',
        pass: { ...formattedPass, status: 'used', usedAt: new Date().toISOString() }
      };
    }
    
    // Valid multi-use pass
    return {
      verified: true,
      message: 'Valid gate pass. Employee may proceed.',
      pass: formattedPass
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
