import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { useLanguage } from "@/contexts/LanguageContext";

import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import OwnerExitModal from "@/components/owner/OwnerExitModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import {
  Crown, Phone, Wallet, TrendingUp, PiggyBank, BarChart3,
  Calendar, CircleDollarSign, AlertTriangle, Trash2, LogOut,
  Shield, FileText, Scale, Sparkles, Clock, Target, Briefcase,
  FolderLock, Download, Eye,
} from "lucide-react";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, AreaChart, Area, Tooltip as RechartsTooltip,
  CartesianGrid, XAxis, YAxis, PieChart, Pie, Cell,
} from "recharts";
import { format, differenceInDays, differenceInMonths, differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";

// Constants for the 15-year partnership
const PARTNERSHIP_START = new Date("2025-05-23");
const PARTNERSHIP_END = new Date("2040-05-23");
const PARTNERSHIP_TOTAL_DAYS = differenceInDays(PARTNERSHIP_END, PARTNERSHIP_START);
const PROJECTED_YOY_GROWTH = 0.12; // 12% annual

const DONUT_COLORS = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--muted))"];

const formatBDT = (v: number) => `৳${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const OwnerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const bn = lang === "bn";
  const isSuperAdmin = role === "super_admin";
  const ownerLookupId = id || "";

  const [warningOpen, setWarningOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exitModalOpen, setExitModalOpen] = useState(false);

  // Resolve investor robustly by either investor.id or investors.user_id
  const { data: investorRecord, isLoading: investorLoading } = useQuery({
    queryKey: ["owner_investor_record", ownerLookupId],
    queryFn: async () => {
      const byInvestorId = await supabase
        .from("investors")
        .select("id, user_id, investor_id, name_en, name_bn, phone, capital, share_percentage, total_weekly_paid, accumulated_profit, weekly_share, status, created_at")
        .eq("id", ownerLookupId)
        .is("deleted_at", null)
        .maybeSingle();
      if (byInvestorId.error) throw byInvestorId.error;
      if (byInvestorId.data) return byInvestorId.data;

      const byUserId = await supabase
        .from("investors")
        .select("id, user_id, investor_id, name_en, name_bn, phone, capital, share_percentage, total_weekly_paid, accumulated_profit, weekly_share, status, created_at")
        .eq("user_id", ownerLookupId)
        .is("deleted_at", null)
        .maybeSingle();
      if (byUserId.error) throw byUserId.error;
      return byUserId.data;
    },
    enabled: !!ownerLookupId,
  });

  const profileId = investorRecord?.user_id ?? ownerLookupId;

  const { data: ownerProfile, isLoading: profileLoading } = useQuery({
    queryKey: ["owner_profile", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name_en, name_bn, phone, owner_id, created_at")
        .eq("id", profileId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
  });

  const owner = useMemo(() => {
    if (ownerProfile) {
      return {
        id: ownerProfile.id,
        user_id: ownerProfile.id,
        name_en: ownerProfile.name_en,
        name_bn: ownerProfile.name_bn,
        phone: ownerProfile.phone,
        owner_id: ownerProfile.owner_id ?? investorRecord?.investor_id ?? ownerProfile.id.slice(0, 8),
        created_at: ownerProfile.created_at,
      };
    }

    if (investorRecord) {
      return {
        id: investorRecord.id,
        user_id: investorRecord.user_id,
        name_en: investorRecord.name_en,
        name_bn: investorRecord.name_bn,
        phone: investorRecord.phone,
        owner_id: investorRecord.investor_id ?? investorRecord.id.slice(0, 8),
        created_at: investorRecord.created_at,
      };
    }

    return null;
  }, [ownerProfile, investorRecord]);

  const ownerRefId = investorRecord?.user_id ?? investorRecord?.id ?? ownerLookupId;

  // Fetch profit share history
  const { data: profitShares } = useQuery({
    queryKey: ["owner_profit_shares", ownerRefId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("*, owner_profit_distributions(period_month, net_profit, distribution_status)")
        .eq("owner_id", ownerRefId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerRefId,
  });

  // Fetch distributions for chart
  const { data: distributions } = useQuery({
    queryKey: ["owner_distributions_chart", ownerRefId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("share_amount, created_at, payment_status")
        .eq("owner_id", ownerRefId)
        .order("created_at", { ascending: true })
        .limit(24);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerRefId,
  });

  // Fetch legal documents from storage
  const { data: legalDocs } = useQuery({
    queryKey: ["owner_legal_docs", ownerRefId],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("legal-vault")
        .list(`${ownerRefId}`, { limit: 20, sortBy: { column: "created_at", order: "desc" } });
      if (error) return [];
      return data ?? [];
    },
    enabled: !!ownerRefId,
  });

  const isLoading = investorLoading || (profileLoading && !investorRecord);

  // Loading state
  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="space-y-4">
          <div className="card-elevated p-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!owner) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center space-y-3">
          <Crown className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = bn ? owner.name_bn : owner.name_en;
  const sharePct = investorRecord?.share_percentage ?? 0;
  const totalCapital = (investorRecord?.capital ?? 0) + (investorRecord?.total_weekly_paid ?? 0);

  // Profit metrics
  const totalProfitEarned = (profitShares ?? []).reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
  const paidShares = (profitShares ?? []).filter((ps) => ps.payment_status === "paid");
  const pendingShares = (profitShares ?? []).filter((ps) => ps.payment_status === "pending");
  const totalPaid = paidShares.reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
  const totalPending = pendingShares.reduce((s, ps) => s + (ps.share_amount ?? 0), 0);

  // Timeline calculations
  const now = new Date();
  const elapsedDays = Math.max(0, differenceInDays(now, PARTNERSHIP_START));
  const progressPct = Math.min(100, (elapsedDays / PARTNERSHIP_TOTAL_DAYS) * 100);
  const elapsedYears = differenceInYears(now, PARTNERSHIP_START);
  const elapsedMonths = differenceInMonths(now, PARTNERSHIP_START) % 12;
  const remainingYears = Math.max(0, differenceInYears(PARTNERSHIP_END, now));
  const remainingMonths = Math.max(0, differenceInMonths(PARTNERSHIP_END, now) % 12);

  // Donut chart data
  const donutData = [
    { name: bn ? "মূলধন" : "Capital Injected", value: totalCapital },
    { name: bn ? "মুনাফা প্রাপ্ত" : "Dividend Withdrawn", value: totalPaid },
    { name: bn ? "বকেয়া" : "Pending", value: totalPending },
  ].filter((d) => d.value > 0);

  // AI Wealth Projection
  const yearsRemaining = Math.max(0, differenceInYears(PARTNERSHIP_END, now));
  const projectedValue = totalCapital * Math.pow(1 + PROJECTED_YOY_GROWTH, yearsRemaining);

  // Area chart data
  const chartData = (distributions ?? []).map((d) => ({
    month: format(new Date(d.created_at), "MMM yy"),
    amount: d.share_amount ?? 0,
  }));

  return (
    <AppLayout>
      <PageHeader
        title={name}
        description={`${bn ? "মালিক" : "Owner"} — ${owner.owner_id ?? owner.id.slice(0, 8)}`}
        badge={bn ? "👑 ফাউন্ডার ও ইকুইটি পার্টনার" : "👑 Founder & Equity Partner"}
      />

      {/* ══════════════════════════════════════════════════════
          SECTION 1: HERO — Equity Identity Card
          ══════════════════════════════════════════════════════ */}
      <Card className={cn(
        "relative overflow-hidden border-0",
        "bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950",
        "shadow-[0_8px_40px_rgba(217,176,96,0.15)]"
      )}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(217,176,96,0.08),transparent_70%)]" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-amber-500/5 blur-3xl" />

        <CardContent className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            {/* Left — Identity */}
            <div className="flex-1 space-y-4">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
                <Crown className="w-3 h-3" />
                {bn ? "ফাউন্ডিং পার্টনার" : "Founding Partner"}
              </div>

              {/* Name */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{name}</h1>
                <p className="text-xs text-amber-200/60 font-mono mt-1">
                  ID: {owner.owner_id ?? owner.id.slice(0, 8)}
                </p>
              </div>

              {/* Status + Phone */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                  investorRecord?.status === "active"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-300 border border-red-500/30"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", investorRecord?.status === "active" ? "bg-emerald-400" : "bg-red-400")} />
                  {investorRecord?.status === "active" ? (bn ? "সক্রিয়" : "Active") : (bn ? "নিষ্ক্রিয়" : "Inactive")}
                </span>
                {owner.phone && (
                  <span className="text-xs text-white/40 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {owner.phone}
                  </span>
                )}
              </div>
            </div>

            {/* Right — Equity Percentage */}
            <div className="text-center sm:text-right">
              <p className="text-[10px] text-amber-200/50 font-bold uppercase tracking-widest mb-1">
                {bn ? "ইকুইটি হোল্ডিং" : "Equity Holding"}
              </p>
              <p className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-amber-400 tracking-tighter leading-none">
                {sharePct.toFixed(2)}%
              </p>
              <p className="text-[10px] text-white/30 mt-1.5">
                {bn ? "মোট কোম্পানি ইকুইটি" : "of total company equity"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════
          SECTION 2: 15-Year Smart Contract Timeline
          ══════════════════════════════════════════════════════ */}
      <Card className="border border-border/60 overflow-hidden">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                {bn ? "১৫-বছর স্মার্ট কন্ট্র্যাক্ট টাইমলাইন" : "15-Year Smart Contract Timeline"}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {bn ? "ক্লোজড-লুপ পার্টনারশিপ চুক্তি" : "Closed-Loop Partnership Agreement"}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="relative">
              <Progress value={progressPct} className="h-3 bg-muted/40" />
              {/* Marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow-lg shadow-primary/30"
                style={{ left: `calc(${Math.min(progressPct, 98)}% - 8px)` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
              <span>May 2025</span>
              <span className="text-primary font-bold">{progressPct.toFixed(1)}%</span>
              <span>May 2040</span>
            </div>
          </div>

          {/* Tenure Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {bn ? "বর্তমান অবস্থান" : "Current Position"}
              </p>
              <p className="text-lg font-bold text-primary mt-0.5">
                {bn
                  ? `বছর ${elapsedYears + 1}, মাস ${elapsedMonths + 1}`
                  : `Year ${elapsedYears + 1}, Month ${elapsedMonths + 1}`}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {bn ? "অবশিষ্ট" : "Remaining"}
              </p>
              <p className="text-lg font-bold text-foreground mt-0.5">
                {bn
                  ? `${remainingYears} বছর ${remainingMonths} মাস`
                  : `${remainingYears}y ${remainingMonths}m`}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center col-span-2 sm:col-span-1">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                {bn ? "ভেস্টিং স্ট্যাটাস" : "Vesting Status"}
              </p>
              <p className={cn(
                "text-sm font-bold mt-0.5",
                elapsedYears >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              )}>
                {elapsedYears >= 5
                  ? (bn ? "✅ সম্পূর্ণ ভেস্টেড" : "✅ Fully Vested")
                  : (bn ? "⏳ ভেস্টিং চলমান" : "⏳ Vesting In Progress")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════
          SECTION 3: Financial ROI & Equity Analytics
          ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Donut Chart — Capital vs Dividend */}
        <Card className="border border-border/60">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Scale className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "ক্যাপিটাল বনাম ডিভিডেন্ড" : "Capital vs Dividend"}
              </h3>
            </div>
            {donutData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {donutData.map((_, idx) => (
                        <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                      formatter={(value: number) => [formatBDT(value)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                {bn ? "এখনো কোনো ডেটা নেই" : "No data yet"}
              </div>
            )}
            {/* Legend */}
            <div className="space-y-1.5">
              {donutData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold">{formatBDT(d.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Wealth Projection */}
        <Card className={cn(
          "border border-border/60 relative overflow-hidden",
          "bg-gradient-to-br from-primary/5 to-transparent"
        )}>
          <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-primary/5 blur-2xl" />
          <CardContent className="relative p-5 space-y-5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {bn ? "AI সম্পদ প্রজেকশন" : "AI Wealth Projection"}
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-background/60 border border-border/40 space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {bn ? "বর্তমান মোট বিনিয়োগ" : "Current Total Investment"}
                </p>
                <p className="text-2xl font-extrabold text-foreground">{formatBDT(totalCapital)}</p>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Target className="w-3.5 h-3.5" />
                <span>{bn ? "বার্ষিক প্রত্যাশিত বৃদ্ধি: ১২%" : "Assumed annual growth: 12% YoY"}</span>
              </div>

              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-1">
                <p className="text-[10px] text-primary font-bold uppercase tracking-widest">
                  {bn ? "২০৪০ সালে প্রজেক্টেড মূল্য" : "Projected Value in 2040"}
                </p>
                <p className="text-3xl font-black text-primary tracking-tight">
                  {formatBDT(Math.round(projectedValue))}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {bn
                    ? `${yearsRemaining} বছরে আনুমানিক ${((projectedValue / Math.max(totalCapital, 1) - 1) * 100).toFixed(0)}% বৃদ্ধি`
                    : `~${((projectedValue / Math.max(totalCapital, 1) - 1) * 100).toFixed(0)}% growth over ${yearsRemaining} years`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 4: Metric Cards
          ══════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: bn ? "মোট মুনাফা" : "Total Profit", value: formatBDT(totalProfitEarned), icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
          { label: bn ? "প্রাপ্ত" : "Received", value: formatBDT(totalPaid), icon: <Wallet className="w-4 h-4" />, color: "text-primary", bg: "bg-primary/10" },
          { label: bn ? "বকেয়া" : "Pending", value: formatBDT(totalPending), icon: <PiggyBank className="w-4 h-4" />, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
          { label: bn ? "মোট মূলধন" : "Total Capital", value: formatBDT(totalCapital), icon: <Briefcase className="w-4 h-4" />, color: "text-foreground", bg: "bg-muted/40" },
        ].map((m) => (
          <Card key={m.label} className="border border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("p-2 rounded-lg shrink-0", m.bg)}>
                <span className={m.color}>{m.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider truncate">{m.label}</p>
                <p className={cn("text-lg font-bold tracking-tight", m.color)}>{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 5: Profit Trend Chart
          ══════════════════════════════════════════════════════ */}
      {chartData.length > 0 && (
        <Card className="border border-border/60">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CircleDollarSign className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "মুনাফা প্রবণতা" : "Profit Trend"}
              </h3>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="ownerProfitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [formatBDT(value), bn ? "মুনাফা" : "Profit"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#ownerProfitGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════
          SECTION 6: Recent Profit Distributions Table
          ══════════════════════════════════════════════════════ */}
      {(profitShares ?? []).length > 0 && (
        <Card className="border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
              {bn ? "সাম্প্রতিক মুনাফা বিতরণ" : "Recent Profit Distributions"}
            </h3>
          </div>
          <div className="hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{bn ? "মাস" : "Period"}</TableHead>
                  <TableHead>{bn ? "শেয়ার %" : "Share %"}</TableHead>
                  <TableHead>{bn ? "পরিমাণ" : "Amount"}</TableHead>
                  <TableHead>{bn ? "অবস্থা" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profitShares ?? []).slice(0, 10).map((ps) => (
                  <TableRow key={ps.id}>
                    <TableCell className="text-xs font-medium">
                      {ps.owner_profit_distributions
                        ? format(new Date((ps.owner_profit_distributions as any).period_month), "MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{ps.share_percentage}%</TableCell>
                    <TableCell className="text-xs font-semibold">{formatBDT(ps.share_amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={ps.payment_status === "paid" ? "active" : "pending"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-border">
            {(profitShares ?? []).slice(0, 10).map((ps) => (
              <div key={ps.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">
                    {ps.owner_profit_distributions
                      ? format(new Date((ps.owner_profit_distributions as any).period_month), "MMM yyyy")
                      : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{ps.share_percentage}% {bn ? "শেয়ার" : "share"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatBDT(ps.share_amount)}</p>
                  <StatusBadge status={ps.payment_status === "paid" ? "active" : "pending"} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════
          SECTION 7: Personal Digital Legal Vault
          ══════════════════════════════════════════════════════ */}
      <Card className="border border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10">
              <FolderLock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {bn ? "🔐 ডিজিটাল লিগ্যাল ভল্ট" : "🔐 Digital Legal Vault"}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {bn ? "সুরক্ষিত নথি সংরক্ষণ" : "Secure Document Repository"}
              </p>
            </div>
          </div>

          {(legalDocs ?? []).length > 0 ? (
            <div className="space-y-2">
              {(legalDocs ?? []).map((doc) => (
                <div
                  key={doc.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{doc.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {doc.created_at ? format(new Date(doc.created_at), "dd MMM yyyy") : "—"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8"
                    onClick={async () => {
                      const { data } = await supabase.storage
                        .from("legal-vault")
                        .createSignedUrl(`${ownerRefId}/${doc.name}`, 300);
                      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center space-y-2">
              <Shield className="w-10 h-10 text-muted-foreground/20 mx-auto" />
              <p className="text-xs text-muted-foreground">
                {bn ? "এখনো কোনো নথি আপলোড হয়নি" : "No documents uploaded yet"}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                {[
                  bn ? "ফাউন্ডার চুক্তিপত্র" : "Founder Agreement",
                  "KYC",
                  bn ? "এক্সিট MoU" : "Exit MoU",
                ].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-full bg-muted/30 border border-border/50 text-muted-foreground"
                  >
                    <FileText className="w-3 h-3" /> {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════
          SECTION 8: Contact Details
          ══════════════════════════════════════════════════════ */}
      <Card className="border border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Phone className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.details")}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <DetailField label={t("table.name")} value={name} />
            <DetailField label={t("detail.nameEn")} value={owner.name_en} />
            <DetailField label={t("table.phone")} value={owner.phone || "—"} />
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════
          SECTION 9: Admin Controls (Exit + Delete)
          ══════════════════════════════════════════════════════ */}

      {/* Owner Exit Protocol — Admin only */}
      {(role === "admin" || isSuperAdmin) && owner && (
        <Card className="border border-amber-500/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <LogOut className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "মালিক এক্সিট প্রোটোকল" : "Owner Exit Protocol"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {bn
                ? "কর্পোরেট-গ্রেড এক্সিট সেটেলমেন্ট। ভেস্টিং ক্যালকুলেশন, পেনাল্টি/বোনাস, MoU জেনারেশন ও Alumni রোল ট্রানজিশন।"
                : "Corporate-grade exit settlement with vesting calculation, penalty/bonus, MoU generation & Alumni role transition."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/5"
              onClick={() => setExitModalOpen(true)}
            >
              <LogOut className="w-4 h-4" />
              {bn ? "এক্সিট প্রক্রিয়া শুরু করুন" : "Initiate Exit Protocol"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Super Admin: Hard Delete */}
      {isSuperAdmin && owner && (
        <Card className="border border-destructive/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "সিস্টেম রিসেট (সুপার অ্যাডমিন)" : "System Reset (Super Admin)"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {bn ? "শুধুমাত্র টেস্ট ডেটা মুছে ফেলার জন্য।" : "For clearing test data only."}
            </p>
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setWarningOpen(true)} disabled={deleting}>
              <Trash2 className="w-4 h-4" />
              {bn ? "টেস্ট মালিক মুছুন" : "Delete Test Owner"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════
          MODALS
          ══════════════════════════════════════════════════════ */}
      {owner && (
        <OwnerExitModal
          open={exitModalOpen}
          onClose={() => setExitModalOpen(false)}
          owner={{
            id: owner.id,
            name_en: owner.name_en,
            name_bn: owner.name_bn,
            phone: owner.phone || "",
            created_at: owner.created_at,
            owner_id: owner.owner_id,
          }}
          totalCapital={totalCapital}
          totalProfitEarned={totalProfitEarned}
        />
      )}

      {/* Hard Delete Warning Modal */}
      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {bn ? "গুরুতর সতর্কতা" : "Critical Warning"}
            </DialogTitle>
            <DialogDescription className="text-sm pt-2 space-y-2">
              <span className="block font-semibold text-destructive">
                {bn ? "⚠️ অপরিবর্তনীয়!" : "⚠️ Irreversible!"}
              </span>
              <span className="block">
                {bn
                  ? "এটি স্থায়ীভাবে auth অ্যাকাউন্ট ও সকল ডেটা মুছে ফেলবে।"
                  : "This will permanently delete the auth account and all data."}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setWarningOpen(false)}>{bn ? "বাতিল" : "Cancel"}</Button>
            <Button variant="destructive" onClick={() => { setWarningOpen(false); setPinOpen(true); }}>
              {bn ? "নিশ্চিত, পিন দিন" : "Confirm, Enter PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete T-PIN */}
      <TransactionAuthModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onAuthorized={async () => {
          setPinOpen(false);
          setDeleting(true);
          try {
            const { data, error } = await supabase.rpc("secure_delete_owner" as any, { _owner_user_id: id });
            if (error) throw new Error(error.message);
            const result = data as unknown as { status: string; message: string };
            if (result.status === "error") { toast.error(result.message); return; }
            toast.success(bn ? "মালিক মুছে ফেলা হয়েছে ✅" : "Owner deleted ✅");
            queryClient.invalidateQueries({ queryKey: ["owners"] });
            navigate("/owners");
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Deletion failed");
          } finally {
            setDeleting(false);
          }
        }}
      />
    </AppLayout>
  );
};

export default OwnerDetail;
