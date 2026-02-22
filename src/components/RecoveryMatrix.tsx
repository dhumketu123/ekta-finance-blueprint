import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OverdueClient {
  loan_id: string;
  client_id: string;
  client_name: string;
  loan_ref: string;
  outstanding: number;
  overdue_days: number;
  overdue_amount: number;
  risk_level: "green" | "yellow" | "red";
}

export default function RecoveryMatrix() {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const bn = lang === "bn";

  const { data: overdueData, isLoading } = useQuery({
    queryKey: ["recovery_matrix"],
    queryFn: async () => {
      const { data: schedules, error } = await supabase
        .from("loan_schedules")
        .select(`
          loan_id, due_date, principal_due, interest_due, penalty_due,
          principal_paid, interest_paid, status,
          loans!inner(id, loan_id, outstanding_principal, outstanding_interest, penalty_amount, client_id,
            clients!inner(name_en, name_bn))
        `)
        .in("status", ["overdue", "partial"])
        .order("due_date", { ascending: true });

      if (error) throw error;

      // Group by loan — FIXED: include penalty_paid in overdue calculation
      const loanMap = new Map<string, OverdueClient>();
      (schedules ?? []).forEach((s: any) => {
        const loan = s.loans;
        const client = loan?.clients;
        if (!loan || !client) return;

        const overdueDays = Math.max(0, Math.floor((Date.now() - new Date(s.due_date).getTime()) / 86400000));
        // Corrected formula: (principal_due + interest_due + penalty_due) - (principal_paid + interest_paid + penalty_paid)
        const penaltyPaid = s.penalty_paid ?? 0;
        const overdueAmt = (s.principal_due + s.interest_due + s.penalty_due) - (s.principal_paid + s.interest_paid + penaltyPaid);

        const existing = loanMap.get(loan.id);
        if (existing) {
          existing.overdue_days = Math.max(existing.overdue_days, overdueDays);
          existing.overdue_amount += Math.max(0, overdueAmt);
        } else {
          loanMap.set(loan.id, {
            loan_id: loan.id,
            client_id: loan.client_id,
            client_name: bn ? client.name_bn || client.name_en : client.name_en,
            loan_ref: loan.loan_id || loan.id.slice(0, 8),
            outstanding: loan.outstanding_principal + loan.outstanding_interest + loan.penalty_amount,
            overdue_days: overdueDays,
            overdue_amount: Math.max(0, overdueAmt),
            risk_level: overdueDays > 7 ? "red" : overdueDays > 3 ? "yellow" : "green",
          });
        }
      });

      return Array.from(loanMap.values()).sort((a, b) => b.overdue_days - a.overdue_days);
    },
  });

  const riskConfig = {
    green: { bg: "bg-success/10 border-success/30", text: "text-success", icon: CheckCircle2, label: bn ? "নিয়মিত" : "Regular" },
    yellow: { bg: "bg-warning/10 border-warning/30", text: "text-warning", icon: Clock, label: bn ? "৩-৭ দিন বিলম্ব" : "3-7 Days Late" },
    red: { bg: "bg-destructive/10 border-destructive/30", text: "text-destructive", icon: XCircle, label: bn ? "ডিফল্টার" : "Defaulter" },
  };

  if (isLoading) {
    return (
      <div className="card-elevated p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
        </div>
      </div>
    );
  }

  const redCount = (overdueData ?? []).filter((d) => d.risk_level === "red").length;
  const yellowCount = (overdueData ?? []).filter((d) => d.risk_level === "yellow").length;
  const totalOverdue = (overdueData ?? []).reduce((s, d) => s + d.overdue_amount, 0);

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <h3 className="text-sm font-bold">{bn ? "রিকভারি ম্যাট্রিক্স" : "Recovery Matrix"}</h3>
        </div>
        <div className="flex gap-2 ml-auto">
          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
            {redCount} {bn ? "ডিফল্টার" : "Defaulters"}
          </Badge>
          <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
            {yellowCount} {bn ? "বিলম্ব" : "Late"}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-mono">
            ৳{totalOverdue.toLocaleString()}
          </Badge>
        </div>
      </div>

      {!overdueData?.length ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          {bn ? "কোনো বকেয়া নেই 🎉" : "No overdue payments 🎉"}
        </div>
      ) : (
        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {overdueData.map((item) => {
            const config = riskConfig[item.risk_level];
            const Icon = config.icon;
            return (
              <div
                key={item.loan_id}
                className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-accent/30 transition-colors ${config.bg} border-l-4`}
                onClick={() => navigate(`/loans/${item.loan_id}`)}
              >
                <Icon className={`w-4 h-4 ${config.text} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{item.client_name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{item.loan_ref}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold">৳{item.overdue_amount.toLocaleString()}</p>
                  <p className={`text-[10px] font-medium ${config.text}`}>
                    {item.overdue_days} {bn ? "দিন" : "days"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
