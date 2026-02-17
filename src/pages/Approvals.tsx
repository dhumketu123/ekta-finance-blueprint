import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { usePendingTransactions, useApprovePendingTransaction, useRejectPendingTransaction } from "@/hooks/usePendingTransactions";
import { usePermissions } from "@/hooks/usePermissions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import TablePagination from "@/components/TablePagination";
import { CheckCircle2, XCircle, Clock, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import FieldOfficerCollectionForm from "@/components/forms/FieldOfficerCollectionForm";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { data: allTxs, isLoading } = usePendingTransactions(tab === "all" ? undefined : tab);
  const { canApproveTransactions, canRecordPayments } = usePermissions();
  const { lang } = useLanguage();
  const approveMut = useApprovePendingTransaction();
  const rejectMut = useRejectPendingTransaction();

  const [reviewTx, setReviewTx] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [page, setPage] = useState(1);
  const bn = lang === "bn";

  // Client-side pagination for pending_transactions (already fetched)
  const txs = allTxs ?? [];
  const totalCount = txs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedTxs = txs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page on tab change
  const handleTabChange = (v: string) => { setTab(v); setPage(1); };

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
          <TabsTrigger value="pending">অপেক্ষমান</TabsTrigger>
          <TabsTrigger value="approved">অনুমোদিত</TabsTrigger>
          <TabsTrigger value="rejected">প্রত্যাখ্যাত</TabsTrigger>
          <TabsTrigger value="all">সব</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !txs.length ? (
            <p className="text-center text-muted-foreground py-12">কোনো লেনদেন পাওয়া যায়নি</p>
          ) : (
            <div className="rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>তারিখ</TableHead>
                    <TableHead>ধরন</TableHead>
                    <TableHead>ক্লায়েন্ট</TableHead>
                    <TableHead>রেফারেন্স</TableHead>
                    <TableHead className="text-right">পরিমাণ (৳)</TableHead>
                    <TableHead>স্থিতি</TableHead>
                    {canApproveTransactions && tab === "pending" && <TableHead>কার্যক্রম</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTxs.map((tx: any) => {
                    const sc = statusConfig[tx.status] || statusConfig.pending;
                    const Icon = sc.icon;
                    return (
                      <TableRow key={tx.id}>
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
                                <CheckCircle2 className="w-3 h-3 mr-1" />অনুমোদন
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => { setReviewTx(tx); setReviewAction("reject"); setReason(""); }}>
                                <XCircle className="w-3 h-3 mr-1" />প্রত্যাখ্যান
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
            <DialogTitle>{reviewAction === "approve" ? "লেনদেন অনুমোদন" : "লেনদেন প্রত্যাখ্যান"}</DialogTitle>
            <DialogDescription>
              {reviewTx && `৳${reviewTx.amount?.toLocaleString()} — ${typeLabels[reviewTx.type] || reviewTx.type} — Ref: ${reviewTx.reference_id}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={reviewAction === "reject" ? "প্রত্যাখ্যানের কারণ (আবশ্যক)" : "মন্তব্য (ঐচ্ছিক)"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTx(null)}>বাতিল</Button>
            <Button
              onClick={handleReview}
              disabled={isProcessing || (reviewAction === "reject" && !reason.trim())}
              className={reviewAction === "approve" ? "bg-success hover:bg-success/90" : "bg-destructive hover:bg-destructive/90"}
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {reviewAction === "approve" ? "অনুমোদন করুন" : "প্রত্যাখ্যান করুন"}
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
