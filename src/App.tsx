import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Index from "./pages/Index";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Investors from "./pages/Investors";
import InvestorDetail from "./pages/InvestorDetail";
import Owners from "./pages/Owners";
import OwnerDetail from "./pages/OwnerDetail";
import FieldOfficers from "./pages/FieldOfficers";
import OfficerDetail from "./pages/OfficerDetail";
import Loans from "./pages/Loans";
import LoanDetail from "./pages/LoanDetail";
import Savings from "./pages/Savings";
import SavingsDetail from "./pages/SavingsDetail";
import Notifications from "./pages/Notifications";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/:id" element={<ClientDetail />} />
            <Route path="/investors" element={<Investors />} />
            <Route path="/investors/:id" element={<InvestorDetail />} />
            <Route path="/owners" element={<Owners />} />
            <Route path="/owners/:id" element={<OwnerDetail />} />
            <Route path="/field-officers" element={<FieldOfficers />} />
            <Route path="/field-officers/:id" element={<OfficerDetail />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/loans/:id" element={<LoanDetail />} />
            <Route path="/savings" element={<Savings />} />
            <Route path="/savings/:id" element={<SavingsDetail />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
