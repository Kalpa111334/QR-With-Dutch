import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Employee } from '@/types';
import { addEmployee, updateEmployee, getDepartments } from '@/utils/employeeUtils';

interface EmployeeFormProps {
  employee?: Employee;
  onSave: () => void;
}

const defaultEmployee: Omit<Employee, 'id'> = {
  firstName: '',
  lastName: '',
  email: '',
  department: '',
  position: '',
  phone: '',
  joinDate: new Date().toISOString().split('T')[0],
  status: 'active',
  name: '', // Add default name property
};

const EmployeeForm: React.FC<EmployeeFormProps> = ({ employee, onSave }) => {
  const [formData, setFormData] = useState<Omit<Employee, 'id'>>({
    ...defaultEmployee,
  });
  const [existingDepartments, setExistingDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (employee) {
      setFormData(employee);
    }
    
    // Fetch departments from Supabase
    const fetchDepartments = async () => {
      try {
        const departments = await getDepartments();
        setExistingDepartments(departments);
      } catch (error) {
        console.error('Error fetching departments:', error);
      }
    };
    
    fetchDepartments();
  }, [employee]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (employee?.id) {
        // Update existing employee
        const result = await updateEmployee({ ...formData, id: employee.id });
        if (result) {
          toast({
            title: 'Employee Updated',
            description: `${formData.firstName} ${formData.lastName} has been updated successfully.`,
          });
          onSave();
        }
      } else {
        // Add new employee
        const result = await addEmployee(formData);
        if (result) {
          toast({
            title: 'Employee Added',
            description: `${formData.firstName} ${formData.lastName} has been added successfully.`,
          });
          setFormData(defaultEmployee);
          onSave();
        }
      }
    } catch (error) {
      console.error('Error saving employee:', error);
      toast({
        title: 'Error',
        description: 'There was an error saving the employee.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{employee?.id ? 'Edit' : 'Add'} Employee</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Select
                value={formData.department}
                onValueChange={(value) => handleSelectChange('department', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {existingDepartments.map(dept => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                name="position"
                value={formData.position}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="joinDate">Join Date</Label>
              <Input
                id="joinDate"
                name="joinDate"
                type="date"
                value={formData.joinDate}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => handleSelectChange('status', value as 'active' | 'inactive')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onSave} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <span className="flex items-center">
                  <span className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full"></span>
                  Processing...
                </span>
              ) : (
                `${employee?.id ? 'Update' : 'Add'} Employee`
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default EmployeeForm;
