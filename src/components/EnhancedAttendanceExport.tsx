import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, FileSpreadsheet, FileJson, Archive, Settings } from 'lucide-react';
import { attendanceExportService, type ExportOptions } from '@/utils/attendanceExportUtils';
import { Attendance } from '@/types';
import { useToast } from '@/components/ui/use-toast';

interface EnhancedAttendanceExportProps {
  records: Attendance[];
  filteredRecords: Attendance[];
  currentFilters: {
    startDate: string;
    endDate: string;
    department: string;
    searchTerm: string;
  };
  className?: string;
}

const EnhancedAttendanceExport: React.FC<EnhancedAttendanceExportProps> = ({
  records,
  filteredRecords,
  currentFilters,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState<Partial<ExportOptions>>({
    format: 'csv',
    includeHeaders: true,
    dateFormat: 'yyyy-MM-dd',
    timeFormat: 'HH:mm:ss',
    groupByDepartment: false,
    includeSummary: true
  });
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const formatOptions = [
    { value: 'csv', label: 'CSV File', icon: FileText, description: 'Comma-separated values for spreadsheet apps' },
    { value: 'xlsx', label: 'Excel File', icon: FileSpreadsheet, description: 'Microsoft Excel format' },
    { value: 'json', label: 'JSON File', icon: FileJson, description: 'Structured data format for developers' },
    { value: 'zip', label: 'ZIP Archive', icon: Archive, description: 'Multiple formats in one archive' }
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const dataToExport = filteredRecords.length > 0 ? filteredRecords : records;
      
      const finalOptions: Partial<ExportOptions> = {
        ...exportOptions,
        filterCriteria: {
          startDate: currentFilters.startDate,
          endDate: currentFilters.endDate,
          department: currentFilters.department
        }
      };

      await attendanceExportService.exportAttendanceData(dataToExport, finalOptions);
      
      toast({
        title: 'Export Successful',
        description: `${dataToExport.length} records exported as ${exportOptions.format?.toUpperCase()}`,
      });
      
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: 'An error occurred while exporting data',
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const selectedFormat = formatOptions.find(f => f.value === exportOptions.format);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className={className} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Advanced Export</span>
          <span className="sm:hidden">Export</span>
        </Button>
      </DialogTrigger>
      
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            Export Attendance Data
          </DialogTitle>
          <DialogDescription className="text-sm">
            Choose export format and options for attendance records
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Summary */}
          <Card>
            <CardContent className="pt-4 sm:pt-6">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">{filteredRecords.length}</div>
                  <div className="text-sm text-muted-foreground">Filtered Records</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-muted-foreground">{records.length}</div>
                  <div className="text-sm text-muted-foreground">Total Records</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {filteredRecords.filter(r => r.status === 'present' || r.status === 'checked-out').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Present</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">
                    {filteredRecords.filter(r => (r.minutes_late || 0) > 0).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Late</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Format Selection */}
          <div className="space-y-3">
            <Label className="text-sm sm:text-base font-medium">Export Format</Label>
            <div className="grid grid-cols-1 gap-3">
              {formatOptions.map((format) => {
                const Icon = format.icon;
                return (
                  <Card 
                    key={format.value}
                    className={`cursor-pointer transition-colors ${
                      exportOptions.format === format.value ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setExportOptions(prev => ({ ...prev, format: format.value as any }))}
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 text-primary" />
                        <div className="flex-1">
                          <div className="font-medium text-sm sm:text-base">{format.label}</div>
                          <div className="text-xs sm:text-sm text-muted-foreground">{format.description}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-4">
            <Label className="text-sm sm:text-base font-medium">Export Options</Label>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-headers"
                  checked={exportOptions.includeHeaders}
                  onCheckedChange={(checked) => 
                    setExportOptions(prev => ({ ...prev, includeHeaders: checked as boolean }))
                  }
                />
                <Label htmlFor="include-headers" className="text-sm">Include column headers</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-summary"
                  checked={exportOptions.includeSummary}
                  onCheckedChange={(checked) => 
                    setExportOptions(prev => ({ ...prev, includeSummary: checked as boolean }))
                  }
                />
                <Label htmlFor="include-summary" className="text-sm">Include summary statistics</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="group-by-department"
                  checked={exportOptions.groupByDepartment}
                  onCheckedChange={(checked) => 
                    setExportOptions(prev => ({ ...prev, groupByDepartment: checked as boolean }))
                  }
                />
                <Label htmlFor="group-by-department" className="text-sm">Group by department</Label>
              </div>
            </div>

            {/* Date and Time Format */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Date Format</Label>
                <Select 
                  value={exportOptions.dateFormat} 
                  onValueChange={(value) => setExportOptions(prev => ({ ...prev, dateFormat: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yyyy-MM-dd">2024-12-23 (ISO)</SelectItem>
                    <SelectItem value="MM/dd/yyyy">12/23/2024 (US)</SelectItem>
                    <SelectItem value="dd/MM/yyyy">23/12/2024 (EU)</SelectItem>
                    <SelectItem value="MMM dd, yyyy">Dec 23, 2024</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Time Format</Label>
                <Select 
                  value={exportOptions.timeFormat} 
                  onValueChange={(value) => setExportOptions(prev => ({ ...prev, timeFormat: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HH:mm:ss">24-hour (14:30:00)</SelectItem>
                    <SelectItem value="HH:mm">24-hour short (14:30)</SelectItem>
                    <SelectItem value="h:mm:ss a">12-hour (2:30:00 PM)</SelectItem>
                    <SelectItem value="h:mm a">12-hour short (2:30 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Current Filters Display */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Filters</Label>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Date: {currentFilters.startDate} to {currentFilters.endDate}
              </Badge>
              <Badge variant="outline">
                Department: {currentFilters.department === 'all' ? 'All' : currentFilters.department}
              </Badge>
              {currentFilters.searchTerm && (
                <Badge variant="outline">
                  Search: {currentFilters.searchTerm}
                </Badge>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              className="w-full sm:w-auto"
              size="sm"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={isExporting || filteredRecords.length === 0}
              className="w-full sm:w-auto"
              size="sm"
            >
              {isExporting ? (
                <>
                  <Download className="mr-2 h-4 w-4 animate-pulse" />
                  Exporting...
                </>
              ) : (
                <>
                  {selectedFormat && <selectedFormat.icon className="mr-2 h-4 w-4" />}
                  <span className="hidden sm:inline">Export {filteredRecords.length > 0 ? filteredRecords.length : records.length} Records</span>
                  <span className="sm:hidden">Export ({filteredRecords.length > 0 ? filteredRecords.length : records.length})</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedAttendanceExport;
