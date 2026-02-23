import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Plus, CheckCircle2, XCircle, Clock, Receipt, MessageSquare,
  AlertTriangle, FileText, Share2, Copy, Calculator, ArrowDownCircle,
  Filter,
} from "lucide-react";
import SmartTransactionForm from "@/components/forms/SmartTransactionForm";
import EarlySettlementCalculator from "@/components/EarlySettlementCalculator";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useFinancialTransactions,
  useSubmitFinancialTransaction,
  useApproveFinancialTransaction,
  useRejectFinancialTransaction,
  TX_TYPE_LABELS,
  MANUAL_TYPES,
  type FinTransactionType,
  type ApprovalStatus,
  type FinancialTransaction,
} from "@/hooks/useFinancialTransactions";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const STATUS_ICON: Record<ApprovalStatus, any> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
};

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  pending: "bg-warning/10 text-warning border-warning/30",
  approved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const FinancialTransactionsPage = () => {
  const { lang } = useLanguage();
  const { canApproveTransactions } = usePermissions();
  const canApprove = canApproveTransactions;

  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [receiptView, setReceiptView] = useState<FinancialTransaction | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const statusFilter = tab === "all" ? undefined : tab as ApprovalStatus;
  const { data: transactions, isLoading } = useFinancialTransactions(statusFilter);
  const approveMut = useApproveFinancialTransaction();
  const rejectMut = useRejectFinancialTransaction();

  const filtered = (transactions ?? []).filter((tx) => {
    // Type filter
    if (typeFilter !== "all" && tx.transaction_type !== typeFilter) return false;
    // Search
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      tx.receipt_number?.toLowerCase().includes(q) ||
      tx.clients?.name_bn?.toLowerCase().includes(q) ||
      tx.clients?.name_en?.toLowerCase().includes(q) ||
      tx.clients?.member_id?.toLowerCase().includes(q) ||
      TX_TYPE_LABELS[tx.transaction_type]?.en?.toLowerCase().includes(q) ||
      TX_TYPE_LABELS[tx.transaction_type]?.bn?.toLowerCase().includes(q)
    );
  });

  const handleApprove = (txId: string, manual: boolean) => {
    if (manual) {
      const reason = prompt(lang === "bn" ? "অনুমোদনের কারণ লিখুন:" : "Enter approval reason:");
      if (!reason) return;
      approveMut.mutate({ txId, reason });
    } else {
      approveMut.mutate({ txId });
    }
  };

  const handleReject = () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    rejectMut.mutate({ txId: rejectTarget, reason: rejectReason });
    setRejectTarget(null);
    setRejectReason("");
  };

  const pendingCount = (transactions ?? []).filter((t) => t.approval_status === "pending").length;

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "আর্থিক লেনদেন" : "Financial Transactions"}
        description={lang === "bn" ? "সকল আর্থিক লেনদেন, রিসিপ্ট ও এসএমএস লগ পরিচালনা" : "Manage all financial transactions, receipts & SMS logs"}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => setSmartOpen(true)}>
              <ArrowDownCircle className="w-3.5 h-3.5" /> {lang === "bn" ? "স্মার্ট লেনদেন" : "Smart Entry"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setSettlementOpen(true)}>
              <Calculator className="w-3.5 h-3.5" /> {lang === "bn" ? "তাড়াতাড়ি পরিশোধ" : "Early Settlement"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> {lang === "bn" ? "ক্লাসিক এন্ট্রি" : "Classic Entry"}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="all" className="text-xs">{lang === "bn" ? "সকল" : "All"}</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs gap-1">
              {lang === "bn" ? "অপেক্ষমান" : "Pending"}
              {pendingCount > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">{lang === "bn" ? "অনুমোদিত" : "Approved"}</TabsTrigger>
            <TabsTrigger value="rejected" className="text-xs">{lang === "bn" ? "প্রত্যাখ্যাত" : "Rejected"}</TabsTrigger>
          </TabsList>

          {/* Premium Categorized Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[220px] text-xs h-9 gap-1.5 border-primary/20 bg-card">
              <Filter className="w-3.5 h-3.5 text-primary shrink-0" />
              <SelectValue placeholder={lang === "bn" ? "ধরন ফিল্টার" : "Filter Type"} />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="all" className="text-xs font-semibold">
                {lang === "bn" ? "📋 সব লেনদেন" : "📋 All Transactions"}
              </SelectItem>
              <SelectSeparator />

              {/* Cash In Group */}
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-emerald-500 font-bold flex items-center gap-1.5 pl-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  {lang === "bn" ? "ক্যাশ ইন (আদায়)" : "Cash In (Receipts)"}
                </SelectLabel>
                <SelectItem value="loan_repayment" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {lang === "bn" ? "কিস্তি আদায়" : "Installment Collection"}</span>
                </SelectItem>
                <SelectItem value="savings_deposit" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {lang === "bn" ? "সঞ্চয় জমা" : "Savings Deposit"}</span>
                </SelectItem>
                <SelectItem value="admission_fee" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {lang === "bn" ? "জরিমানা ও ফি আদায়" : "Penalty & Processing Fee"}</span>
                </SelectItem>
                <SelectItem value="share_capital_deposit" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {lang === "bn" ? "শেয়ার ও ঝুঁকি তহবিল" : "Share & Risk Fund"}</span>
                </SelectItem>
                <SelectItem value="insurance_premium" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {lang === "bn" ? "বীমা প্রিমিয়াম" : "Insurance Premium"}</span>
                </SelectItem>
              </SelectGroup>

              <SelectSeparator />

              {/* Cash Out Group */}
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-red-500 font-bold flex items-center gap-1.5 pl-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {lang === "bn" ? "ক্যাশ আউট (প্রদান)" : "Cash Out (Payments)"}
                </SelectLabel>
                <SelectItem value="loan_disbursement" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {lang === "bn" ? "ঋণ বিতরণ" : "Loan Disbursement"}</span>
                </SelectItem>
                <SelectItem value="savings_withdrawal" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {lang === "bn" ? "সঞ্চয় উত্তোলন" : "Savings Withdrawal"}</span>
                </SelectItem>
                <SelectItem value="insurance_claim_payout" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {lang === "bn" ? "মুনাফা/লভ্যাংশ প্রদান" : "Profit/Dividend Payout"}</span>
                </SelectItem>
              </SelectGroup>

              <SelectSeparator />

              {/* Internal & Adjustment Group */}
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-wider text-blue-500 font-bold flex items-center gap-1.5 pl-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  {lang === "bn" ? "ইন্টারনাল ও সমন্বয়" : "Internal & Adjustment"}
                </SelectLabel>
                <SelectItem value="adjustment_entry" className="text-xs pl-6">
                  <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {lang === "bn" ? "অ্যাকাউন্ট সমন্বয়" : "Account Adjustment"}</span>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={lang === "bn" ? "রিসিপ্ট/নাম/ধরন দিয়ে খুঁজুন..." : "Search receipt/name/type..."}
              className="pl-9 text-xs h-9" />
          </div>
        </div>

        <TabsContent value={tab} className="mt-0">
          {isLoading ? <TableSkeleton rows={5} cols={7} /> : filtered.length === 0 ? (
            <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
              {lang === "bn" ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found"}
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="card-elevated overflow-hidden hidden md:block">
                <Table className="table-premium">
                  <TableHeader className="table-header-premium">
                    <TableRow>
                      <TableHead className="text-xs">{lang === "bn" ? "রিসিপ্ট" : "Receipt"}</TableHead>
                      <TableHead className="text-xs">{lang === "bn" ? "সদস্য" : "Member"}</TableHead>
                      <TableHead className="text-xs">{lang === "bn" ? "ধরন" : "Type"}</TableHead>
                      <TableHead className="text-xs">{lang === "bn" ? "পরিমাণ" : "Amount"}</TableHead>
                      <TableHead className="text-xs">{lang === "bn" ? "অবস্থা" : "Status"}</TableHead>
                      <TableHead className="text-xs">{lang === "bn" ? "তারিখ" : "Date"}</TableHead>
                      <TableHead className="text-xs w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((tx) => {
                      const Icon = STATUS_ICON[tx.approval_status];
                      const typeLabel = TX_TYPE_LABELS[tx.transaction_type];
                      return (
                        <TableRow key={tx.id} className="hover:bg-accent/30">
                          <TableCell className="font-mono text-xs">
                            {tx.receipt_number || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <p className="text-xs font-medium">{tx.clients ? (lang === "bn" ? tx.clients.name_bn : tx.clients.name_en) : "—"}</p>
                            <p className="text-[10px] text-muted-foreground">{tx.clients?.member_id}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {tx.manual_flag && <AlertTriangle className="w-3 h-3 text-warning" />}
                              <span className="text-xs">{lang === "bn" ? typeLabel?.bn : typeLabel?.en}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-bold">৳{Number(tx.amount).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] gap-1 ${STATUS_COLOR[tx.approval_status]}`}>
                              <Icon className="w-3 h-3" />
                              {tx.approval_status === "pending" ? (lang === "bn" ? "অপেক্ষমান" : "Pending") :
                               tx.approval_status === "approved" ? (lang === "bn" ? "অনুমোদিত" : "Approved") :
                               (lang === "bn" ? "প্রত্যাখ্যাত" : "Rejected")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString("bn-BD")}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {tx.approval_status === "pending" && canApprove && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-success hover:bg-success/10"
                                    onClick={() => handleApprove(tx.id, tx.manual_flag)}
                                    disabled={approveMut.isPending}>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                                    onClick={() => setRejectTarget(tx.id)}>
                                    <XCircle className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                              {tx.receipt_snapshot && (
                                <>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                                    onClick={() => setReceiptView(tx)}>
                                    <Receipt className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-[#25D366] hover:bg-[#25D366]/10"
                                    onClick={() => shareViaWhatsApp(tx)} title="WhatsApp-এ শেয়ার">
                                    <Share2 className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {filtered.map((tx) => {
                  const Icon = STATUS_ICON[tx.approval_status];
                  const typeLabel = TX_TYPE_LABELS[tx.transaction_type];
                  return (
                    <div key={tx.id} className="card-elevated p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {tx.manual_flag && <AlertTriangle className="w-3 h-3 text-warning" />}
                          <span className="text-xs font-medium">{lang === "bn" ? typeLabel?.bn : typeLabel?.en}</span>
                        </div>
                        <Badge variant="outline" className={`text-[10px] gap-1 ${STATUS_COLOR[tx.approval_status]}`}>
                          <Icon className="w-3 h-3" />
                          {tx.approval_status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold">৳{Number(tx.amount).toLocaleString()}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{tx.receipt_number || "—"}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tx.clients ? (lang === "bn" ? tx.clients.name_bn : tx.clients.name_en) : "—"}
                        {tx.clients?.member_id && ` (${tx.clients.member_id})`}
                      </p>
                      <div className="flex gap-1.5 pt-1">
                        {tx.approval_status === "pending" && canApprove && (
                          <>
                            <Button size="sm" className="h-7 text-xs flex-1 bg-success hover:bg-success/90"
                              onClick={() => handleApprove(tx.id, tx.manual_flag)} disabled={approveMut.isPending}>
                              {lang === "bn" ? "অনুমোদন" : "Approve"}
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs flex-1"
                              onClick={() => setRejectTarget(tx.id)}>
                              {lang === "bn" ? "প্রত্যাখ্যান" : "Reject"}
                            </Button>
                          </>
                        )}
                        {tx.receipt_snapshot && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setReceiptView(tx)}>
                              <Receipt className="w-3 h-3" /> {lang === "bn" ? "রিসিপ্ট" : "Receipt"}
                            </Button>
                            <Button size="sm" className="h-7 text-xs gap-1 bg-[#25D366] hover:bg-[#1fb855] text-white"
                              onClick={() => shareViaWhatsApp(tx)}>
                              <Share2 className="w-3 h-3" /> WhatsApp
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Receipt Dialog */}
      {receiptView && (
        <Dialog open={!!receiptView} onOpenChange={() => setReceiptView(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Receipt className="w-4 h-4 text-primary" />
                {lang === "bn" ? "লেনদেন রিসিপ্ট" : "Transaction Receipt"}
              </DialogTitle>
            </DialogHeader>
            <ReceiptCard tx={receiptView} lang={lang} />
          </DialogContent>
        </Dialog>
      )}

      {/* Reject Dialog */}
      {rejectTarget && (
        <Dialog open={!!rejectTarget} onOpenChange={() => { setRejectTarget(null); setRejectReason(""); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">{lang === "bn" ? "প্রত্যাখ্যানের কারণ" : "Rejection Reason"}</DialogTitle>
            </DialogHeader>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder={lang === "bn" ? "কারণ লিখুন..." : "Enter reason..."} rows={3} className="text-sm" />
            <Button onClick={handleReject} disabled={!rejectReason.trim() || rejectMut.isPending}
              variant="destructive" className="w-full text-xs">
              {lang === "bn" ? "প্রত্যাখ্যান করুন" : "Confirm Rejection"}
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Transaction Dialog */}
      {createOpen && <CreateTransactionDialog open={createOpen} onClose={() => setCreateOpen(false)} lang={lang} />}
      
      {/* Smart Transaction Form */}
      <SmartTransactionForm open={smartOpen} onClose={() => setSmartOpen(false)} />
      
      {/* Early Settlement Calculator */}
      <EarlySettlementCalculator open={settlementOpen} onClose={() => setSettlementOpen(false)} />
    </AppLayout>
  );
};

// ── WhatsApp Share Helper ─────────────────────────────────────
const buildReceiptMessage = (tx: FinancialTransaction): string => {
  const snap = tx.receipt_snapshot as any;
  if (!snap) return "";
  const typeLabel = TX_TYPE_LABELS[snap.transaction_type as FinTransactionType];

  let msg = `📋 লেনদেন রিসিপ্ট\n━━━━━━━━━━━━━━━━\n একতা ফাইন্যান্স\n সমবায় ক্ষুদ্রঋণ ব্যবস্থাপনা\n\n`;
  msg += `🔖 রিসিপ্ট নং: ${snap.receipt_number}\n`;
  msg += `👤 সদস্য: ${snap.member_name || "—"}\n`;
  msg += `📂 ধরন: ${typeLabel?.bn || snap.transaction_type}\n`;
  msg += `💰 পরিমাণ: ৳${Number(snap.amount).toLocaleString()}\n`;

  if (snap.allocation && Object.keys(snap.allocation).length > 0) {
    msg += `\n📊 বরাদ্দ বিবরণ:\n`;
    Object.entries(snap.allocation).forEach(([key, val]) => {
      const label = key.replace(/_/g, " ");
      msg += `  • ${label}: ${typeof val === "number" ? `৳${Number(val).toLocaleString()}` : String(val)}\n`;
    });
  }

  if (snap.running_balance && Object.keys(snap.running_balance).length > 0) {
    msg += `\n💼 হালনাগাদ ব্যালেন্স:\n`;
    Object.entries(snap.running_balance).forEach(([key, val]) => {
      const label = key.replace(/_/g, " ");
      msg += `  • ${label}: ${typeof val === "number" ? `৳${Number(val).toLocaleString()}` : String(val)}\n`;
    });
  }

  msg += `\n📅 তারিখ/সময়: ${new Date(snap.approved_at).toLocaleString("bn-BD")}\n`;
  msg += `━━━━━━━━━━━━━━━━\n✅ একতা ফাইন্যান্স — ধন্যবাদ`;
  return msg;
};

const shareViaWhatsApp = (tx: FinancialTransaction) => {
  const phone = tx.clients?.phone?.replace(/[^0-9]/g, "") || "";
  const message = buildReceiptMessage(tx);
  const url = phone
    ? `https://wa.me/${phone.startsWith("88") ? phone : "88" + phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
};

const copyReceiptToClipboard = async (tx: FinancialTransaction) => {
  const message = buildReceiptMessage(tx);
  try {
    await navigator.clipboard.writeText(message);
    toast.success("রিসিপ্ট কপি করা হয়েছে");
  } catch {
    toast.error("কপি করা যায়নি");
  }
};

// ── Receipt Card ──────────────────────────────────────────────
const ReceiptCard = ({ tx, lang }: { tx: FinancialTransaction; lang: string }) => {
  const snap = tx.receipt_snapshot as any;
  if (!snap) return null;
  const hasPhone = !!tx.clients?.phone;

  return (
    <div className="space-y-3 text-xs">
      <div className="text-center border-b border-dashed pb-3">
        <p className="font-bold text-base">{lang === "bn" ? "একতা ফাইন্যান্স" : "Ekta Finance"}</p>
        <p className="text-muted-foreground">{lang === "bn" ? "সমবায় ক্ষুদ্রঋণ ব্যবস্থাপনা" : "Cooperative Microfinance"}</p>
      </div>

      <div className="flex justify-between p-2 rounded bg-primary/5 border border-primary/20">
        <span className="font-medium">{lang === "bn" ? "রিসিপ্ট নং" : "Receipt No."}</span>
        <span className="font-bold font-mono">{snap.receipt_number}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between"><span className="text-muted-foreground">{lang === "bn" ? "সদস্য" : "Member"}</span><span className="font-medium">{snap.member_name}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">{lang === "bn" ? "ধরন" : "Type"}</span><span className="font-medium">{TX_TYPE_LABELS[snap.transaction_type as FinTransactionType]?.[lang === "bn" ? "bn" : "en"]}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">{lang === "bn" ? "পরিমাণ" : "Amount"}</span><span className="font-bold text-sm">৳{Number(snap.amount).toLocaleString()}</span></div>
      </div>

      {snap.allocation && Object.keys(snap.allocation).length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontSize: "10px" }}>
            {lang === "bn" ? "বরাদ্দ বিবরণ" : "Allocation Breakdown"}
          </p>
          {Object.entries(snap.allocation).map(([key, val]) => (
            <div key={key} className="flex justify-between px-2 py-1 rounded bg-muted/50">
              <span className="capitalize">{key.replace(/_/g, " ")}</span>
              <span className="font-medium">{typeof val === "number" ? `৳${Number(val).toLocaleString()}` : String(val)}</span>
            </div>
          ))}
        </div>
      )}

      {snap.running_balance && Object.keys(snap.running_balance).length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontSize: "10px" }}>
            {lang === "bn" ? "হালনাগাদ ব্যালেন্স" : "Updated Balance"}
          </p>
          {Object.entries(snap.running_balance).map(([key, val]) => (
            <div key={key} className="flex justify-between px-2 py-1 rounded bg-accent/30">
              <span className="capitalize">{key.replace(/_/g, " ")}</span>
              <span className="font-bold">{typeof val === "number" ? `৳${Number(val).toLocaleString()}` : String(val)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-dashed pt-2 text-center text-muted-foreground">
        <p>{new Date(snap.approved_at).toLocaleString("bn-BD")}</p>
        <p className="mt-1">{lang === "bn" ? "ধন্যবাদ" : "Thank you"}</p>
      </div>

      {/* WhatsApp Share & Copy Buttons */}
      <div className="border-t pt-3 flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-8 text-xs gap-1.5 bg-[#25D366] hover:bg-[#1fb855] text-white"
          onClick={() => shareViaWhatsApp(tx)}
        >
          <Share2 className="w-3.5 h-3.5" />
          {lang === "bn" ? "WhatsApp-এ শেয়ার" : "Share via WhatsApp"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={() => copyReceiptToClipboard(tx)}
        >
          <Copy className="w-3.5 h-3.5" />
          {lang === "bn" ? "কপি" : "Copy"}
        </Button>
      </div>
    </div>
  );
};

// ── Create Transaction Dialog ─────────────────────────────────
const CreateTransactionDialog = ({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: string }) => {
  const submitMut = useSubmitFinancialTransaction();
  const [form, setForm] = useState({
    transaction_type: "" as FinTransactionType | "",
    amount: "",
    member_id: "",
    account_id: "",
    notes: "",
  });

  // Load clients for member selection
  const { data: clients } = useQuery({
    queryKey: ["clients_for_tx"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name_en, name_bn, member_id").is("deleted_at", null).order("name_en");
      return data ?? [];
    },
  });

  const handleSubmit = () => {
    if (!form.transaction_type || !form.amount || Number(form.amount) <= 0) {
      toast.error(lang === "bn" ? "ধরন ও পরিমাণ আবশ্যক" : "Type and amount required");
      return;
    }
    submitMut.mutate({
      transaction_type: form.transaction_type as FinTransactionType,
      amount: Number(form.amount),
      member_id: form.member_id || undefined,
      account_id: form.account_id || undefined,
      notes: form.notes || undefined,
    }, {
      onSuccess: () => {
        onClose();
        setForm({ transaction_type: "", amount: "", member_id: "", account_id: "", notes: "" });
      },
    });
  };

  const txTypes = Object.entries(TX_TYPE_LABELS) as [FinTransactionType, { bn: string; en: string }][];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{lang === "bn" ? "নতুন আর্থিক লেনদেন" : "New Financial Transaction"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{lang === "bn" ? "লেনদেনের ধরন" : "Transaction Type"} *</Label>
            <Select value={form.transaction_type} onValueChange={(v) => setForm({ ...form, transaction_type: v as FinTransactionType })}>
              <SelectTrigger className="text-xs"><SelectValue placeholder={lang === "bn" ? "ধরন নির্বাচন করুন" : "Select type"} /></SelectTrigger>
              <SelectContent>
                {txTypes.map(([key, label]) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    {lang === "bn" ? label.bn : label.en}
                    {MANUAL_TYPES.includes(key) && " ⚠️"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{lang === "bn" ? "সদস্য" : "Member"}</Label>
            <Select value={form.member_id} onValueChange={(v) => setForm({ ...form, member_id: v })}>
              <SelectTrigger className="text-xs"><SelectValue placeholder={lang === "bn" ? "সদস্য নির্বাচন" : "Select member"} /></SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {lang === "bn" ? c.name_bn : c.name_en} ({c.member_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{lang === "bn" ? "পরিমাণ ৳" : "Amount ৳"} *</Label>
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="text-sm" placeholder="0" />
          </div>

          <div>
            <Label className="text-xs">{lang === "bn" ? "অ্যাকাউন্ট ID" : "Account ID"} ({lang === "bn" ? "ঋণ/সঞ্চয়" : "Loan/Savings"})</Label>
            <Input value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              className="text-xs font-mono" placeholder="UUID" />
          </div>

          <div>
            <Label className="text-xs">{lang === "bn" ? "নোট" : "Notes"}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="text-sm" rows={2} />
          </div>

          {form.transaction_type && MANUAL_TYPES.includes(form.transaction_type as FinTransactionType) && (
            <div className="flex items-start gap-2 p-2 rounded bg-warning/10 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{lang === "bn" ? "এই লেনদেনে ম্যানুয়াল অনুমোদন ও কারণ প্রয়োজন" : "This transaction requires manual approval with reason"}</span>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitMut.isPending} className="w-full text-xs">
            {submitMut.isPending ? "..." : lang === "bn" ? "জমা দিন" : "Submit Transaction"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FinancialTransactionsPage;
