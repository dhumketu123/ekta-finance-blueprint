import React, { Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantBrandingProvider } from "@/contexts/TenantBrandingContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";

// Static imports — critical auth paths (must load instantly)
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Static imports — core high-frequency pages (instant navigation)
import Index from "./pages/Index";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Loans from "./pages/Loans";
import LoanDetail from "./pages/LoanDetail";
import Savings from "./pages/Savings";
import SavingsDetail from "./pages/SavingsDetail";

// Lazy imports — secondary/heavy pages
const Investors = React.lazy(() => import("./pages/Investors"));
const InvestorDetail = React.lazy(() => import("./pages/InvestorDetail"));
const Owners = React.lazy(() => import("./pages/Owners"));
const OwnerDetail = React.lazy(() => import("./pages/OwnerDetail"));
const FieldOfficers = React.lazy(() => import("./pages/FieldOfficers"));
const OfficerDetail = React.lazy(() => import("./pages/OfficerDetail"));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const SettingsPage = React.lazy(() => import("./pages/SettingsPage"));
const Approvals = React.lazy(() => import("./pages/Approvals"));
const InvestorWallet = React.lazy(() => import("./pages/InvestorWallet"));
const FinancialTransactions = React.lazy(() => import("./pages/FinancialTransactions"));
const Reports = React.lazy(() => import("./pages/Reports"));
const TrialBalance = React.lazy(() => import("./pages/TrialBalance"));
const ProfitLoss = React.lazy(() => import("./pages/ProfitLoss"));
const PaymentStatus = React.lazy(() => import("./pages/PaymentStatus"));
const InvestorSummary = React.lazy(() => import("./pages/InvestorSummary"));
const RiskDashboard = React.lazy(() => import("./pages/RiskDashboard"));
const MonitoringDashboard = React.lazy(() => import("./pages/MonitoringDashboard"));
const OwnerProfitDistribution = React.lazy(() => import("./pages/OwnerProfitDistribution"));
const QuantumLedger = React.lazy(() => import("./pages/QuantumLedger"));
const Commitments = React.lazy(() => import("./pages/Commitments"));
const CommitmentAnalytics = React.lazy(() => import("./pages/CommitmentAnalytics"));
const RiskHeatmap = React.lazy(() => import("./pages/RiskHeatmap"));
const LedgerAudit = React.lazy(() => import("./pages/LedgerAudit"));
const SuperAdminDashboard = React.lazy(() => import("./pages/SuperAdminDashboard"));
const AccountingDashboard = React.lazy(() => import("./pages/AccountingDashboard"));
const DayClose = React.lazy(() => import("./pages/DayClose"));
const BalanceSheet = React.lazy(() => import("./pages/BalanceSheet"));

/* ── Premium page loader ── */
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
    <div className="relative h-10 w-10">
      <div
        className="absolute inset-0 rounded-full animate-spin"
        style={{
          background: "conic-gradient(from 0deg, transparent 60%, hsl(var(--primary)))",
          maskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))",
          WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))",
        }}
      />
    </div>
    <p className="text-xs text-muted-foreground animate-pulse">লোড হচ্ছে...</p>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <AuthProvider>
          <TenantBrandingProvider>
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <RouteErrorBoundary>
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
                <Route path="/owner-profit" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><OwnerProfitDistribution /></ProtectedRoute>} />
                <Route path="/wallet" element={<ProtectedRoute allowedRoles={["investor"]}><InvestorWallet /></ProtectedRoute>} />
                <Route path="/quantum-ledger" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><QuantumLedger /></ProtectedRoute>} />
                <Route path="/commitments" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><Commitments /></ProtectedRoute>} />
                <Route path="/commitment-analytics" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><CommitmentAnalytics /></ProtectedRoute>} />
                <Route path="/risk-heatmap" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><RiskHeatmap /></ProtectedRoute>} />
                <Route path="/ledger-audit" element={<ProtectedRoute allowedRoles={["admin", "owner"]}><LedgerAudit /></ProtectedRoute>} />
                <Route path="/super-admin" element={<ProtectedRoute allowedRoles={["admin"]}><SuperAdminDashboard /></ProtectedRoute>} />
                <Route path="/accounting" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><AccountingDashboard /></ProtectedRoute>} />
                <Route path="/day-close" element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><DayClose /></ProtectedRoute>} />
                <Route path="/reports/balance-sheet" element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><BalanceSheet /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </RouteErrorBoundary>
            </Suspense>
          </BrowserRouter>
          </TenantBrandingProvider>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
