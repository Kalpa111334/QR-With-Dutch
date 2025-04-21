import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, LogOut, UserX, Clock, Timer, AlertTriangle, Briefcase, Share2, Loader2 } from 'lucide-react';
import { getTodayAttendanceSummary, autoShareAttendanceSummary } from '@/utils/attendanceUtils';
import { toast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface DetailedStats {
  onTime: number;
  lateArrivals: number;
  veryLate: number;
  halfDay: number;
  earlyDepartures: number;
  overtime: number;
  regularHours: number;
  attendanceRate: string;
  efficiencyRate: string;
  punctualityRate: string;
}

interface PresenceBreakdown {
  currentlyPresent: number;
  lateButPresent: number;
  checkedOut: number;
  onTimeArrivals: number;
  absent: number;
}

interface AttendanceData {
  totalEmployees: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  checkedOutCount: number;
  onTime: number;
  stillWorking: number;
  currentPresenceRate: string;
  totalPresentRate: string;
  onTimeRate: string;
  lateRate: string;
  absentRate: string;
  detailed: DetailedStats;
  presenceBreakdown: PresenceBreakdown;
}

const AttendanceStats: React.FC = () => {
  const [stats, setStats] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [lastPresentCount, setLastPresentCount] = useState(0);
  const [activeView, setActiveView] = useState<'standard' | 'detailed' | 'rates'>('standard');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await getTodayAttendanceSummary();
        if (stats && data.presentCount > lastPresentCount) {
          toast({
            title: "New Check-in!",
            description: `Total present: ${data.presentCount}/${data.totalEmployees}`,
            duration: 3000,
          });
        }
        setLastPresentCount(data.presentCount);
        setStats(data);
      } catch (error) {
        console.error('Error fetching attendance stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30 * 1000);
    return () => clearInterval(interval);
  }, [stats, lastPresentCount]);

  const handleShare = async () => {
    try {
      setSharing(true);
      const whatsappUrl = await autoShareAttendanceSummary();
      
      if (!whatsappUrl) {
        toast({
          title: "Sharing Failed",
          description: "Please check your WhatsApp settings and try again.",
          variant: "destructive",
        });
        return;
      }

      // Open WhatsApp in a new window
      window.open(whatsappUrl, '_blank');
      
      toast({
        title: "Report Ready",
        description: "WhatsApp has been opened with the detailed report.",
      });
    } catch (error) {
      toast({
        title: "Sharing Failed",
        description: "An error occurred while preparing the report.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-white/50 dark:bg-black/20">
            <CardContent className="p-6">
              <div className="h-16 animate-pulse bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const standardCards = [
    {
      title: 'Total Employees',
      value: stats?.totalEmployees || 0,
      icon: Users,
      description: 'Active employees in system',
      color: 'text-blue-600'
    },
    {
      title: 'Present Today',
      value: stats?.presentCount || 0,
      icon: UserCheck,
      description: `Present Rate: ${stats?.totalPresentRate || '0.0'}%`,
      color: 'text-green-600',
      highlight: stats?.presentCount > lastPresentCount
    },
    {
      title: 'Checked Out',
      value: stats?.checkedOutCount || 0,
      icon: LogOut,
      description: `Still Working: ${stats?.stillWorking || 0}`,
      color: 'text-orange-600'
    },
    {
      title: 'Absent Today',
      value: stats?.absentCount || 0,
      icon: UserX,
      description: `Absent Rate: ${stats?.absentRate || '0.0'}%`,
      color: `text-${stats?.absentCount ? 'red' : 'gray'}-600`
    }
  ];

  const detailedCards = [
    {
      title: 'On Time',
      value: stats?.presenceBreakdown.onTimeArrivals || 0,
      icon: Clock,
      description: `Punctuality Rate: ${stats?.onTimeRate || '0.0'}%`,
      color: 'text-green-600'
    },
    {
      title: 'Late But Present',
      value: stats?.presenceBreakdown.lateButPresent || 0,
      icon: AlertTriangle,
      description: `Late Rate: ${stats?.lateRate || '0.0'}%`,
      color: 'text-yellow-600'
    },
    {
      title: 'Currently Present',
      value: stats?.presenceBreakdown.currentlyPresent || 0,
      icon: Briefcase,
      description: `Current Rate: ${stats?.currentPresenceRate || '0.0'}%`,
      color: 'text-blue-600'
    },
    {
      title: 'Total Present',
      value: (stats?.presenceBreakdown.currentlyPresent || 0) + 
             (stats?.presenceBreakdown.lateButPresent || 0) + 
             (stats?.presenceBreakdown.checkedOut || 0),
      icon: Users,
      description: `Total Rate: ${stats?.totalPresentRate || '0.0'}%`,
      color: 'text-green-600'
    }
  ];

  const rateCards = [
    {
      title: 'Attendance Rate',
      value: `${stats?.totalPresentRate || '0.0'}%`,
      icon: Users,
      description: `${(stats?.presenceBreakdown.currentlyPresent || 0) + 
                    (stats?.presenceBreakdown.lateButPresent || 0) + 
                    (stats?.presenceBreakdown.checkedOut || 0)} of ${stats?.totalEmployees || 0}`,
      color: 'text-blue-600'
    },
    {
      title: 'Punctuality Rate',
      value: `${stats?.onTimeRate || '0.0'}%`,
      icon: Clock,
      description: `${stats?.presenceBreakdown.onTimeArrivals || 0} arrived on time`,
      color: 'text-green-600'
    },
    {
      title: 'Current Presence',
      value: `${stats?.currentPresenceRate || '0.0'}%`,
      icon: UserCheck,
      description: `${stats?.presenceBreakdown.currentlyPresent || 0} currently in office`,
      color: 'text-orange-600'
    },
    {
      title: 'Efficiency Rate',
      value: `${stats?.detailed.efficiencyRate || '0.0'}%`,
      icon: Briefcase,
      description: `Based on working hours`,
      color: 'text-purple-600'
    }
  ];

  const currentCards = {
    standard: standardCards,
    detailed: detailedCards,
    rates: rateCards
  }[activeView];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Tabs value={activeView} onValueChange={(value) => setActiveView(value as 'standard' | 'detailed' | 'rates')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="standard">Standard View</TabsTrigger>
            <TabsTrigger value="detailed">Detailed View</TabsTrigger>
            <TabsTrigger value="rates">Rates View</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          onClick={handleShare}
          disabled={sharing || loading}
          className="ml-4 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {sharing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sharing...
            </>
          ) : (
            <>
              <Share2 className="mr-2 h-4 w-4" />
              Share Report
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {currentCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={index} 
              className={`bg-white/50 dark:bg-black/20 hover:shadow-md transition-all duration-300 ${
                stat.highlight ? 'animate-pulse border-green-500 border-2' : ''
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AttendanceStats; 