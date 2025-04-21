import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AttendanceTable from '@/components/AttendanceTable';
import AttendanceSummaryShare from '@/components/AttendanceSummaryShare';
import AutomatedAttendanceBot from '@/components/AutomatedAttendanceBot';

const AttendanceRecords: React.FC = () => {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold">Attendance Records</h1>
      
      <Tabs defaultValue="records" className="w-full">
        <TabsList>
          <TabsTrigger value="records">Records</TabsTrigger>
          <TabsTrigger value="share">Manual Share</TabsTrigger>
          <TabsTrigger value="bot">Automated BOT</TabsTrigger>
        </TabsList>
        
        <TabsContent value="records">
          <AttendanceTable />
        </TabsContent>
        
        <TabsContent value="share">
          <AttendanceSummaryShare />
        </TabsContent>

        <TabsContent value="bot">
          <AutomatedAttendanceBot />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AttendanceRecords; 