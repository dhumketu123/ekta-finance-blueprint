import { useState, useCallback, memo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Loader2, Zap } from "lucide-react";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import ArcReactorButton from "@/components/ui/ArcReactorButton";

// ── Expense category definitions ─────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  { key: "office_rent",   emoji: "🏢", bn: "অফিস ভাড়া",           en: "Office Rent" },
  { key: "staff_salary",  emoji: "👥", bn: "স্টাফ বেতন",            en: "Staff Salary" },
  { key: "utilities",     emoji: "⚡", bn: "বিদ্যুৎ / ইন্টারনেট",  en: "Utilities" },
  { key: "transport",     emoji: "🛺", bn: "যাতায়াত",               en: "Transport" },
  { key: "hospitality",   emoji: "☕", bn: "আপ্যায়ন",               en: "Hospitality" },
  { key: "maintenance",   emoji: "🛠️", bn: "মেরামত",                en: "Maintenance" },
  { key: "stationery",    emoji: "📄", bn: "স্টেশনারি",             en: "Stationery" },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]["key"];

// ── Quick-tap macro presets ───────────────────────────────────────────────────
const QUICK_PRESETS = [
  { emoji: "☕", bn: "চা-নাস্তা", en: "Tea/Snack",  category: "hospitality", amount: 100 },
  { emoji: "📄", bn: "প্রিন্ট",   en: "Print",      category: "stationery",  amount: 50  },
  { emoji: "🛺", bn: "যাতায়াত", en: "Transport",   category: "transport",   amount: 200 },
  { emoji: "⚡", bn: "বিদ্যুৎ",  en: "Electricity", category: "utilities",   amount: 500 },
  { emoji: "🛠️", bn: "মেরামত",  en: "Repair",      category: "maintenance", amount: 300 },
] as const;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

type SubmitPhase = "form" | "pin" | "hold" | "submitting";

interface Props {
  open: boolean;
  onClose: () => void;
}

function ExpenseEntryModalInner({ open, onClose }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bn = lang === "bn";

  const [date, setDate]           = useState(todayISO());
  const [category, setCategory]   = useState<ExpenseCategoryKey | "">("");
  const [amount, setAmount]       = useState("");
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl]   = useState("");
  const [phase, setPhase]         = useState<SubmitPhase>("form");

  const applyPreset = useCallback((preset: (typeof QUICK_PRESETS)[number]) => {
    setCategory(preset.category as ExpenseCategoryKey);
    setAmount(String(preset.amount));
    setDescription(bn ? preset.bn : preset.en);
  }, [bn]);

  const resetForm = useCallback(() => {
    setDate(todayISO());
    setCategory("");
    setAmount("");
    setDescription("");
    setReceiptUrl("");
    setPhase("form");
  }, []);

  // ── Step 1: Validate form → open PIN ───────────────────────────────────────
  const handleInitiateSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      toast.error(bn ? "ব্যয়ের ধরন নির্বাচন করুন" : "Please select an expense category");
      return;
    }
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error(bn ? "সঠিক পরিমাণ দিন" : "Please enter a valid amount");
      return;
    }
    setPhase("pin");
  }, [category, amount, bn]);

  // ── Step 2: PIN verified → show Hold-to-Confirm ────────────────────────────
  const handlePinAuthorized = useCallback(() => {
    setPhase("hold");
  }, []);

  // ── Step 3: Hold confirmed → submit to DB ──────────────────────────────────
  const handleFinalSubmit = useCallback(async () => {
    setPhase("submitting");
    try {
      const numAmount = parseFloat(amount);
      const catMeta = EXPENSE_CATEGORIES.find((c) => c.key === category);
      const receiptNum = `EXP-${Date.now().toString(36).toUpperCase()}`;

      const { error } = await supabase
        .from("financial_transactions" as any)
        .insert([{
          transaction_type: "adjustment_entry",
          amount: numAmount,
          created_by: user?.id,
          approval_status: "pending",
          manual_flag: true,
          receipt_number: receiptNum,
          notes: description || null,
          allocation_breakdown: {
            is_operational_expense: true,
            expense_category: category,
            expense_category_label_bn: catMeta?.bn ?? category,
            expense_category_label_en: catMeta?.en ?? category,
            expense_date: date,
            receipt_url: receiptUrl || null,
            description: description || null,
          },
        }]);

      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["financial_transactions"] });
      qc.invalidateQueries({ queryKey: ["operational_expenses"] });
      qc.invalidateQueries({ queryKey: ["profit-loss"] });

      toast.success(
        bn
          ? `✅ ব্যয় এন্ট্রি (${receiptNum}) অনুমোদনের জন্য জমা দেওয়া হয়েছে`
          : `✅ Expense (${receiptNum}) submitted for approval`,
      );
      resetForm();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Unknown error");
      setPhase("form");
    }
  }, [amount, category, date, description, receiptUrl, user?.id, qc, bn, resetForm, onClose]);

  const isLocked = phase === "submitting";

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (isLocked) return;
          if (!v) { resetForm(); onClose(); }
        }}
      >
        <DialogContent
          className="max-w-md w-full p-0 overflow-hidden border border-border/60 shadow-2xl flex flex-col"
          style={{ background: "hsl(var(--card))", maxHeight: "90vh" }}
          onPointerDownOutside={(e) => { if (isLocked) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
        >
          {/* ── Sticky Header ── */}
          <div
            className="flex-shrink-0 px-6 pt-6 pb-4"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--accent) / 0.08))",
              borderBottom: "1px solid hsl(var(--border) / 0.5)",
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-card-foreground">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Receipt className="w-4 h-4 text-primary" />
                </div>
                {bn ? "অপারেশনাল ব্যয় এন্ট্রি" : "Log Operational Expense"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {bn
                  ? "পেন্ডিং অনুমোদনের জন্য মেকার-চেকার ওয়ার্কফ্লোতে যাবে"
                  : "Submitted for maker-checker approval workflow"}
              </p>
            </DialogHeader>
          </div>

          {/* ── Scrollable Body ── */}
          <ScrollArea className="flex-1 min-h-0">
            <form id="expense-form" onSubmit={handleInitiateSubmit} className="px-6 pb-2 pt-4 space-y-4">
              {/* Quick-tap macro bar */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-accent" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {bn ? "দ্রুত এন্ট্রি" : "Quick Tap"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PRESETS.map((p) => (
                    <button
                      key={p.category + p.amount}
                      type="button"
                      onClick={() => applyPreset(p)}
                      disabled={isLocked}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
                      style={{
                        background: "hsl(var(--primary) / 0.06)",
                        borderColor: "hsl(var(--primary) / 0.2)",
                        color: "hsl(var(--primary))",
                      }}
                    >
                      <span>{p.emoji}</span>
                      <span>{bn ? p.bn : p.en}</span>
                      <span className="text-muted-foreground font-mono">৳{p.amount}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date + Category row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold mb-1.5 block text-muted-foreground">
                    {bn ? "তারিখ" : "Date"}
                  </Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={todayISO()}
                    className="h-9 text-sm"
                    disabled={isLocked}
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold mb-1.5 block text-muted-foreground">
                    {bn ? "ব্যয়ের ধরন" : "Category"} <span className="text-destructive">*</span>
                  </Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategoryKey)} disabled={isLocked}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={bn ? "নির্বাচন করুন" : "Select"} />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.key} value={cat.key}>
                          <span className="flex items-center gap-2">
                            <span>{cat.emoji}</span>
                            <span className={bn ? "font-bangla" : ""}>{bn ? cat.bn : cat.en}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Amount */}
              <div>
                <Label className="text-xs font-semibold mb-1.5 block text-muted-foreground">
                  {bn ? "পরিমাণ (৳)" : "Amount (৳)"} <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">৳</span>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-9 pl-7 text-sm font-mono"
                    disabled={isLocked}
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs font-semibold mb-1.5 block text-muted-foreground">
                  {bn ? "বিবরণ" : "Description"}
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={bn ? "ব্যয়ের বিস্তারিত..." : "Details about this expense..."}
                  rows={2}
                  className="text-sm resize-none"
                  maxLength={300}
                  disabled={isLocked}
                />
              </div>

              {/* Receipt URL */}
              <div>
                <Label className="text-xs font-semibold mb-1.5 block text-muted-foreground">
                  {bn ? "রিসিট লিংক / মেমো" : "Receipt URL / Memo"}
                  <span className="ml-1 text-[10px] text-muted-foreground/60">({bn ? "ঐচ্ছিক" : "optional"})</span>
                </Label>
                <Input
                  type="url"
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  placeholder="https://..."
                  className="h-9 text-sm"
                  disabled={isLocked}
                />
              </div>

              {/* Approval note */}
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
                style={{
                  background: "hsl(var(--warning) / 0.08)",
                  border: "1px solid hsl(var(--warning) / 0.2)",
                  color: "hsl(var(--warning))",
                }}
              >
                <span className="mt-0.5">⏳</span>
                <span className={bn ? "font-bangla" : ""}>
                  {bn
                    ? "এই ব্যয় প্রথমে পেন্ডিং অবস্থায় থাকবে। CEO/অ্যাডমিন অনুমোদনের পর P&L-এ যোগ হবে।"
                    : "This expense will be pending until CEO/Admin approves it in the maker-checker workflow."}
                </span>
              </div>
            </form>
          </ScrollArea>

          {/* ── Sticky Footer ── */}
          <div
            className="flex-shrink-0 px-6 py-4 border-t"
            style={{ borderColor: "hsl(var(--border) / 0.5)" }}
          >
            {phase === "hold" ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {bn ? "ব্যয় নিশ্চিত করতে চেপে ধরুন" : "Hold to confirm expense"}
                </p>
                <ArcReactorButton
                  onConfirmed={handleFinalSubmit}
                  holdDuration={1500}
                  size={88}
                  label={bn ? "ব্যয় নিশ্চিতকরণ" : "Confirm Expense"}
                  sublabel={`৳${parseFloat(amount || "0").toLocaleString()}`}
                />
              </div>
            ) : phase === "submitting" ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm font-semibold text-muted-foreground">
                  {bn ? "জমা হচ্ছে..." : "Submitting..."}
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-9 text-sm"
                  onClick={() => { resetForm(); onClose(); }}
                  disabled={isLocked}
                >
                  {bn ? "বাতিল" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  form="expense-form"
                  className="flex-1 h-9 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isLocked}
                >
                  <Receipt className="w-3.5 h-3.5 mr-1.5" />
                  {bn ? "পিন যাচাই করুন" : "Verify PIN & Submit"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN Auth Modal */}
      <TransactionAuthModal
        open={phase === "pin"}
        onClose={() => setPhase("form")}
        onAuthorized={handlePinAuthorized}
      />
    </>
  );
}

const ExpenseEntryModal = memo(ExpenseEntryModalInner);
ExpenseEntryModal.displayName = "ExpenseEntryModal";
export default ExpenseEntryModal;

export { EXPENSE_CATEGORIES, type ExpenseCategoryKey };
