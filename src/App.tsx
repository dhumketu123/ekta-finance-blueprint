import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
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
import Approvals from "./pages/Approvals";
import NotFound from "./pages/NotFound";
import InvestorWallet from "./pages/InvestorWallet";
import FinancialTransactions from "./pages/FinancialTransactions";
import Reports from "./pages/Reports";
import TrialBalance from "./pages/TrialBalance";
import ProfitLoss from "./pages/ProfitLoss";
import PaymentStatus from "./pages/PaymentStatus";
import InvestorSummary from "./pages/InvestorSummary";
import RiskDashboard from "./pages/RiskDashboard";
import MonitoringDashboard from "./pages/MonitoringDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><Index /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><Clients /></ProtectedRoute>} />
              <Route path="/clients/:id" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><ClientDetail /></ProtectedRoute>} />
              <Route path="/investors" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><Investors /></ProtectedRoute>} />
              <Route path="/investors/:id" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><InvestorDetail /></ProtectedRoute>} />
              <Route path="/owners" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><Owners /></ProtectedRoute>} />
              <Route path="/owners/:id" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><OwnerDetail /></ProtectedRoute>} />
              <Route path="/field-officers" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><FieldOfficers /></ProtectedRoute>} />
              <Route path="/field-officers/:id" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><OfficerDetail /></ProtectedRoute>} />
              <Route path="/loans" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><Loans /></ProtectedRoute>} />
              <Route path="/loans/:id" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><LoanDetail /></ProtectedRoute>} />
              <Route path="/savings" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><Savings /></ProtectedRoute>} />
              <Route path="/savings/:id" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><SavingsDetail /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><Notifications /></ProtectedRoute>} />
              <Route path="/approvals" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer", "field_officer"]}><Approvals /></ProtectedRoute>} />
              <Route path="/transactions" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer", "field_officer"]}><FinancialTransactions /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><SettingsPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><Reports /></ProtectedRoute>} />
              <Route path="/reports/trial-balance" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><TrialBalance /></ProtectedRoute>} />
              <Route path="/reports/profit-loss" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><ProfitLoss /></ProtectedRoute>} />
              <Route path="/reports/payment-status" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><PaymentStatus /></ProtectedRoute>} />
              <Route path="/reports/investor-summary" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><InvestorSummary /></ProtectedRoute>} />
              <Route path="/risk-dashboard" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><RiskDashboard /></ProtectedRoute>} />
              <Route path="/monitoring" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><MonitoringDashboard /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute allowedRoles={["investor"]}><InvestorWallet /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
