
import { supabase } from '@/integrations/supabase/client';
import { Employee, GatePass } from '@/types';
import { generateQRCodeForPass as generateQRCode } from './qrCodeUtils';

// Generate a unique pass code with better uniqueness guarantee
export const generatePassCode = (): string => {
  // Use a timestamp and random parts for better uniqueness
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timestampPart = Date.now().toString(36).substring(-4).toUpperCase();
  const secondRandom = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `${randomPart}-${timestampPart}-${secondRandom}`;
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

// Create a new gate pass with improved error handling and time tracking
export const createGatePass = async (
  employeeId: string,
  validity: 'single' | 'day' | 'week' | 'month',
  type: 'entry' | 'exit' | 'both',
  reason: string,
  expectedExitTime?: string,
  expectedReturnTime?: string
): Promise<GatePass | null> => {
  try {
    if (!employeeId) {
      throw new Error('Employee ID is required');
    }
    
    if (!reason || reason.trim() === '') {
      throw new Error('Reason is required');
    }
    
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
      expectedExitTime,
      expectedReturnTime,
      systemUserId,
      expirationDate
    });
    
    // Using a direct insert approach
    const { data, error } = await supabase
      .from('gate_passes')
      .insert({
        employee_id: employeeId,
        pass_code: passCode,
        employee_name: employeeName,
        validity: validity,
        type: type,
        reason: reason,
        expected_exit_time: expectedExitTime || null,
        expected_return_time: expectedReturnTime || null,
        created_by: systemUserId,
        expires_at: expirationDate.toISOString(),
        status: 'active'
      })
      .select()
      .single();
      
    if (error) {
      console.error('Error creating gate pass:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error('Failed to create gate pass');
    }
    
    console.log('Gate pass created successfully:', data);
    
    // Map the database fields to our GatePass type
    return {
      id: data.id,
      employeeId: data.employee_id,
      employeeName: data.employee_name,
      passCode: data.pass_code,
      validity: data.validity,
      type: data.type,
      reason: data.reason,
      status: data.status,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      usedAt: data.used_at,
      expectedExitTime: data.expected_exit_time,
      expectedReturnTime: data.expected_return_time,
      exitTime: data.exit_time,
      returnTime: data.return_time
    };
  } catch (error) {
    console.error('Error creating gate pass:', error);
    return null;
  }
};

// Record gate pass usage (exit or return)
export const recordGatePassUsage = async (
  passId: string,
  usageType: 'exit' | 'return',
  time: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    if (!passId) {
      return { success: false, message: 'Pass ID is required' };
    }
    
    // Get the current pass status first to check if it's valid
    const { data: pass, error: getError } = await supabase
      .from('gate_passes')
      .select('*')
      .eq('id', passId)
      .single();
      
    if (getError) {
      console.error('Error fetching gate pass:', getError);
      return { success: false, message: 'Error fetching gate pass' };
    }
    
    if (!pass) {
      return { success: false, message: 'Gate pass not found' };
    }
    
    if (pass.status !== 'active') {
      return { 
        success: false, 
        message: `This pass is ${pass.status} and cannot be used for ${usageType}` 
      };
    }
    
    // For return, check if exit time is recorded
    if (usageType === 'return' && !pass.exit_time) {
      return { 
        success: false, 
        message: 'Cannot record return time without an exit time' 
      };
    }
    
    // Create the correct update data
    let updateData: Record<string, any> = {};
    if (usageType === 'exit') {
      updateData = { exit_time: time };
    } else {
      updateData = { return_time: time };
    }
      
    const { error: updateError } = await supabase
      .from('gate_passes')
      .update(updateData)
      .eq('id', passId);
      
    if (updateError) {
      console.error(`Error recording ${usageType} time:`, updateError);
      return { success: false, message: `Error recording ${usageType} time` };
    }
    
    return { 
      success: true, 
      message: usageType === 'exit' ? 'Exit time recorded' : 'Return time recorded' 
    };
  } catch (error) {
    console.error(`Error recording ${usageType} time:`, error);
    return { success: false, message: `Unexpected error recording ${usageType} time` };
  }
};

// Fetch all gate passes with improved performance and status updates
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
        expected_exit_time,
        expected_return_time,
        exit_time,
        return_time,
        employees (id, first_name, last_name)
      `)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching gate passes:', error);
      throw error;
    }
    
    console.log(`Retrieved ${passes?.length || 0} gate passes`);
    
    // Check for expired passes and update them in the database
    const now = new Date();
    const passesToUpdate = [];
    
    // Guard against undefined passes
    if (!passes) {
      return [];
    }
    
    const formattedPasses = passes.map(pass => {
      if (!pass) return null;
      
      const expirationDate = new Date(pass.expires_at);
      let currentStatus = pass.status;
      
      // If pass is active but expired, mark for update
      if (pass.status === 'active' && expirationDate < now) {
        passesToUpdate.push(pass.id);
        currentStatus = 'expired';
      }
      
      return {
        id: pass.id,
        employeeId: pass.employee_id,
        employeeName: pass.employees ? 
          `${pass.employees.first_name || ''} ${pass.employees.last_name || ''}`.trim() : 
          'Unknown Employee',
        passCode: pass.pass_code,
        validity: pass.validity,
        type: pass.type,
        reason: pass.reason,
        status: currentStatus,
        createdAt: pass.created_at,
        expiresAt: pass.expires_at,
        usedAt: pass.used_at,
        expectedExitTime: pass.expected_exit_time,
        expectedReturnTime: pass.expected_return_time,
        exitTime: pass.exit_time,
        returnTime: pass.return_time
      };
    }).filter(Boolean) as GatePass[]; // Filter out any null values and cast
    
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
    
    return formattedPasses;
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
        message: 'Please enter a valid gate pass code.'
      };
    }
    
    // Sanitize the pass code input
    const cleanPassCode = passCode.trim().toUpperCase();
    console.log('Cleaned pass code for verification:', cleanPassCode);
    
    // Get the pass directly
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
        expected_exit_time,
        expected_return_time,
        exit_time,
        return_time,
        employees (id, first_name, last_name)
      `)
      .ilike('pass_code', cleanPassCode)
      .single();
    
    if (error) {
      // If not found by exact match, try flexible matching
      const { data: allPasses, error: listError } = await supabase
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
          expected_exit_time,
          expected_return_time,
          exit_time,
          return_time,
          employees (id, first_name, last_name)
        `);
        
      if (listError || !allPasses || allPasses.length === 0) {
        return {
          verified: false,
          message: 'Invalid gate pass. This pass does not exist.'
        };
      }
      
      // Try matching by comparing without dashes or spaces
      const normalizedInput = cleanPassCode.replace(/[-\s]/g, '');
      let matchingPass = allPasses.find(p => {
        if (!p || !p.pass_code) return false;
        const normalizedPassCode = p.pass_code.replace(/[-\s]/g, '').toUpperCase();
        return normalizedPassCode === normalizedInput;
      });
      
      // If still not found, try matching just the last 6 characters
      if (!matchingPass && cleanPassCode.length >= 6) {
        const lastSixChars = cleanPassCode.slice(-6);
        matchingPass = allPasses.find(p => {
          if (!p || !p.pass_code) return false;
          return p.pass_code.toUpperCase().endsWith(lastSixChars);
        });
      }
      
      if (!matchingPass) {
        return {
          verified: false,
          message: 'Invalid gate pass. This pass does not exist.'
        };
      }
      
      // Use the matching pass
      return processPassVerification(matchingPass);
    }
    
    // If we got here, we found the pass by exact match
    return processPassVerification(pass);
  } catch (error) {
    console.error('Error verifying gate pass:', error);
    return {
      verified: false,
      message: 'Error verifying pass. Please try again.',
    };
  }
};

// Helper function to process pass verification
const processPassVerification = (pass: any) => {
  const now = new Date();
  const expirationDate = new Date(pass.expires_at);
  
  // Format the pass for return
  const formattedPass: GatePass = {
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
    usedAt: pass.used_at,
    expectedExitTime: pass.expected_exit_time,
    expectedReturnTime: pass.expected_return_time,
    exitTime: pass.exit_time,
    returnTime: pass.return_time
  };
  
  // Check if expired
  if (expirationDate < now && pass.status === 'active') {
    // Mark as expired in the database
    supabase
      .from('gate_passes')
      .update({ status: 'expired' })
      .eq('id', pass.id)
      .then(({ error }) => {
        if (error) console.error('Error updating pass status:', error);
      });
      
    return {
      verified: false,
      message: 'Expired gate pass. This pass is no longer valid.',
      pass: { ...formattedPass, status: 'expired' }
    };
  }
  
  // Check other status issues
  switch (pass.status) {
    case 'used':
      if (pass.validity === 'single') {
        return {
          verified: false,
          message: 'Pass already used. This single-use pass has already been scanned.',
          pass: formattedPass
        };
      }
      break;
      
    case 'expired':
      return {
        verified: false,
        message: 'Expired gate pass. This pass is no longer valid.',
        pass: formattedPass
      };
      
    case 'revoked':
      return {
        verified: false,
        message: 'Revoked gate pass. This pass has been revoked by security.',
        pass: formattedPass
      };
  }
  
  // Valid pass - handle based on type
  if (pass.validity === 'single' && pass.status === 'active') {
    // Mark single-use passes as used
    supabase
      .from('gate_passes')
      .update({ 
        status: 'used', 
        used_at: new Date().toISOString() 
      })
      .eq('id', pass.id)
      .then(({ error }) => {
        if (error) console.error('Error updating pass status:', error);
      });
      
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
};

// Export the QR code generation function
export { generateQRCode as generateQRCodeForPass };
