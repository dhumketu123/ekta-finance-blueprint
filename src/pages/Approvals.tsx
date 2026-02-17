import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { useApprovePendingTransaction, useRejectPendingTransaction } from "@/hooks/usePendingTransactions";
import { usePermissions } from "@/hooks/usePermissions";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TablePagination from "@/components/TablePagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import FieldOfficerCollectionForm from "@/components/forms/FieldOfficerCollectionForm";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const typeLabels: Record<string, string> = {
  loan_repayment: "ঋণ পরিশোধ",
  loan_principal: "মূলধন",
  loan_interest: "সুদ",
  loan_penalty: "জরিমানা",
  savings_deposit: "সঞ্চয় জমা",
  savings_withdrawal: "সঞ্চয় উত্তোলন",
};

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "অপেক্ষমান", icon: Clock, className: "bg-warning/10 text-warning border-warning/30" },
  approved: { label: "অনুমোদিত", icon: CheckCircle2, className: "bg-success/10 text-success border-success/30" },
  rejected: { label: "প্রত্যাখ্যাত", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/30" },
};

const PAGE_SIZE = 10;

const Approvals = () => {
  const [tab, setTab] = useState("pending");
  const { canApproveTransactions, canRecordPayments } = usePermissions();
  const { lang } = useLanguage();
  const approveMut = useApprovePendingTransaction();
  const rejectMut = useRejectPendingTransaction();
  const bn = lang === "bn";
  const qc = useQueryClient();

  // Realtime subscription for pending_transactions
  useEffect(() => {
    const channel = supabase
      .channel("approvals-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending_transactions" }, () => {
        qc.invalidateQueries({ queryKey: ["pending_transactions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const statusFilter = tab === "all" ? undefined : tab;

  const {
    data: txs,
    isLoading,
    page,
    setPage,
    totalPages,
    totalCount,
  } = usePaginatedQuery({
    table: "pending_transactions",
    queryKey: ["pending_transactions", tab],
    pageSize: PAGE_SIZE,
    select: "*, clients(name_en, name_bn)",
    filters: statusFilter ? { status: statusFilter } : {},
    orderBy: { column: "created_at", ascending: false },
    softDelete: false,
  });

  const [reviewTx, setReviewTx] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [collectionOpen, setCollectionOpen] = useState(false);

  const handleTabChange = (v: string) => {
    setTab(v);
    setPage(1);
  };

  const handleReview = () => {
    if (!reviewTx) return;
    if (reviewAction === "approve") {
      approveMut.mutate({ txId: reviewTx.id, reason: reason || undefined }, { onSuccess: () => { setReviewTx(null); setReason(""); } });
    } else {
      if (!reason.trim()) return;
      rejectMut.mutate({ txId: reviewTx.id, reason }, { onSuccess: () => { setReviewTx(null); setReason(""); } });
    }
  };

  const isProcessing = approveMut.isPending || rejectMut.isPending;

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-2">
        <PageHeader title={bn ? "অনুমোদন সারি" : "Approval Queue"} description={bn ? "Field Officer দের জমা দেওয়া লেনদেন অনুমোদন/প্রত্যাখ্যান করুন" : "Approve/reject transactions submitted by field officers"} />
        {canRecordPayments && (
          <Button size="sm" onClick={() => setCollectionOpen(true)} className="text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            {bn ? "সংগ্রহ জমা দিন" : "Submit Collection"}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="pending">{bn ? "অপেক্ষমান" : "Pending"}</TabsTrigger>
          <TabsTrigger value="approved">{bn ? "অনুমোদিত" : "Approved"}</TabsTrigger>
          <TabsTrigger value="rejected">{bn ? "প্রত্যাখ্যাত" : "Rejected"}</TabsTrigger>
          <TabsTrigger value="all">{bn ? "সব" : "All"}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : !txs.length ? (
            <p className="text-center text-muted-foreground py-12">{bn ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found"}</p>
          ) : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
                    <TableHead>{bn ? "ধরন" : "Type"}</TableHead>
                    <TableHead>{bn ? "ক্লায়েন্ট" : "Client"}</TableHead>
                    <TableHead>{bn ? "রেফারেন্স" : "Reference"}</TableHead>
                    <TableHead className="text-right">{bn ? "পরিমাণ (৳)" : "Amount (৳)"}</TableHead>
                    <TableHead>{bn ? "স্থিতি" : "Status"}</TableHead>
                    {canApproveTransactions && tab === "pending" && <TableHead>{bn ? "কার্যক্রম" : "Actions"}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((tx: any) => {
                    const sc = statusConfig[tx.status] || statusConfig.pending;
                    const Icon = sc.icon;
                    return (
                      <TableRow key={tx.id} className="animate-in fade-in-50 duration-300">
                        <TableCell className="text-xs">{format(new Date(tx.created_at), "dd/MM/yy HH:mm")}</TableCell>
                        <TableCell className="text-xs font-medium">{typeLabels[tx.type] || tx.type}</TableCell>
                        <TableCell className="text-xs">{tx.clients?.name_bn || tx.clients?.name_en || "—"}</TableCell>
                        <TableCell className="text-xs font-mono">{tx.reference_id}</TableCell>
                        <TableCell className="text-right font-semibold text-xs">৳{tx.amount?.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                            <Icon className="w-3 h-3 mr-1" />{sc.label}
                          </Badge>
                        </TableCell>
                        {canApproveTransactions && tab === "pending" && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-success border-success/30 hover:bg-success/10"
                                onClick={() => { setReviewTx(tx); setReviewAction("approve"); setReason(""); }}>
                                <CheckCircle2 className="w-3 h-3 mr-1" />{bn ? "অনুমোদন" : "Approve"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => { setReviewTx(tx); setReviewAction("reject"); setReason(""); }}>
                                <XCircle className="w-3 h-3 mr-1" />{bn ? "প্রত্যাখ্যান" : "Reject"}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={!!reviewTx} onOpenChange={(o) => !o && setReviewTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? (bn ? "লেনদেন অনুমোদন" : "Approve Transaction") : (bn ? "লেনদেন প্রত্যাখ্যান" : "Reject Transaction")}</DialogTitle>
            <DialogDescription>
              {reviewTx && `৳${reviewTx.amount?.toLocaleString()} — ${typeLabels[reviewTx.type] || reviewTx.type} — Ref: ${reviewTx.reference_id}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={reviewAction === "reject" ? (bn ? "প্রত্যাখ্যানের কারণ (আবশ্যক)" : "Rejection reason (required)") : (bn ? "মন্তব্য (ঐচ্ছিক)" : "Comment (optional)")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTx(null)}>{bn ? "বাতিল" : "Cancel"}</Button>
            <Button
              onClick={handleReview}
              disabled={isProcessing || (reviewAction === "reject" && !reason.trim())}
              className={reviewAction === "approve" ? "bg-success hover:bg-success/90" : "bg-destructive hover:bg-destructive/90"}
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {reviewAction === "approve" ? (bn ? "অনুমোদন করুন" : "Approve") : (bn ? "প্রত্যাখ্যান করুন" : "Reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field Officer Collection Form */}
      <FieldOfficerCollectionForm open={collectionOpen} onClose={() => setCollectionOpen(false)} />
    </AppLayout>
  );
};

export default Approvals;
