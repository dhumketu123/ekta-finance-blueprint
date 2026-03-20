import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/dashboard/MetricCard";

import { AlertTriangle, Eye, Shield, Flame, TrendingDown, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface HeatmapClient {
  id: string;
  name_en: string;
  name_bn: string;
  phone: string | null;
  member_id: string | null;
  area: string | null;
  assigned_officer: string | null;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  overdue_count: number;
  outstanding: number;
  penalty: number;
}

const classifyRisk = (score: number): HeatmapClient["risk_level"] => {
  if (score >= 5) return "critical";
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
};

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-success/15", text: "text-success", border: "border-success/30" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-600", border: "border-yellow-500/30" },
  high: { bg: "bg-orange-500/15", text: "text-orange-600", border: "border-orange-500/30" },
  critical: { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30" },
};

const riskLabels: Record<string, { en: string; bn: string }> = {
  low: { en: "Low", bn: "নিম্ন" },
  medium: { en: "Medium", bn: "মাঝারি" },
  high: { en: "High", bn: "উচ্চ" },
  critical: { en: "Critical", bn: "গুরুতর" },
};

const useRiskHeatmapData = () =>
  useQuery({
    queryKey: ["risk_heatmap"],
    queryFn: async (): Promise<HeatmapClient[]> => {
      // Get all active clients with their loan data
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name_en, name_bn, phone, member_id, area, assigned_officer")
        .is("deleted_at", null)
        .eq("status", "active")
        .order("name_en");

      if (!clients?.length) return [];

      const clientIds = clients.map((c) => c.id);

      // Get overdue schedules per client
      const { data: overdueData } = await supabase
        .from("loan_schedules")
        .select("client_id, status")
        .in("client_id", clientIds)
        .eq("status", "overdue");

      // Get outstanding loans per client
      const { data: loanData } = await supabase
        .from("loans")
        .select("client_id, outstanding_principal, outstanding_interest, penalty_amount")
        .in("client_id", clientIds)
        .eq("status", "active")
        .is("deleted_at", null);

      // Aggregate
      const overdueMap = new Map<string, number>();
      (overdueData ?? []).forEach((s) => {
        overdueMap.set(s.client_id, (overdueMap.get(s.client_id) ?? 0) + 1);
      });

      const loanMap = new Map<string, { outstanding: number; penalty: number }>();
      (loanData ?? []).forEach((l) => {
        const prev = loanMap.get(l.client_id) ?? { outstanding: 0, penalty: 0 };
        loanMap.set(l.client_id, {
          outstanding: prev.outstanding + Number(l.outstanding_principal) + Number(l.outstanding_interest),
          penalty: prev.penalty + Number(l.penalty_amount),
        });
      });

      return clients.map((c) => {
        const overdue = overdueMap.get(c.id) ?? 0;
        const loan = loanMap.get(c.id) ?? { outstanding: 0, penalty: 0 };
        // Simple risk score: overdue count + penalty ratio factor
        const penaltyFactor = loan.outstanding > 0 ? Math.floor((loan.penalty / loan.outstanding) * 10) : 0;
        const riskScore = overdue + penaltyFactor;
        return {
          ...c,
          risk_score: riskScore,
          risk_level: classifyRisk(riskScore),
          overdue_count: overdue,
          outstanding: loan.outstanding,
          penalty: loan.penalty,
        };
      });
    },
    staleTime: 3 * 60 * 1000,
  });

const RiskHeatmap = () => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const { data: clients, isLoading, refetch, isFetching } = useRiskHeatmapData();
  const [filterLevel, setFilterLevel] = useState<string>("all");

  const sorted = useMemo(() => {
    const list = clients ?? [];
    const filtered = filterLevel === "all" ? list : list.filter((c) => c.risk_level === filterLevel);
    return [...filtered].sort((a, b) => b.risk_score - a.risk_score);
  }, [clients, filterLevel]);

  const buckets = useMemo(() => {
    const all = clients ?? [];
    return {
      low: all.filter((c) => c.risk_level === "low").length,
      medium: all.filter((c) => c.risk_level === "medium").length,
      high: all.filter((c) => c.risk_level === "high").length,
      critical: all.filter((c) => c.risk_level === "critical").length,
    };
  }, [clients]);

  const top10 = sorted.slice(0, 10);

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title={lang === "bn" ? "ঝুঁকি হিটম্যাপ" : "Risk Heatmap"} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={5} cols={5} />
      </AppLayout>
    );
  }

  const maskId = (id: string | null) => {
    if (!id) return "—";
    if (id.length <= 4) return id;
    return id.slice(0, 3) + "***" + id.slice(-2);
  };

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "ঝুঁকি হিটম্যাপ" : "Risk Heatmap"}
        description={lang === "bn" ? "ক্লায়েন্ট ঝুঁকি গ্রিড ও অগ্রাধিকার তালিকা" : "Client risk grid & priority list"}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
          </Button>
        }
      />

      {/* Risk Distribution Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {(["low", "medium", "high", "critical"] as const).map((level) => {
          const c = riskColors[level];
          const count = buckets[level];
          const icons = { low: Shield, medium: TrendingDown, high: AlertTriangle, critical: Flame };
          const Icon = icons[level];
          return (
            <button
              key={level}
              onClick={() => setFilterLevel(filterLevel === level ? "all" : level)}
              className={`card-elevated p-4 border ${c.border} ${filterLevel === level ? c.bg : ""} transition-all hover:scale-[1.02] text-left`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${c.text}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${c.text}`}>
                  {riskLabels[level][lang === "bn" ? "bn" : "en"]}
                </span>
              </div>
              <p className="text-2xl font-extrabold text-foreground">{count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {lang === "bn" ? "ক্লায়েন্ট" : "clients"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Heatmap Visual Grid */}
      <div className="card-elevated p-4">
        <h3 className="text-sm font-bold text-card-foreground mb-3">
          {lang === "bn" ? "হিটম্যাপ গ্রিড" : "Heatmap Grid"}
          <Badge variant="secondary" className="ml-2 text-xs">{sorted.length}</Badge>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((c) => {
            const col = riskColors[c.risk_level];
            return (
              <Tooltip key={c.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(`/clients/${c.id}`)}
                    className={`w-8 h-8 rounded-md ${col.bg} border ${col.border} hover:scale-110 transition-transform flex items-center justify-center`}
                  >
                    <span className={`text-[9px] font-bold ${col.text}`}>{c.risk_score}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <p className="font-semibold">{lang === "bn" ? c.name_bn : c.name_en}</p>
                  <p>{lang === "bn" ? "ঝুঁকি" : "Risk"}: {c.risk_score} | {lang === "bn" ? "বকেয়া" : "Overdue"}: {c.overdue_count}</p>
                  <p>৳{c.outstanding.toLocaleString()}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder={lang === "bn" ? "ঝুঁকি ফিল্টার" : "Risk Filter"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "bn" ? "সব" : "All"}</SelectItem>
            <SelectItem value="critical">{lang === "bn" ? "গুরুতর" : "Critical"}</SelectItem>
            <SelectItem value="high">{lang === "bn" ? "উচ্চ" : "High"}</SelectItem>
            <SelectItem value="medium">{lang === "bn" ? "মাঝারি" : "Medium"}</SelectItem>
            <SelectItem value="low">{lang === "bn" ? "নিম্ন" : "Low"}</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs ml-auto">{sorted.length} {lang === "bn" ? "ফলাফল" : "results"}</Badge>
      </div>

      {/* Priority List: Top 10 */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-card-foreground flex items-center gap-2">
            <Flame className="w-4 h-4 text-destructive" />
            {lang === "bn" ? "শীর্ষ ১০ অগ্রাধিকার" : "Top 10 Priority List"}
          </h2>
        </div>

        {top10.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className="w-12 h-12 mx-auto text-success/50 mb-3" />
            <p className="text-sm text-muted-foreground">{lang === "bn" ? "কোনো ঝুঁকিপূর্ণ ক্লায়েন্ট নেই" : "No at-risk clients found"}</p>
          </div>
        ) : (
          <>
            <div className="hidden sm:block">
              <Table className="table-premium">
                <TableHeader className="table-header-premium">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{lang === "bn" ? "ক্লায়েন্ট" : "Client"}</TableHead>
                    <TableHead>{lang === "bn" ? "সদস্য আইডি" : "Member ID"}</TableHead>
                    <TableHead>{lang === "bn" ? "ঝুঁকি" : "Risk"}</TableHead>
                    <TableHead>{lang === "bn" ? "বকেয়া কিস্তি" : "Overdue"}</TableHead>
                    <TableHead>{lang === "bn" ? "বকেয়া পরিমাণ" : "Outstanding"}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top10.map((c, i) => {
                    const col = riskColors[c.risk_level];
                    return (
                      <TableRow key={c.id} className="hover:bg-accent/50 transition-colors">
                        <TableCell className="text-xs font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <p className="text-sm font-semibold">{lang === "bn" ? c.name_bn : c.name_en}</p>
                          <p className="text-xs text-muted-foreground">{c.area || "—"}</p>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{maskId(c.member_id)}</TableCell>
                        <TableCell>
                          <Badge className={`${col.bg} ${col.text} border ${col.border} text-[10px]`}>
                            {riskLabels[c.risk_level][lang === "bn" ? "bn" : "en"]} ({c.risk_score})
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-bold text-destructive">{c.overdue_count}</TableCell>
                        <TableCell className="text-sm font-semibold">৳{c.outstanding.toLocaleString()}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => navigate(`/clients/${c.id}`)}>
                            <Eye className="w-3.5 h-3.5" />
                            {lang === "bn" ? "দেখুন" : "Open"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden divide-y divide-border">
              {top10.map((c, i) => {
                const col = riskColors[c.risk_level];
                return (
                  <div key={c.id} className="p-4 flex items-center gap-3 cursor-pointer hover:bg-accent/50" onClick={() => navigate(`/clients/${c.id}`)}>
                    <div className={`w-10 h-10 rounded-lg ${col.bg} border ${col.border} flex items-center justify-center shrink-0`}>
                      <span className={`text-sm font-bold ${col.text}`}>{c.risk_score}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-center gap-2">
                        <p className="text-sm font-semibold truncate">{lang === "bn" ? c.name_bn : c.name_en}</p>
                        <Badge className={`${col.bg} ${col.text} border ${col.border} text-[10px] shrink-0`}>
                          {riskLabels[c.risk_level][lang === "bn" ? "bn" : "en"]}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{c.overdue_count} {lang === "bn" ? "বকেয়া" : "overdue"}</span>
                        <span>•</span>
                        <span className="font-semibold text-foreground">৳{c.outstanding.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default RiskHeatmap;
