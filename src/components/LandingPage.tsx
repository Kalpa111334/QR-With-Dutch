
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QrCode, Users, FileText, Clock, ArrowRight } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100">
      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="text-center mb-16">
          <div className="inline-block p-3 bg-white/50 backdrop-blur-sm rounded-lg mb-6">
            <QrCode className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
            QR Attendance System
          </h1>
          <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
            Streamline your employee attendance tracking with our powerful QR code-based system.
            Simple, efficient, and modern.
          </p>
          <Button 
            onClick={onGetStarted} 
            size="lg" 
            className="mt-8 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg"
          >
            Get Started <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <Card className="bg-white/70 backdrop-blur-sm hover:shadow-lg transition-all overflow-hidden border-none">
            <div className="h-2 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
            <CardContent className="p-6">
              <div className="bg-blue-100 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                <QrCode className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">QR-Based Check-in</h3>
              <p className="text-gray-600">
                Employees can check in and out quickly by simply scanning their unique QR code.
                No more time cards or manual entries.
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-white/70 backdrop-blur-sm hover:shadow-lg transition-all overflow-hidden border-none">
            <div className="h-2 bg-gradient-to-r from-purple-500 to-pink-400"></div>
            <CardContent className="p-6">
              <div className="bg-purple-100 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Detailed Reports</h3>
              <p className="text-gray-600">
                Access comprehensive attendance reports and analytics to gain insights
                into employee attendance patterns.
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-white/70 backdrop-blur-sm hover:shadow-lg transition-all overflow-hidden border-none">
            <div className="h-2 bg-gradient-to-r from-pink-500 to-orange-400"></div>
            <CardContent className="p-6">
              <div className="bg-pink-100 p-3 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-pink-600" />
              </div>
              <h3 className="text-xl font-bold mb-2">Real-time Tracking</h3>
              <p className="text-gray-600">
                Monitor employee attendance in real-time. Get instant notifications
                for late arrivals or absences.
              </p>
            </CardContent>
          </Card>
        </div>
        
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-8 mb-16 shadow-lg">
          <div className="flex flex-col md:flex-row items-center">
            <div className="md:w-1/2 mb-6 md:mb-0 md:pr-10">
              <h2 className="text-3xl font-bold mb-4">Employee Management Made Simple</h2>
              <p className="text-gray-600 mb-6">
                Our system makes it easy to manage your workforce with features like bulk employee imports,
                department organization, and custom reports. Save time and reduce administrative overhead.
              </p>
              <div className="space-y-3">
                {['Easy employee onboarding', 'Bulk import from CSV or Excel', 'Department management', 'Attendance history'].map((feature, index) => (
                  <div key={index} className="flex items-center">
                    <div className="rounded-full bg-green-100 p-1 mr-3">
                      <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:w-1/2 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-purple-600 rounded-2xl transform rotate-3"></div>
                <div className="relative bg-white p-6 rounded-2xl shadow-sm">
                  <div className="flex items-center border-b pb-4 mb-4">
                    <div className="bg-primary/10 p-3 rounded-full">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div className="ml-4">
                      <h4 className="font-semibold">Employee Management</h4>
                      <p className="text-sm text-gray-500">Add, edit and organize your team</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-2 bg-gray-100 rounded w-full"></div>
                    <div className="h-2 bg-gray-100 rounded w-4/5"></div>
                    <div className="h-2 bg-gray-100 rounded w-3/5"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Get Started?</h2>
          <Button 
            onClick={onGetStarted} 
            size="lg" 
            className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg"
          >
            Start Using QR Attendance <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
