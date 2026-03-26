import { useParams } from "react-router-dom";
import { useState, useMemo, useCallback } from "react";
import { formatLocalDate, formatShortDate } from "@/lib/date-utils";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import RepaymentProgress from "@/components/RepaymentProgress";
import ProfileCompletionRing from "@/components/ProfileCompletionRing";
import ClientPhotoUpload from "@/components/ClientPhotoUpload";
import LoanScheduleTable from "@/components/LoanScheduleTable";
import LoanDisbursementModal from "@/components/forms/LoanDisbursementModal";
import LoanPaymentModal from "@/components/forms/LoanPaymentModal";
import SmartTransactionForm from "@/components/forms/SmartTransactionForm";
import SavingsTransactionModal from "@/components/forms/SavingsTransactionModal";
import CreateSavingsAccountModal from "@/components/forms/CreateSavingsAccountModal";
import TablePagination from "@/components/TablePagination";
import EarlySettlementCalculator from "@/components/EarlySettlementCalculator";
import ClientStatementExport from "@/components/ClientStatementExport";
import ClientAnalyticsPanel from "@/components/ClientAnalyticsPanel";
import FinancialJourneyChart from "@/components/FinancialJourneyChart";
import PaymentHealthGauge from "@/components/PaymentHealthGauge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClient, useTransactions } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User, Wallet, PiggyBank, MapPin, Shield, TrendingUp, Banknote, CalendarDays,
  AlertTriangle, CheckCircle, Calculator, Receipt, ArrowDownCircle, ArrowUpCircle,
  History, FileText, Filter, Download, BarChart3, Archive, CalendarIcon, Phone
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import CommunicationHub from "@/components/CommunicationHub";
import SnoozePanel from "@/components/SnoozePanel";
import ClientProfileHeader from "@/components/ClientProfileHeader";
import { SectionHeader } from "@/components/SectionHeader";
import QuickActionGrid from "@/components/QuickActionGrid";
import TrustTierHeroCard from "@/components/TrustTierHeroCard";
import { TX_TYPE_LABELS, type FinTransactionType } from "@/hooks/useFinancialTransactions";

const ClientDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const bn = lang === "bn";
  const { canEditClients, isAdmin, isTreasurer, isOwner } = usePermissions();
  const { data: client, isLoading } = useClient(id || "");
  const { data: txns } = useTransactions({ client_id: id });

  const [disburseOpen, setDisburseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentLoanId, setPaymentLoanId] = useState<string | undefined>();
  const [smartTxOpen, setSmartTxOpen] = useState(false);
  const [savingsTxOpen, setSavingsTxOpen] = useState(false);
  const [savingsTxType, setSavingsTxType] = useState<"savings_deposit" | "savings_withdrawal">("savings_deposit");
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementLoanId, setSettlementLoanId] = useState<string | undefined>();
  const [scheduleLoanId, setScheduleLoanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "schedule" | "history" | "hub">("info");
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [createSavingsOpen, setCreateSavingsOpen] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [chartDateFrom, setChartDateFrom] = useState<Date | undefined>(undefined);
  const [chartDateTo, setChartDateTo] = useState<Date | undefined>(undefined);
  const HISTORY_PER_PAGE = 20;

  // ALL active loans for this client (multi-loan support)
  const { data: activeLoans } = useQuery({
    queryKey: ["loans", "client_all", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("id, loan_id, status, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, maturity_date, disbursement_date, loan_model, total_principal, total_interest, next_due_date, installment_day")
        .eq("client_id", id!)
        .in("status", ["active", "default"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Schedule stats per loan
  const { data: allScheduleStats } = useQuery({
    queryKey: ["schedule-stats-all", activeLoans?.map(l => l.id).join(",")],
    queryFn: async () => {
      if (!activeLoans?.length) return {};
      const ids = activeLoans.map(l => l.id);
      const { data, error } = await supabase
        .from("loan_schedules")
        .select("loan_id, status, principal_due, interest_due, principal_paid, interest_paid")
        .in("loan_id", ids);
      if (error) throw error;
      const stats: Record<string, { total: number; paid: number; partial: number; remaining: number; paidAmount: number; totalAmount: number }> = {};
      for (const row of data ?? []) {
        if (!stats[row.loan_id]) stats[row.loan_id] = { total: 0, paid: 0, partial: 0, remaining: 0, paidAmount: 0, totalAmount: 0 };
        stats[row.loan_id].total++;
        stats[row.loan_id].totalAmount += Number(row.principal_due) + Number(row.interest_due);
        stats[row.loan_id].paidAmount += Number(row.principal_paid) + Number(row.interest_paid);
        if (row.status === "paid") stats[row.loan_id].paid++;
        else if (row.status === "partial") stats[row.loan_id].partial++;
        else stats[row.loan_id].remaining++;
      }
      return stats;
    },
    enabled: !!activeLoans?.length,
  });

  // Snooze-eligible schedules per loan (next unpaid installment)
  const { data: snoozeSchedules } = useQuery({
    queryKey: ["snooze-schedules", activeLoans?.map(l => l.id).join(",")],
    queryFn: async () => {
      if (!activeLoans?.length) return {};
      const ids = activeLoans.map(l => l.id);
      const { data, error } = await (supabase.from("loan_schedules") as any)
        .select("id, loan_id, due_date, status, promised_date, snooze_count, promised_status, is_penalty_frozen")
        .in("loan_id", ids)
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: true });
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const row of data ?? []) {
        if (!map[row.loan_id]) map[row.loan_id] = row;
      }
      return map;
    },
    enabled: !!activeLoans?.length,
  });

  // Mask sensitive fields
  const maskPhone = (phone: string | null) => {
    if (!phone || phone.length <= 5) return phone || "—";
    return phone.slice(0, 3) + "••••" + phone.slice(-2);
  };
  const maskNid = (nid: string | null) => {
    if (!nid || nid.length <= 4) return nid || "—";
    return nid.slice(0, 2) + "••••••" + nid.slice(-2);
  };
  const canExport = isAdmin || isTreasurer || isOwner;

  // Savings summary
  const { data: savingsAccounts } = useQuery({
    queryKey: ["savings-accounts-all", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_accounts")
        .select("id, balance, status, savings_product_id, savings_products(product_name_en, product_name_bn)")
        .eq("client_id", id!)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Settled/closed loans
  const { data: settledLoans } = useQuery({
    queryKey: ["loans", "client_settled", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("id, loan_id, status, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, maturity_date, disbursement_date, loan_model, total_principal, total_interest, next_due_date")
        .eq("client_id", id!)
        .in("status", ["settled", "closed"] as any[])
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && showSettled,
  });

  // Transaction history for this client (merged from both tables)
  const { data: finTxnRaw } = useQuery({
    queryKey: ["client_financial_txns", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions" as any)
        .select("*")
        .eq("member_id", id!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  // Legacy transactions table (loan payments go here)
  const { data: legacyTxnRaw } = useQuery({
    queryKey: ["client_legacy_txns", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions" as any)
        .select("*")
        .eq("client_id", id!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  // Merge both transaction sources into unified format
  const clientTransactions = useMemo(() => {
    const fin = (finTxnRaw ?? []).map((tx: any) => ({ ...tx, _source: "fin" }));
    const legacy = (legacyTxnRaw ?? [])
      .filter((tx: any) => !["loan_disbursement"].includes(tx.type)) // exclude disbursements from history
      .map((tx: any) => ({
        id: tx.id,
        created_at: tx.created_at,
        transaction_type: tx.type === "loan_principal" ? "loan_repayment"
          : tx.type === "loan_interest" ? "loan_repayment"
          : tx.type === "loan_penalty" ? "loan_repayment"
          : tx.type,
        amount: tx.amount,
        approval_status: tx.status === "paid" ? "approved" : tx.status,
        reference_id: tx.reference_id,
        receipt_number: null,
        notes: tx.notes,
        _source: "legacy",
      }));
    // Deduplicate by reference_id where possible
    const finRefIds = new Set(fin.filter((t: any) => t.reference_id).map((t: any) => t.reference_id));
    const dedupedLegacy = legacy.filter((t: any) => !t.reference_id || !finRefIds.has(t.reference_id));
    return [...fin, ...dedupedLegacy].sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [finTxnRaw, legacyTxnRaw]);

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="space-y-4">
          <div className="card-elevated p-8 animate-pulse"><div className="h-4 bg-muted rounded w-1/3 mx-auto" /></div>
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const c = client as any;
  const name = bn ? (c.name_bn || c.name_en) : c.name_en;
  const hasActiveLoans = !!activeLoans?.length;

  const totalRepaid = useMemo(() =>
    txns
      ?.filter((tx: any) => ["loan_repayment", "loan_principal", "loan_interest"].includes(tx.type) && tx.status === "paid")
      .reduce((s: number, tx: any) => s + tx.amount, 0) ?? 0,
    [txns]
  );

  // Defensive: join data may be object/array/null — always extract scalars safely
  const loanProduct = (typeof c.loan_products === "object" && c.loan_products !== null && !Array.isArray(c.loan_products))
    ? c.loan_products : null;
  const loanAmount = c.loan_amount ?? 0;
  const interestRate = loanProduct?.interest_rate;
  const tenure = loanProduct?.tenure_months;
  const paymentType = loanProduct?.payment_type ? String(loanProduct.payment_type) : undefined;
  const totalOwed = loanAmount > 0 && interestRate ? loanAmount + (loanAmount * interestRate / 100) : loanAmount;
  const nextPaymentDate = c.next_payment_date;

  const savingsProduct = (typeof c.savings_products === "object" && c.savings_products !== null && !Array.isArray(c.savings_products))
    ? c.savings_products : null;
  const savingsType: string = savingsProduct?.product_name_en ? String(savingsProduct.product_name_en) : "—";
  const frequency: string = savingsProduct?.frequency ? String(savingsProduct.frequency) : "—";

  const maskedMemberId = useMemo(() => {
    const mid = c.member_id;
    if (!mid || mid.length <= 6) return mid || "—";
    return mid.slice(0, 4) + "••••" + mid.slice(-2);
  }, [c.member_id]);

  const maritalMap: Record<string, string> = useMemo(() => ({
    unmarried: bn ? "অবিবাহিত" : "Unmarried",
    married: bn ? "বিবাহিত" : "Married",
    widowed: bn ? "বিধবা/বিপত্নীক" : "Widowed",
    divorced: bn ? "তালাকপ্রাপ্ত" : "Divorced",
  }), [bn]);

  const totalSavingsBalance = useMemo(() =>
    savingsAccounts?.reduce((s, a) => s + Number(a.balance), 0) ?? 0,
    [savingsAccounts]
  );

  const aggTotalOutstanding = useMemo(() =>
    (activeLoans ?? []).reduce((s, l) => s + Number(l.outstanding_principal) + Number(l.outstanding_interest) + Number(l.penalty_amount), 0),
    [activeLoans]
  );
  const aggTotalPaid = useMemo(() =>
    (activeLoans ?? []).reduce((s, l) => s + (Number(l.total_principal) + Number(l.total_interest)) - (Number(l.outstanding_principal) + Number(l.outstanding_interest)), 0),
    [activeLoans]
  );
  const aggTotalPenalty = useMemo(() =>
    (activeLoans ?? []).reduce((s, l) => s + Number(l.penalty_amount), 0),
    [activeLoans]
  );


  const filteredTxns = useMemo(() =>
    clientTransactions?.filter((tx: any) => {
      if (historyFilter === "all") return true;
      return tx.transaction_type === historyFilter;
    }) ?? [],
    [clientTransactions, historyFilter]
  );

  const historyTotalPages = Math.ceil(filteredTxns.length / HISTORY_PER_PAGE);
  const paginatedTxns = useMemo(() =>
    filteredTxns.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE),
    [filteredTxns, historyPage]
  );

  const openPayment = useCallback((loanId: string) => {
    setPaymentLoanId(loanId);
    setPaymentOpen(true);
  }, []);

  const openSchedule = useCallback((loanId: string) => {
    setScheduleLoanId(loanId);
    setActiveTab("schedule");
  }, []);

  return (
    <AppLayout>
      <PageHeader
        title={name}
        description={`${t("detail.client")} — ${maskedMemberId}`}
      />

      {/* ── Unified Client Profile Header ── */}
      <ClientProfileHeader
        client={c}
        clientId={client.id}
        canEditClients={canEditClients}
        activeLoans={activeLoans}
        maskedMemberId={maskedMemberId}
      />

      {/* ── Quick Action Grid ── */}
      {(isAdmin || canEditClients) && (
        <QuickActionGrid
          hasActiveLoans={hasActiveLoans}
          canExport={canExport}
          onPaymentOrDisburse={() => {
            if (hasActiveLoans) {
              openPayment(activeLoans![0].id);
            } else {
              setDisburseOpen(true);
            }
          }}
          onSavings={() => { setSavingsTxType("savings_deposit"); setSavingsTxOpen(true); }}
          onFeeOther={() => setSmartTxOpen(true)}
          onExport={() => setExportOpen(true)}
        />
      )}

      {/* ── Trust Tier Emotional Card ── */}
      <TrustTierHeroCard trustTier={c.trust_tier} trustScore={c.trust_score} />

      {/* ── Date Range Filter ── */}
      <div className="flex items-center gap-2 flex-wrap animate-slide-up overflow-hidden" style={{ animationDelay: "0.06s" }}>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs rounded-lg h-8", !chartDateFrom && "text-muted-foreground")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {chartDateFrom ? formatLocalDate(chartDateFrom, lang, { short: true }) : (bn ? "শুরুর তারিখ" : "From")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={chartDateFrom} onSelect={setChartDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">→</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs rounded-lg h-8", !chartDateTo && "text-muted-foreground")}>
              <CalendarIcon className="w-3.5 h-3.5" />
              {chartDateTo ? formatLocalDate(chartDateTo, lang, { short: true }) : (bn ? "শেষ তারিখ" : "To")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={chartDateTo} onSelect={setChartDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(chartDateFrom || chartDateTo) && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setChartDateFrom(undefined); setChartDateTo(undefined); }}>
            {bn ? "রিসেট" : "Reset"}
          </Button>
        )}
      </div>

      {/* ── Loan Status Section ── */}
      {hasActiveLoans && (
        <section>
          <SectionHeader
            title={bn ? "ঋণের অবস্থা" : "Loan Status"}
            subtitle={bn ? "সক্রিয় ঋণ এবং পরিশোধের অগ্রগতি" : "Overview of active and repayment progress"}
          />
          <div className="space-y-4">
      {activeLoans!.map((loan, idx) => {
        const daysUntilDue = loan.next_due_date
          ? Math.ceil((new Date(loan.next_due_date).getTime() - Date.now()) / 86400000)
          : null;
        const totalOutstanding = Number(loan.outstanding_principal) + Number(loan.outstanding_interest) + Number(loan.penalty_amount);
        const isOverdue90 = loan.status === "default";
        const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
        const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 3;
        const stats = allScheduleStats?.[loan.id];

        return (
          <div
            key={loan.id}
            className={`card-elevated p-4 sm:p-5 border-l-4 animate-slide-up overflow-hidden ${isOverdue90 ? "border-l-destructive" : isOverdue ? "border-l-destructive" : isDueSoon ? "border-l-warning" : "border-l-primary"}`}
            style={{ animationDelay: `${0.1 + idx * 0.05}s` }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet className={`w-4 h-4 ${isOverdue90 ? "text-destructive" : "text-warning"}`} />
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isOverdue90 ? "text-destructive" : "text-warning"}`}>
                  {bn ? "সক্রিয় ঋণ" : "Active Loan"} {activeLoans!.length > 1 ? `#${idx + 1}` : ""}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {loan.loan_id && (
                  <span className="text-xs font-mono font-semibold bg-warning/10 text-warning px-2 py-0.5 rounded-md border border-warning/20">
                    {loan.loan_id}
                  </span>
                )}
                <StatusBadge status={loan.status as any} />
              </div>
            </div>

            {/* Risk Indicator */}
            {(isOverdue90 || isOverdue || isDueSoon) && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs font-semibold ${
                isOverdue90 || isOverdue ? "bg-destructive/10 text-destructive border border-destructive/20" : "bg-warning/10 text-warning border border-warning/20"
              }`}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {isOverdue90
                  ? (bn ? "⚠️ এই ঋণ খেলাপি (৯০+ দিন বকেয়া)" : "⚠️ This loan is in DEFAULT (90+ days overdue)")
                  : isOverdue
                  ? (bn ? `⚠️ কিস্তি ${Math.abs(daysUntilDue!)} দিন বকেয়া` : `⚠️ Payment ${Math.abs(daysUntilDue!)} days overdue`)
                  : (bn ? `📅 পরবর্তী কিস্তি ${daysUntilDue} দিনে` : `📅 Next payment in ${daysUntilDue} days`)}
              </div>
            )}

            {/* Penalty badge */}
            {Number(loan.penalty_amount) > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {bn ? `💸 জরিমানা বকেয়া: ৳${Number(loan.penalty_amount).toLocaleString()}` : `💸 Pending Penalty: ৳${Number(loan.penalty_amount).toLocaleString()}`}
              </div>
            )}

            {totalOutstanding <= 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-xs font-semibold bg-success/10 text-success border border-success/20">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {bn ? "✅ সম্পূর্ণ পরিশোধিত — বন্ধ হওয়ার অপেক্ষায়" : "✅ Fully repaid — pending closure"}
              </div>
            )}

            {/* Smart Snooze Panel */}
            {snoozeSchedules?.[loan.id] && (
              <div className="mb-3">
                <SnoozePanel schedule={snoozeSchedules[loan.id]} />
              </div>
            )}

            {/* Waterfall info tooltip */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-2 text-[10px] text-muted-foreground bg-muted/50">
              <span>⚡ {bn ? "পেমেন্ট অগ্রাধিকার:" : "Payment Priority:"}</span>
              <span className="font-semibold text-destructive">{bn ? "জরিমানা" : "Penalty"}</span>
              <span>→</span>
              <span className="font-semibold text-warning">{bn ? "সুদ" : "Interest"}</span>
              <span>→</span>
              <span className="font-semibold text-success">{bn ? "আসল" : "Principal"}</span>
            </div>

            <RepaymentProgress
              totalAmount={Number(loan.total_principal) + Number(loan.total_interest)}
              paidAmount={(Number(loan.total_principal) + Number(loan.total_interest)) - totalOutstanding}
              tenure={stats?.total}
              paidInstallments={stats?.paid}
              nextPaymentDate={loan.next_due_date ?? nextPaymentDate}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{bn ? "ঋণের পরিমাণ" : "Loan Amount"}</p>
                <p className="text-sm font-bold text-foreground">৳{Number(loan.total_principal).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{bn ? "বকেয়া আসল" : "Outstanding"}</p>
                <p className="text-sm font-bold text-destructive">৳{Number(loan.outstanding_principal).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{bn ? "বকেয়া সুদ" : "Interest Due"}</p>
                <p className="text-sm font-bold text-warning">৳{Number(loan.outstanding_interest).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{bn ? "কিস্তির পরিমাণ" : "EMI"}</p>
                <p className="text-sm font-bold text-primary">৳{Number(loan.emi_amount).toLocaleString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 pt-2 border-t border-border">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><CalendarDays className="w-3 h-3" />{bn ? "পরবর্তী কিস্তি" : "Next Due"}</p>
                <p className={`text-sm font-bold ${isOverdue ? "text-destructive" : isDueSoon ? "text-warning" : "text-primary"}`}>{formatLocalDate(loan.next_due_date, lang, { short: true })}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{bn ? "পরিশোধিত" : "Paid"}</p>
                <p className="text-sm font-bold text-success">{stats?.paid ?? "—"}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{bn ? "অবশিষ্ট" : "Remaining"}</p>
                <p className="text-sm font-bold text-destructive">{stats?.remaining ?? "—"}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><CalendarDays className="w-3 h-3" />{bn ? "পরিপক্কতা" : "Maturity"}</p>
                <p className="text-sm font-bold">{formatLocalDate(loan.maturity_date, lang, { short: true })}</p>
              </div>
            </div>

            {loan.installment_day && (
              <div className="mt-2 pt-2 border-t border-border text-center">
                <p className="text-[10px] text-muted-foreground">
                  {bn ? `📌 নির্ধারিত কিস্তির তারিখ: প্রতি মাসের ${loan.installment_day} তারিখ` : `📌 Fixed installment day: ${loan.installment_day}th of every month`}
                </p>
              </div>
            )}

            {/* Per-loan action buttons */}
            {(isAdmin || canEditClients) && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1 min-w-0" onClick={() => openPayment(loan.id)}>
                  <Banknote className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{bn ? "পেমেন্ট" : "Pay"}</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1 min-w-0" onClick={() => openSchedule(loan.id)}>
                  <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{bn ? "সময়সূচি" : "Schedule"}</span>
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs flex-1 min-w-0" onClick={() => { setSettlementLoanId(loan.id); setSettlementOpen(true); }}>
                  <Calculator className="w-3.5 h-3.5" />
                  {bn ? "নিষ্পত্তি" : "Settle"}
                </Button>
              </div>
            )}
          </div>
        );
      })}
          </div>
        </section>
      )}

      {/* ── Savings Management Section ── */}
      <section>
        <SectionHeader
          title={bn ? "সঞ্চয় ব্যবস্থাপনা" : "Savings Management"}
          subtitle={bn ? "অ্যাকাউন্ট ব্যালেন্স এবং লেনদেন" : "Account balance and transactions"}
        />
      <div className="card-elevated p-4 sm:p-5 border-l-4 border-l-success animate-slide-up overflow-hidden" style={{ animationDelay: "0.12s" }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <PiggyBank className="w-4 h-4 text-success flex-shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-success">
              {bn ? "সঞ্চয় সারসংক্ষেপ" : "Savings Summary"}
            </h3>
          </div>
          {(isAdmin || canEditClients) && (
            <div className="flex flex-wrap gap-2 sm:gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:overflow-visible md:pb-0">
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs h-7 border-success/30 text-success hover:bg-success/10" onClick={() => setCreateSavingsOpen(true)}>
                <PiggyBank className="w-3 h-3" />
                {bn ? "অ্যাকাউন্ট খুলুন" : "Open Account"}
              </Button>
              {savingsAccounts && savingsAccounts.length > 0 && (
                <>
                  <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs h-7" onClick={() => { setSavingsTxType("savings_deposit"); setSavingsTxOpen(true); }}>
                    <ArrowDownCircle className="w-3 h-3" />
                    {bn ? "জমা" : "Deposit"}
                  </Button>
                  <Button size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs h-7" onClick={() => { setSavingsTxType("savings_withdrawal"); setSavingsTxOpen(true); }}>
                    <ArrowUpCircle className="w-3 h-3" />
                    {bn ? "উত্তোলন" : "Withdraw"}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        {savingsAccounts && savingsAccounts.length > 0 ? (
          <>
            {savingsAccounts.map((sa: any) => {
              // Defensive: ensure join data is never rendered as raw object
              const spData = (typeof sa.savings_products === "object" && sa.savings_products !== null && !Array.isArray(sa.savings_products))
                ? sa.savings_products : null;
              const spName = spData?.[bn ? "product_name_bn" : "product_name_en"];
              const displayName = (typeof spName === "string" && spName) ? spName : sa.id?.slice(0, 8) ?? "—";
              return (
              <div key={sa.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-xs font-medium">{displayName}</p>
                </div>
                <p className="text-sm font-bold text-success">৳{Number(sa.balance).toLocaleString()}</p>
              </div>
            ))}
            <div className="flex justify-between mt-3 pt-2 border-t border-border">
              <span className="text-xs font-semibold text-muted-foreground">{bn ? "মোট ব্যালেন্স" : "Total Balance"}</span>
              <span className="text-sm font-bold text-success">৳{totalSavingsBalance.toLocaleString()}</span>
            </div>
            {totalSavingsBalance < 1000 && (
              <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {bn ? `⚠️ সঞ্চয় ব্যালেন্স কম (<৳১,০০০)` : `⚠️ Low savings balance (<৳1,000)`}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-6">
            <PiggyBank className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">
              {bn ? "কোনো সঞ্চয় অ্যাকাউন্ট নেই" : "No savings accounts yet"}
            </p>
            {(isAdmin || canEditClients) && (
              <Button size="sm" variant="outline" className="mt-2 gap-1.5 text-xs border-success/30 text-success" onClick={() => setCreateSavingsOpen(true)}>
                <PiggyBank className="w-3.5 h-3.5" />
                {bn ? "প্রথম অ্যাকাউন্ট খুলুন" : "Open First Account"}
              </Button>
            )}
          </div>
        )}
      </div>
      </section>

      {/* ── Financial Journey Chart & Health Gauge ── */}
      {hasActiveLoans && (() => {
        const stats = allScheduleStats ?? {};
        const totalAmount = Object.values(stats).reduce((s: number, v: any) => s + (v.totalAmount || 0), 0);
        const paidAmount = Object.values(stats).reduce((s: number, v: any) => s + (v.paidAmount || 0), 0);
        const totalInst = Object.values(stats).reduce((s: number, v: any) => s + v.total, 0);
        const paidInst = Object.values(stats).reduce((s: number, v: any) => s + v.paid, 0);
        const partialInst = Object.values(stats).reduce((s: number, v: any) => s + (v.partial || 0), 0);
        // Punctuality: paid + proportional partial credit
        const punctPct = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
        const effectivePaid = paidInst + (partialInst * 0.5); // partial counts as half
        const rLvl = (() => {
          let rs = 0;
          if (punctPct < 50) rs += 3; else if (punctPct < 75) rs += 1;
          if ((activeLoans ?? []).some(l => l.next_due_date && Math.ceil((new Date(l.next_due_date).getTime() - Date.now()) / 86400000) < -7)) rs += 2;
          return rs >= 5 ? "critical" : rs >= 3 ? "high" : rs >= 1 ? "medium" : "low";
        })();

        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <FinancialJourneyChart clientId={id!} loanIds={activeLoans!.map(l => l.id)} dateRange={{ from: chartDateFrom ?? null, to: chartDateTo ?? null }} />
            </div>
            <PaymentHealthGauge
              punctualityPct={punctPct}
              riskLevel={rLvl}
              paidInstallments={Math.round(effectivePaid)}
              totalInstallments={totalInst}
            />
          </div>
        );
      })()}

      {/* ── Financial Summary Section ── */}
      {hasActiveLoans && (
        <section>
          <SectionHeader
            title={bn ? "আর্থিক সারসংক্ষেপ" : "Financial Summary"}
            subtitle={bn ? "সম্মিলিত ঋণ এবং সঞ্চয় পর্যালোচনা" : "Combined loan and savings overview"}
          />
        <div className="card-elevated p-4 sm:p-5 animate-slide-up overflow-hidden" style={{ animationDelay: "0.14s" }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {bn ? "সামগ্রিক সারসংক্ষেপ" : "Aggregate Summary"}
              </h3>
            </div>
            <Button size="sm" variant="ghost" className="gap-1 text-xs h-7" onClick={() => { setShowSettled(!showSettled); }}>
              <Archive className="w-3 h-3" />
              {showSettled ? (bn ? "বন্ধ ঋণ লুকান" : "Hide Settled") : (bn ? "বন্ধ ঋণ দেখান" : "Show Settled")}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="relative overflow-hidden p-4 rounded-xl border border-primary/15 text-center" style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.06), hsl(var(--primary) / 0.02))", boxShadow: "0 2px 12px -4px hsl(var(--primary) / 0.1)" }}>
              <Wallet className="w-4 h-4 text-primary mx-auto mb-1.5 opacity-70" />
              <p className="text-[10px] text-muted-foreground font-medium">{bn ? "সক্রিয় ঋণ" : "Active Loans"}</p>
              <p className="text-2xl font-extrabold text-primary mt-0.5">{activeLoans?.length ?? 0}</p>
            </div>
            <div className="relative overflow-hidden p-4 rounded-xl border border-success/15 text-center" style={{ background: "linear-gradient(135deg, hsl(var(--success) / 0.06), hsl(var(--success) / 0.02))", boxShadow: "0 2px 12px -4px hsl(var(--success) / 0.1)" }}>
              <CheckCircle className="w-4 h-4 text-success mx-auto mb-1.5 opacity-70" />
              <p className="text-[10px] text-muted-foreground font-medium">{bn ? "মোট পরিশোধিত" : "Total Paid"}</p>
              <p className="text-2xl font-extrabold text-success mt-0.5">৳{Math.max(aggTotalPaid, 0).toLocaleString()}</p>
            </div>
            <div className="relative overflow-hidden p-4 rounded-xl border border-destructive/15 text-center" style={{ background: "linear-gradient(135deg, hsl(var(--destructive) / 0.06), hsl(var(--destructive) / 0.02))", boxShadow: "0 2px 12px -4px hsl(var(--destructive) / 0.1)" }}>
              <AlertTriangle className="w-4 h-4 text-destructive mx-auto mb-1.5 opacity-70" />
              <p className="text-[10px] text-muted-foreground font-medium">{bn ? "মোট বকেয়া" : "Total Outstanding"}</p>
              <p className="text-2xl font-extrabold text-destructive mt-0.5">৳{aggTotalOutstanding.toLocaleString()}</p>
            </div>
            <div className="relative overflow-hidden p-4 rounded-xl border border-warning/15 text-center" style={{ background: "linear-gradient(135deg, hsl(var(--warning) / 0.06), hsl(var(--warning) / 0.02))", boxShadow: "0 2px 12px -4px hsl(var(--warning) / 0.1)" }}>
              <Banknote className="w-4 h-4 text-warning mx-auto mb-1.5 opacity-70" />
              <p className="text-[10px] text-muted-foreground font-medium">{bn ? "মোট জরিমানা" : "Total Penalty"}</p>
              <p className="text-2xl font-extrabold text-warning mt-0.5">৳{aggTotalPenalty.toLocaleString()}</p>
            </div>
          </div>

          {/* Settled loans list */}
          {showSettled && settledLoans && settledLoans.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{bn ? "বন্ধ/নিষ্পত্তি ঋণ" : "Settled / Closed Loans"}</p>
              {settledLoans.map((sl: any) => (
                <div key={sl.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                    <span className="font-mono font-semibold">{sl.loan_id || sl.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">৳{Number(sl.total_principal).toLocaleString()}</span>
                    <StatusBadge status={sl.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {showSettled && (!settledLoans || settledLoans.length === 0) && (
            <p className="mt-3 text-xs text-muted-foreground text-center">{bn ? "কোনো বন্ধ ঋণ নেই" : "No settled loans"}</p>
          )}
        </div>
        </section>
      )}

      {/* ── Analytics Section ── */}
      {hasActiveLoans && (
        <section>
          <SectionHeader
            title={bn ? "অ্যানালিটিক্স" : "Analytics"}
            subtitle={bn ? "কর্মক্ষমতা এবং পরিশোধ অন্তর্দৃষ্টি" : "Performance and repayment insights"}
          />
        <ClientAnalyticsPanel
          loans={(activeLoans ?? []).map(l => ({
            ...l,
            outstanding_principal: Number(l.outstanding_principal),
            outstanding_interest: Number(l.outstanding_interest),
            penalty_amount: Number(l.penalty_amount),
            emi_amount: Number(l.emi_amount),
            total_principal: Number(l.total_principal),
            total_interest: Number(l.total_interest),
          }))}
          scheduleStats={allScheduleStats ?? {}}
          transactions={(clientTransactions ?? []).map((tx: any) => ({
            created_at: tx.created_at,
            transaction_type: tx.transaction_type,
            amount: Number(tx.amount),
            approval_status: tx.approval_status,
          }))}
          savingsBalance={totalSavingsBalance}
        />
        </section>
      )}

      {/* ── Tabs: Info | Schedule | History | Hub ── */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {(["info", "schedule", "history", "hub"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "info" && <User className="w-3 h-3" />}
            {tab === "schedule" && <CalendarDays className="w-3 h-3" />}
            {tab === "history" && <History className="w-3 h-3" />}
            {tab === "hub" && <BarChart3 className="w-3 h-3" />}
            {tab === "info"
              ? (bn ? "তথ্য" : "Info")
              : tab === "schedule"
              ? (bn ? "সময়সূচি" : "Schedule")
              : tab === "history"
              ? (bn ? "লেনদেন ইতিহাস" : "Transactions")
              : (bn ? "পেমেন্ট হাব" : "Payment Hub")}
          </button>
        ))}
      </div>

      {/* ── INFO TAB ── */}
      {activeTab === "info" && (
        <div className="space-y-0">
          <SectionHeader
            title={bn ? "ক্লায়েন্ট তথ্য" : "Client Information"}
            subtitle={bn ? "ব্যক্তিগত এবং যোগাযোগের বিবরণ" : "Personal and contact details"}
          />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
          {/* Personal */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.15s" }}>
            <div className="flex items-center gap-2 text-primary">
              <User className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.personalInfo")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <DetailField label={t("table.name")} value={name} />
              <DetailField label={bn ? "ফোন" : "Phone"} value={c.phone || "—"} />
              <DetailField label={bn ? "পিতা/স্বামী" : "Father / Husband"} value={c.father_or_husband_name || "—"} />
              <DetailField label={bn ? "মাতার নাম" : "Mother Name"} value={c.mother_name || "—"} />
              <DetailField label={bn ? "NID নম্বর" : "NID Number"} value={c.nid_number || "—"} />
              <DetailField label={bn ? "জন্ম তারিখ" : "Date of Birth"} value={formatLocalDate(c.date_of_birth, lang)} />
              <DetailField label={bn ? "বৈবাহিক অবস্থা" : "Marital Status"} value={maritalMap[c.marital_status] || "—"} />
              <DetailField label={bn ? "পেশা" : "Occupation"} value={c.occupation || "—"} />
            </div>
          </div>

          {/* Loan Info */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 text-primary">
              <Wallet className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.loanInfo")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <DetailField label={t("table.loan")} value={loanAmount ? `৳${loanAmount.toLocaleString()}` : "—"} highlight={!!loanAmount} />
              <DetailField label={t("table.interest")} value={interestRate ? `${interestRate}%` : "—"} />
              <DetailField label={t("table.tenure")} value={tenure ? `${tenure} ${t("table.months")}` : "—"} />
              <DetailField label={t("table.paymentType")} value={paymentType?.replace("_", " ") || "—"} />
            </div>
          </div>

          {/* Address */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.22s" }}>
            <div className="flex items-center gap-2 text-primary">
              <MapPin className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{bn ? "ঠিকানা" : "Address"}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <DetailField label={bn ? "গ্রাম" : "Village"} value={c.village || "—"} />
              <DetailField label={bn ? "ডাকঘর" : "Post Office"} value={c.post_office || "—"} />
              <DetailField label={bn ? "ইউনিয়ন" : "Union"} value={c.union_name || "—"} />
              <DetailField label={bn ? "উপজেলা" : "Upazila"} value={c.upazila || "—"} />
              <DetailField label={bn ? "জেলা" : "District"} value={c.district || "—"} />
              <DetailField label={bn ? "এলাকা" : "Area"} value={c.area || "—"} />
            </div>
          </div>

          {/* Nominee */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.25s" }}>
            <div className="flex items-center gap-2 text-primary">
              <Shield className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{bn ? "নমিনি" : "Nominee"}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <DetailField label={bn ? "নমিনির নাম" : "Nominee Name"} value={c.nominee_name || "—"} />
              <DetailField label={bn ? "সম্পর্ক" : "Relation"} value={c.nominee_relation || "—"} />
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{bn ? "নমিনির ফোন" : "Nominee Phone"}</p>
                {(() => {
                  const safePhone = (c.nominee_phone || "").replace(/[০-৯]/g, (d: string) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d+]/g, "");
                  return (
                    <div className="flex items-center gap-2">
                      <p className="text-base font-medium text-foreground">{c.nominee_phone || "—"}</p>
                      {safePhone.length >= 7 && (
                        <a
                          href={`tel:${safePhone}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white active:scale-95 transition-all duration-200 shadow-sm"
                          title={bn ? "কল করুন" : "Call"}
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  );
                })()}
              </div>
              <DetailField label={bn ? "নমিনির NID" : "Nominee NID"} value={c.nominee_nid || "—"} />
            </div>
          </div>

          {/* Savings Info */}
          <div className="card-elevated p-5 space-y-4 md:col-span-2 animate-slide-up" style={{ animationDelay: "0.28s" }}>
            <div className="flex items-center gap-2 text-primary">
              <PiggyBank className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.savingsInfo")}</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <DetailField label={t("table.savings")} value={savingsType} />
              <DetailField label={t("detail.frequency")} value={frequency} />
              <DetailField label={t("detail.nextDeposit")} value={formatLocalDate(nextPaymentDate, lang)} />
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {activeTab === "schedule" && (
        <div className="animate-slide-up">
          {hasActiveLoans ? (
            <div className="space-y-4">
              {activeLoans!.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {activeLoans!.map((l, i) => (
                    <Button
                      key={l.id}
                      size="sm"
                      variant={scheduleLoanId === l.id ? "default" : "outline"}
                      className="text-xs"
                      onClick={() => setScheduleLoanId(l.id)}
                    >
                      {l.loan_id || `Loan #${i + 1}`}
                    </Button>
                  ))}
                </div>
              )}
              <LoanScheduleTable loanId={scheduleLoanId || activeLoans![0].id} />
            </div>
          ) : (
            <div className="card-elevated p-10 text-center space-y-3">
              <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                {bn ? "কোনো সক্রিয় ঋণ নেই" : "No Active Loan"}
              </p>
              <p className="text-xs text-muted-foreground">
                {bn ? "ঋণ বিতরণ করুন তারপর কিস্তির সময়সূচি দেখা যাবে" : "Disburse a loan to view the installment schedule"}
              </p>
              {(isAdmin || canEditClients) && (
                <Button size="sm" className="gap-1.5 text-xs mt-2" onClick={() => setDisburseOpen(true)}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  {bn ? "ঋণ বিতরণ করুন" : "Disburse Loan"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === "history" && (
        <div className="space-y-4 animate-slide-up">
          {/* Filter bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="w-3.5 h-3.5" />
              {bn ? "ফিল্টার:" : "Filter:"}
            </div>
            <Select value={historyFilter} onValueChange={(v) => { setHistoryFilter(v); setHistoryPage(1); }}>
              <SelectTrigger className="w-48 text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{bn ? "সব লেনদেন" : "All Transactions"}</SelectItem>
                <SelectItem value="loan_repayment" className="text-xs">{bn ? "ঋণ পরিশোধ" : "Loan Repayment"}</SelectItem>
                <SelectItem value="loan_disbursement" className="text-xs">{bn ? "ঋণ বিতরণ" : "Loan Disbursement"}</SelectItem>
                <SelectItem value="savings_deposit" className="text-xs">{bn ? "সঞ্চয় জমা" : "Savings Deposit"}</SelectItem>
                <SelectItem value="savings_withdrawal" className="text-xs">{bn ? "সঞ্চয় উত্তোলন" : "Savings Withdrawal"}</SelectItem>
                <SelectItem value="admission_fee" className="text-xs">{bn ? "ভর্তি ফি" : "Admission Fee"}</SelectItem>
                <SelectItem value="share_capital_deposit" className="text-xs">{bn ? "শেয়ার মূলধন" : "Share Capital"}</SelectItem>
                <SelectItem value="insurance_premium" className="text-xs">{bn ? "বীমা প্রিমিয়াম" : "Insurance Premium"}</SelectItem>
                <SelectItem value="adjustment_entry" className="text-xs">{bn ? "সমন্বয়" : "Adjustment"}</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs">
              {filteredTxns.length} {bn ? "টি" : "records"}
            </Badge>
          </div>

          {/* Transaction table */}
          <div className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-3 font-semibold">{bn ? "তারিখ" : "Date"}</th>
                    <th className="text-left p-3 font-semibold">{bn ? "ধরন" : "Type"}</th>
                    <th className="text-right p-3 font-semibold">{bn ? "পরিমাণ" : "Amount"}</th>
                    <th className="text-center p-3 font-semibold">{bn ? "অবস্থা" : "Status"}</th>
                    <th className="text-left p-3 font-semibold">{bn ? "রেফারেন্স" : "Reference"}</th>
                    <th className="text-left p-3 font-semibold">{bn ? "রিসিপ্ট" : "Receipt"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        {bn ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found"}
                      </td>
                    </tr>
                  ) : (
                    paginatedTxns.map((tx: any) => {
                      const typeLabel = TX_TYPE_LABELS[tx.transaction_type as FinTransactionType];
                      const statusColor = tx.approval_status === "approved"
                        ? "bg-success/10 text-success border-success/30"
                        : tx.approval_status === "rejected"
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : "bg-warning/10 text-warning border-warning/30";
                      return (
                        <tr key={tx.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-muted-foreground">
                            {formatShortDate(tx.created_at, lang)}
                          </td>
                          <td className="p-3">
                            <span className="font-medium">{bn ? typeLabel?.bn : typeLabel?.en}</span>
                          </td>
                          <td className="p-3 text-right font-bold">৳{Number(tx.amount).toLocaleString()}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor}`}>
                              {tx.approval_status === "approved" ? (bn ? "অনুমোদিত" : "Approved")
                                : tx.approval_status === "rejected" ? (bn ? "প্রত্যাখ্যাত" : "Rejected")
                                : (bn ? "অপেক্ষমাণ" : "Pending")}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground font-mono text-[10px]">
                            {tx.receipt_number || tx.reference_id?.slice(0, 12) || "—"}
                          </td>
                          <td className="p-3">
                            {tx.receipt_number && (
                              <span className="text-primary text-[10px] font-semibold">📄 {tx.receipt_number}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={historyPage} totalPages={historyTotalPages} totalCount={filteredTxns.length} onPageChange={setHistoryPage} />
          </div>
        </div>
      )}

      {/* ── PAYMENT HUB TAB ── */}
      {activeTab === "hub" && (
        <div className="space-y-4 animate-slide-up">
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-primary">{bn ? "পেমেন্ট হাব" : "Payment Hub"}</h3>
              </div>
              <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => setExportOpen(true)}>
                <Download className="w-3 h-3" />
                {bn ? "এক্সপোর্ট" : "Export"}
              </Button>
            </div>

            {/* Quick action grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {hasActiveLoans && (
                <button
                  onClick={() => openPayment(activeLoans![0].id)}
                  className="p-4 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors text-center"
                >
                  <Banknote className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-xs font-semibold">{bn ? "কিস্তি প্রদান" : "Pay EMI"}</p>
                </button>
              )}
              <button
                onClick={() => { setSavingsTxType("savings_deposit"); setSavingsTxOpen(true); }}
                className="p-4 rounded-xl bg-success/5 border border-success/20 hover:bg-success/10 transition-colors text-center"
              >
                <PiggyBank className="w-5 h-5 text-success mx-auto mb-1" />
                <p className="text-xs font-semibold">{bn ? "সঞ্চয় জমা" : "Deposit"}</p>
              </button>
              <button
                onClick={() => setSmartTxOpen(true)}
                className="p-4 rounded-xl bg-warning/5 border border-warning/20 hover:bg-warning/10 transition-colors text-center"
              >
                <Receipt className="w-5 h-5 text-warning mx-auto mb-1" />
                <p className="text-xs font-semibold">{bn ? "ফি পেমেন্ট" : "Fee Payment"}</p>
              </button>
              {!hasActiveLoans && (
                <button
                  onClick={() => setDisburseOpen(true)}
                  className="p-4 rounded-xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors text-center"
                >
                  <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-xs font-semibold">{bn ? "ঋণ বিতরণ" : "Disburse"}</p>
                </button>
              )}
              {hasActiveLoans && (
                <button
                  onClick={() => { setSettlementLoanId(activeLoans![0].id); setSettlementOpen(true); }}
                  className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors text-center"
                >
                  <Calculator className="w-5 h-5 text-destructive mx-auto mb-1" />
                  <p className="text-xs font-semibold">{bn ? "নিষ্পত্তি" : "Settle"}</p>
                </button>
              )}
            </div>

            {/* Per-loan comparison */}
            {hasActiveLoans && activeLoans!.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground">{bn ? "ঋণ তুলনা" : "Loan Comparison"}</p>
                {activeLoans!.map((loan) => {
                  const total = Number(loan.total_principal) + Number(loan.total_interest);
                  const outstanding = Number(loan.outstanding_principal) + Number(loan.outstanding_interest) + Number(loan.penalty_amount);
                  const paidPct = total > 0 ? Math.round(((total - outstanding) / total) * 100) : 0;
                  return (
                    <div key={loan.id} className="p-3 rounded-xl bg-muted/30 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono font-semibold">{loan.loan_id || loan.id.slice(0, 8)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-primary">{paidPct}%</span>
                          <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => openPayment(loan.id)}>
                            <Banknote className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${paidPct >= 75 ? "bg-success" : paidPct >= 40 ? "bg-primary" : "bg-warning"}`}
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                        <span>{bn ? "বকেয়া:" : "Due:"} ৳{outstanding.toLocaleString()}</span>
                        <span>EMI: ৳{Number(loan.emi_amount).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent transactions preview */}
            {clientTransactions && clientTransactions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-2">{bn ? "সাম্প্রতিক লেনদেন" : "Recent Transactions"}</p>
                {clientTransactions.slice(0, 5).map((tx: any) => {
                  const typeLabel = TX_TYPE_LABELS[tx.transaction_type as FinTransactionType];
                  return (
                    <div key={tx.id} className="flex items-center justify-between py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatShortDate(tx.created_at, lang)}</span>
                        <span className="font-medium">{bn ? typeLabel?.bn : typeLabel?.en}</span>
                      </div>
                      <span className="font-bold">৳{Number(tx.amount).toLocaleString()}</span>
                    </div>
                  );
                })}
                <Button variant="ghost" size="sm" className="w-full text-xs mt-2" onClick={() => setActiveTab("history")}>
                  {bn ? "সব দেখুন →" : "View All →"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {disburseOpen && (
        <LoanDisbursementModal open={disburseOpen} onClose={() => setDisburseOpen(false)} prefilledClientId={id} />
      )}
      {paymentOpen && (
        <LoanPaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          prefilledLoanId={paymentLoanId}
          loanInfo={activeLoans?.find(l => l.id === paymentLoanId) ? {
            id: paymentLoanId!,
            loan_id: activeLoans!.find(l => l.id === paymentLoanId)!.loan_id,
            outstanding_principal: Number(activeLoans!.find(l => l.id === paymentLoanId)!.outstanding_principal),
            outstanding_interest: Number(activeLoans!.find(l => l.id === paymentLoanId)!.outstanding_interest),
            penalty_amount: Number(activeLoans!.find(l => l.id === paymentLoanId)!.penalty_amount),
            emi_amount: Number(activeLoans!.find(l => l.id === paymentLoanId)!.emi_amount),
          } : undefined}
        />
      )}
      {smartTxOpen && (
        <SmartTransactionForm open={smartTxOpen} onClose={() => setSmartTxOpen(false)} prefillClientId={id} />
      )}
      {savingsTxOpen && (
        <SavingsTransactionModal open={savingsTxOpen} onClose={() => setSavingsTxOpen(false)} prefillClientId={id} prefillType={savingsTxType} />
      )}
      {createSavingsOpen && (
        <CreateSavingsAccountModal
          open={createSavingsOpen}
          onClose={() => setCreateSavingsOpen(false)}
          clientId={id!}
          clientName={name}
          clientPhone={c.phone}
        />
      )}
      {settlementOpen && (
        <EarlySettlementCalculator open={settlementOpen} onClose={() => { setSettlementOpen(false); setSettlementLoanId(undefined); }} preselectedLoanId={settlementLoanId} />
      )}
      {exportOpen && (() => {
        // Compute analytics snapshot for export
        const stats = allScheduleStats ?? {};
        const totalInst = Object.values(stats).reduce((s: number, v: any) => s + v.total, 0);
        const paidInst = Object.values(stats).reduce((s: number, v: any) => s + v.paid, 0);
        const punctualityPct = totalInst > 0 ? Math.round((paidInst / totalInst) * 100) : 0;
        const repaidTotal = (clientTransactions ?? [])
          .filter((tx: any) => tx.transaction_type === "loan_repayment" && tx.approval_status === "approved")
          .reduce((s: number, tx: any) => s + Number(tx.amount), 0);
        const now = Date.now();
        const overdueCount = (activeLoans ?? []).filter(l => l.next_due_date && Math.ceil((new Date(l.next_due_date).getTime() - now) / 86400000) < -7).length;
        const highRiskCount = (activeLoans ?? []).filter(l => {
          const st = stats[l.id];
          if (!st || st.total === 0) return false;
          return st.remaining / st.total > 0.2 || (Number(l.total_principal) > 0 && Number(l.penalty_amount) / Number(l.total_principal) > 0.1);
        }).length;

        return (
          <ClientStatementExport
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            clientName={name}
            memberId={c.member_id || client.id.slice(0, 8)}
            loans={(activeLoans ?? []) as any[]}
            transactions={(clientTransactions ?? []) as any[]}
            savingsBalance={totalSavingsBalance}
            analytics={{ punctualityPct, totalRepaid: repaidTotal, riskLevel: overdueCount > 0 || highRiskCount > 0 ? "high" : "low", highRiskCount, overdueCount }}
          />
        );
      })()}
    </AppLayout>
  );
};

export default ClientDetail;
