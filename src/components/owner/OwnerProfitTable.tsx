import { memo, Suspense, lazy, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatusBadge from "@/components/StatusBadge";
import { Calendar, CircleDollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { formatLocalDate, formatChartDate } from "@/lib/date-utils";

const LazyResponsiveContainer = lazy(() => import("recharts").then((m) => ({ default: m.ResponsiveContainer })));
const LazyAreaChart = lazy(() => import("recharts").then((m) => ({ default: m.AreaChart })));
const LazyArea = lazy(() => import("recharts").then((m) => ({ default: m.Area })));
const LazyCartesianGrid = lazy(() => import("recharts").then((m) => ({ default: m.CartesianGrid })));
const LazyXAxis = lazy(() => import("recharts").then((m) => ({ default: m.XAxis })));
const LazyYAxis = lazy(() => import("recharts").then((m) => ({ default: m.YAxis })));
const LazyTooltip = lazy(() => import("recharts").then((m) => ({ default: m.Tooltip })));

const formatBDT = (v: number) => `৳${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const PAGE_SIZE = 15;

interface OwnerProfitTableProps {
  ownerRefId: string;
  bn: boolean;
}

const OwnerProfitTable = memo(({ ownerRefId, bn }: OwnerProfitTableProps) => {
  const [page, setPage] = useState(0);

  // Paginated profit shares
  const { data: profitSharesResult, isLoading } = useQuery({
    queryKey: ["owner_profit_shares_paginated", ownerRefId, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      const { data, error, count } = await supabase
        .from("owner_profit_shares")
        .select("*, owner_profit_distributions(period_month, net_profit, distribution_status)", { count: "exact" })
        .eq("owner_id", ownerRefId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { items: data ?? [], totalCount: count ?? 0 };
    },
    enabled: !!ownerRefId,
    staleTime: 60_000,
  });

  // Chart data (last 24 months, separate lightweight query)
  const { data: chartData } = useQuery({
    queryKey: ["owner_profit_chart", ownerRefId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("share_amount, created_at")
        .eq("owner_id", ownerRefId)
        .order("created_at", { ascending: true })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((d) => ({
        month: formatChartDate(d.created_at, bn ? "bn" : "en"),
        amount: d.share_amount ?? 0,
      }));
    },
    enabled: !!ownerRefId,
    staleTime: 120_000,
  });

  const items = profitSharesResult?.items ?? [];
  const totalCount = profitSharesResult?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handlePrev = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const handleNext = useCallback(() => setPage((p) => Math.min(totalPages - 1, p + 1)), [totalPages]);

  return (
    <>
      {/* Profit Trend Chart */}
      {(chartData ?? []).length > 0 && (
        <Card className="border border-border/60">
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CircleDollarSign className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                {bn ? "মুনাফা প্রবণতা" : "Profit Trend"}
              </h3>
            </div>
            <Suspense fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
              <div className="h-48">
                <LazyResponsiveContainer width="100%" height="100%">
                  <LazyAreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="ownerProfitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <LazyCartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <LazyXAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <LazyYAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <LazyTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value: number) => [formatBDT(value), bn ? "মুনাফা" : "Profit"]}
                    />
                    <LazyArea type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#ownerProfitGrad)" />
                  </LazyAreaChart>
                </LazyResponsiveContainer>
              </div>
            </Suspense>
          </div>
        </Card>
      )}

      {/* Paginated Profit Distributions Table */}
      {(totalCount > 0 || isLoading) && (
        <Card className="border border-border/60 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {bn ? "মুনাফা বিতরণ ইতিহাস" : "Profit Distribution History"}
              </h3>
            </div>
            {totalCount > 0 && (
              <span className="text-[10px] text-muted-foreground font-medium">
                {bn ? `মোট ${totalCount} টি` : `${totalCount} total`}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
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
                    {items.map((ps: any) => (
                      <TableRow key={ps.id}>
                        <TableCell className="text-xs font-medium">
                          {ps.owner_profit_distributions
                            ? format(new Date(ps.owner_profit_distributions.period_month), "MMM yyyy")
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

              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-border">
                {items.map((ps: any) => (
                  <div key={ps.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">
                        {ps.owner_profit_distributions
                          ? format(new Date(ps.owner_profit_distributions.period_month), "MMM yyyy")
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t border-border">
                  <Button variant="ghost" size="sm" onClick={handlePrev} disabled={page === 0} className="gap-1 text-xs">
                    <ChevronLeft className="w-3.5 h-3.5" /> {bn ? "আগে" : "Prev"}
                  </Button>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {bn ? `পৃষ্ঠা ${page + 1} / ${totalPages}` : `Page ${page + 1} of ${totalPages}`}
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleNext} disabled={page >= totalPages - 1} className="gap-1 text-xs">
                    {bn ? "পরে" : "Next"} <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </>
  );
});

OwnerProfitTable.displayName = "OwnerProfitTable";
export default OwnerProfitTable;
