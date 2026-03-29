import { useState, useCallback, useRef, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Receipt, Loader2, Zap, ShieldCheck, Lock, AlertTriangle,
  CheckCircle2, X,
} from "lucide-react";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";
import confetti from "canvas-confetti";

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

type Phase = "form" | "pin" | "confirm" | "executing" | "success";

interface Props {
  open: boolean;
  onClose: () => void;
}

const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -40, scale: 0.92, transition: { duration: 0.25, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
};

function ExpenseEntryModalInner({ open, onClose }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bn = lang === "bn";

  // Form state
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<ExpenseCategoryKey | "">("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [submitting, setSubmitting] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const numAmount = parseFloat(amount) || 0;
  const isFormValid = !!category && numAmount > 0;
  const isLocked = phase === "executing" || submitting;
  const catMeta = EXPENSE_CATEGORIES.find((c) => c.key === category);

  // ── PIN Lock Countdown ──
  useEffect(() => {
    if (!lockedUntil) { setCountdown(0); return; }
    const calc = () => {
      const diff = Math.max(0, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
      setCountdown(diff);
      if (diff <= 0) { setLockedUntil(null); setRemainingAttempts(null); }
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [lockedUntil]);

  // Focus first PIN input
  useEffect(() => {
    if (phase === "pin") { resetPin(); setTimeout(() => pinRefs.current[0]?.focus(), 150); }
  }, [phase]);

  const resetPin = useCallback(() => {
    setPin(["", "", "", ""]); setPinVerifying(false); setPinShake(false);
    setRemainingAttempts(null); setLockedUntil(null); setCountdown(0);
  }, []);

  const triggerPinShake = useCallback(() => {
    setPinShake(true); setPin(["", "", "", ""]);
    setTimeout(() => { setPinShake(false); pinRefs.current[0]?.focus(); }, 500);
  }, []);

  const handlePinDigit = useCallback((index: number, value: string) => {
    if (pinVerifying || countdown > 0) return;
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pin]; next[index] = digit; setPin(next);
    if (digit && index < 3) pinRefs.current[index + 1]?.focus();
    if (digit && index === 3 && next.every((d) => d)) verifyPinAndProceed(next.join(""));
  }, [pin, pinVerifying, countdown]);

  const handlePinKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus();
  }, [pin]);

  const verifyPinAndProceed = async (fullPin: string) => {
    setPinVerifying(true);
    try {
      const res = await verifyTransactionPin(fullPin);
      if (res.status === "success") setPhase("confirm");
      else if (res.status === "locked") { setLockedUntil(res.locked_until); setRemainingAttempts(0); triggerPinShake(); }
      else if (res.status === "invalid") { setRemainingAttempts(res.remaining_attempts); triggerPinShake(); }
      else if (res.status === "no_pin") {
        toast.error(bn ? "প্রথমে সেটিংস থেকে ট্রানজেকশন PIN সেট করুন" : "Set Transaction PIN in Settings first");
        setPhase("form");
      }
    } catch { triggerPinShake(); } finally { setPinVerifying(false); }
  };

  const formatCountdownTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

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
    setSubmitting(false);
    setReceiptNumber("");
    resetPin();
  }, [resetPin]);

  // ── Phase 1: Validate form → open PIN ──
  const handleNextStep = useCallback(() => {
    if (!category) {
      toast.error(bn ? "ব্যয়ের ধরন নির্বাচন করুন" : "Please select an expense category");
      return;
    }
    if (!numAmount || numAmount <= 0) {
      toast.error(bn ? "সঠিক পরিমাণ দিন" : "Please enter a valid amount");
      return;
    }
    setPhase("pin");
  }, [category, numAmount, bn]);

  // ── Phase 3 (Hold confirmed) → Execute DB submission ──
  const handleExecute = useCallback(async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPhase("executing");
    try {
      const rcpt = `EXP-${Date.now().toString(36).toUpperCase()}`;
      setReceiptNumber(rcpt);

      const { error } = await supabase
        .from("financial_transactions" as any)
        .insert([{
          transaction_type: "adjustment_entry",
          amount: numAmount,
          created_by: user.id,
          approval_status: "pending",
          manual_flag: true,
          receipt_number: rcpt,
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

      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? "ব্যয় এন্ট্রি সফল ✅" : "Expense logged successfully ✅");
      setPhase("success");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      toast.error(errMsg);
      setPhase("form");
    } finally {
      setSubmitting(false);
    }
  }, [user, submitting, numAmount, category, date, description, receiptUrl, catMeta, qc, bn]);

  const handleClose = useCallback(() => {
    if (isLocked) return;
    resetForm();
    onClose();
  }, [onClose, resetForm, isLocked]);

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o && !isLocked) handleClose(); }}>
      <DrawerContent
        onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
      >
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2 text-primary">
            <Receipt className="w-5 h-5" />
            {bn ? "অপারেশনাল ব্যয় এন্ট্রি" : "Log Operational Expense"}
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই করুন" : "Verify your identity")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : phase === "success" ? (bn ? "ব্যয় এন্ট্রি সম্পন্ন" : "Expense logged")
              : (bn ? "প্রতিষ্ঠানের পরিচালন ব্যয় রেকর্ড করুন" : "Record organizational expenses")}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {/* ═══ PHASE 1: Form ═══ */}
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-4">
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-primary/5 border-primary/20 text-primary"
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
                    <Label className="text-xs font-bold">{bn ? "তারিখ" : "Date"}</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      max={todayISO()}
                      className="mt-1.5 h-9 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold">
                      {bn ? "ব্যয়ের ধরন" : "Category"} <span className="text-destructive">*</span>
                    </Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategoryKey)}>
                      <SelectTrigger className="mt-1.5 h-9 text-sm">
                        <SelectValue placeholder={bn ? "নির্বাচন করুন" : "Select"} />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.key} value={cat.key}>
                            <span className="flex items-center gap-2">
                              <span>{cat.emoji}</span>
                              <span>{bn ? cat.bn : cat.en}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <Label className="text-xs font-bold">
                    {bn ? "পরিমাণ (৳)" : "Amount (৳)"} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5 text-lg font-bold font-mono"
                  />
                </div>

                {/* Description */}
                <div>
                  <Label className="text-xs font-bold">{bn ? "বিবরণ (ঐচ্ছিক)" : "Description (Optional)"}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={bn ? "ব্যয়ের বিস্তারিত..." : "Details about this expense..."}
                    rows={2}
                    className="mt-1.5 text-sm resize-none"
                    maxLength={300}
                  />
                </div>

                {/* Receipt URL */}
                <div>
                  <Label className="text-xs font-bold">
                    {bn ? "রিসিট লিংক (ঐচ্ছিক)" : "Receipt URL (Optional)"}
                  </Label>
                  <Input
                    type="url"
                    value={receiptUrl}
                    onChange={(e) => setReceiptUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1.5 h-9 text-sm"
                  />
                </div>

                {/* Info banner */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                  <span className="mt-0.5">⏳</span>
                  <span>
                    {bn
                      ? "এই ব্যয় পেন্ডিং থাকবে। CEO/অ্যাডমিন অনুমোদনের পর P&L-এ যোগ হবে।"
                      : "Expense will be pending until CEO/Admin approves via maker-checker workflow."}
                  </span>
                </div>
              </DrawerBody>
              <DrawerFooter className="flex-row gap-2">
                <Button variant="ghost" onClick={handleClose} className="flex-1">{bn ? "বাতিল" : "Cancel"}</Button>
                <Button onClick={handleNextStep} disabled={!isFormValid} className="flex-1 gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> {bn ? "পিন যাচাই করুন" : "Verify PIN"}
                </Button>
              </DrawerFooter>
            </motion.div>
          )}

          {/* ═══ PHASE 2: PIN ═══ */}
          {phase === "pin" && (
            <motion.div key="pin" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="flex flex-col items-center justify-center gap-5 py-8">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>
                <div className="text-center">
                  <h3 className="text-sm font-bold">{bn ? "ট্রানজেকশন PIN" : "Transaction PIN"}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{bn ? "আপনার ৪-সংখ্যার PIN দিন" : "Enter your 4-digit PIN"}</p>
                </div>
                <motion.div className="flex gap-3" animate={pinShake ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                  {pin.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { pinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinDigit(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      disabled={pinVerifying || countdown > 0}
                      className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-40"
                      autoComplete="off"
                    />
                  ))}
                </motion.div>
                {countdown > 0 && (
                  <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                    <Lock className="w-3.5 h-3.5" /> {bn ? `লক — ${formatCountdownTime(countdown)}` : `Locked — ${formatCountdownTime(countdown)}`}
                  </div>
                )}
                {remainingAttempts !== null && remainingAttempts > 0 && countdown === 0 && (
                  <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 px-3 py-2 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5" /> {bn ? `ভুল PIN — ${remainingAttempts} বার বাকি` : `Wrong PIN — ${remainingAttempts} left`}
                  </div>
                )}
                {pinVerifying && <p className="text-xs text-muted-foreground animate-pulse">{bn ? "যাচাই হচ্ছে..." : "Verifying..."}</p>}
              </DrawerBody>
              <DrawerFooter>
                <Button variant="ghost" onClick={() => { resetPin(); setPhase("form"); }}>{bn ? "পেছনে যান" : "Go Back"}</Button>
              </DrawerFooter>
            </motion.div>
          )}

          {/* ═══ PHASE 3: Hold-to-Confirm (Arc Reactor) ═══ */}
          {phase === "confirm" && (
            <motion.div key="confirm" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody>
                <div className="rounded-xl bg-background/60 dark:bg-background/40 backdrop-blur-md border border-border/50 p-6 flex flex-col items-center gap-6">
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {bn ? "ব্যয় নিশ্চিতকরণ" : "Expense Confirmation"}
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      ৳{numAmount.toLocaleString()}
                    </p>
                    {catMeta && (
                      <p className="text-sm text-muted-foreground">
                        {catMeta.emoji} {bn ? catMeta.bn : catMeta.en}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{date}</p>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <ArcReactorButton
                      onConfirmed={handleExecute}
                      holdDuration={2500}
                      size={110}
                      disabled={submitting}
                      label={bn ? "ব্যয় নিশ্চিত করতে ধরে রাখুন" : "Hold to confirm expense"}
                      sublabel={bn ? "ধরুন" : "HOLD"}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {bn ? "নিশ্চিত করতে বোতাম ধরে রাখুন" : "Hold the button to confirm"}
                    </p>
                  </div>
                </div>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="outline" onClick={() => setPhase("form")} disabled={submitting} className="w-full gap-2">
                  <X className="w-4 h-4" />
                  {bn ? "ফিরে যান" : "Go Back"}
                </Button>
              </DrawerFooter>
            </motion.div>
          )}

          {/* ═══ PHASE 4: Executing ═══ */}
          {phase === "executing" && (
            <motion.div key="executing" {...vaultTransition} className="flex-1 min-h-0 px-6 py-12 flex flex-col items-center justify-center gap-4">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                <Loader2 className="w-10 h-10 text-primary" />
              </motion.div>
              <p className="text-sm font-medium text-muted-foreground">{bn ? "ব্যয় এন্ট্রি প্রক্রিয়াকরণ হচ্ছে..." : "Processing expense..."}</p>
            </motion.div>
          )}

          {/* ═══ PHASE 5: Success ═══ */}
          {phase === "success" && (
            <motion.div key="success" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody>
                <div className="space-y-5 py-3">
                  {/* Success icon */}
                  <div className="flex flex-col items-center justify-center text-center space-y-3">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-success" />
                    </motion.div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {bn ? "ব্যয় এন্ট্রি সফল!" : "Expense Logged!"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {bn ? "অনুমোদনের জন্য পেন্ডিং আছে" : "Pending approval"}
                      </p>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="space-y-2">
                    <div className="flex justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs">
                      <span>{bn ? "পরিমাণ" : "Amount"}</span>
                      <span className="font-bold text-primary">৳{numAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-muted/50 border border-border/40 text-xs">
                      <span>{bn ? "ক্যাটাগরি" : "Category"}</span>
                      <span className="font-semibold">{catMeta?.emoji} {bn ? catMeta?.bn : catMeta?.en}</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-muted/50 border border-border/40 text-xs">
                      <span>{bn ? "তারিখ" : "Date"}</span>
                      <span className="font-mono font-semibold">{date}</span>
                    </div>
                    {receiptNumber && (
                      <div className="flex justify-between p-2.5 rounded-lg bg-muted/50 border border-border/40 text-xs">
                        <span>{bn ? "রিসিট নং" : "Receipt #"}</span>
                        <span className="font-mono font-semibold text-primary">{receiptNumber}</span>
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 text-center text-xs">
                    <p className="font-bold text-warning">
                      ⏳ {bn ? "অনুমোদনের অপেক্ষায়" : "Awaiting Approval"}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {bn ? "CEO/অ্যাডমিন অনুমোদনের পর P&L-এ যোগ হবে" : "Will be added to P&L after CEO/Admin approval"}
                    </p>
                  </div>
                </div>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="outline" onClick={handleClose} className="w-full">{bn ? "বন্ধ করুন" : "Close"}</Button>
              </DrawerFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}

const ExpenseEntryModal = memo(ExpenseEntryModalInner);
ExpenseEntryModal.displayName = "ExpenseEntryModal";
export default ExpenseEntryModal;
