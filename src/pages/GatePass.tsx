
import React, { useState, useEffect } from 'react';
import { QrCode, Check, X, Clipboard, Download, AlertTriangle, Search, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Employee, GatePass } from '@/types';
import { getEmployees } from '@/utils/employeeUtils';
import { 
  getGatePasses,
  createGatePass,
  verifyGatePass,
  generateQRCodeForPass,
  recordGatePassUsage
} from '@/utils/gatePassUtils';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Skeleton } from '@/components/ui/skeleton';
import { TimeSelector } from '@/components/TimeSelector';

const GatePass: React.FC = () => {
  // State management
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [gatePasses, setGatePasses] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [passType, setPassType] = useState<'entry' | 'exit' | 'both'>('both');
  const [passValidity, setPassValidity] = useState<'single' | 'day' | 'week' | 'month'>('single');
  const [passReason, setPassReason] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('create');
  const [passCode, setPassCode] = useState<string>('');
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    message: string;
    pass?: any;
  } | null>(null);
  
  // Time tracking states
  const [expectedExitTime, setExpectedExitTime] = useState<string>(
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [expectedReturnTime, setExpectedReturnTime] = useState<string>(
    new Date(Date.now() + 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [usageType, setUsageType] = useState<'exit' | 'return'>('exit');
  
  // Loading and operation states
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const { toast } = useToast();

  // Fetch employees and gate passes on component mount or refresh
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
  }, [toast, refreshTrigger]);

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
      setIsCreating(true);
      
      // Create new pass in database with time information
      const newPass = await createGatePass(
        selectedEmployee,
        passValidity,
        passType,
        passReason,
        expectedExitTime,
        expectedReturnTime
      );
      
      if (newPass) {
        // Refresh gate passes list
        setRefreshTrigger(prev => prev + 1);
        
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
        
        // Download QR code automatically
        handleDownloadQRCode(newPass);
        
        // Switch to verify tab to show the new pass
        setActiveTab('verify');
        
        // Show alert with pass code
        setShowAlert(true);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to create gate pass. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating gate pass:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Verify gate pass by code
  const handleVerifyPass = async (codeToVerify = passCode) => {
    if (!codeToVerify || codeToVerify.trim() === '') {
      toast({
        title: 'Error',
        description: 'Please enter a pass code to verify',
        variant: 'destructive',
      });
      return;
    }
    
    setIsVerifying(true);
    
    try {
      console.log("Verifying pass with code:", codeToVerify);
      const verification = await verifyGatePass(codeToVerify);
      console.log("Verification result:", verification);
      
      setVerificationResult(verification);
      
      // Show the alert regardless of verification result
      setShowAlert(true);
      
      // If the pass was updated, refresh the gate passes list
      if (verification.pass && 
         (verification.verified || 
          verification.pass.status === 'expired' || 
          verification.pass.status === 'used')) {
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error verifying gate pass:', error);
      setVerificationResult({
        verified: false,
        message: 'Error verifying pass. Please try again.',
      });
      // Show error alert
      setShowAlert(true);
    } finally {
      setIsVerifying(false);
    }
  };

  // Record gate pass usage (exit or return)
  const handleRecordUsage = async (pass: any, type: 'exit' | 'return') => {
    try {
      const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const result = await recordGatePassUsage(pass.id, type, currentTime);
      
      if (result.success) {
        toast({
          title: type === 'exit' ? 'Exit Recorded' : 'Return Recorded',
          description: `Time: ${currentTime}`,
        });
        
        // Refresh gate passes list
        setRefreshTrigger(prev => prev + 1);
        
        // Update verification result
        if (verificationResult?.pass) {
          const updatedPass = {
            ...verificationResult.pass,
            ...(type === 'exit' ? { exitTime: currentTime } : { returnTime: currentTime })
          };
          setVerificationResult({
            ...verificationResult,
            pass: updatedPass
          });
        }
      } else {
        toast({
          title: 'Error',
          description: result.message || 'Failed to record usage',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error(`Error recording ${type}:`, error);
      toast({
        title: 'Error',
        description: `Failed to record ${type}`,
        variant: 'destructive',
      });
    }
  };

  // Copy pass details to clipboard
  const copyPassToClipboard = (pass: any) => {
    const passText = `Gate Pass: ${pass.passCode}
Employee: ${pass.employeeName}
Type: ${pass.type}
Validity: ${pass.validity}
Reason: ${pass.reason}
Expected Exit: ${pass.expectedExitTime || 'Not specified'}
Expected Return: ${pass.expectedReturnTime || 'Not specified'}
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

  // Function to download QR code as PNG and auto-verify
  const handleDownloadQRCode = async (pass: any) => {
    try {
      setIsDownloading(true);
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
        
        // Auto-verify the pass
        await handleVerifyPass(pass.passCode);
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
      setIsDownloading(false);
    }
  };

  // Function to get appropriate badge color based on status
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'used':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-orange-100 text-orange-800';
      case 'revoked':
        return 'bg-red-100 text-red-800';
      default:
        return '';
    }
  };

  // Handle manual refresh of gate passes
  const handleRefreshPasses = () => {
    setRefreshTrigger(prev => prev + 1);
    toast({
      title: 'Refreshing',
      description: 'Updating gate pass data...',
    });
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
                {loading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <select 
                    id="employee"
                    className="w-full border rounded-md p-2"
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    disabled={isCreating}
                  >
                    <option value="">Select an employee</option>
                    {employees.map(employee => (
                      <option key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              {/* Pass Type */}
              <div className="space-y-2">
                <Label htmlFor="pass-type">Pass Type</Label>
                <select 
                  id="pass-type"
                  className="w-full border rounded-md p-2"
                  value={passType}
                  onChange={(e) => setPassType(e.target.value as 'entry' | 'exit' | 'both')}
                  disabled={isCreating}
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
                  disabled={isCreating}
                >
                  <option value="single">Single Use (24 hours)</option>
                  <option value="day">One Day (until midnight)</option>
                  <option value="week">One Week</option>
                  <option value="month">One Month</option>
                </select>
              </div>
              
              {/* Time Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expected-exit">Expected Exit Time</Label>
                  <TimeSelector 
                    id="expected-exit"
                    value={expectedExitTime}
                    onChange={setExpectedExitTime}
                    disabled={isCreating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expected-return">Expected Return Time</Label>
                  <TimeSelector 
                    id="expected-return"
                    value={expectedReturnTime}
                    onChange={setExpectedReturnTime}
                    disabled={isCreating}
                  />
                </div>
              </div>
              
              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  placeholder="Reason for gate pass"
                  value={passReason}
                  onChange={(e) => setPassReason(e.target.value)}
                  disabled={isCreating}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={handleCreateGatePass}
                disabled={!selectedEmployee || !passReason || isCreating}
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <QrCode className="mr-2 h-4 w-4" />
                    Generate Gate Pass
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Verify Pass Tab */}
        <TabsContent value="verify">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Enter Pass Code</CardTitle>
                <CardDescription>
                  Enter the gate pass code to verify
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center flex-col space-y-6">
                <div className="w-full max-w-md mx-auto">
                  <div className="flex flex-col space-y-2">
                    <Label htmlFor="pass-code">Gate Pass Code</Label>
                    <div className="flex space-x-2">
                      <Input 
                        id="pass-code"
                        placeholder="Enter gate pass code" 
                        value={passCode}
                        onChange={(e) => setPassCode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && passCode.trim() !== '') {
                            handleVerifyPass();
                          }
                        }}
                        className="font-mono tracking-wider"
                      />
                      <Button 
                        onClick={() => handleVerifyPass()}
                        disabled={isVerifying || !passCode}
                      >
                        {isVerifying ? (
                          <>
                            <div className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></div>
                            Verifying...
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4 mr-1" /> Verify
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter the pass code as shown on the employee's pass or scan the QR code.
                    </p>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="mb-2 text-sm text-muted-foreground">Or enter code with segments</p>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={10}
                      value={passCode}
                      onChange={(value) => setPassCode(value)}
                      render={({ slots }) => (
                        <InputOTPGroup>
                          {slots && slots.map((slot, index) => (
                            <InputOTPSlot key={index} {...slot} index={index} />
                          ))}
                        </InputOTPGroup>
                      )}
                    />
                  </div>
                </div>
                
                {verificationResult?.verified && verificationResult.pass && (
                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-medium mb-2">Record Pass Usage:</h3>
                    <div className="flex flex-col space-y-2">
                      <div className="flex justify-between gap-2">
                        <Button 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => handleRecordUsage(verificationResult.pass, 'exit')}
                          disabled={verificationResult.pass.exitTime}
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          {verificationResult.pass.exitTime ? 
                            `Exit Recorded: ${verificationResult.pass.exitTime}` : 
                            'Record Exit'
                          }
                        </Button>
                        <Button 
                          variant="outline" 
                          className="flex-1"
                          onClick={() => handleRecordUsage(verificationResult.pass, 'return')}
                          disabled={!verificationResult.pass.exitTime || verificationResult.pass.returnTime}
                        >
                          <Clock className="mr-2 h-4 w-4" />
                          {verificationResult.pass.returnTime ? 
                            `Return Recorded: ${verificationResult.pass.returnTime}` : 
                            'Record Return'
                          }
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Verification Result</CardTitle>
                <CardDescription>
                  Gate pass verification status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading || isVerifying ? (
                  <div className="py-10 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p>{isVerifying ? 'Verifying pass...' : 'Loading...'}</p>
                  </div>
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
                        <p><span className="font-medium">Pass Code:</span> {verificationResult.pass.passCode}</p>
                        <p><span className="font-medium">Employee:</span> {verificationResult.pass.employeeName}</p>
                        <p><span className="font-medium">Type:</span> <span className="capitalize">{verificationResult.pass.type}</span></p>
                        <p><span className="font-medium">Reason:</span> {verificationResult.pass.reason}</p>
                        <p><span className="font-medium">Created:</span> {new Date(verificationResult.pass.createdAt).toLocaleString()}</p>
                        <p><span className="font-medium">Expires:</span> {new Date(verificationResult.pass.expiresAt).toLocaleString()}</p>
                        
                        {/* Time tracking information */}
                        <p><span className="font-medium">Expected Exit:</span> {verificationResult.pass.expectedExitTime || 'Not specified'}</p>
                        <p><span className="font-medium">Expected Return:</span> {verificationResult.pass.expectedReturnTime || 'Not specified'}</p>
                        
                        {verificationResult.pass.exitTime && (
                          <p><span className="font-medium">Actual Exit:</span> {verificationResult.pass.exitTime}</p>
                        )}
                        
                        {verificationResult.pass.returnTime && (
                          <p><span className="font-medium">Actual Return:</span> {verificationResult.pass.returnTime}</p>
                        )}
                        
                        {verificationResult.pass.usedAt && (
                          <p><span className="font-medium">Used:</span> {new Date(verificationResult.pass.usedAt).toLocaleString()}</p>
                        )}
                        
                        {/* Pass Code Display */}
                        <div className="pt-4 flex flex-col items-center">
                          <div className="bg-white p-4 rounded-lg shadow-md mb-4 text-center">
                            <p className="text-sm text-gray-500 mb-1">Gate Pass Code</p>
                            <p className="text-xl font-bold tracking-wider font-mono">{verificationResult.pass.passCode}</p>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-center">
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
                                onClick={() => handleDownloadQRCode(verificationResult.pass!)}
                                disabled={isDownloading}
                              >
                                {isDownloading ? (
                                  <>
                                    <div className="animate-spin mr-2 h-4 w-4 border-b-2 border-white rounded-full"></div>
                                    Downloading...
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download QR Code
                                  </>
                                )}
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
                    <p className="text-muted-foreground">No gate pass verified yet</p>
                    <p className="text-sm text-muted-foreground">Enter a gate pass code to see verification results</p>
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
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshPasses}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pass Code</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Exit Time</TableHead>
                        <TableHead>Return Time</TableHead>
                        <TableHead>Expiration</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gatePasses.length > 0 ? (
                        gatePasses.map(pass => (
                          <TableRow key={pass.id}>
                            <TableCell className="font-medium font-mono">{pass.passCode}</TableCell>
                            <TableCell>{pass.employeeName}</TableCell>
                            <TableCell>
                              <span className="capitalize">{pass.type}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getStatusBadgeClass(pass.status)}>
                                {pass.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {pass.exitTime || 
                                <span className="text-muted-foreground text-sm">
                                  Expected: {pass.expectedExitTime || 'N/A'}
                                </span>
                              }
                            </TableCell>
                            <TableCell>
                              {pass.returnTime || 
                                <span className="text-muted-foreground text-sm">
                                  Expected: {pass.expectedReturnTime || 'N/A'}
                                </span>
                              }
                            </TableCell>
                            <TableCell>{new Date(pass.expiresAt).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => copyPassToClipboard(pass)}
                                  title="Copy pass details"
                                >
                                  <Clipboard className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setPassCode(pass.passCode);
                                    setActiveTab('verify');
                                    handleVerifyPass(pass.passCode);
                                  }}
                                  title="Verify this pass"
                                >
                                  <Search className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                            No gate passes found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Verification Success/Failure Alert Dialog */}
      <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
        <AlertDialogContent className={verificationResult?.verified ? "border-green-500" : "border-red-500"}>
          <AlertDialogHeader>
            <div className="flex items-center">
              {verificationResult?.verified ? (
                <Check className="h-6 w-6 text-green-600 mr-2" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
              )}
              <AlertDialogTitle>
                {verificationResult?.verified ? "Access Granted" : "Access Denied"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {verificationResult?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {verificationResult?.pass && (
            <div className="my-4 p-4 bg-gray-50 rounded-md">
              <p className="font-medium mb-2">Gate Pass Details:</p>
              <p><span className="font-medium">Pass Code:</span> {verificationResult.pass.passCode}</p>
              <p><span className="font-medium">Employee:</span> {verificationResult.pass.employeeName}</p>
              <p><span className="font-medium">Type:</span> <span className="capitalize">{verificationResult.pass.type}</span></p>
              <p><span className="font-medium">Status:</span> <span className="capitalize">{verificationResult.pass.status}</span></p>
              <p><span className="font-medium">Expected Exit:</span> {verificationResult.pass.expectedExitTime || 'Not specified'}</p>
              <p><span className="font-medium">Expected Return:</span> {verificationResult.pass.expectedReturnTime || 'Not specified'}</p>
              
              {verificationResult.pass.exitTime && (
                <p><span className="font-medium">Actual Exit:</span> {verificationResult.pass.exitTime}</p>
              )}
              
              {verificationResult.pass.returnTime && (
                <p><span className="font-medium">Actual Return:</span> {verificationResult.pass.returnTime}</p>
              )}
              
              <p><span className="font-medium">Expires:</span> {new Date(verificationResult.pass.expiresAt).toLocaleString()}</p>
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogAction>
              {verificationResult?.verified ? "Approve Entry" : "Close"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default GatePass;
