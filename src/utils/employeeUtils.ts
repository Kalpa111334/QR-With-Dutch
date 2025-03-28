
import { Employee } from '../types';

// In a real app, this would be replaced with a database call
const EMPLOYEES_STORAGE_KEY = 'qr-attendance-employees';

export const getEmployees = (): Employee[] => {
  const storedEmployees = localStorage.getItem(EMPLOYEES_STORAGE_KEY);
  if (storedEmployees) {
    return JSON.parse(storedEmployees);
  }
  return [];
};

export const addEmployee = (employee: Employee): Employee => {
  const employees = getEmployees();
  const newEmployee = {
    ...employee,
    id: crypto.randomUUID(),
  };
  
  employees.push(newEmployee);
  localStorage.setItem(EMPLOYEES_STORAGE_KEY, JSON.stringify(employees));
  return newEmployee;
};

export const updateEmployee = (updatedEmployee: Employee): Employee => {
  const employees = getEmployees();
  const index = employees.findIndex(emp => emp.id === updatedEmployee.id);
  
  if (index !== -1) {
    employees[index] = updatedEmployee;
    localStorage.setItem(EMPLOYEES_STORAGE_KEY, JSON.stringify(employees));
  }
  
  return updatedEmployee;
};

export const deleteEmployee = (id: string): boolean => {
  const employees = getEmployees();
  const filteredEmployees = employees.filter(emp => emp.id !== id);
  
  if (filteredEmployees.length !== employees.length) {
    localStorage.setItem(EMPLOYEES_STORAGE_KEY, JSON.stringify(filteredEmployees));
    return true;
  }
  
  return false;
};

export const getEmployeeById = (id: string): Employee | undefined => {
  const employees = getEmployees();
  return employees.find(emp => emp.id === id);
};

export const getDepartments = (): string[] => {
  const employees = getEmployees();
  const departments = new Set<string>();
  
  employees.forEach(emp => {
    if (emp.department) {
      departments.add(emp.department);
    }
  });
  
  return Array.from(departments);
};
