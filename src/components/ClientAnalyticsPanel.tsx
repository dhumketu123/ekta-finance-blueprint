import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  ShieldAlert, PiggyBank, BarChart3, Clock
} from "lucide-react";

interface LoanData {
  id: string;
  loan_id: string | null;
  status: string;
  outstanding_principal: number;
  outstanding_interest: number;
  penalty_amount: number;
  emi_amount: number;
  total_principal: number;
  total_interest: number;
  next_due_date: string | null;
  maturity_date: string | null;
}

interface ScheduleStats {
  [loanId: string]: { total: number; paid: number; partial?: number; remaining: number; paidAmount?: number; totalAmount?: number };
}

interface TxData {
  created_at: string;
  transaction_type: string;
  amount: number;
  approval_status: string;
}

interface Props {
  loans: LoanData[];
  scheduleStats: ScheduleStats;
  transactions: TxData[];
  savingsBalance: number;
}

export default function ClientAnalyticsPanel({ loans, scheduleStats, transactions, savingsBalance }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const analytics = useMemo(() => {
    // Payment Punctuality: based on actual amounts paid vs due
    const totalAmount = Object.values(scheduleStats).reduce((s, v) => s + (v.totalAmount || v.total), 0);
    const paidAmount = Object.values(scheduleStats).reduce((s, v) => s + (v.paidAmount || v.paid), 0);
    const totalInstallments = Object.values(scheduleStats).reduce((s, v) => s + v.total, 0);
    const paidInstallments = Object.values(scheduleStats).reduce((s, v) => s + v.paid, 0);
    const partialInstallments = Object.values(scheduleStats).reduce((s, v) => s + (v.partial || 0), 0);
    const punctualityPct = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

    // Overdue loans (next_due_date in the past)
    const now = Date.now();
    const overdueLoans = loans.filter(l => {
      if (!l.next_due_date) return false;
      const diff = Math.ceil((new Date(l.next_due_date).getTime() - now) / 86400000);
      return diff < -7;
    });

    // High-risk loans: >20% overdue EMIs or penalty >10% of principal
    const highRiskLoans = loans.filter(l => {
      const stats = scheduleStats[l.id];
      if (!stats || stats.total === 0) return false;
      const overdueRatio = stats.remaining / stats.total;
      const penaltyRatio = Number(l.total_principal) > 0
        ? Number(l.penalty_amount) / Number(l.total_principal)
        : 0;
      return overdueRatio > 0.2 || penaltyRatio > 0.1;
    });

    // EMI compliance: approved loan_repayment transactions
    const repaymentTxns = transactions.filter(tx =>
      tx.transaction_type === "loan_repayment" && tx.approval_status === "approved"
    );
    const totalRepaid = repaymentTxns.reduce((s, tx) => s + Number(tx.amount), 0);

    // Savings health
    const totalDeposits = transactions
      .filter(tx => tx.transaction_type === "savings_deposit" && tx.approval_status === "approved")
      .reduce((s, tx) => s + Number(tx.amount), 0);
    const totalWithdrawals = transactions
      .filter(tx => tx.transaction_type === "savings_withdrawal" && tx.approval_status === "approved")
      .reduce((s, tx) => s + Number(tx.amount), 0);
    const lowBalance = savingsBalance < 1000;

    // Overall risk score (simple heuristic)
    let riskScore = 0;
    if (punctualityPct < 50) riskScore += 3;
    else if (punctualityPct < 75) riskScore += 1;
    if (overdueLoans.length > 0) riskScore += 2;
    if (highRiskLoans.length > 0) riskScore += 2;
    if (lowBalance) riskScore += 1;
    const riskLevel = riskScore >= 5 ? "critical" : riskScore >= 3 ? "high" : riskScore >= 1 ? "medium" : "low";

    return {
      punctualityPct,
      totalInstallments,
      paidInstallments,
      overdueLoans,
      highRiskLoans,
      totalRepaid,
      totalDeposits,
      totalWithdrawals,
      lowBalance,
      riskLevel,
      riskScore,
    };
  }, [loans, scheduleStats, transactions, savingsBalance]);

  const riskColors: Record<string, string> = {
    low: "bg-success/10 text-success border-success/20",
    medium: "bg-warning/10 text-warning border-warning/20",
    high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    critical: "bg-destructive/10 text-destructive border-destructive/20",
  };

  const riskLabels: Record<string, { en: string; bn: string }> = {
    low: { en: "Low Risk", bn: "কম ঝুঁকি" },
    medium: { en: "Medium Risk", bn: "মাঝারি ঝুঁকি" },
    high: { en: "High Risk", bn: "উচ্চ ঝুঁকি" },
    critical: { en: "Critical Risk", bn: "গুরুতর ঝুঁকি" },
  };

  return (
    <div className="card-elevated p-5 animate-slide-up" style={{ animationDelay: "0.16s" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
            {bn ? "ক্লায়েন্ট অ্যানালিটিক্স" : "Client Analytics"}
          </h3>
        </div>
        <Badge className={`text-[10px] px-2 py-0.5 ${riskColors[analytics.riskLevel]}`}>
          {bn ? riskLabels[analytics.riskLevel].bn : riskLabels[analytics.riskLevel].en}
        </Badge>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Punctuality */}
        <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
          <Clock className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-[10px] text-muted-foreground">{bn ? "সময়মতো পরিশোধ" : "Punctuality"}</p>
          <p className={`text-lg font-bold ${analytics.punctualityPct >= 75 ? "text-success" : analytics.punctualityPct >= 50 ? "text-warning" : "text-destructive"}`}>
            {analytics.punctualityPct}%
          </p>
          <p className="text-[10px] text-muted-foreground">
            {analytics.paidInstallments}/{analytics.totalInstallments} {bn ? "কিস্তি" : "installments"}
          </p>
        </div>

        {/* Total Repaid */}
        <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
          <TrendingUp className="w-4 h-4 mx-auto mb-1 text-success" />
          <p className="text-[10px] text-muted-foreground">{bn ? "মোট পরিশোধিত" : "Total Repaid"}</p>
          <p className="text-lg font-bold text-success">৳{analytics.totalRepaid.toLocaleString()}</p>
        </div>

        {/* Savings Flow */}
        <div className="p-3 rounded-xl bg-muted/50 border border-border text-center">
          <PiggyBank className="w-4 h-4 mx-auto mb-1 text-primary" />
          <p className="text-[10px] text-muted-foreground">{bn ? "সঞ্চয় প্রবাহ" : "Savings Flow"}</p>
          <p className="text-sm font-bold text-success">+৳{analytics.totalDeposits.toLocaleString()}</p>
          <p className="text-sm font-bold text-destructive">-৳{analytics.totalWithdrawals.toLocaleString()}</p>
        </div>

        {/* Risk Indicator */}
        <div className={`p-3 rounded-xl border text-center ${riskColors[analytics.riskLevel]}`}>
          <ShieldAlert className="w-4 h-4 mx-auto mb-1" />
          <p className="text-[10px]">{bn ? "ঝুঁকি স্কোর" : "Risk Score"}</p>
          <p className="text-lg font-bold">{analytics.riskScore}/8</p>
        </div>
      </div>

      {/* Alerts Section */}
      {(analytics.highRiskLoans.length > 0 || analytics.overdueLoans.length > 0 || analytics.lowBalance) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {bn ? "সতর্কতা" : "Alerts"}
          </p>

          {analytics.highRiskLoans.map(l => (
            <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-orange-500/10 text-orange-600 border border-orange-500/20">
              <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
              {bn
                ? `⚠️ ঋণ ${l.loan_id || l.id.slice(0, 8)}: উচ্চ ঝুঁকি (বকেয়া >20% বা জরিমানা >10%)`
                : `⚠️ Loan ${l.loan_id || l.id.slice(0, 8)}: High risk (>20% overdue or penalty >10%)`}
            </div>
          ))}

          {analytics.overdueLoans.map(l => (
            <div key={`od-${l.id}`} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
              <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
              {bn
                ? `🔴 ঋণ ${l.loan_id || l.id.slice(0, 8)}: ৭+ দিন বকেয়া`
                : `🔴 Loan ${l.loan_id || l.id.slice(0, 8)}: 7+ days overdue`}
            </div>
          ))}

          {analytics.lowBalance && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
              <PiggyBank className="w-3.5 h-3.5 flex-shrink-0" />
              {bn
                ? `⚠️ সঞ্চয় ব্যালেন্স কম: ৳${savingsBalance.toLocaleString()} (<৳১,০০০)`
                : `⚠️ Low savings balance: ৳${savingsBalance.toLocaleString()} (<৳1,000)`}
            </div>
          )}

          {analytics.highRiskLoans.length === 0 && analytics.overdueLoans.length === 0 && !analytics.lowBalance && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-success/10 text-success border border-success/20">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {bn ? "✅ সব ঠিক আছে" : "✅ All clear — no alerts"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
