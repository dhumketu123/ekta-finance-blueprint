import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, Clock, Loader2, Play, RefreshCw, AlertTriangle, Info } from "lucide-react";
import { formatLocalDateTime } from "@/lib/date-utils";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useApprovalRequests,
  useDecideApprovalRequest,
  useProcessApprovedRequest,
  useRetryFailedExecution,
  type ApprovalStatus,
  type ApprovalRequest,
} from "@/hooks/useApprovals";

const statusBadge: Record<string, { label: string; className: string; icon: any }> = {
  PENDING: { label: "অপেক্ষমান", className: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  APPROVED: { label: "অনুমোদিত", className: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  REJECTED: { label: "প্রত্যাখ্যাত", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  EXECUTED: { label: "কার্যকর", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  EXECUTION_FAILED: { label: "ব্যর্থ", className: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle },
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
  const retryMut = useRetryFailedExecution();

  // Execute confirmation modal
  const [confirmExec, setConfirmExec] = useState<ApprovalRequest | null>(null);
  // Per-row execution lock (prevents double-click during in-flight)
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());

  // Realtime invalidation — only INSERT/UPDATE
  useEffect(() => {
    const ch = supabase
      .channel("approval-requests-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approval_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["approval_requests"] });
        qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approval_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["approval_requests"] });
        qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const lockRow = (id: string) => setLockedIds((s) => new Set(s).add(id));
  const unlockRow = (id: string) =>
    setLockedIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });

  const handleExecuteConfirm = () => {
    if (!confirmExec) return;
    const id = confirmExec.id;
    lockRow(id);
    executeMut.mutate(
      { id },
      {
        onSettled: () => { unlockRow(id); setConfirmExec(null); },
      },
    );
  };

  const handleRetry = (r: ApprovalRequest) => {
    lockRow(r.id);
    retryMut.mutate({ id: r.id }, { onSettled: () => unlockRow(r.id) });
  };

  if (isLoading) return <TableSkeleton rows={5} cols={6} />;
  if (!rows.length) {
    return (
      <p className="text-center text-muted-foreground py-12">
        {bn ? "কোনো অনুরোধ পাওয়া যায়নি" : "No requests found"}
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
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
              const rowLocked = lockedIds.has(r.id);
              const execError = (r as any).execution_error as string | null | undefined;

              return (
                <TableRow key={r.id} className="animate-in fade-in-50 duration-300">
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span>{formatLocalDateTime(r.created_at, lang)}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3 h-3 text-muted-foreground hover:text-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="space-y-1 text-[11px]">
                            <div><span className="text-muted-foreground">তৈরি:</span> {formatLocalDateTime(r.created_at, lang)}</div>
                            {r.approved_at && (
                              <div><span className="text-muted-foreground">অনুমোদন:</span> {formatLocalDateTime(r.approved_at, lang)}</div>
                            )}
                            {r.executed_at && (
                              <div><span className="text-muted-foreground">কার্যকর:</span> {formatLocalDateTime(r.executed_at, lang)}</div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{r.entity_type}</TableCell>
                  <TableCell className="text-xs">{r.action_type}</TableCell>
                  <TableCell className="text-right text-xs font-semibold">
                    {r.amount != null ? `৳${Number(r.amount).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                        <Icon className="w-3 h-3 mr-1" />{sc.label}
                      </Badge>
                      {canRetry && execError && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-sm">
                            <p className="text-[11px] font-mono break-words">{execError}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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
                          disabled={rowLocked || executeMut.isPending}
                          onClick={() => setConfirmExec(r)}
                        >
                          {rowLocked ? (
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
                          disabled={rowLocked || retryMut.isPending}
                          onClick={() => handleRetry(r)}
                        >
                          {rowLocked ? (
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

      {/* Execute confirmation modal */}
      <Dialog open={!!confirmExec} onOpenChange={(o) => !o && setConfirmExec(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bn ? "কার্যকর নিশ্চিত করুন" : "Confirm Execution"}</DialogTitle>
            <DialogDescription>
              {bn
                ? "এই অনুমোদিত অনুরোধটি এখনই কার্যকর করা হবে। এই পদক্ষেপটি অপরিবর্তনীয়।"
                : "This approved request will be executed now. This action is irreversible."}
            </DialogDescription>
          </DialogHeader>
          {confirmExec && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div><span className="text-muted-foreground">{bn ? "ধরন:" : "Entity:"}</span> <span className="font-medium">{confirmExec.entity_type}</span></div>
              <div><span className="text-muted-foreground">{bn ? "অ্যাকশন:" : "Action:"}</span> <span className="font-medium">{confirmExec.action_type}</span></div>
              {confirmExec.amount != null && (
                <div><span className="text-muted-foreground">{bn ? "পরিমাণ:" : "Amount:"}</span> <span className="font-semibold">৳{Number(confirmExec.amount).toLocaleString()}</span></div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmExec(null)} disabled={executeMut.isPending}>
              {bn ? "বাতিল" : "Cancel"}
            </Button>
            <Button onClick={handleExecuteConfirm} disabled={executeMut.isPending}>
              {executeMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              <Play className="w-3.5 h-3.5 mr-1.5" />
              {bn ? "কার্যকর করুন" : "Execute Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default ApprovalRequestsTable;
