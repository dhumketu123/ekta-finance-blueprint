import { useState, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageCircle, Lock, CheckCircle2, Loader2, Zap, Users, MoreVertical, Sparkles, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, isAfter, parseISO } from "date-fns";
import { formatLocalDate } from "@/lib/date-utils";
import { CustomTransactionModal } from "./CustomTransactionModal";
import { PartnerLedgerModal } from "./PartnerLedgerModal";

interface Investor {
  id: string;
  name_en: string;
  name_bn: string;
  phone: string | null;
  weekly_share: number;
  weekly_paid_until: string | null;
  total_weekly_paid: number;
  capital: number;
  status: string;
}

interface Props {
  investors: Investor[];
}

interface CollectionRow {
  id: string;
  selected: boolean;
  amount: number;
  isLocked: boolean;
}

// ── Tier calculation ──────────────────────────────────────────────────────
function getFounderTier(inv: Investor): { key: string; label_en: string; label_bn: string; className: string } {
  const total = (inv.capital || 0) + (inv.total_weekly_paid || 0);
  if (total > 50000) {
    return { key: "apex", label_en: "Apex", label_bn: "এপেক্স", className: "border-amber-500/50 text-amber-700 bg-amber-500/10 dark:text-amber-400" };
  }
  if (total >= 10000) {
    return { key: "growth", label_en: "Growth", label_bn: "গ্রোথ", className: "border-emerald-500/50 text-emerald-700 bg-emerald-500/10 dark:text-emerald-400" };
  }
  return { key: "seed", label_en: "Seed", label_bn: "সিড", className: "border-muted-foreground/30 text-muted-foreground bg-muted/50" };
}

export const FridayExpressGrid = memo(function FridayExpressGrid({ investors }: Props) {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bn = lang === "bn";
  const today = new Date();

  // Custom transaction modal state
  const [customTxModal, setCustomTxModal] = useState<{ open: boolean; investor: Investor | null }>({
    open: false,
    investor: null,
  });

  // Ledger modal state
  const [ledgerModal, setLedgerModal] = useState<{ open: boolean; investor: Investor | null }>({
    open: false,
    investor: null,
  });

  // Initialize collection state
  const [rows, setRows] = useState<Record<string, CollectionRow>>(() => {
    const initial: Record<string, CollectionRow> = {};
    investors.forEach((inv) => {
      const paidUntil = inv.weekly_paid_until ? parseISO(inv.weekly_paid_until) : null;
      const isLocked = paidUntil ? isAfter(paidUntil, today) : false;
      initial[inv.id] = {
        id: inv.id,
        selected: !isLocked && inv.status === "active",
        amount: inv.weekly_share || 100,
        isLocked,
      };
    });
    return initial;
  });

  // Update rows when investors change
  useMemo(() => {
    const newRows: Record<string, CollectionRow> = {};
    investors.forEach((inv) => {
      const paidUntil = inv.weekly_paid_until ? parseISO(inv.weekly_paid_until) : null;
      const isLocked = paidUntil ? isAfter(paidUntil, today) : false;
      newRows[inv.id] = rows[inv.id] ?? {
        id: inv.id,
        selected: !isLocked && inv.status === "active",
        amount: inv.weekly_share || 100,
        isLocked,
      };
      newRows[inv.id].isLocked = isLocked;
    });
    const hasChanges = Object.keys(newRows).some(
      (id) => !rows[id] || rows[id].isLocked !== newRows[id].isLocked
    );
    if (hasChanges || Object.keys(newRows).length !== Object.keys(rows).length) {
      setRows(newRows);
    }
  }, [investors]);

  const toggleSelect = useCallback((id: string) => {
    setRows((prev) => ({
      ...prev,
      [id]: { ...prev[id], selected: !prev[id].selected },
    }));
  }, []);

  const updateAmount = useCallback((id: string, amount: number) => {
    setRows((prev) => ({
      ...prev,
      [id]: { ...prev[id], amount: Math.max(0, amount) },
    }));
  }, []);

  const selectAll = useCallback((checked: boolean) => {
    setRows((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((id) => {
        if (!updated[id].isLocked) {
          updated[id].selected = checked;
        }
      });
      return updated;
    });
  }, []);

  // Bulk collection mutation
  const bulkCollect = useMutation({
    mutationFn: async (selectedRows: { investorId: string; amount: number }[]) => {
      const results = [];
      for (const row of selectedRows) {
        const { data, error } = await supabase.rpc("create_investor_weekly_transaction", {
          p_data: {
            investor_id: row.investorId,
            type: "weekly",
            amount: row.amount,
            notes: bn ? "ফ্রাইডে এক্সপ্রেস সংগ্রহ" : "Friday Express Collection",
          },
        });
        if (error) {
          results.push({ id: row.investorId, error: error.message });
        } else {
          results.push({ id: row.investorId, success: true, txId: data });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => r.error).length;
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary_metrics"] });
      if (successCount > 0) {
        toast.success(bn ? `${successCount} জন সংগ্রহ সফল!` : `${successCount} collections processed!`);
      }
      if (failCount > 0) {
        toast.error(bn ? `${failCount} জন ব্যর্থ` : `${failCount} failed`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleProcessCollection = () => {
    const selected = Object.values(rows)
      .filter((r) => r.selected && !r.isLocked && r.amount > 0)
      .map((r) => ({ investorId: r.id, amount: r.amount }));

    if (selected.length === 0) {
      toast.warning(bn ? "কোনো পার্টনার নির্বাচিত নেই" : "No partners selected");
      return;
    }

    bulkCollect.mutate(selected);
  };

  const generateWhatsAppMessage = (inv: Investor, amount: number) => {
    const name = bn ? (inv.name_bn || inv.name_en) : inv.name_en;
    const total = (inv.total_weekly_paid || 0) + amount;
    const msg = bn
      ? `সম্মানিত ${name},\nশেয়ার জমা ✅ ৳${amount.toLocaleString()}\nমোট: ৳${total.toLocaleString()}\n— একতা ফাইন্যান্স`
      : `Dear ${name},\nShare received ✅ ৳${amount.toLocaleString()}\nTotal: ৳${total.toLocaleString()}\n— Ekta Finance`;
    return encodeURIComponent(msg);
  };

  const openWhatsApp = (phone: string | null, inv: Investor, amount: number) => {
    if (!phone) {
      toast.error(bn ? "ফোন নম্বর নেই" : "No phone number");
      return;
    }
    let normalized = phone.replace(/\D/g, "");
    if (normalized.startsWith("0")) {
      normalized = "88" + normalized;
    } else if (!normalized.startsWith("88")) {
      normalized = "88" + normalized;
    }
    const msg = generateWhatsAppMessage(inv, amount);
    window.open(`https://wa.me/${normalized}?text=${msg}`, "_blank");
  };

  const selectedCount = Object.values(rows).filter((r) => r.selected && !r.isLocked).length;
  const totalAmount = Object.values(rows)
    .filter((r) => r.selected && !r.isLocked)
    .reduce((sum, r) => sum + r.amount, 0);

  const allUnlockedSelected = investors
    .filter((inv) => !rows[inv.id]?.isLocked)
    .every((inv) => rows[inv.id]?.selected);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Summary Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {bn ? "নির্বাচিত পার্টনার" : "Selected Partners"}
              </p>
              <p className="text-lg font-bold text-primary">{selectedCount}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {bn ? "মোট সংগ্রহ" : "Total Collection"}
            </p>
            <p className="text-lg font-bold text-success">৳{totalAmount.toLocaleString("bn-BD")}</p>
          </div>
        </div>

        {/* Table */}
        <div className="card-elevated overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allUnlockedSelected && investors.length > 0}
                    onCheckedChange={(c) => selectAll(!!c)}
                  />
                </TableHead>
                <TableHead className="text-xs font-bold">
                  {bn ? "পার্টনার" : "Partner"}
                </TableHead>
                <TableHead className="text-xs font-bold text-center">
                  {bn ? "স্ট্যাটাস" : "Status"}
                </TableHead>
                <TableHead className="text-xs font-bold text-center w-32">
                  {bn ? "পরিমাণ ৳" : "Amount ৳"}
                </TableHead>
                <TableHead className="text-xs font-bold text-center w-20">
                  <span className="flex items-center justify-center gap-1">
                    {bn ? "সপ্তাহ" : "Weeks"}
                    <Sparkles className="w-3 h-3 text-amber-500" />
                  </span>
                </TableHead>
                <TableHead className="w-12 text-center">
                  {bn ? "অ্যাকশন" : "Actions"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((inv) => {
                const row = rows[inv.id];
                if (!row) return null;
                const name = bn ? (inv.name_bn || inv.name_en) : inv.name_en;
                const weeklyShare = inv.weekly_share || 100;
                const weeksCount = row.amount > 0 ? Math.floor(row.amount / weeklyShare) : 0;
                const paidUntil = inv.weekly_paid_until
                  ? formatLocalDate(inv.weekly_paid_until, bn ? "bn" : "en", { short: true })
                  : "—";

                // Tier
                const tier = getFounderTier(inv);

                // 5-year projection
                const projection = (weeklyShare * 52 * 5) + (inv.capital || 0);

                return (
                  <TableRow
                    key={inv.id}
                    className={cn(
                      "transition-colors",
                      row.isLocked && "bg-success/5",
                      row.selected && !row.isLocked && "bg-primary/5"
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={row.selected}
                        onCheckedChange={() => toggleSelect(inv.id)}
                        disabled={row.isLocked}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p 
                              className="text-sm font-medium truncate cursor-pointer hover:text-primary hover:underline transition-colors"
                              onClick={() => navigate(`/owners/${inv.id}`)}
                            >{name}</p>
                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 leading-4 ${tier.className}`}>
                              {bn ? tier.label_bn : tier.label_en}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {bn ? `পেইড থ্রু: ${paidUntil}` : `Paid Through: ${paidUntil}`}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {row.isLocked ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] border-success/50 text-success bg-success/10"
                        >
                          <Lock className="w-3 h-3" />
                          {bn ? "অগ্রিম পেইড" : "Advance Paid"}
                        </Badge>
                      ) : inv.status === "active" ? (
                        <Badge
                          variant="outline"
                          className="gap-1 text-[10px] border-primary/50 text-primary bg-primary/10"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {bn ? "সক্রিয়" : "Active"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {inv.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step={weeklyShare}
                        min={0}
                        value={row.amount}
                        onChange={(e) => updateAmount(inv.id, Number(e.target.value))}
                        disabled={row.isLocked}
                        className="w-full text-center text-sm h-8"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "text-sm font-bold cursor-help inline-flex items-center gap-1",
                              weeksCount > 1 ? "text-success" : "text-foreground"
                            )}
                          >
                            {weeksCount}
                            <Sparkles className="w-3 h-3 text-amber-500 opacity-60" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-[260px] bg-card border border-primary/20 shadow-lg"
                        >
                          <p className="text-xs font-medium">
                            {bn
                              ? `✨ AI প্রজেকশন: ৫ বছর পর সম্ভাব্য ইকুইটি ভ্যালু ~ ৳${projection.toLocaleString("bn-BD")}`
                              : `✨ AI Projection: Est. 5-year equity ~ ৳${projection.toLocaleString()}`}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onClick={() => openWhatsApp(inv.phone, inv, row.amount)}
                            disabled={!inv.phone}
                            className="gap-2 cursor-pointer"
                          >
                            <MessageCircle className="w-4 h-4 text-emerald-600" />
                            {bn ? "💬 হোয়াটসঅ্যাপ রিসিপ্ট" : "💬 WhatsApp Receipt"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setCustomTxModal({ open: true, investor: inv })}
                            className="gap-2 cursor-pointer"
                          >
                            <Zap className="w-4 h-4 text-primary" />
                            {bn ? "⚡ কাস্টম লেনদেন" : "⚡ Custom Transaction"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setLedgerModal({ open: true, investor: inv })}
                            className="gap-2 cursor-pointer"
                          >
                            <BookOpen className="w-4 h-4 text-amber-600" />
                            {bn ? "📜 হিসাব বিবরণী" : "📜 Audit Ledger"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Sticky Process Button */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm p-4 -mx-4 border-t border-border shadow-lg">
          <Button
            onClick={handleProcessCollection}
            disabled={selectedCount === 0 || bulkCollect.isPending}
            className="w-full gap-2 h-12 text-base font-bold bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {bulkCollect.isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {bn ? "প্রক্রিয়াকরণ হচ্ছে..." : "Processing..."}
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                {bn
                  ? `ফ্রাইডে সংগ্রহ প্রক্রিয়া করুন (${selectedCount} জন • ৳${totalAmount.toLocaleString()})`
                  : `Process Friday Collection (${selectedCount} • ৳${totalAmount.toLocaleString()})`}
              </>
            )}
          </Button>
        </div>

        {/* Custom Transaction Modal */}
        {customTxModal.investor && (
          <CustomTransactionModal
            investorId={customTxModal.investor.id}
            investorName={bn ? (customTxModal.investor.name_bn || customTxModal.investor.name_en) : customTxModal.investor.name_en}
            open={customTxModal.open}
            onClose={() => setCustomTxModal({ open: false, investor: null })}
          />
        )}

        {/* Partner Ledger Modal */}
        {ledgerModal.investor && (
          <PartnerLedgerModal
            investorId={ledgerModal.investor.id}
            investorName={bn ? (ledgerModal.investor.name_bn || ledgerModal.investor.name_en) : ledgerModal.investor.name_en}
            open={ledgerModal.open}
            onClose={() => setLedgerModal({ open: false, investor: null })}
          />
        )}
      </div>
    </TooltipProvider>
  );
});
