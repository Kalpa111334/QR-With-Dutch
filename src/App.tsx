
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LandingPage from "./components/LandingPage";

const queryClient = new QueryClient();

const App = () => {
  const [showApp, setShowApp] = useState<boolean>(false);
  
  // Check local storage to see if user has already entered the app
  useEffect(() => {
    const hasEntered = localStorage.getItem('hasEnteredApp');
    if (hasEntered === 'true') {
      setShowApp(true);
    }
  }, []);

  const handleGetStarted = () => {
    localStorage.setItem('hasEnteredApp', 'true');
    setShowApp(true);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950 dark:via-purple-950 dark:to-pink-950">
          <Toaster />
          <Sonner />
          <BrowserRouter>
            {!showApp ? (
              <LandingPage onGetStarted={handleGetStarted} />
            ) : (
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/landing" element={<LandingPage onGetStarted={() => setShowApp(true)} />} />
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
