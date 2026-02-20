import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton, MetricCardSkeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, AlertTriangle, Banknote } from "lucide-react";

const PaymentStatusPage = () => {
  const { lang } = useLanguage();

  // Fetch all loan schedules with client & loan info
  const { data: schedules, isLoading } = useQuery({
    queryKey: ["payment-status-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_schedules")
        .select("*, clients(name_en, name_bn, member_id), loans(loan_id, status)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch penalty & interest earned from master_ledger
  const { data: ledgerSums } = useQuery({
    queryKey: ["payment-status-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_ledger")
        .select("account_code, credit_amount")
        .in("account_code", ["PENALTY_INCOME", "LOAN_INTEREST"]);
      if (error) throw error;
      const penaltyEarned = (data ?? []).filter(r => r.account_code === "PENALTY_INCOME").reduce((s, r) => s + Number(r.credit_amount), 0);
      const interestEarned = (data ?? []).filter(r => r.account_code === "LOAN_INTEREST").reduce((s, r) => s + Number(r.credit_amount), 0);
      return { penaltyEarned, interestEarned };
    },
  });

  const metrics = useMemo(() => {
    if (!schedules) return null;
    const paid = schedules.filter(s => s.status === "paid");
    const pending = schedules.filter(s => s.status === "pending");
    const overdue = schedules.filter(s => s.status === "overdue");
    const partial = schedules.filter(s => s.status === "partial");

    const totalCollected = paid.reduce((s, r) => s + Number(r.principal_paid ?? 0) + Number(r.interest_paid ?? 0), 0)
      + partial.reduce((s, r) => s + Number(r.principal_paid ?? 0) + Number(r.interest_paid ?? 0), 0);
    const totalDue = schedules.reduce((s, r) => s + Number(r.total_due ?? (Number(r.principal_due) + Number(r.interest_due))), 0);
    const overdueDue = overdue.reduce((s, r) => s + Number(r.total_due ?? (Number(r.principal_due) + Number(r.interest_due))) - Number(r.principal_paid ?? 0) - Number(r.interest_paid ?? 0), 0);

    return {
      total: schedules.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      overdueCount: overdue.length,
      partialCount: partial.length,
      totalCollected,
      totalDue,
      overdueDue,
    };
  }, [schedules]);

  // Overdue & upcoming schedules for table display
  const displaySchedules = useMemo(() => {
    if (!schedules) return [];
    return schedules
      .filter(s => s.status === "overdue" || s.status === "partial" || s.status === "pending")
      .slice(0, 20);
  }, [schedules]);

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title={lang === "bn" ? "পেমেন্ট স্ট্যাটাস" : "Payment Status"} />
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
        title={lang === "bn" ? "পেমেন্ট স্ট্যাটাস ড্যাশবোর্ড" : "Payment Status Dashboard"}
        description={lang === "bn" ? "সকল কিস্তির পেমেন্ট অবস্থা ও সারাংশ" : "Overview of all installment payment statuses"}
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <MetricCard
          title={lang === "bn" ? "পরিশোধিত কিস্তি" : "Paid Installments"}
          value={metrics?.paidCount ?? 0}
          subtitle={`${lang === "bn" ? "মোট" : "of"} ${metrics?.total ?? 0}`}
          icon={<CheckCircle2 className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={lang === "bn" ? "বকেয়া কিস্তি" : "Overdue"}
          value={metrics?.overdueCount ?? 0}
          subtitle={`৳${(metrics?.overdueDue ?? 0).toLocaleString()} ${lang === "bn" ? "বকেয়া" : "due"}`}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="destructive"
        />
        <MetricCard
          title={lang === "bn" ? "মুলতুবি কিস্তি" : "Pending"}
          value={metrics?.pendingCount ?? 0}
          subtitle={lang === "bn" ? "আসন্ন পেমেন্ট" : "Upcoming payments"}
          icon={<Clock className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={lang === "bn" ? "মোট আদায়" : "Total Collected"}
          value={`৳${((metrics?.totalCollected ?? 0) / 1000).toFixed(0)}K`}
          subtitle={`৳${((metrics?.totalDue ?? 0) / 1000).toFixed(0)}K ${lang === "bn" ? "মোট" : "total"}`}
          icon={<Banknote className="w-5 h-5" />}
        />
      </div>

      {/* Penalty & Interest Earned */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card-elevated p-5 border-l-4 border-l-warning">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {lang === "bn" ? "মোট সুদ আদায়" : "Total Interest Earned"}
          </p>
          <p className="text-xl font-bold text-warning mt-1">৳{(ledgerSums?.interestEarned ?? 0).toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-destructive">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {lang === "bn" ? "মোট জরিমানা আদায়" : "Total Penalty Earned"}
          </p>
          <p className="text-xl font-bold text-destructive mt-1">৳{(ledgerSums?.penaltyEarned ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Collection Progress */}
      {metrics && metrics.totalDue > 0 && (
        <div className="card-elevated p-5 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{lang === "bn" ? "সামগ্রিক আদায় অগ্রগতি" : "Overall Collection Progress"}</span>
            <span className="font-semibold text-foreground">
              {Math.round((metrics.totalCollected / metrics.totalDue) * 100)}%
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-700 progress-glow"
              style={{ width: `${Math.min((metrics.totalCollected / metrics.totalDue) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>৳{metrics.totalCollected.toLocaleString()} {lang === "bn" ? "আদায়" : "collected"}</span>
            <span>৳{metrics.totalDue.toLocaleString()} {lang === "bn" ? "মোট" : "total"}</span>
          </div>
        </div>
      )}

      {/* Overdue & Upcoming Table */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-bold text-card-foreground">
            {lang === "bn" ? "বকেয়া ও আসন্ন কিস্তি" : "Overdue & Upcoming Installments"}
          </h2>
        </div>
        {displaySchedules.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {lang === "bn" ? "কোনো বকেয়া বা আসন্ন কিস্তি নেই" : "No overdue or upcoming installments"}
          </div>
        ) : (
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead className="text-xs">{lang === "bn" ? "সদস্য" : "Member"}</TableHead>
                <TableHead className="text-xs">{lang === "bn" ? "ঋণ আইডি" : "Loan ID"}</TableHead>
                <TableHead className="text-xs">#</TableHead>
                <TableHead className="text-xs">{lang === "bn" ? "দেয় তারিখ" : "Due Date"}</TableHead>
                <TableHead className="text-xs text-right">{lang === "bn" ? "মোট দেয়" : "Total Due"}</TableHead>
                <TableHead className="text-xs text-center">{lang === "bn" ? "অবস্থা" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displaySchedules.map((row) => {
                const clientName = lang === "bn"
                  ? (row.clients?.name_bn || row.clients?.name_en || "—")
                  : (row.clients?.name_en || "—");
                const loanRef = row.loans?.loan_id || row.loan_id?.slice(0, 8) || "—";
                const totalDue = Number(row.total_due ?? (Number(row.principal_due) + Number(row.interest_due)));
                const statusMap: Record<string, "overdue" | "pending" | "paid" | "active"> = {
                  overdue: "overdue",
                  pending: "pending",
                  partial: "pending",
                  paid: "paid",
                };

                return (
                  <TableRow
                    key={row.id}
                    className={row.status === "overdue" ? "bg-destructive/5" : ""}
                  >
                    <TableCell>
                      <p className="text-xs font-medium">{clientName}</p>
                      {row.clients?.member_id && (
                        <p className="text-[10px] text-muted-foreground font-mono">{row.clients.member_id}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{loanRef}</TableCell>
                    <TableCell className="text-xs text-center font-mono">{row.installment_number}</TableCell>
                    <TableCell className="text-xs font-medium">{row.due_date}</TableCell>
                    <TableCell className="text-xs text-right font-bold">৳{totalDue.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={statusMap[row.status] ?? "pending"} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </AppLayout>
  );
};

export default PaymentStatusPage;
