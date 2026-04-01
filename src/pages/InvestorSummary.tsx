import { useMemo, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";

import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton, MetricCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Users, Wallet, RefreshCw, Download, DollarSign, BarChart3 } from "lucide-react";
import { format } from "date-fns";

const InvestorSummaryPage = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // Fetch all investors
  const { data: investors, isLoading: invLoading } = useQuery({
    queryKey: ["investor-summary-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch profit transactions
  const { data: profitTxs } = useQuery({
    queryKey: ["investor-summary-profits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("investor_id, amount, transaction_date, type")
        .eq("type", "investor_profit")
        .eq("status", "paid")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
  });

  const metrics = useMemo(() => {
    if (!investors) return null;
    const active = investors.filter(i => i.status === "active");
    const totalCapital = investors.reduce((s, i) => s + Number(i.capital), 0);
    const totalPrincipal = investors.reduce((s, i) => s + Number(i.principal_amount), 0);
    const totalAccProfit = investors.reduce((s, i) => s + Number(i.accumulated_profit), 0);
    const reinvestors = investors.filter(i => i.reinvest);
    const totalProfitPaid = (profitTxs ?? []).reduce((s, tx) => s + Number(tx.amount), 0);

    return {
      totalInvestors: investors.length,
      activeInvestors: active.length,
      totalCapital,
      totalPrincipal,
      totalAccProfit,
      totalProfitPaid,
      reinvestorCount: reinvestors.length,
      avgProfitPercent: active.length > 0
        ? Math.round(active.reduce((s, i) => s + Number(i.monthly_profit_percent), 0) / active.length * 100) / 100
        : 0,
    };
  }, [investors, profitTxs]);

  // Per-investor profit map
  const profitMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of profitTxs ?? []) {
      if (tx.investor_id) {
        map[tx.investor_id] = (map[tx.investor_id] ?? 0) + Number(tx.amount);
      }
    }
    return map;
  }, [profitTxs]);

  // CSV Export
  const exportCsv = useCallback(() => {
    if (!investors) return;
    const headers = ["ID", "Name (EN)", "Name (BN)", "Status", "Capital", "Principal", "Monthly %", "Accumulated Profit", "Reinvest", "Total Profit Paid"];
    const rows = investors.map(inv => [
      inv.investor_id ?? inv.id.slice(0, 8),
      inv.name_en,
      inv.name_bn,
      inv.status,
      inv.capital,
      inv.principal_amount,
      inv.monthly_profit_percent,
      inv.accumulated_profit,
      inv.reinvest ? "Yes" : "No",
      profitMap[inv.id] ?? 0,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investor-summary-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [investors, profitMap]);

  if (invLoading) {
    return (
      <AppLayout>
        <PageHeader title={bn ? "বিনিয়োগকারী সারাংশ" : "Investor Summary"} badge={bn ? "📈 ইনভেস্টর ইন্টেলিজেন্স" : "📈 Investor Intelligence"} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={6} cols={6} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "বিনিয়োগকারী সারাংশ রিপোর্ট" : "Investor Summary Report"}
        description={bn ? "সকল বিনিয়োগকারীর পোর্টফোলিও, লভ্যাংশ ও পুনর্বিনিয়োগ সারাংশ" : "Portfolio, profit distribution & reinvestment summary for all investors"}
        badge={bn ? "📈 ইনভেস্টর ইন্টেলিজেন্স" : "📈 Investor Intelligence"}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
            <Download className="w-4 h-4" />
            {bn ? "CSV ডাউনলোড" : "Export CSV"}
          </Button>
        }
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
        <MetricCard
          title={bn ? "মোট বিনিয়োগকারী" : "Total Investors"}
          value={metrics?.totalInvestors ?? 0}
          subtitle={`${metrics?.activeInvestors ?? 0} ${bn ? "সক্রিয়" : "active"}`}
          icon={<Users className="w-5 h-5" />}
        />
        <MetricCard
          title={bn ? "মোট মূলধন" : "Total Capital"}
          value={`৳${((metrics?.totalCapital ?? 0) / 1000).toFixed(0)}K`}
          subtitle={`${bn ? "আসল" : "Principal"}: ৳${((metrics?.totalPrincipal ?? 0) / 1000).toFixed(0)}K`}
          icon={<Wallet className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={bn ? "মোট লভ্যাংশ বিতরণ" : "Total Profit Distributed"}
          value={`৳${((metrics?.totalProfitPaid ?? 0) / 1000).toFixed(0)}K`}
          subtitle={`${bn ? "সঞ্চিত" : "Accumulated"}: ৳${((metrics?.totalAccProfit ?? 0) / 1000).toFixed(0)}K`}
          icon={<DollarSign className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={bn ? "পুনর্বিনিয়োগকারী" : "Reinvestors"}
          value={metrics?.reinvestorCount ?? 0}
          subtitle={`${bn ? "গড় লভ্যাংশ" : "Avg profit"}: ${metrics?.avgProfitPercent ?? 0}%`}
          icon={<RefreshCw className="w-5 h-5" />}
        />
      </div>

      {/* Reinvestment summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card-elevated p-5 border-l-4 border-l-success">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {bn ? "মোট মূলধন (সক্রিয়)" : "Active Capital"}
          </p>
          <p className="text-xl font-bold text-success mt-1">
            ৳{(investors ?? []).filter(i => i.status === "active").reduce((s, i) => s + Number(i.capital), 0).toLocaleString()}
          </p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-primary">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {bn ? "গড় মাসিক লভ্যাংশ হার" : "Avg Monthly Profit Rate"}
          </p>
          <p className="text-xl font-bold text-primary mt-1">{metrics?.avgProfitPercent ?? 0}%</p>
        </div>
      </div>

      {/* Investor Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            {bn ? "বিনিয়োগকারী তালিকা" : "Investor Portfolio"}
          </h2>
        </div>
        {(!investors || investors.length === 0) ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {bn ? "কোনো বিনিয়োগকারী পাওয়া যায়নি" : "No investors found"}
          </div>
        ) : (
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead className="text-xs">{bn ? "আইডি" : "ID"}</TableHead>
                <TableHead className="text-xs">{bn ? "নাম" : "Name"}</TableHead>
                <TableHead className="text-xs text-right">{bn ? "মূলধন" : "Capital"}</TableHead>
                <TableHead className="text-xs text-right">{bn ? "লভ্যাংশ %" : "Profit %"}</TableHead>
                <TableHead className="text-xs text-right">{bn ? "মোট লভ্যাংশ" : "Total Profit"}</TableHead>
                <TableHead className="text-xs text-center">{bn ? "পুনর্বিনিয়োগ" : "Reinvest"}</TableHead>
                <TableHead className="text-xs text-center">{bn ? "অবস্থা" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((inv) => {
                const name = bn ? inv.name_bn || inv.name_en : inv.name_en;
                const totalProfit = profitMap[inv.id] ?? 0;
                const statusMap: Record<string, "active" | "inactive" | "paid"> = {
                  active: "active",
                  matured: "paid",
                  closed: "inactive",
                };
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs font-mono">{inv.investor_id ?? inv.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{name}</p>
                      {inv.phone && <p className="text-[10px] text-muted-foreground">{inv.phone}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold">৳{Number(inv.capital).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{inv.monthly_profit_percent}%</TableCell>
                    <TableCell className="text-xs text-right font-mono font-medium text-success">৳{totalProfit.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-center">
                      {inv.reinvest ? (
                        <span className="inline-flex items-center gap-1 text-success text-[10px] font-bold">
                          <RefreshCw className="w-3 h-3" /> {bn ? "হ্যাঁ" : "Yes"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[10px]">{bn ? "না" : "No"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={statusMap[inv.status] ?? "active"} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        </div>
      </div>
    </AppLayout>
  );
};

export default InvestorSummaryPage;
