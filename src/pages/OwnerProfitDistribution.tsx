import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";

import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Crown, TrendingUp, DollarSign, Calculator, Loader2, ArrowUpRight, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

const OwnerProfitDistribution = () => {
  const { lang } = useLanguage();
  const { isAdmin, isOwner } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [calculating, setCalculating] = useState(false);

  // Fetch distributions
  const { data: distributions, isLoading: distLoading } = useQuery({
    queryKey: ["owner_profit_distributions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_distributions")
        .select("*")
        .order("period_month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data;
    },
  });

  // Fetch owner shares
  const { data: shares } = useQuery({
    queryKey: ["owner_profit_shares"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("*, profiles:owner_id(name_en, name_bn)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch owners for count
  const { data: owners } = useQuery({
    queryKey: ["owners_count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "owner");
      if (error) throw error;
      return data;
    },
  });

  // KPI calculations
  const totalDistributed = distributions
    ?.filter(d => d.distribution_status === "distributed")
    .reduce((s, d) => s + Number(d.net_profit), 0) ?? 0;

  const totalPending = distributions
    ?.filter(d => d.distribution_status === "pending")
    .reduce((s, d) => s + Number(d.net_profit), 0) ?? 0;

  const latestRevenue = distributions?.[0]?.gross_revenue ?? 0;
  const latestNetProfit = distributions?.[0]?.net_profit ?? 0;
  const ownerCount = owners?.length ?? 0;

  // Predictive: estimate next month's profit (simple moving average of last 3)
  const recentProfits = (distributions ?? [])
    .filter(d => d.distribution_status === "distributed")
    .slice(0, 3)
    .map(d => Number(d.net_profit));
  const predictedNext = recentProfits.length > 0
    ? Math.round(recentProfits.reduce((a, b) => a + b, 0) / recentProfits.length)
    : 0;

  // Calculate profit for current month
  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const now = new Date();
      const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

      const { data, error } = await supabase.rpc("calculate_owner_profit", {
        _period_month: periodMonth,
      });

      if (error) throw error;

      const result = data as any;
      toast({
        title: lang === "bn" ? "মুনাফা হিসাব সম্পন্ন" : "Profit Calculated",
        description: lang === "bn"
          ? `নিট মুনাফা: ৳${Number(result?.net_profit ?? 0).toLocaleString()} | ${ownerCount} জন মালিকের মধ্যে বিতরণ`
          : `Net Profit: ৳${Number(result?.net_profit ?? 0).toLocaleString()} | Distributed among ${ownerCount} owners`,
      });
      queryClient.invalidateQueries({ queryKey: ["owner_profit_distributions"] });
      queryClient.invalidateQueries({ queryKey: ["owner_profit_shares"] });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast({ title: "Error", description: errMsg, variant: "destructive" });
    } finally {
      setCalculating(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "distributed":
        return { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: lang === "bn" ? "বিতরিত" : "Paid" };
      case "pending":
        return { icon: Clock, color: "text-warning", bg: "bg-warning/10", label: lang === "bn" ? "বকেয়া" : "Pending" };
      default:
        return { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", label: status };
    }
  };

  const formatMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US", { year: "numeric", month: "long" });
  };

  if (distLoading) {
    return (
      <AppLayout>
        <PageHeader title={lang === "bn" ? "মালিক মুনাফা বিতরণ" : "Owner Profit Distribution"} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={5} cols={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "মালিক মুনাফা বিতরণ" : "Owner Profit Distribution"}
        description={lang === "bn"
          ? "মাসিক নিট মুনাফা হিসাব ও মালিকদের মধ্যে বিতরণ"
          : "Monthly net profit calculation and distribution among owners"}
        actions={
          isAdmin ? (
            <Button
              size="sm"
              className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCalculate}
              disabled={calculating}
            >
              {calculating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
              {lang === "bn" ? "মুনাফা হিসাব করুন" : "Calculate Profit"}
            </Button>
          ) : null
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          title={lang === "bn" ? "মোট বিতরিত" : "Total Distributed"}
          value={`৳${(totalDistributed / 1000).toFixed(0)}K`}
          subtitle={`${distributions?.filter(d => d.distribution_status === "distributed").length ?? 0} ${lang === "bn" ? "মাস" : "months"}`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={lang === "bn" ? "বকেয়া মুনাফা" : "Pending Profit"}
          value={`৳${(totalPending / 1000).toFixed(0)}K`}
          subtitle={`${distributions?.filter(d => d.distribution_status === "pending").length ?? 0} ${lang === "bn" ? "মাস বকেয়া" : "months pending"}`}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={lang === "bn" ? "সর্বশেষ রাজস্ব" : "Latest Revenue"}
          value={`৳${(Number(latestRevenue) / 1000).toFixed(0)}K`}
          subtitle={`${lang === "bn" ? "নিট" : "Net"}: ৳${(Number(latestNetProfit) / 1000).toFixed(0)}K`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <MetricCard
                  title={lang === "bn" ? "পূর্বাভাস (পরবর্তী)" : "Predicted Next"}
                  value={`৳${(predictedNext / 1000).toFixed(0)}K`}
                  subtitle={`${ownerCount} ${lang === "bn" ? "জন মালিক" : "owners"}`}
                  icon={<ArrowUpRight className="w-5 h-5" />}
                  variant="default"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {lang === "bn"
                  ? `পূর্বাভাস: পরবর্তী মাসে প্রত্যেক মালিক ≈ ৳${ownerCount > 0 ? Math.round(predictedNext / ownerCount).toLocaleString() : 0} পাবেন`
                  : `Prediction: Each owner ≈ ৳${ownerCount > 0 ? Math.round(predictedNext / ownerCount).toLocaleString() : 0} next month`}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Storytelling Banner */}
      {distributions && distributions.length > 0 && (
        <div className="card-elevated p-4 border-l-4 border-l-success animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Crown className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-bold text-card-foreground">
                {lang === "bn"
                  ? `✨ সিস্টেম সুখী — ${distributions.filter(d => d.distribution_status === "distributed").length} মাসের মুনাফা সফলভাবে বিতরণ হয়েছে`
                  : `✨ System Happy — ${distributions.filter(d => d.distribution_status === "distributed").length} months of profit successfully distributed`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "bn"
                  ? `মোট ৳${totalDistributed.toLocaleString()} বিতরিত | ${ownerCount} জন মালিক সক্রিয়`
                  : `Total ৳${totalDistributed.toLocaleString()} distributed | ${ownerCount} owners active`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Distribution History Table */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-bold text-card-foreground">
            {lang === "bn" ? "বিতরণ ইতিহাস" : "Distribution History"}
          </h2>
        </div>

        {!distributions || distributions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {lang === "bn" ? "কোনো মুনাফা বিতরণ নেই — উপরে 'মুনাফা হিসাব করুন' চাপুন" : "No distributions yet — click 'Calculate Profit' above"}
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block">
              <Table className="table-premium">
                <TableHeader className="table-header-premium">
                  <TableRow>
                    <TableHead>{lang === "bn" ? "মাস" : "Month"}</TableHead>
                    <TableHead>{lang === "bn" ? "মোট রাজস্ব" : "Revenue"}</TableHead>
                    <TableHead>{lang === "bn" ? "বিনিয়োগকারী মুনাফা" : "Investor Profit"}</TableHead>
                    <TableHead>{lang === "bn" ? "নিট মুনাফা" : "Net Profit"}</TableHead>
                    <TableHead>{lang === "bn" ? "অবস্থা" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributions.map((d) => {
                    const sc = getStatusConfig(d.distribution_status);
                    return (
                      <TableRow key={d.id} className="group transition-colors hover:bg-accent/50">
                        <TableCell className="text-xs font-medium">{formatMonth(d.period_month)}</TableCell>
                        <TableCell className="text-xs font-semibold">৳{Number(d.gross_revenue).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">৳{Number(d.investor_profit_paid).toLocaleString()}</TableCell>
                        <TableCell className="text-xs font-bold">
                          <span className={Number(d.net_profit) >= 0 ? "text-success" : "text-destructive"}>
                            ৳{Number(d.net_profit).toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.bg} ${sc.color}`}>
                            <sc.icon className="w-3 h-3" />
                            {sc.label}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border">
              {distributions.map((d) => {
                const sc = getStatusConfig(d.distribution_status);
                return (
                  <div key={d.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{formatMonth(d.period_month)}</p>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sc.bg} ${sc.color}`}>
                        <sc.icon className="w-3 h-3" />
                        {sc.label}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{lang === "bn" ? "রাজস্ব" : "Revenue"}</p>
                        <p className="font-semibold">৳{Number(d.gross_revenue).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{lang === "bn" ? "বিনিয়োগকারী" : "Investor"}</p>
                        <p className="font-semibold">৳{Number(d.investor_profit_paid).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{lang === "bn" ? "নিট" : "Net"}</p>
                        <p className={`font-bold ${Number(d.net_profit) >= 0 ? "text-success" : "text-destructive"}`}>
                          ৳{Number(d.net_profit).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Owner Shares Breakdown */}
      {shares && shares.length > 0 && (
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-bold text-card-foreground">
              {lang === "bn" ? "মালিকদের ভাগ" : "Owner Shares"}
            </h2>
          </div>
          <div className="hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{lang === "bn" ? "মালিক" : "Owner"}</TableHead>
                  <TableHead>{lang === "bn" ? "শেয়ার %" : "Share %"}</TableHead>
                  <TableHead>{lang === "bn" ? "পরিমাণ" : "Amount"}</TableHead>
                  <TableHead>{lang === "bn" ? "অবস্থা" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map((s: any) => {
                  const name = lang === "bn"
                    ? (s.profiles?.name_bn || s.profiles?.name_en || "—")
                    : (s.profiles?.name_en || "—");
                  const psc = getStatusConfig(s.payment_status === "paid" ? "distributed" : "pending");
                  return (
                    <TableRow key={s.id} className="hover:bg-accent/50 transition-colors">
                      <TableCell className="text-xs font-medium">{name}</TableCell>
                      <TableCell className="text-xs">{Number(s.share_percentage).toFixed(1)}%</TableCell>
                      <TableCell className="text-xs font-semibold">৳{Number(s.share_amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${psc.bg} ${psc.color}`}>
                          <psc.icon className="w-3 h-3" />
                          {psc.label}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="sm:hidden divide-y divide-border">
            {shares.map((s: any) => {
              const name = lang === "bn"
                ? (s.profiles?.name_bn || s.profiles?.name_en || "—")
                : (s.profiles?.name_en || "—");
              const psc = getStatusConfig(s.payment_status === "paid" ? "distributed" : "pending");
              return (
                <div key={s.id} className="p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                    <Crown className="w-4 h-4 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${psc.bg} ${psc.color}`}>
                        <psc.icon className="w-3 h-3" />
                        {psc.label}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Number(s.share_percentage).toFixed(1)}% → <span className="font-semibold text-foreground">৳{Number(s.share_amount).toLocaleString()}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default OwnerProfitDistribution;
