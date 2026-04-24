import { useNavigate } from "react-router-dom";
import { useState } from "react";
import RecoveryMatrix from "@/components/RecoveryMatrix";
import CashflowOracleWidget from "@/components/CashflowOracleWidget";
import SmartCollectionAssistant from "@/components/SmartCollectionAssistant";
import AppLayout from "@/components/AppLayout";
import { MetricCard } from "@/components/dashboard/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import RepaymentProgress from "@/components/RepaymentProgress";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MetricCardSkeleton, TableSkeleton, SummaryCardSkeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, Wallet, PiggyBank, CreditCard, Send, Plus, ArrowUpRight, AlertTriangle, Clock, Minus, Shield, Droplets, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDashboardMetrics, useClients, useInvestors } from "@/hooks/useSupabaseData";
import ExpenseEntryModal from "@/components/expenses/ExpenseEntryModal";
import OnboardingWizard from "@/components/OnboardingWizard";
import PendingApprovalsWidget from "@/components/dashboard/PendingApprovalsWidget";


const Dashboard = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [expenseOpen, setExpenseOpen] = useState(false);

  // 🚀 PHASE 0 — ZERO-WATERFALL: each section loads independently.
  // No global `loading` gate — layout renders instantly.
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { data: dbClients, isLoading: clientsLoading } = useClients();
  const { data: dbInvestors, isLoading: investorsLoading } = useInvestors();

  // Use DB data only — no fake fallbacks
  const displayClients = (dbClients ?? []).slice(0, 4);
  const displayInvestors = dbInvestors ?? [];

  const totalClients = metrics?.totalClients ?? 0;
  const activeLoansCount = metrics?.activeLoansCount ?? 0;
  const totalLoanAmount = metrics?.totalLoanAmount ?? 0;
  const totalCapital = metrics?.totalCapital ?? 0;
  const investorCount = metrics?.investorCount ?? 0;
  const savingsThisMonth = metrics?.savingsThisMonth ?? 0;
  const overdueCount = metrics?.overdueCount ?? 0;
  const pendingCount = metrics?.pendingCount ?? 0;

  return (
    <AppLayout>
      <OnboardingWizard />
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        badge={lang === "bn" ? "🏠 কমান্ড সেন্টার" : "🏠 Command Center"}
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg shadow-sm btn-depth" onClick={() => navigate("/notifications")}>
              <Send className="w-3.5 h-3.5" /> {t("dashboard.sendNotification")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs rounded-lg shadow-sm btn-depth border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setExpenseOpen(true)}
            >
              <Minus className="w-3.5 h-3.5" />
              {lang === "bn" ? "ব্যয় এন্ট্রি" : "Log Expense"}
            </Button>
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 btn-depth" onClick={() => navigate("/clients")}>
              <Plus className="w-3.5 h-3.5" /> {t("dashboard.newClient")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
        <MetricCard
          title={t("dashboard.totalClients")}
          value={totalClients}
          subtitle={`${activeLoansCount} ${t("dashboard.activeLoansCount")}`}
          icon={<Users className="w-5 h-5" />}
          trend={{ value: 8, positive: true }}
        />
        <MetricCard
          title={t("dashboard.activeLoans")}
          value={`৳${(totalLoanAmount / 1000).toFixed(0)}K`}
          subtitle={`${activeLoansCount} ${t("dashboard.disbursed")}`}
          icon={<Wallet className="w-5 h-5" />}
          variant="warning"
          trend={{ value: 12, positive: true }}
        />
        <MetricCard
          title={t("dashboard.investorCapital")}
          value={`৳${(totalCapital / 100000).toFixed(1)}L`}
          subtitle={`${investorCount} ${t("dashboard.investors")}`}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success"
          trend={{ value: 5, positive: true }}
        />
        <MetricCard
          title={t("dashboard.savingsCollected")}
          value={`৳${(savingsThisMonth / 1000).toFixed(0)}K`}
          subtitle={t("dashboard.thisMonth")}
          icon={<PiggyBank className="w-5 h-5" />}
          variant="default"
        />
      </div>

      {/* v3: Risk Reserve + Liquidity row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6">
        <MetricCard
          title={lang === "bn" ? "ঝুঁকি সঞ্চিতি" : "Risk Reserve Fund"}
          value={`৳${((metrics?.riskReserve ?? 0) / 1000).toFixed(1)}K`}
          subtitle={lang === "bn" ? "RISK_RESERVE অ্যাকাউন্ট" : "RISK_RESERVE account"}
          icon={<Shield className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={lang === "bn" ? "তারল্য অনুপাত" : "Liquidity Ratio"}
          value={metrics?.liquidityRatio != null ? metrics.liquidityRatio.toFixed(4) : "—"}
          subtitle={metrics?.liquiditySnapshotDate
            ? `${lang === "bn" ? "তারিখ" : "As of"}: ${metrics.liquiditySnapshotDate}`
            : (lang === "bn" ? "ডেটা নেই" : "No data")}
          icon={<Droplets className="w-5 h-5" />}
          variant={metrics?.liquidityRatio != null && metrics.liquidityRatio < 1 ? "warning" : "default"}
        />
        {/* Reconciliation health — red pulsing when issues > 0 */}
        <div className={`card-elevated p-5 border-l-4 ${
          (metrics?.reconciliationIssueCount ?? 0) > 0
            ? "border-l-destructive animate-pulse"
            : "border-l-success"
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${
              (metrics?.reconciliationIssueCount ?? 0) > 0 ? "bg-destructive/10" : "bg-success/10"
            }`}>
              <ShieldAlert className={`w-4 h-4 ${
                (metrics?.reconciliationIssueCount ?? 0) > 0 ? "text-destructive" : "text-success"
              }`} />
            </div>
            <div>
              <p className="text-sm font-bold text-card-foreground">
                {(metrics?.reconciliationIssueCount ?? 0) > 0
                  ? `⚠️ ${metrics?.reconciliationIssueCount} ${lang === "bn" ? "লেজার অমিল" : "Ledger Imbalance(s)"}`
                  : (lang === "bn" ? "লেজার পরিচ্ছন্ন" : "Ledger Clean")}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {metrics?.reconciliationStatus ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <PendingApprovalsWidget />

      {/* Summary Cards Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="card-elevated p-5 border-l-4 border-l-destructive">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-bold text-card-foreground">{overdueCount} {t("dashboard.overduePayments")}</p>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{t("dashboard.overduePayments")}</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-warning">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-warning/10">
              <Clock className="w-4 h-4 text-warning" />
            </div>
            <div>
              <p className="text-sm font-bold text-card-foreground">{pendingCount} {t("dashboard.pendingDeposits")}</p>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Due within next 3 days</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-success/10">
              <TrendingUp className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-sm font-bold text-card-foreground">{t("dashboard.profitDistributions")}</p>
              <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                {metrics?.profitThisMonth ? `৳${metrics.profitThisMonth.toLocaleString()} this month` : "Auto-reinvest active"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Investor Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
        <MetricCard
          title={lang === "bn" ? "মোট বিনিয়োগ" : "Total Investment"}
          value={`৳${((metrics?.totalPrincipalInvested ?? 0) / 1000).toFixed(0)}K`}
          subtitle={`${metrics?.activeInvestorCount ?? 0} ${lang === "bn" ? "সক্রিয়" : "active"}`}
          icon={<Wallet className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={lang === "bn" ? "লভ্যাংশ বিতরণ" : "Profit Distributed"}
          value={`৳${((metrics?.totalProfitDistributed ?? 0) / 1000).toFixed(0)}K`}
          subtitle={`${lang === "bn" ? "সঞ্চিত" : "Accrued"}: ৳${((metrics?.totalAccumulatedProfit ?? 0) / 1000).toFixed(0)}K`}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={lang === "bn" ? "পুনর্বিনিয়োগকারী" : "Reinvestors"}
          value={metrics?.reinvestorCount ?? 0}
          subtitle={`${lang === "bn" ? "মোট" : "of"} ${metrics?.investorCount ?? 0}`}
          icon={<ArrowUpRight className="w-5 h-5" />}
        />
        <MetricCard
          title={lang === "bn" ? "এই মাসের লভ্যাংশ" : "Profit This Month"}
          value={`৳${((metrics?.profitThisMonth ?? 0) / 1000).toFixed(0)}K`}
          subtitle={lang === "bn" ? "চলতি মাস" : "Current month"}
          icon={<PiggyBank className="w-5 h-5" />}
          variant="default"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { icon: CreditCard, labelKey: "action.payLoan", path: "/loans" },
          { icon: PiggyBank, labelKey: "action.deposit", path: "/savings" },
          { icon: ArrowUpRight, labelKey: "action.reinvest", path: "/investors" },
          { icon: Send, labelKey: "action.sendMessage", path: "/notifications" },
        ].map((action) => (
          <Button key={action.labelKey} variant="outline" size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm btn-depth hover:bg-accent hover:text-accent-foreground hover:border-accent transition-all"
            onClick={() => navigate(action.path)}>
            <action.icon className="w-3.5 h-3.5" />
            {t(action.labelKey)}
          </Button>
        ))}
      </div>

      {/* Recovery Matrix */}
      {/* AI Cashflow Oracle + Recovery Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <CashflowOracleWidget />
        <RecoveryMatrix />
      </div>

      {/* Smart Collection Assistant */}
      <SmartCollectionAssistant maxItems={6} />

      {/* Recent Clients */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-card-foreground">{t("dashboard.recentClients")}</h2>
          <Button variant="ghost" size="sm" className="text-xs text-primary font-semibold" onClick={() => navigate("/clients")}>
            {t("dashboard.viewAll")}
          </Button>
        </div>
        {clientsLoading ? (
          <div className="p-4">
            <TableSkeleton rows={4} cols={4} />
          </div>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table className="table-premium">
                <TableHeader className="table-header-premium">
                  <TableRow>
                    <TableHead>{t("table.name")}</TableHead>
                    <TableHead>{t("table.area")}</TableHead>
                    <TableHead>{t("table.loan")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayClients.map((client) => {
                    const name = lang === "bn" ? (client as any).name_bn : (client as any).name_en;
                    const area = (client as any).area;
                    const loanAmt = (client as any).loan_amount;
                    const status = (client as any).status;
                    const id = (client as any).id;
                    const nextPayment = (client as any).next_payment_date;

                    return (
                      <TooltipProvider key={id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TableRow className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/clients/${id}`)}>
                              <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                              <TableCell className="text-xs">{area || "—"}</TableCell>
                              <TableCell className="text-xs font-semibold">{loanAmt ? `৳${Number(loanAmt).toLocaleString()}` : "—"}</TableCell>
                              <TableCell><StatusBadge status={status === "overdue" ? "overdue" : status === "pending" ? "pending" : status === "active" ? "active" : "inactive"} /></TableCell>
                            </TableRow>
                          </TooltipTrigger>
                          <TooltipContent className="tooltip-premium" side="top">
                            <p>{nextPayment ? `Next payment: ${nextPayment}` : "No payment scheduled"}</p>
                            {loanAmt && <p>Loan: ৳{Number(loanAmt).toLocaleString()}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="sm:hidden divide-y divide-border">
              {displayClients.map((client) => {
                const name = lang === "bn" ? (client as any).name_bn : (client as any).name_en;
                const loanAmt = (client as any).loan_amount;
                const area = (client as any).area;
                const status = (client as any).status;
                const id = (client as any).id;

                return (
                  <div key={id} className="p-4 flex items-center gap-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/clients/${id}`)}>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold truncate">{name}</p>
                        <StatusBadge status={status === "overdue" ? "overdue" : status === "active" ? "active" : "inactive"} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{area}</span>
                        <span>•</span>
                        <span className="font-semibold text-foreground">{loanAmt ? `৳${Number(loanAmt).toLocaleString()}` : "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Investors */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-card-foreground">{t("nav.investors")}</h2>
          <Button variant="ghost" size="sm" className="text-xs text-primary font-semibold" onClick={() => navigate("/investors")}>
            {t("dashboard.viewAll")}
          </Button>
        </div>
        <div className="hidden sm:block">
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.capital")}</TableHead>
                <TableHead>{t("table.monthlyProfit")}</TableHead>
                <TableHead>{t("table.reinvest")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayInvestors.map((inv) => {
                const name = lang === "bn" ? (inv as any).name_bn : (inv as any).name_en;
                const capital = (inv as any).capital;
                const profitPct = (inv as any).monthly_profit_percent;
                const reinvest = (inv as any).reinvest;
                const id = (inv as any).id;

                return (
                  <TableRow key={id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/investors/${id}`)}>
                    <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                    <TableCell className="text-xs font-semibold">৳{Number(capital).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{profitPct}%</TableCell>
                    <TableCell><StatusBadge status={reinvest ? "active" : "inactive"} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="sm:hidden divide-y divide-border">
          {displayInvestors.map((inv) => {
            const name = lang === "bn" ? (inv as any).name_bn : (inv as any).name_en;
            const capital = (inv as any).capital;
            const profitPct = (inv as any).monthly_profit_percent;
            const reinvest = (inv as any).reinvest;
            const id = (inv as any).id;

            return (
              <div key={id} className="p-4 flex items-center gap-3 cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/investors/${id}`)}>
                <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <StatusBadge status={reinvest ? "active" : "inactive"} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">৳{Number(capital).toLocaleString()}</span>
                    <span>•</span>
                    <span>{profitPct}% {t("table.monthlyProfit")}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ExpenseEntryModal open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </AppLayout>
  );
};

export default Dashboard;
