import { useState, useCallback, useRef, useEffect } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ShieldCheck, Lock, AlertTriangle, CheckCircle2, Loader2,
  MessageCircle, MessageSquare, X, AlertCircle, Banknote,
} from "lucide-react";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";
import confetti from "canvas-confetti";
import { normalizePhone } from "@/lib/phone-utils";
import { buildReceiptMessage } from "@/services/messageBuilder";
import { logReceiptSend } from "@/services/receiptAuditLogger";

const schema = z.object({
  loan_id: z.string().uuid("Invalid Loan ID"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  reference_id: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

interface LoanInfo {
  id: string;
  loan_id: string | null;
  outstanding_principal: number;
  outstanding_interest: number;
  penalty_amount: number;
  emi_amount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  prefilledLoanId?: string;
  loanInfo?: LoanInfo;
}

interface PaymentResult {
  loan_id: string;
  total_payment: number;
  penalty_paid: number;
  interest_paid: number;
  principal_paid: number;
  new_outstanding: number;
  loan_closed: boolean;
  dps_collected?: number;
  points_earned?: number;
  new_score?: number;
  new_tier?: string;
}

export interface PendingTransaction {
  loan_id: string;
  amount: number;
  reference_id?: string;
  notes?: string;
}

type Phase = "form" | "pin" | "confirm" | "executing" | "success";

const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -40, scale: 0.92, transition: { duration: 0.25, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
};

export default function LoanPaymentModal({ open, onClose, prefilledLoanId, loanInfo }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const bn = lang === "bn";
  const queryClient = useQueryClient();

  const maxPayable = loanInfo
    ? Number(loanInfo.outstanding_principal || 0) + Number(loanInfo.outstanding_interest || 0) + Number(loanInfo.penalty_amount || 0)
    : 0;
  const emiSuggestion = loanInfo
    ? Number(loanInfo.penalty_amount || 0) + Number(loanInfo.outstanding_interest || 0) + Number(loanInfo.emi_amount || 0)
    : 0;
  const smartSuggestion = maxPayable > 0 ? Math.min(emiSuggestion, maxPayable) : emiSuggestion;
  const isFullPayoff = maxPayable < emiSuggestion;

  // Form state
  const [form, setForm] = useState({ loan_id: prefilledLoanId ?? "", amount: "", reference_id: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("form");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [nextDueDate, setNextDueDate] = useState<string | null>(null);

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const numAmount = Number(form.amount);
  const isFormValid = form.loan_id && numAmount > 0 && (maxPayable <= 0 || numAmount <= maxPayable);
  const isLocked = phase === "executing" || submitting;
  const loanDisplayId = loanInfo?.loan_id || loanInfo?.id?.slice(0, 8);

  // Countdown for PIN lock
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
      else if (res.status === "no_pin") { toast.error(bn ? "প্রথমে সেটিংস থেকে ট্রানজেকশন PIN সেট করুন" : "Set Transaction PIN in Settings first"); setPhase("form"); }
    } catch { triggerPinShake(); } finally { setPinVerifying(false); }
  };

  const formatCountdownTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  // Validate form & proceed to PIN
  const handleNextStep = useCallback(() => {
    const parsed = schema.safeParse({ ...form, amount: numAmount });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setPhase("pin");
  }, [form, numAmount]);

  // Execute payment after PIN + Hold
  const handleExecute = useCallback(async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPhase("executing");
    try {
      // Auto-repair now handled atomically inside the RPC

      const { data, error } = await supabase.rpc("apply_loan_payment", {
        _loan_id: form.loan_id,
        _amount: numAmount,
        _performed_by: user.id,
        _reference_id: form.reference_id || null,
      });
      if (error) throw error;

      const paymentData = data as unknown as PaymentResult;
      setResult(paymentData);

      // AUTO-KILL PTP
      try {
        await supabase
          .from("loan_schedules")
          .update({ promised_date: null, promised_status: "none", is_penalty_frozen: false } as any)
          .eq("loan_id", form.loan_id)
          .eq("promised_status", "promised");
      } catch (ptpErr) { console.error("PTP auto-clear:", ptpErr); }

      // Cache invalidation
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["loan_schedules"] });

      // Fetch client info + next installment date for receipt
      try {
        const { data: loanData } = await supabase
          .from("loans")
          .select("loan_id, client_id, installment_day, clients!loans_client_id_fkey(name_en, name_bn, phone)")
          .eq("id", form.loan_id)
          .single();
        if (loanData) {
          const client = (loanData as any).clients;
          if (client) {
            setClientPhone(client.phone || "");
            setClientName(client.name_bn || client.name_en || "");
          }
        }
        // Get the next pending installment due_date (locked to loan's anchor day)
        const { data: nextSched } = await supabase
          .from("loan_schedules")
          .select("due_date")
          .eq("loan_id", form.loan_id)
          .in("status", ["pending", "partial", "overdue"])
          .order("installment_number", { ascending: true })
          .limit(1);
        if (nextSched?.[0]?.due_date) {
          setNextDueDate(nextSched[0].due_date);
        }
      } catch { /* non-critical */ }

      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? "পেমেন্ট সফল ✅" : "Payment successful ✅");
      setPhase("success");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast.error(errMsg || (bn ? "পেমেন্ট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" : "Payment failed. Please try again."));
      setPhase("form");
    } finally {
      setSubmitting(false);
    }
  }, [user, submitting, form, numAmount, loanInfo, bn, queryClient]);

  const handleClose = useCallback(() => {
    if (isLocked) return;
    setPhase("form");
    setForm({ loan_id: prefilledLoanId ?? "", amount: "", reference_id: "", notes: "" });
    setErrors({});
    setResult(null);
    setClientName("");
    setClientPhone("");
    setNextDueDate(null);
    resetPin();
    onClose();
  }, [onClose, prefilledLoanId, resetPin, isLocked]);

  // Build receipt message
  const buildReceiptMsg = useCallback(() => {
    if (!result) return "";
    const dps = Number(result.dps_collected || 0);
    const loanPaid = Number(result.total_payment);
    const totalInput = dps + loanPaid;
    const remaining = Number(result.new_outstanding).toLocaleString();
    const nextDateStr = nextDueDate
      ? format(new Date(nextDueDate + "T00:00:00"), "dd/MM/yyyy")
      : "";
    const dpsLine = dps > 0 ? `\nসঞ্চয়: ৳${dps.toLocaleString()} ঋণ: ৳${loanPaid.toLocaleString()}` : "";
    const pointsEarned = result.points_earned ?? 0;
    const pointsLine = pointsEarned !== 0
      ? `\nট্রাস্ট: ${pointsEarned > 0 ? "+" : ""}${pointsEarned} (${result.new_score ?? 0})`
      : "";
    return result.loan_closed
      ? `সম্মানিত ${clientName},\nআপনার ঋণ সম্পূর্ণ পরিশোধিত ✅${dpsLine}\nমোট: ৳${totalInput.toLocaleString()}${pointsLine}\n— একতা ফাইন্যান্স`
      : `সম্মানিত ${clientName},\nকিস্তি জমা হয়েছে ✅${dpsLine}\nমোট: ৳${totalInput.toLocaleString()} বকেয়া: ৳${remaining}${nextDateStr ? `\nআগামী কিস্তি: ${nextDateStr}` : ""}${pointsLine}\n— একতা ফাইন্যান্স`;
  }, [result, clientName, nextDueDate]);

  const normalizePhone = (phone: string) => {
    const raw = phone.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d]/g, "");
    const last10 = raw.slice(-10);
    return last10.length === 10 ? "880" + last10 : "";
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o && !isLocked) handleClose(); }}>
      <DrawerContent
        onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
      >
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2 text-primary">
            <Banknote className="w-5 h-5" />
            {bn ? "নিরাপদ ঋণ পরিশোধ" : "Secure Loan Payment"}
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই করুন" : "Verify your identity")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : phase === "success" ? (bn ? "লেনদেন সম্পন্ন" : "Transaction complete")
              : (bn ? "ঋণের কিস্তি পরিশোধ করুন" : "Make a loan payment")}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {/* ═══ PHASE 1: Form ═══ */}
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-4">
                {/* Loan Summary Card */}
                {loanInfo && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bn ? "ঋণ" : "Loan"}</span>
                      <span className="font-mono font-bold">{loanDisplayId}</span>
                    </div>
                    {Number(loanInfo.penalty_amount) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-destructive">{bn ? "জরিমানা বকেয়া" : "Penalty Due"}</span>
                        <span className="font-bold text-destructive">৳{Number(loanInfo.penalty_amount).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bn ? "বকেয়া সুদ" : "Interest Due"}</span>
                      <span className="font-bold text-warning">৳{Number(loanInfo.outstanding_interest).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bn ? "বকেয়া আসল" : "Principal Due"}</span>
                      <span className="font-bold">৳{Number(loanInfo.outstanding_principal).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/40 pt-2 mt-1">
                      <span className="text-xs font-semibold">{bn ? "কিস্তির পরিমাণ (EMI)" : "EMI Amount"}</span>
                      <span className="text-sm font-bold text-primary">৳{Number(loanInfo.emi_amount).toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {/* Loan ID (hidden if prefilled) */}
                {!prefilledLoanId && (
                  <div>
                    <Label className="text-xs font-bold">Loan ID *</Label>
                    <Input value={form.loan_id} onChange={(e) => setForm({ ...form, loan_id: e.target.value })} className="mt-1.5 text-sm font-mono" placeholder="UUID" />
                    {errors.loan_id && <p className="text-xs text-destructive mt-1">{errors.loan_id}</p>}
                  </div>
                )}

                {/* Amount */}
                <div>
                  <Label className="text-xs font-bold">{bn ? "পরিমাণ (৳)" : "Amount (৳)"} *</Label>
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className={`mt-1.5 text-lg font-bold ${numAmount > maxPayable && maxPayable > 0 ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    placeholder={smartSuggestion > 0 ? `${bn ? "প্রস্তাবিত" : "Suggested"}: ৳${smartSuggestion.toLocaleString()}` : ""}
                  />
                  {numAmount > maxPayable && maxPayable > 0 && (
                    <p className="text-[11px] font-bold text-destructive mt-1">
                      ⚠️ {bn ? `সর্বোচ্চ ৳${maxPayable.toLocaleString()} এর বেশি নয়` : `Max ৳${maxPayable.toLocaleString()}`}
                    </p>
                  )}
                  {smartSuggestion > 0 && !form.amount && (
                    <button type="button" className="text-[10px] text-primary mt-1 hover:underline" onClick={() => setForm({ ...form, amount: String(smartSuggestion) })}>
                      {isFullPayoff
                        ? (bn ? `সম্পূর্ণ বকেয়া ৳${smartSuggestion.toLocaleString()} পূরণ করুন` : `Fill full outstanding ৳${smartSuggestion.toLocaleString()}`)
                        : (bn ? `প্রস্তাবিত ৳${smartSuggestion.toLocaleString()} পূরণ করুন` : `Fill suggested ৳${smartSuggestion.toLocaleString()}`)}
                    </button>
                  )}
                  {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
                </div>

                {/* Reference ID */}
                <div>
                  <Label className="text-xs font-bold">{bn ? "রেফারেন্স (ঐচ্ছিক)" : "Reference (Optional)"}</Label>
                  <Input value={form.reference_id} onChange={(e) => setForm({ ...form, reference_id: e.target.value })} className="mt-1.5 text-sm" placeholder={bn ? "ইউনিক রেফারেন্স" : "Unique reference"} />
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-xs font-bold">{bn ? "নোটস (ঐচ্ছিক)" : "Notes (Optional)"}</Label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={bn ? "মন্তব্য লিখুন..." : "Add remarks..."} rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 mt-1.5" maxLength={500} />
                </div>

                {/* Info banner */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{bn ? "পেমেন্ট অগ্রাধিকার: জরিমানা → সুদ → আসল" : "Payment priority: Penalty → Interest → Principal"}</span>
                </div>
              </DrawerBody>
              <DrawerFooter className="flex-row gap-2">
                <Button variant="ghost" onClick={handleClose} className="flex-1">{bn ? "বাতিল" : "Cancel"}</Button>
                <Button onClick={handleNextStep} disabled={!isFormValid} className="flex-1 gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> {bn ? "পরবর্তী ধাপ" : "Next Step"}
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
                    <input key={i} ref={(el) => { pinRefs.current[i] = el; }} type="password" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handlePinDigit(i, e.target.value)} onKeyDown={(e) => handlePinKeyDown(i, e)}
                      disabled={pinVerifying || countdown > 0}
                      className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-40" autoComplete="off" />
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
                      {bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final Confirmation"}
                    </p>
                    <p className="text-2xl font-bold text-primary">
                      ৳{numAmount.toLocaleString()}
                    </p>
                    {loanDisplayId && (
                      <p className="text-sm text-muted-foreground">
                        {bn ? "ঋণ" : "Loan"}: {loanDisplayId}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {bn ? "জরিমানা → সুদ → আসল" : "Penalty → Interest → Principal"}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <ArcReactorButton
                      onConfirmed={handleExecute}
                      holdDuration={2500}
                      size={110}
                      disabled={submitting}
                      label={bn ? "পেমেন্ট নিশ্চিত করতে ধরে রাখুন" : "Hold to confirm payment"}
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
              <p className="text-sm font-medium text-muted-foreground">{bn ? "পেমেন্ট প্রক্রিয়াকরণ হচ্ছে..." : "Processing payment..."}</p>
            </motion.div>
          )}

          {/* ═══ PHASE 5: Success + Receipt ═══ */}
          {phase === "success" && result && (() => {
            const finalPhone = normalizePhone(clientPhone);
            const receiptMsg = buildReceiptMsg();
            const encoded = encodeURIComponent(receiptMsg);
            return (
              <motion.div key="success" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
                <DrawerBody>
                  <div className="space-y-5 py-3">
                    {/* Success icon + heading */}
                    <div className="flex flex-col items-center justify-center text-center space-y-3">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                      </motion.div>
                      <div>
                        <p className="text-lg font-semibold text-foreground">
                          {result.loan_closed ? (bn ? "ঋণ সম্পূর্ণ পরিশোধিত!" : "Loan Fully Paid!") : (bn ? "পেমেন্ট সফল!" : "Payment Successful!")}
                        </p>
                        {clientName && <p className="text-sm text-muted-foreground mt-1">{clientName}</p>}
                      </div>
                    </div>

                    {/* Payment Breakdown with DPS Split */}
                     <div className="space-y-2">
                       {Number(result.dps_collected || 0) > 0 && (
                         <div className="flex justify-between p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs">
                           <span className="flex items-center gap-1.5">🏦 {bn ? "বাধ্যতামূলক সঞ্চয় (DPS)" : "Compulsory Savings (DPS)"}</span>
                           <span className="font-bold text-blue-600">৳{Number(result.dps_collected).toLocaleString()}</span>
                         </div>
                       )}
                       {Number(result.penalty_paid) > 0 && (
                         <div className="flex justify-between p-2.5 rounded-lg bg-destructive/5 border border-destructive/10 text-xs">
                           <span>{bn ? "জরিমানা প্রদান" : "Penalty Paid"}</span>
                           <span className="font-bold text-destructive">৳{Number(result.penalty_paid).toLocaleString()}</span>
                         </div>
                       )}
                       {Number(result.interest_paid) > 0 && (
                         <div className="flex justify-between p-2.5 rounded-lg bg-warning/5 border border-warning/10 text-xs">
                           <span>{bn ? "সুদ প্রদান" : "Interest Paid"}</span>
                           <span className="font-bold text-warning">৳{Number(result.interest_paid).toLocaleString()}</span>
                         </div>
                       )}
                       <div className="flex justify-between p-2.5 rounded-lg bg-success/5 border border-success/10 text-xs">
                         <span>{bn ? "আসল প্রদান" : "Principal Paid"}</span>
                         <span className="font-bold text-success">৳{Number(result.principal_paid).toLocaleString()}</span>
                       </div>
                       {Number(result.dps_collected || 0) > 0 && (
                         <div className="flex justify-between p-2.5 rounded-lg bg-muted/60 border border-border/40 text-xs font-semibold">
                           <span>{bn ? "মোট প্রদান" : "Total Paid"}</span>
                           <span className="text-primary">৳{(Number(result.total_payment) + Number(result.dps_collected || 0)).toLocaleString()}</span>
                         </div>
                       )}
                     </div>

                    {/* Trust Points Gamification Badge */}
                    {result.points_earned !== undefined && result.points_earned !== 0 && (
                      <div className={`rounded-xl p-3 text-center text-xs border ${
                        result.points_earned > 0
                          ? 'border-success/30 bg-success/10'
                          : 'border-destructive/30 bg-destructive/5'
                      }`}>
                        {result.points_earned > 0 ? (
                          <p className="font-bold text-success">
                            🎉 {bn
                              ? `অভিনন্দন! আপনি ${result.points_earned} ট্রাস্ট পয়েন্ট অর্জন করেছেন! (বর্তমান পয়েন্ট: ${result.new_score ?? 0})`
                              : `Congratulations! You earned ${result.points_earned} Trust Points! (Current: ${result.new_score ?? 0})`}
                          </p>
                        ) : (
                          <p className="font-medium text-destructive">
                            ⚠️ {bn
                              ? `বিলম্বের কারণে ${Math.abs(result.points_earned)} ট্রাস্ট পয়েন্ট কাটা হয়েছে। (বর্তমান পয়েন্ট: ${result.new_score ?? 0})`
                              : `${Math.abs(result.points_earned)} Trust Points deducted due to late payment. (Current: ${result.new_score ?? 0})`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Remaining balance */}
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">{bn ? "অবশিষ্ট বকেয়া" : "Remaining Balance"}</p>
                      <p className="text-2xl font-bold text-primary">৳{Number(result.new_outstanding).toLocaleString()}</p>
                    </div>

                    {/* WhatsApp + SMS receipt buttons */}
                    <div className="flex flex-col gap-2 pt-4 border-t border-border/50">
                      {finalPhone && (
                        <div className="flex gap-2 w-full">
                          <Button className="flex-1 gap-2 bg-success hover:bg-success/90 text-success-foreground shadow-lg" onClick={() => window.open(`https://wa.me/${finalPhone}?text=${encoded}`, "_blank")}>
                            <MessageCircle className="w-4 h-4" /> WhatsApp
                          </Button>
                          <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg" onClick={() => window.open(`sms:+${finalPhone}?body=${encoded}`, "_self")}>
                            <MessageSquare className="w-4 h-4" /> SMS
                          </Button>
                        </div>
                      )}
                      <Button variant="outline" onClick={handleClose} className="w-full">{bn ? "বন্ধ করুন" : "Close"}</Button>
                    </div>
                  </div>
                </DrawerBody>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}
