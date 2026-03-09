import { useState, useMemo, useCallback } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageCircle, Lock, CheckCircle2, Loader2, Zap, Users, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, isAfter, parseISO } from "date-fns";
import { CustomTransactionModal } from "./CustomTransactionModal";

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

export function FridayExpressGrid({ investors }: Props) {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const bn = lang === "bn";
  const today = new Date();

  // Custom transaction modal state
  const [customTxModal, setCustomTxModal] = useState<{ open: boolean; investor: Investor | null }>({
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
      // Always update lock status
      newRows[inv.id].isLocked = isLocked;
    });
    // Only update if there are actual changes
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
      ? `সম্মানিত পার্টনার ${name}, আপনার ৳${amount.toLocaleString()} জমা হয়েছে। মোট শেয়ার স্থিতি: ৳${total.toLocaleString()}। ধন্যবাদ, একতা ফাইন্যান্স।`
      : `Dear Partner ${name}, your payment of ৳${amount.toLocaleString()} has been received. Total balance: ৳${total.toLocaleString()}. Thank you, Ekta Finance.`;
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
                {bn ? "সপ্তাহ" : "Weeks"}
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
                ? format(parseISO(inv.weekly_paid_until), "dd MMM yyyy")
                : "—";

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
                    <div>
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {bn ? `পেইড থ্রু: ${paidUntil}` : `Paid Through: ${paidUntil}`}
                      </p>
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
                    <span
                      className={cn(
                        "text-sm font-bold",
                        weeksCount > 1 ? "text-success" : "text-foreground"
                      )}
                    >
                      {weeksCount}
                    </span>
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
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => openWhatsApp(inv.phone, inv, row.amount)}
                          disabled={!inv.phone}
                          className="gap-2 cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4 text-green-600" />
                          {bn ? "💬 হোয়াটসঅ্যাপ রিসিপ্ট" : "💬 WhatsApp Receipt"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setCustomTxModal({ open: true, investor: inv })}
                          className="gap-2 cursor-pointer"
                        >
                          <Zap className="w-4 h-4 text-primary" />
                          {bn ? "⚡ কাস্টম লেনদেন" : "⚡ Custom Transaction"}
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
    </div>
  );
}
