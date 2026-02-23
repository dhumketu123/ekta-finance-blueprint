import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import CommunicationHub from "@/components/CommunicationHub";
import MetricCard from "@/components/MetricCard";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInvestor, useTransactions } from "@/hooks/useSupabaseData";
import { sampleInvestors } from "@/data/sampleData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, Phone, Wallet, Crown, Gem, Award, Star,
  PlusCircle, ArrowDownCircle, Banknote, Calendar, Timer,
  Download, LineChart as LineChartIcon, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { format, differenceInDays, addMonths, startOfMonth } from "date-fns";
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, Area, AreaChart } from "recharts";

/* ─── Tier Badge Logic ─── */
const getTier = (capital: number, bn: boolean) => {
  if (capital >= 1000000) return { label: bn ? "👑 প্লাটিনাম" : "👑 Platinum", color: "bg-gradient-to-r from-amber-500 to-yellow-400 text-white", icon: Crown };
  if (capital >= 500000) return { label: bn ? "💎 ডায়মন্ড" : "💎 Diamond", color: "bg-gradient-to-r from-cyan-500 to-blue-500 text-white", icon: Gem };
  if (capital >= 200000) return { label: bn ? "🏆 গোল্ড" : "🏆 Gold", color: "bg-gradient-to-r from-yellow-600 to-amber-500 text-white", icon: Award };
  return { label: bn ? "⭐ সিলভার" : "⭐ Silver", color: "bg-gradient-to-r from-slate-400 to-slate-500 text-white", icon: Star };
};

/* ─── Dividend Countdown ─── */
const getDividendCountdown = (lastProfitDate: string | null, bn: boolean) => {
  const now = new Date();
  const nextMonth = startOfMonth(addMonths(now, 1));
  const days = differenceInDays(nextMonth, now);
  return bn ? `পরবর্তী লভ্যাংশ: ${days} দিন ⏳` : `Next Dividend: ${days} days ⏳`;
};

/* ─── AI Projection ─── */
const getProjection = (capital: number, rate: number, bn: boolean) => {
  if (rate <= 0) return null;
  const monthsToDouble = Math.ceil(Math.log(2) / Math.log(1 + rate / 100));
  return bn
    ? `💡 AI প্রজেকশন: ${rate}% মাসিক চক্রবৃদ্ধি হারে, এই মূলধন ~${monthsToDouble} মাসে দ্বিগুণ হবে।`
    : `💡 AI Projection: At ${rate}% monthly compound rate, this capital will double in ~${monthsToDouble} months.`;
};

const InvestorDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bn = lang === "bn";
  const { data: dbInvestor, isLoading } = useInvestor(id || "");
  const { data: txns } = useTransactions({ investor_id: id });

  // Modal states — must be before any early returns
  const [payDividendOpen, setPayDividendOpen] = useState(false);
  const [addCapitalOpen, setAddCapitalOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [payoutMode, setPayoutMode] = useState<"cash" | "reinvest">("cash");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [dividendPayAmount, setDividendPayAmount] = useState("");
  const [dividendNotes, setDividendNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sampleInv = sampleInvestors.find((i) => i.id === id);
  const hasDb = !!dbInvestor;
  const inv: any = hasDb ? dbInvestor : sampleInv;

  // Memoized sparkline — also must be before returns
  const sparklineData = useMemo(() => {
    if (!txns) return Array.from({ length: 6 }, (_, i) => ({ month: "", value: 0 }));
    const now = new Date();
    const dividends = txns.filter((tx: any) => tx.type === "investor_profit");
    const months: { month: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, "yyyy-MM");
      const profit = dividends
        .filter((tx: any) => tx.transaction_date?.startsWith(key) && tx.status === "paid")
        .reduce((s: number, tx: any) => s + tx.amount, 0);
      months.push({ month: format(d, "MMM"), value: profit });
    }
    return months;
  }, [txns]);

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="card-elevated p-8 text-center animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mx-auto" />
        </div>
      </AppLayout>
    );
  }

  if (!inv) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = hasDb ? (bn ? inv.name_bn : inv.name_en) : (bn ? inv.nameBn : inv.nameEn);
  const nameEn = hasDb ? inv.name_en : inv.nameEn;
  const phone = inv.phone;
  const capital = Number(hasDb ? inv.capital : inv.capital);
  const profitPct = Number(hasDb ? inv.monthly_profit_percent : inv.monthlyProfitPercent);
  const reinvest = inv.reinvest;
  const monthlyProfit = Math.round(capital * profitPct / 100);
  const dueDividend = Number(hasDb ? inv.due_dividend ?? 0 : 0);
  const totalPayable = monthlyProfit + dueDividend;
  const lastProfitDate = hasDb ? inv.last_profit_date : null;
  const maturityDate = hasDb ? inv.maturity_date : null;

  const totalProfitPaid = txns
    ?.filter((tx: any) => tx.type === "investor_profit" && tx.status === "paid")
    .reduce((s: number, tx: any) => s + tx.amount, 0) ?? 0;

  const tier = getTier(capital, bn);
  const TierIcon = tier.icon;
  const countdown = getDividendCountdown(lastProfitDate, bn);
  const projection = reinvest ? getProjection(capital, profitPct, bn) : null;

  // Dividend history & Capital transactions
  const dividendTxns = txns?.filter((tx: any) => tx.type === "investor_profit") ?? [];
  const capitalTxns = txns?.filter((tx: any) =>
    ["loan_disbursement", "investor_principal_return", "savings_deposit"].includes(tx.type) ||
    tx.notes?.toLowerCase().includes("capital")
  ) ?? [];

  // Handlers
  const handlePayDividend = async () => {
    if (!hasDb || !user) return;
    setSubmitting(true);
    try {
      if (payoutMode === "reinvest") {
        // Add profit to capital
        const { error: updErr } = await supabase
          .from("investors")
          .update({
            capital: capital + monthlyProfit,
            accumulated_profit: (inv.accumulated_profit || 0) + monthlyProfit,
            last_profit_date: format(new Date(), "yyyy-MM-dd"),
          })
          .eq("id", inv.id);
        if (updErr) throw updErr;
      } else {
        const { error: updErr } = await supabase
          .from("investors")
          .update({ last_profit_date: format(new Date(), "yyyy-MM-dd") })
          .eq("id", inv.id);
        if (updErr) throw updErr;
      }
      // Log transaction
      const { error: txErr } = await supabase.from("transactions").insert({
        investor_id: inv.id,
        type: "investor_profit" as any,
        amount: monthlyProfit,
        status: "paid" as any,
        transaction_date: format(new Date(), "yyyy-MM-dd"),
        notes: payoutMode === "reinvest" ? "Auto-reinvested to capital" : "Cash payout",
        performed_by: user.id,
      });
      if (txErr) throw txErr;
      toast.success(bn ? "লভ্যাংশ প্রদান সফল ✅" : "Dividend paid successfully ✅");
      queryClient.invalidateQueries({ queryKey: ["investors", id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setPayDividendOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCapital = async () => {
    if (!hasDb || !user) return;
    const amt = Number(capitalAmount);
    const fee = Number(feeAmount) || 0;
    if (!amt || amt <= 0) { toast.error(bn ? "সঠিক পরিমাণ দিন" : "Enter valid amount"); return; }
    setSubmitting(true);
    try {
      const { error: updErr } = await supabase
        .from("investors")
        .update({
          capital: capital + amt,
          principal_amount: (inv.principal_amount || 0) + amt,
        })
        .eq("id", inv.id);
      if (updErr) throw updErr;
      // Log capital transaction
      const { error: txErr } = await supabase.from("transactions").insert({
        investor_id: inv.id,
        type: "savings_deposit" as any,
        amount: amt,
        status: "paid" as any,
        transaction_date: format(new Date(), "yyyy-MM-dd"),
        notes: `Capital addition${fee > 0 ? ` (Fee: ৳${fee})` : ""}`,
        performed_by: user.id,
      });
      if (txErr) throw txErr;
      // Log fee if present
      if (fee > 0) {
        await supabase.from("transactions").insert({
          investor_id: inv.id,
          type: "loan_penalty" as any,
          amount: fee,
          status: "paid" as any,
          transaction_date: format(new Date(), "yyyy-MM-dd"),
          notes: "Capital addition processing fee",
          performed_by: user.id,
        });
      }
      toast.success(bn ? "মূলধন যোগ সফল ✅" : "Capital added ✅");
      queryClient.invalidateQueries({ queryKey: ["investors", id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setAddCapitalOpen(false);
      setCapitalAmount("");
      setFeeAmount("");
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!hasDb || !user) return;
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0 || amt > capital) { toast.error(bn ? "সঠিক পরিমাণ দিন" : "Invalid amount"); return; }
    setSubmitting(true);
    try {
      const { error: updErr } = await supabase
        .from("investors")
        .update({ capital: capital - amt })
        .eq("id", inv.id);
      if (updErr) throw updErr;
      const { error: txErr } = await supabase.from("transactions").insert({
        investor_id: inv.id,
        type: "investor_principal_return" as any,
        amount: amt,
        status: "paid" as any,
        transaction_date: format(new Date(), "yyyy-MM-dd"),
        notes: "Capital withdrawal",
        performed_by: user.id,
      });
      if (txErr) throw txErr;
      toast.success(bn ? "উত্তোলন সফল ✅" : "Withdrawal successful ✅");
      queryClient.invalidateQueries({ queryKey: ["investors", id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setWithdrawalOpen(false);
      setWithdrawAmount("");
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadStatement = () => {
    const allTxns = txns ?? [];
    if (!allTxns.length) { toast.info(bn ? "কোনো লেনদেন নেই" : "No transactions"); return; }
    const headers = ["Date", "Type", "Amount (৳)", "Status", "Notes"];
    const rows = allTxns.map((tx: any) => [
      tx.transaction_date, tx.type, tx.amount, tx.status, tx.notes || ""
    ]);
    const csv = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investor-statement-${inv.investor_id || inv.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(bn ? "স্টেটমেন্ট ডাউনলোড হয়েছে" : "Statement downloaded");
  };

  return (
    <AppLayout>
      <PageHeader title={bn ? "সম্পদ ব্যবস্থাপনা" : "Wealth Management"} description={`${t("detail.investor")} — ${inv.investor_id ?? inv.id.slice(0, 8)}`} />

      {/* ═══ PHASE 1: Premium Hero Section ═══ */}
      <div className="card-elevated p-6 border-l-4 border-l-success relative overflow-hidden">
        {/* Background sparkline */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="hsl(var(--success))" fill="url(#sparkGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="relative flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center shrink-0 ring-2 ring-success/20">
            <TrendingUp className="w-8 h-8 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-foreground truncate">{name}</h2>
              {/* Tier Badge */}
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold ${tier.color} shadow-sm`}>
                <TierIcon className="w-3 h-3" />
                {tier.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{inv.investor_id ?? inv.id.slice(0, 8)}</span>
              <StatusBadge status={reinvest ? "active" : "inactive"} />
              {phone && (
                <CommunicationHub clientId={inv.id} clientPhone={phone} clientName={name} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Wealth Tracker Metric Cards ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={bn ? "মোট মূলধন" : "Total Capital"}
          value={`৳${capital.toLocaleString()}`}
          icon={<Wallet className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={bn ? "মাসিক লভ্যাংশ" : "Monthly Profit"}
          value={`৳${monthlyProfit.toLocaleString()}`}
          subtitle={`${profitPct}%`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          title={bn ? "মোট লভ্যাংশ প্রদান" : "Total Profit Paid"}
          value={`৳${totalProfitPaid.toLocaleString()}`}
          icon={<Banknote className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={bn ? "লভ্যাংশ কাউন্টডাউন" : "Dividend Countdown"}
          value={countdown}
          icon={<Timer className="w-5 h-5" />}
          variant="default"
        />
      </div>

      {/* ═══ PHASE 2: Action Buttons ═══ */}
      {hasDb && (
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => { setPayoutMode(reinvest ? "reinvest" : "cash"); setPayDividendOpen(true); }}
            className="gap-2 bg-success hover:bg-success/90 text-success-foreground shadow-md"
          >
            <Banknote className="w-4 h-4" />
            {bn ? "লভ্যাংশ প্রদান" : "Pay Dividend"}
          </Button>
          <Button
            onClick={() => setAddCapitalOpen(true)}
            variant="outline"
            className="gap-2 border-primary/30 hover:bg-primary/5"
          >
            <PlusCircle className="w-4 h-4 text-primary" />
            {bn ? "মূলধন যোগ" : "Add Capital"}
          </Button>
          <Button
            onClick={() => setWithdrawalOpen(true)}
            variant="outline"
            className="gap-2 border-destructive/30 hover:bg-destructive/5"
          >
            <ArrowDownCircle className="w-4 h-4 text-destructive" />
            {bn ? "উত্তোলন" : "Withdrawal"}
          </Button>
        </div>
      )}

      {/* ═══ PHASE 3: AI Projection Card ═══ */}
      {projection && (
        <div className="card-elevated p-5 border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-primary/10 shrink-0">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-1">
                {bn ? "AI প্রজেকশন" : "AI Projection"}
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{projection}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Profit Sparkline Chart ═══ */}
      {sparklineData.some(d => d.value > 0) && (
        <div className="card-elevated p-5">
          <div className="flex items-center gap-2 mb-3">
            <LineChartIcon className="w-4 h-4 text-success" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {bn ? "লভ্যাংশ ট্রেন্ড (৬ মাস)" : "Profit Trend (6 Months)"}
            </h3>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="value" stroke="hsl(var(--success))" fill="url(#profitGrad)" strokeWidth={2.5} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number) => [`৳${v.toLocaleString()}`, bn ? "লভ্যাংশ" : "Profit"]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ Contact Info ═══ */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Phone className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.contactInfo")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <DetailField label={t("table.name")} value={name} />
          <DetailField label={t("detail.nameEn")} value={nameEn} />
          <DetailField label={t("table.phone")} value={phone || "—"} />
          <DetailField label={t("table.reinvest")} value={reinvest ? "✅ Yes" : "❌ No"} />
          {maturityDate && <DetailField label={bn ? "পরিপক্কতার তারিখ" : "Maturity Date"} value={format(new Date(maturityDate), "dd MMM yyyy")} />}
        </div>
      </div>

      {/* ═══ PHASE 4: Ledger Tabs ═══ */}
      <div className="card-elevated p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {bn ? "লেনদেন লেজার" : "Transaction Ledger"}
          </h3>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownloadStatement}>
            <Download className="w-3.5 h-3.5" />
            {bn ? "স্টেটমেন্ট" : "Statement"}
          </Button>
        </div>

        <Tabs defaultValue="dividends" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="dividends" className="text-xs gap-1.5">
              <Banknote className="w-3.5 h-3.5" />
              {bn ? "লভ্যাংশ ইতিহাস" : "Dividend History"}
            </TabsTrigger>
            <TabsTrigger value="capital" className="text-xs gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              {bn ? "মূলধন লেনদেন" : "Capital Transactions"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dividends">
            {dividendTxns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{bn ? "কোনো লভ্যাংশ রেকর্ড নেই" : "No dividend records"}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "তারিখ" : "Date"}</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "পরিমাণ" : "Amount"}</th>
                      <th className="text-center py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "অবস্থা" : "Status"}</th>
                      <th className="text-left py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "মন্তব্য" : "Notes"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividendTxns.slice(0, 20).map((tx: any) => (
                      <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 text-xs font-mono">{tx.transaction_date}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-success">৳{Number(tx.amount).toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-center"><StatusBadge status={tx.status === "paid" ? "paid" : "pending"} /></td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground truncate max-w-[150px]">{tx.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="capital">
            {capitalTxns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{bn ? "কোনো মূলধন লেনদেন নেই" : "No capital transactions"}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "তারিখ" : "Date"}</th>
                      <th className="text-left py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "ধরন" : "Type"}</th>
                      <th className="text-right py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "পরিমাণ" : "Amount"}</th>
                      <th className="text-left py-2 px-3 text-xs font-bold text-muted-foreground uppercase">{bn ? "মন্তব্য" : "Notes"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capitalTxns.slice(0, 20).map((tx: any) => (
                      <tr key={tx.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3 text-xs font-mono">{tx.transaction_date}</td>
                        <td className="py-2.5 px-3 text-xs">{tx.type}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${tx.type === "investor_principal_return" ? "text-destructive" : "text-primary"}`}>
                          {tx.type === "investor_principal_return" ? "-" : "+"}৳{Number(tx.amount).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground truncate max-w-[150px]">{tx.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ═══ PHASE 2: Pay Dividend Modal ═══ */}
      <Dialog open={payDividendOpen} onOpenChange={setPayDividendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-success" />
              {bn ? "লভ্যাংশ প্রদান" : "Pay Dividend"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-3">
            <div className="card-elevated p-4 bg-success/5 border-success/20">
              <p className="text-xs text-muted-foreground">{bn ? "হিসাবকৃত লভ্যাংশ" : "Calculated Dividend"}</p>
              <p className="text-3xl font-extrabold text-success mt-1">৳{monthlyProfit.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{capital.toLocaleString()} × {profitPct}%</p>
            </div>
            <div>
              <Label className="text-xs font-bold mb-2 block">{bn ? "পরিশোধ পদ্ধতি" : "Payout Method"}</Label>
              <RadioGroup value={payoutMode} onValueChange={(v) => setPayoutMode(v as "cash" | "reinvest")} className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="cash" id="cash" />
                  <Label htmlFor="cash" className="text-sm cursor-pointer flex-1">
                    💵 {bn ? "নগদ প্রদান" : "Cash Payout"}
                  </Label>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="reinvest" id="reinvest" />
                  <Label htmlFor="reinvest" className="text-sm cursor-pointer flex-1">
                    🔄 {bn ? "মূলধনে পুনঃবিনিয়োগ" : "Reinvest to Capital"}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDividendOpen(false)}>{bn ? "বাতিল" : "Cancel"}</Button>
            <Button onClick={handlePayDividend} disabled={submitting} className="bg-success hover:bg-success/90 text-success-foreground gap-1.5">
              {submitting ? "..." : bn ? "নিশ্চিত করুন" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Add Capital Modal ═══ */}
      <Dialog open={addCapitalOpen} onOpenChange={setAddCapitalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-primary" />
              {bn ? "মূলধন যোগ" : "Add Capital"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div>
              <Label className="text-xs font-bold">{bn ? "মূলধন পরিমাণ (৳)" : "Capital Amount (৳)"}</Label>
              <Input
                type="number"
                value={capitalAmount}
                onChange={(e) => setCapitalAmount(e.target.value)}
                placeholder="50000"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">{bn ? "ফি (ঐচ্ছিক)" : "Fee (Optional)"}</Label>
              <Input
                type="number"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                placeholder="0"
                className="mt-1.5"
              />
            </div>
            {capitalAmount && Number(capitalAmount) > 0 && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground">{bn ? "নতুন মোট মূলধন" : "New Total Capital"}</p>
                <p className="text-xl font-bold text-primary">৳{(capital + Number(capitalAmount)).toLocaleString()}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCapitalOpen(false)}>{bn ? "বাতিল" : "Cancel"}</Button>
            <Button onClick={handleAddCapital} disabled={submitting} className="gap-1.5">
              {submitting ? "..." : bn ? "যোগ করুন" : "Add Capital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Withdrawal Modal ═══ */}
      <Dialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-destructive" />
              {bn ? "উত্তোলন" : "Withdrawal"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10">
              <p className="text-xs text-muted-foreground">{bn ? "বর্তমান মূলধন" : "Current Capital"}</p>
              <p className="text-xl font-bold text-foreground">৳{capital.toLocaleString()}</p>
            </div>
            <div>
              <Label className="text-xs font-bold">{bn ? "উত্তোলনের পরিমাণ (৳)" : "Withdrawal Amount (৳)"}</Label>
              <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="10000"
                max={capital}
                className="mt-1.5"
              />
            </div>
            {withdrawAmount && Number(withdrawAmount) > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border/60">
                <p className="text-xs text-muted-foreground">{bn ? "অবশিষ্ট মূলধন" : "Remaining Capital"}</p>
                <p className={`text-xl font-bold ${Number(withdrawAmount) > capital ? "text-destructive" : "text-foreground"}`}>
                  ৳{Math.max(0, capital - Number(withdrawAmount)).toLocaleString()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawalOpen(false)}>{bn ? "বাতিল" : "Cancel"}</Button>
            <Button
              onClick={handleWithdrawal}
              disabled={submitting || Number(withdrawAmount) > capital || Number(withdrawAmount) <= 0}
              variant="destructive"
              className="gap-1.5"
            >
              {submitting ? "..." : bn ? "উত্তোলন করুন" : "Withdraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default InvestorDetail;
