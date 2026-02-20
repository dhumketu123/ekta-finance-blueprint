import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { CalendarDays, CheckCircle2, Clock, AlertTriangle, Circle } from "lucide-react";

interface Props {
  loanId: string;
}

const statusConfig = {
  paid:    { icon: CheckCircle2,  className: "text-success",     label: { en: "Paid",    bn: "পরিশোধিত" } },
  partial: { icon: Clock,         className: "text-warning",     label: { en: "Partial", bn: "আংশিক"    } },
  overdue: { icon: AlertTriangle, className: "text-destructive", label: { en: "Overdue", bn: "বকেয়া"    } },
  pending: { icon: Circle,        className: "text-muted-foreground", label: { en: "Pending", bn: "বকেয়া নেই" } },
};

export default function LoanScheduleTable({ loanId }: Props) {
  const { lang } = useLanguage();

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["loan_schedules", loanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_schedules" as any)
        .select("*")
        .eq("loan_id", loanId)
        .order("installment_number");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!loanId,
  });

  if (isLoading) return <TableSkeleton rows={6} cols={6} />;
  if (!schedules?.length) return (
    <div className="text-center py-6 text-xs text-muted-foreground">
      {lang === "bn" ? "কোনো কিস্তির সময়সূচি পাওয়া যায়নি" : "No installment schedule found"}
    </div>
  );

  const totalDue  = schedules.reduce((s, r) => s + Number(r.total_due ?? 0), 0);
  const totalPaid = schedules.reduce((s, r) => s + Number(r.principal_paid ?? 0) + Number(r.interest_paid ?? 0), 0);
  const paid      = schedules.filter(r => r.status === "paid").length;
  const overdue   = schedules.filter(r => r.status === "overdue").length;

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: lang === "bn" ? "মোট কিস্তি" : "Total",   value: schedules.length,       cls: "text-foreground" },
          { label: lang === "bn" ? "পরিশোধিত"  : "Paid",    value: paid,                   cls: "text-success"    },
          { label: lang === "bn" ? "বকেয়া"     : "Overdue", value: overdue,                cls: "text-destructive"},
          { label: lang === "bn" ? "বাকি"       : "Pending", value: schedules.length - paid - overdue, cls: "text-muted-foreground" },
        ].map((item, i) => (
          <div key={i} className="card-elevated p-2 text-center">
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
            <p className={`text-lg font-bold ${item.cls}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{lang === "bn" ? "পরিশোধ অগ্রগতি" : "Repayment Progress"}</span>
          <span>৳{totalPaid.toLocaleString()} / ৳{totalDue.toLocaleString()}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: `${totalDue ? Math.min((totalPaid / totalDue) * 100, 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead className="w-10 text-center">#</TableHead>
              <TableHead><div className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{lang === "bn" ? "দেয় তারিখ" : "Due Date"}</div></TableHead>
              <TableHead className="text-right">{lang === "bn" ? "আসল" : "Principal"}</TableHead>
              <TableHead className="text-right">{lang === "bn" ? "সুদ" : "Interest"}</TableHead>
              <TableHead className="text-right">{lang === "bn" ? "মোট" : "Total"}</TableHead>
              <TableHead className="text-center">{lang === "bn" ? "অবস্থা" : "Status"}</TableHead>
              <TableHead>{lang === "bn" ? "পরিশোধের তারিখ" : "Paid Date"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((row) => {
              const cfg = statusConfig[row.status as keyof typeof statusConfig] ?? statusConfig.pending;
              const Icon = cfg.icon;
              const isPaid = row.status === "paid";
              return (
                <TableRow
                  key={row.id}
                  className={isPaid ? "opacity-60" : row.status === "overdue" ? "bg-destructive/5" : ""}
                >
                  <TableCell className="text-center text-xs font-mono text-muted-foreground">{row.installment_number}</TableCell>
                  <TableCell className="text-xs font-medium">{row.due_date}</TableCell>
                  <TableCell className="text-xs text-right">৳{Number(row.principal_due).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right text-warning">৳{Number(row.interest_due).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right font-bold">৳{Number(row.total_due ?? (Number(row.principal_due) + Number(row.interest_due))).toLocaleString()}</TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${cfg.className}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label[lang as "en" | "bn"] ?? cfg.label.en}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.paid_date ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
