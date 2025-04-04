
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LandingPage from "./components/LandingPage";
import RosterManagement from "./pages/RosterManagement";
import GatePass from "./pages/GatePass";
import { setupAutoReportScheduling } from "./utils/attendanceUtils";
import { toast } from "@/components/ui/use-toast";

// Create a new QueryClient with better configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // Try failed requests only once
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false, // Don't refetch when window gets focus
      refetchOnReconnect: true, // Do refetch when reconnecting
      meta: {
        onError: (error) => {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "An unexpected error occurred",
            variant: "destructive",
          });
        }
      },
    },
  },
});

const App: React.FC = () => {
  const [showApp, setShowApp] = React.useState<boolean>(false);
  const [isInitialized, setIsInitialized] = React.useState<boolean>(false);
  const [initError, setInitError] = React.useState<string | null>(null);
  
  // Check local storage to see if user has already entered the app
  React.useEffect(() => {
    const hasEntered = localStorage.getItem('hasEnteredApp');
    if (hasEntered === 'true') {
      setShowApp(true);
    }
    
    // Set up automatic report scheduling when the app loads
    try {
      setupAutoReportScheduling();
      setIsInitialized(true);
    } catch (error) {
      console.error("Error initializing app:", error);
      setInitError(error instanceof Error ? error.message : "Failed to initialize application");
      setIsInitialized(true); // We still want to show the app even if there's an initialization error
    }
  }, []);

  const handleGetStarted = () => {
    localStorage.setItem('hasEnteredApp', 'true');
    setShowApp(true);
  };

  // Add the more responsive meta tag for viewport
  React.useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    document.getElementsByTagName('head')[0].appendChild(meta);
    
    return () => {
      document.getElementsByTagName('head')[0].removeChild(meta);
    };
  }, []);

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950 dark:via-purple-950 dark:to-pink-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If there was an initialization error, show it but still let users access the app
  if (initError) {
    toast({
      title: "Warning",
      description: `There was an issue initializing some features: ${initError}`,
      variant: "destructive",
    });
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950 dark:via-purple-950 dark:to-pink-950 overflow-x-hidden">
          <Toaster />
          <Sonner position="top-center" closeButton={true} richColors />
          <BrowserRouter>
            {!showApp ? (
              <LandingPage onGetStarted={handleGetStarted} />
            ) : (
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/landing" element={<LandingPage onGetStarted={() => setShowApp(true)} />} />
                <Route path="/roster" element={<RosterManagement />} />
                <Route path="/gate-pass" element={<GatePass />} />
                <Route path="/home" element={<Navigate to="/" replace />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            )}
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
