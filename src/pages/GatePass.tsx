
import React, { useState, useEffect } from 'react';
import { QrCode, Check, X, Clipboard, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Employee } from '@/types';
import { getEmployees } from '@/utils/employeeUtils';
import QRScanner from '@/components/QRScanner';

// Define a GatePass type
interface GatePass {
  id: string;
  employeeId: string;
  employeeName: string;
  validity: 'single' | 'day' | 'week' | 'month';
  type: 'entry' | 'exit' | 'both';
  reason: string;
  status: 'active' | 'used' | 'expired';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

// Mock function to generate a unique pass code
const generatePassCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const GatePass: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [passType, setPassType] = useState<'entry' | 'exit' | 'both'>('both');
  const [passValidity, setPassValidity] = useState<'single' | 'day' | 'week' | 'month'>('single');
  const [passReason, setPassReason] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('create');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    message: string;
    pass?: GatePass;
  } | null>(null);
  
  const { toast } = useToast();

  // Fetch employees on component mount
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const data = await getEmployees();
        setEmployees(data);
      } catch (error) {
        console.error('Error fetching employees:', error);
        toast({
          title: 'Error',
          description: 'Failed to load employees',
          variant: 'destructive',
        });
      }
    };

    fetchEmployees();
    
    // Mock gate passes for demo
    const mockPasses: GatePass[] = [
      {
        id: 'PASS123',
        employeeId: 'emp-1',
        employeeName: 'John Doe',
        validity: 'day',
        type: 'both',
        reason: 'Client meeting',
        status: 'active',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'PASS456',
        employeeId: 'emp-2',
        employeeName: 'Jane Smith',
        validity: 'single',
        type: 'entry',
        reason: 'Forgot ID card',
        status: 'used',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        usedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }
    ];
    
    setGatePasses(mockPasses);
  }, [toast]);

  // Create a new gate pass
  const handleCreateGatePass = () => {
    if (!selectedEmployee || !passReason) {
      toast({
        title: 'Missing Information',
        description: 'Please select an employee and provide a reason',
        variant: 'destructive',
      });
      return;
    }

    // Find selected employee
    const employee = employees.find(emp => emp.id === selectedEmployee);
    
    if (!employee) {
      toast({
        title: 'Error',
        description: 'Selected employee not found',
        variant: 'destructive',
      });
      return;
    }

    // Calculate expiration date based on validity
    let expirationDate = new Date();
    switch (passValidity) {
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

    // Create new pass
    const newPass: GatePass = {
      id: generatePassCode(),
      employeeId: selectedEmployee,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      validity: passValidity,
      type: passType,
      reason: passReason,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: expirationDate.toISOString(),
    };

    // Add to passes state
    setGatePasses([...gatePasses, newPass]);
    
    toast({
      title: 'Gate Pass Created',
      description: `Pass code: ${newPass.id} - Valid until ${new Date(newPass.expiresAt).toLocaleString()}`,
    });

    // Reset form
    setSelectedEmployee('');
    setPassReason('');
    setPassType('both');
    setPassValidity('single');
    
    // Switch to passes tab to show the new pass
    setActiveTab('passes');
  };

  // Handle QR code scan result
  const handleScanResult = (result: string) => {
    setScanResult(result);
    
    try {
      // Parse the QR code data (could be JSON or just the pass ID)
      let passId = result;
      try {
        const parsedData = JSON.parse(result);
        passId = parsedData.id || result;
      } catch {
        // If not JSON, assume it's the pass ID directly
      }
      
      // Find the pass in our collection
      const pass = gatePasses.find(p => p.id === passId);
      
      if (!pass) {
        setVerificationResult({
          verified: false,
          message: 'Invalid gate pass. This pass does not exist.',
        });
        return;
      }
      
      // Check if expired
      if (new Date(pass.expiresAt) < new Date()) {
        setVerificationResult({
          verified: false,
          message: 'Expired gate pass. This pass is no longer valid.',
          pass,
        });
        return;
      }
      
      // Check if already used (for single-use passes)
      if (pass.validity === 'single' && pass.status === 'used') {
        setVerificationResult({
          verified: false,
          message: 'Pass already used. This single-use pass has already been scanned.',
          pass,
        });
        return;
      }
      
      // Valid pass
      setVerificationResult({
        verified: true,
        message: 'Valid gate pass. Employee may proceed.',
        pass,
      });
      
      // If it's a single-use pass, mark it as used
      if (pass.validity === 'single') {
        const updatedPasses = gatePasses.map(p => {
          if (p.id === passId) {
            return {
              ...p,
              status: 'used',
              usedAt: new Date().toISOString(),
            };
          }
          return p;
        });
        
        setGatePasses(updatedPasses);
      }
    } catch (error) {
      console.error('Error processing scan result:', error);
      setVerificationResult({
        verified: false,
        message: 'Invalid QR code format. Please try again.',
      });
    }
  };

  // Copy pass details to clipboard
  const copyPassToClipboard = (pass: GatePass) => {
    const passText = `Gate Pass: ${pass.id}
Employee: ${pass.employeeName}
Type: ${pass.type}
Validity: ${pass.validity}
Reason: ${pass.reason}
Expires: ${new Date(pass.expiresAt).toLocaleString()}`;

    navigator.clipboard.writeText(passText).then(
      () => {
        toast({
          title: 'Copied',
          description: 'Gate pass details copied to clipboard',
        });
      },
      (err) => {
        console.error('Could not copy text: ', err);
        toast({
          title: 'Error',
          description: 'Failed to copy to clipboard',
          variant: 'destructive',
        });
      }
    );
  };

  return (
    <div className="container mx-auto py-6">
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Gate Pass System</h1>
            <p className="text-muted-foreground">
              Create and verify temporary access passes for employees
            </p>
          </div>
          <TabsList className="mt-4 md:mt-0">
            <TabsTrigger value="create">Create Pass</TabsTrigger>
            <TabsTrigger value="verify">Verify Pass</TabsTrigger>
            <TabsTrigger value="passes">All Passes</TabsTrigger>
          </TabsList>
        </div>
        
        {/* Create Pass Tab */}
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Gate Pass</CardTitle>
              <CardDescription>
                Generate a temporary access pass for employees
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Employee Selection */}
              <div className="space-y-2">
                <Label htmlFor="employee">Employee</Label>
                <select 
                  id="employee"
                  className="w-full border rounded-md p-2"
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                >
                  <option value="">Select an employee</option>
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Pass Type */}
              <div className="space-y-2">
                <Label htmlFor="pass-type">Pass Type</Label>
                <select 
                  id="pass-type"
                  className="w-full border rounded-md p-2"
                  value={passType}
                  onChange={(e) => setPassType(e.target.value as 'entry' | 'exit' | 'both')}
                >
                  <option value="entry">Entry Only</option>
                  <option value="exit">Exit Only</option>
                  <option value="both">Entry & Exit</option>
                </select>
              </div>
              
              {/* Pass Validity */}
              <div className="space-y-2">
                <Label htmlFor="pass-validity">Validity Period</Label>
                <select 
                  id="pass-validity"
                  className="w-full border rounded-md p-2"
                  value={passValidity}
                  onChange={(e) => setPassValidity(e.target.value as 'single' | 'day' | 'week' | 'month')}
                >
                  <option value="single">Single Use</option>
                  <option value="day">One Day</option>
                  <option value="week">One Week</option>
                  <option value="month">One Month</option>
                </select>
              </div>
              
              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  placeholder="Reason for gate pass"
                  value={passReason}
                  onChange={(e) => setPassReason(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={handleCreateGatePass}
                disabled={!selectedEmployee || !passReason}
              >
                <QrCode className="mr-2 h-4 w-4" />
                Generate Gate Pass
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Verify Pass Tab */}
        <TabsContent value="verify">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Scan QR Code</CardTitle>
                <CardDescription>
                  Scan the QR code on the gate pass to verify
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <div className="w-full max-w-md">
                  <QRScanner onScan={handleScanResult} />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-start">
                <div className="text-sm text-muted-foreground">
                  <p>Scan result: {scanResult || 'No scan yet'}</p>
                </div>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Verification Result</CardTitle>
                <CardDescription>
                  Gate pass verification status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {verificationResult ? (
                  <div className="space-y-4">
                    <Alert variant={verificationResult.verified ? "default" : "destructive"}>
                      <div className="flex items-center">
                        {verificationResult.verified ? (
                          <Check className="h-5 w-5 mr-2 text-green-600" />
                        ) : (
                          <X className="h-5 w-5 mr-2" />
                        )}
                        <AlertTitle>
                          {verificationResult.verified ? 'Access Granted' : 'Access Denied'}
                        </AlertTitle>
                      </div>
                      <AlertDescription>{verificationResult.message}</AlertDescription>
                    </Alert>
                    
                    {verificationResult.pass && (
                      <div className="mt-4 border rounded-md p-4 space-y-2">
                        <p className="font-medium">Pass Details:</p>
                        <p><span className="font-medium">ID:</span> {verificationResult.pass.id}</p>
                        <p><span className="font-medium">Employee:</span> {verificationResult.pass.employeeName}</p>
                        <p><span className="font-medium">Type:</span> <Badge variant="outline" className="capitalize">{verificationResult.pass.type}</Badge></p>
                        <p><span className="font-medium">Reason:</span> {verificationResult.pass.reason}</p>
                        <p><span className="font-medium">Expires:</span> {new Date(verificationResult.pass.expiresAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-center">
                    <QrCode className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No gate pass scanned yet</p>
                    <p className="text-sm text-muted-foreground">Scan a QR code to see verification results</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* All Passes Tab */}
        <TabsContent value="passes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>All Gate Passes</CardTitle>
                <CardDescription>
                  Manage and view all issued gate passes
                </CardDescription>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pass ID</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Validity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gatePasses.length > 0 ? (
                    gatePasses.map(pass => (
                      <TableRow key={pass.id}>
                        <TableCell className="font-medium">{pass.id}</TableCell>
                        <TableCell>{pass.employeeName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{pass.type}</Badge>
                        </TableCell>
                        <TableCell className="capitalize">{pass.validity}</TableCell>
                        <TableCell>
                          <Badge 
                            className={
                              pass.status === 'active' ? 'bg-green-100 text-green-800' :
                              pass.status === 'used' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                            }
                          >
                            {pass.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(pass.expiresAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyPassToClipboard(pass)}
                          >
                            <Clipboard className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                        No gate passes found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GatePass;
