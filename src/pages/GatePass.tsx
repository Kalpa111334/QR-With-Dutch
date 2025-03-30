import React, { useState, useEffect } from 'react';
import { QrCode, Check, X, Clipboard, Users, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Employee } from '@/types';
import { getEmployees } from '@/utils/employeeUtils';
import QRScanner from '@/components/QRScanner';
import { 
  GatePass as GatePassType,
  getGatePasses,
  createGatePass,
  verifyGatePass,
  generateQRCodeForPass
} from '@/utils/gatePassUtils';

const GatePass: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [gatePasses, setGatePasses] = useState<GatePassType[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [passType, setPassType] = useState<'entry' | 'exit' | 'both'>('both');
  const [passValidity, setPassValidity] = useState<'single' | 'day' | 'week' | 'month'>('single');
  const [passReason, setPassReason] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('create');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    message: string;
    pass?: GatePassType;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { toast } = useToast();

  // Fetch employees and gate passes on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch employees
        const employeesData = await getEmployees();
        setEmployees(employeesData);
        
        // Fetch gate passes
        const passesData = await getGatePasses();
        setGatePasses(passesData);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load data',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  // Create a new gate pass
  const handleCreateGatePass = async () => {
    if (!selectedEmployee || !passReason) {
      toast({
        title: 'Missing Information',
        description: 'Please select an employee and provide a reason',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      
      // Create new pass in database
      const newPass = await createGatePass(
        selectedEmployee,
        passValidity,
        passType,
        passReason
      );
      
      if (newPass) {
        // Add to passes state
        setGatePasses(prevPasses => [newPass, ...prevPasses]);
        
        toast({
          title: 'Gate Pass Created',
          description: `Pass code: ${newPass.passCode} - Valid until ${new Date(newPass.expiresAt).toLocaleString()}`,
        });

        // Reset form
        setSelectedEmployee('');
        setPassReason('');
        setPassType('both');
        setPassValidity('single');
        
        // Set verification result to show the new pass automatically
        setVerificationResult({
          verified: true,
          message: 'Valid gate pass. Employee may proceed.',
          pass: newPass
        });
        
        // Switch to verify tab to show the new pass
        setActiveTab('verify');
      } else {
        toast({
          title: 'Error',
          description: 'Failed to create gate pass',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating gate pass:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle QR code scan result
  const handleScanResult = async (result: string) => {
    setScanResult(result);
    
    try {
      // Try to parse the QR code data (could be JSON or just the pass ID/code)
      let passIdentifier = result;
      try {
        const parsedData = JSON.parse(result);
        passIdentifier = parsedData.id || parsedData.passCode || result;
      } catch {
        // If not valid JSON, assume it's the pass ID or code directly
      }
      
      // Verify the pass
      const verification = await verifyGatePass(passIdentifier);
      setVerificationResult(verification);
      
      // If valid, update the pass in local state if it exists there
      if (verification.pass && verification.pass.id) {
        setGatePasses(prev => 
          prev.map(pass => 
            pass.id === verification.pass!.id ? verification.pass! : pass
          )
        );
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
  const copyPassToClipboard = (pass: GatePassType) => {
    const passText = `Gate Pass: ${pass.passCode}
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

  // Function to download QR code as PNG
  const downloadQRCode = async (pass: GatePassType) => {
    try {
      setLoading(true);
      const qrBlob = await generateQRCodeForPass(pass);
      
      if (qrBlob) {
        // Create download link
        const url = URL.createObjectURL(qrBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `gate_pass_${pass.passCode}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        toast({
          title: 'QR Code Downloaded',
          description: 'Gate pass QR code has been downloaded successfully',
        });
      } else {
        throw new Error('Failed to generate QR code');
      }
    } catch (error) {
      console.error('Error downloading QR code:', error);
      toast({
        title: 'Error',
        description: 'Failed to download QR code',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                  disabled={loading}
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
                  disabled={loading}
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
                  disabled={loading}
                >
                  <option value="single">Single Use (24 hours)</option>
                  <option value="day">One Day (until midnight)</option>
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
                  disabled={loading}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={handleCreateGatePass}
                disabled={!selectedEmployee || !passReason || loading}
              >
                <QrCode className="mr-2 h-4 w-4" />
                {loading ? 'Creating...' : 'Generate Gate Pass'}
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
                {loading ? (
                  <div className="py-10 text-center">Verifying pass...</div>
                ) : verificationResult ? (
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
                        <p><span className="font-medium">Code:</span> {verificationResult.pass.passCode}</p>
                        <p><span className="font-medium">Employee:</span> {verificationResult.pass.employeeName}</p>
                        <p><span className="font-medium">Type:</span> <Badge variant="outline" className="capitalize">{verificationResult.pass.type}</Badge></p>
                        <p><span className="font-medium">Reason:</span> {verificationResult.pass.reason}</p>
                        <p><span className="font-medium">Created:</span> {new Date(verificationResult.pass.createdAt).toLocaleString()}</p>
                        <p><span className="font-medium">Expires:</span> {new Date(verificationResult.pass.expiresAt).toLocaleString()}</p>
                        {verificationResult.pass.usedAt && (
                          <p><span className="font-medium">Used:</span> {new Date(verificationResult.pass.usedAt).toLocaleString()}</p>
                        )}
                        
                        {/* QR Code Display */}
                        <div className="pt-4 flex flex-col items-center">
                          <div className="bg-white p-4 rounded-lg shadow-md mb-4" id="qr-container">
                            {verificationResult.verified && (
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify({
                                  passId: verificationResult.pass.id,
                                  passCode: verificationResult.pass.passCode
                                }))}`}
                                alt="Gate Pass QR Code"
                                className="w-48 h-48"
                              />
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyPassToClipboard(verificationResult.pass!)}
                            >
                              <Clipboard className="h-4 w-4 mr-2" />
                              Copy Pass Details
                            </Button>
                            {verificationResult.verified && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => downloadQRCode(verificationResult.pass!)}
                                disabled={loading}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download QR Code
                              </Button>
                            )}
                          </div>
                        </div>
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
              {loading ? (
                <div className="py-10 text-center">Loading gate passes...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pass Code</TableHead>
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
                          <TableCell className="font-medium">{pass.passCode}</TableCell>
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GatePass;
