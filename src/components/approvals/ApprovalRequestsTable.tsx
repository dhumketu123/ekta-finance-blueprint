import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, Loader2, Play, RefreshCw } from "lucide-react";
import { formatLocalDateTime } from "@/lib/date-utils";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useApprovalRequests,
  useDecideApprovalRequest,
  useProcessApprovedRequest,
  type ApprovalStatus,
} from "@/hooks/useApprovals";

const statusBadge: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "অপেক্ষমান", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  APPROVED: { label: "অনুমোদিত", className: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  REJECTED: { label: "প্রত্যাখ্যাত", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  EXECUTED: { label: "কার্যকর", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  EXECUTION_FAILED: { label: "ব্যর্থ", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  CANCELLED: { label: "বাতিল", className: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

interface Props {
  status?: ApprovalStatus;
}

const ApprovalRequestsTable = ({ status }: Props) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useApprovalRequests(status);
  const decideMut = useDecideApprovalRequest();
  const executeMut = useProcessApprovedRequest();

  // Realtime invalidation
  useEffect(() => {
    const ch = supabase
      .channel("approval-requests-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "approval_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["approval_requests"] });
        qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  if (isLoading) return <TableSkeleton rows={5} cols={6} />;
  if (!rows.length) {
    return (
      <p className="text-center text-muted-foreground py-12">
        {bn ? "কোনো অনুরোধ পাওয়া যায়নি" : "No requests found"}
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
            <TableHead>{bn ? "ধরন" : "Entity"}</TableHead>
            <TableHead>{bn ? "অ্যাকশন" : "Action"}</TableHead>
            <TableHead className="text-right">{bn ? "পরিমাণ (৳)" : "Amount (৳)"}</TableHead>
            <TableHead>{bn ? "স্থিতি" : "Status"}</TableHead>
            <TableHead className="text-right">{bn ? "কার্যক্রম" : "Actions"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const sc = statusBadge[r.status] ?? statusBadge.PENDING;
            const Icon = sc.icon;
            const canDecide = r.status === "PENDING";
            const canExecute = r.status === "APPROVED";
            const canRetry = r.status === "EXECUTION_FAILED";
            return (
              <TableRow key={r.id} className="animate-in fade-in-50 duration-300">
                <TableCell className="text-xs">{formatLocalDateTime(r.created_at, lang)}</TableCell>
                <TableCell className="text-xs font-medium">{r.entity_type}</TableCell>
                <TableCell className="text-xs">{r.action_type}</TableCell>
                <TableCell className="text-right text-xs font-semibold">
                  {r.amount != null ? `৳${Number(r.amount).toLocaleString()}` : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                    <Icon className="w-3 h-3 mr-1" />{sc.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {canDecide && (
                      <>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-success text-success-foreground hover:bg-success/90"
                          disabled={decideMut.isPending}
                          onClick={() => decideMut.mutate({ id: r.id, decision: "APPROVED" })}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {bn ? "অনুমোদন" : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          disabled={decideMut.isPending}
                          onClick={() => {
                            const reason = window.prompt(bn ? "প্রত্যাখ্যানের কারণ" : "Rejection reason");
                            if (reason && reason.trim()) {
                              decideMut.mutate({ id: r.id, decision: "REJECTED", reason: reason.trim() });
                            }
                          }}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          {bn ? "প্রত্যাখ্যান" : "Reject"}
                        </Button>
                      </>
                    )}
                    {canExecute && (
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        disabled={executeMut.isPending}
                        onClick={() => executeMut.mutate({ id: r.id })}
                      >
                        {executeMut.isPending && executeMut.variables?.id === r.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3 mr-1" />
                        )}
                        {bn ? "কার্যকর" : "Execute"}
                      </Button>
                    )}
                    {canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={executeMut.isPending}
                        onClick={() => executeMut.mutate({ id: r.id })}
                      >
                        {executeMut.isPending && executeMut.variables?.id === r.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3 mr-1" />
                        )}
                        {bn ? "পুনরায় চেষ্টা" : "Retry"}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default ApprovalRequestsTable;
