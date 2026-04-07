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
import { ROUTES } from "@/config/routes";

// Static imports — critical auth paths
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";

// Static imports — core high-frequency pages
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
const AlumniDashboard = React.lazy(() => import("./pages/AlumniDashboard"));
const GovernanceCore = React.lazy(() => import("./pages/GovernanceCore"));

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
                {/* ── Auth (unprotected) ── */}
                <Route path={ROUTES.AUTH} element={<Auth />} />
                <Route path={ROUTES.RESET_PASSWORD} element={<ResetPassword />} />
                <Route path={ROUTES.UNAUTHORIZED} element={<Unauthorized />} />

                {/* ── Core Operations ── */}
                <Route path={ROUTES.DASHBOARD} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><Index /></ProtectedRoute>} />
                <Route path={ROUTES.TRANSACTIONS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer", "field_officer"]}><FinancialTransactions /></ProtectedRoute>} />
                <Route path={ROUTES.APPROVALS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer", "field_officer"]}><Approvals /></ProtectedRoute>} />
                <Route path={ROUTES.DAY_CLOSE} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><DayClose /></ProtectedRoute>} />
                <Route path={ROUTES.COMMITMENTS} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><Commitments /></ProtectedRoute>} />

                {/* ── Customer & Investor ── */}
                <Route path={ROUTES.CLIENTS} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><Clients /></ProtectedRoute>} />
                <Route path={ROUTES.CLIENT_DETAIL} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><ClientDetail /></ProtectedRoute>} />
                <Route path={ROUTES.LOANS} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><Loans /></ProtectedRoute>} />
                <Route path={ROUTES.LOAN_DETAIL} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer"]}><LoanDetail /></ProtectedRoute>} />
                <Route path={ROUTES.SAVINGS} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><Savings /></ProtectedRoute>} />
                <Route path={ROUTES.SAVINGS_DETAIL} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><SavingsDetail /></ProtectedRoute>} />
                <Route path={ROUTES.INVESTORS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><Investors /></ProtectedRoute>} />
                <Route path={ROUTES.INVESTOR_DETAIL} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><InvestorDetail /></ProtectedRoute>} />
                <Route path={ROUTES.INVESTOR_WALLET} element={<ProtectedRoute allowedRoles={["investor"]}><InvestorWallet /></ProtectedRoute>} />
                <Route path={ROUTES.OWNERS} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><Owners /></ProtectedRoute>} />
                <Route path={ROUTES.OWNER_DETAIL} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><OwnerDetail /></ProtectedRoute>} />
                <Route path={ROUTES.FIELD_OFFICERS} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><FieldOfficers /></ProtectedRoute>} />
                <Route path={ROUTES.OFFICER_DETAIL} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><OfficerDetail /></ProtectedRoute>} />

                {/* ── Risk & Control ── */}
                <Route path={ROUTES.RISK_DASHBOARD} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><RiskDashboard /></ProtectedRoute>} />
                <Route path={ROUTES.RISK_HEATMAP} element={<ProtectedRoute allowedRoles={["admin", "owner", "field_officer", "treasurer"]}><RiskHeatmap /></ProtectedRoute>} />
                <Route path={ROUTES.GOVERNANCE} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><GovernanceCore /></ProtectedRoute>} />
                <Route path={ROUTES.MONITORING} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><MonitoringDashboard /></ProtectedRoute>} />

                {/* ── Intelligence & Reporting ── */}
                <Route path={ROUTES.REPORTS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><Reports /></ProtectedRoute>} />
                <Route path={ROUTES.PROFIT_LOSS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><ProfitLoss /></ProtectedRoute>} />
                <Route path={ROUTES.BALANCE_SHEET} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><BalanceSheet /></ProtectedRoute>} />
                <Route path={ROUTES.TRIAL_BALANCE} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><TrialBalance /></ProtectedRoute>} />
                <Route path={ROUTES.LEDGER_AUDIT} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><LedgerAudit /></ProtectedRoute>} />
                <Route path={ROUTES.OWNER_PROFIT} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><OwnerProfitDistribution /></ProtectedRoute>} />
                <Route path={ROUTES.QUANTUM_LEDGER} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><QuantumLedger /></ProtectedRoute>} />
                <Route path={ROUTES.COMMITMENT_ANALYTICS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><CommitmentAnalytics /></ProtectedRoute>} />
                <Route path={ROUTES.ACCOUNTING} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><AccountingDashboard /></ProtectedRoute>} />
                <Route path={ROUTES.PAYMENT_STATUS} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><PaymentStatus /></ProtectedRoute>} />
                <Route path={ROUTES.INVESTOR_SUMMARY} element={<ProtectedRoute allowedRoles={["admin", "owner", "treasurer"]}><InvestorSummary /></ProtectedRoute>} />

                {/* ── System Administration ── */}
                <Route path={ROUTES.SETTINGS} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><SettingsPage /></ProtectedRoute>} />
                <Route path={ROUTES.NOTIFICATIONS} element={<ProtectedRoute allowedRoles={["admin", "owner"]}><Notifications /></ProtectedRoute>} />
                <Route path={ROUTES.SUPER_ADMIN} element={<ProtectedRoute allowedRoles={["admin"]}><SuperAdminDashboard /></ProtectedRoute>} />

                {/* ── Role-specific ── */}
                <Route path={ROUTES.ALUMNI} element={<ProtectedRoute allowedRoles={["alumni"]}><AlumniDashboard /></ProtectedRoute>} />

                {/* ── Fallback ── */}
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
