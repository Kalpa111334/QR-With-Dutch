
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
    
    // Insert directly using RPC function - using a custom function known to exist in the database
    const { data, error } = await supabase.rpc('create_gate_pass_with_times', {
      p_employee_id: employeeId,
      p_pass_code: passCode,
      p_employee_name: employeeName,
      p_validity: validity,
      p_type: type,
      p_reason: reason,
      p_expected_exit_time: expectedExitTime || null,
      p_expected_return_time: expectedReturnTime || null,
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
    
    // Safely access properties with proper type checking
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
    
    // Update the pass with the usage time - we need to construct the updateData differently
    const updateObject: Record<string, any> = {};
    if (usageType === 'exit') {
      updateObject.exit_time = time;
    } else {
      updateObject.return_time = time;
    }
      
    const { error: updateError } = await supabase
      .from('gate_passes')
      .update(updateObject)
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
    
    // Get all passes to perform client-side matching
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
        expected_exit_time,
        expected_return_time,
        exit_time,
        return_time,
        employees (id, first_name, last_name)
      `);
    
    if (error) {
      console.error('Error querying gate passes:', error);
      return {
        verified: false,
        message: 'Error verifying gate pass. Please try again.'
      };
    }
    
    if (!allPasses) {
      console.log('No passes retrieved from database');
      return {
        verified: false,
        message: 'No gate passes found in system.'
      };
    }
    
    console.log(`Retrieved ${allPasses.length} passes to check against`);
    
    // Multiple matching strategies
    // 1. Try exact match (case-insensitive)
    let matchingPass = allPasses.find(pass => 
      pass && pass.pass_code && pass.pass_code.toUpperCase() === cleanPassCode
    );
    
    // 2. If no exact match, try more flexible matching (ignore dashes and spaces)
    if (!matchingPass) {
      console.log('No exact match found, trying flexible match');
      const normalizedInput = cleanPassCode.replace(/[-\s]/g, '');
      
      matchingPass = allPasses.find(pass => {
        if (!pass || !pass.pass_code) return false;
        const normalizedPassCode = pass.pass_code.replace(/[-\s]/g, '').toUpperCase();
        return normalizedPassCode === normalizedInput;
      });
    }
    
    // 3. Try matching just the last 6 characters (useful for partial manual entry)
    if (!matchingPass && cleanPassCode.length >= 6) {
      console.log('Trying partial match with last 6 characters');
      const lastSixChars = cleanPassCode.slice(-6);
      
      matchingPass = allPasses.find(pass => {
        if (!pass || !pass.pass_code) return false;
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
    
    // Format the pass for return
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
      usedAt: matchingPass.used_at,
      expectedExitTime: matchingPass.expected_exit_time,
      expectedReturnTime: matchingPass.expected_return_time,
      exitTime: matchingPass.exit_time,
      returnTime: matchingPass.return_time
    };
    
    // Check pass status and update if needed
    
    // 1. Check if expired
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
    
    // 2. Check other status issues
    switch (matchingPass.status) {
      case 'used':
        if (matchingPass.validity === 'single') {
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
    if (matchingPass.validity === 'single' && matchingPass.status === 'active') {
      // Mark single-use passes as used
      const { error: updateError } = await supabase
        .from('gate_passes')
        .update({ 
          status: 'used', 
          used_at: new Date().toISOString() 
        })
        .eq('id', matchingPass.id);
        
      if (updateError) {
        console.error('Error updating pass status:', updateError);
        // Continue anyway but log the error
      }
        
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
