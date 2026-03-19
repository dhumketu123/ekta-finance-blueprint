import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Banknote, ShieldCheck, Lock, AlertTriangle, CheckCircle2, Loader2, MessageCircle,
} from "lucide-react";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";
import confetti from "canvas-confetti";

interface Props {
  open: boolean;
  onClose: () => void;
  investor: any;
  capital: number;
  profitPct: number;
  monthlyProfit: number;
  dueDividend: number;
  totalPayable: number;
  reinvest: boolean;
}

type Phase = "form" | "pin" | "confirm" | "executing" | "success";

const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -40, scale: 0.92, transition: { duration: 0.25, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
};

export function InvestorDividendModal({ open, onClose, investor, capital, profitPct, monthlyProfit, dueDividend, totalPayable, reinvest }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [phase, setPhase] = useState<Phase>("form");
  const [payoutMode, setPayoutMode] = useState<"cash" | "reinvest">(reinvest ? "reinvest" : "cash");
  const [dividendPayAmount, setDividendPayAmount] = useState(String(totalPayable));
  const [dividendNotes, setDividendNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isFormValid = dividendPayAmount && Number(dividendPayAmount) > 0 && Number(dividendPayAmount) <= totalPayable;
  const isLocked = phase === "executing" || submitting;

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
    if (phase === "pin") {
      resetPin();
      setTimeout(() => pinRefs.current[0]?.focus(), 150);
    }
  }, [phase]);

  const resetPin = useCallback(() => {
    setPin(["", "", "", ""]);
    setPinVerifying(false);
    setPinShake(false);
    setRemainingAttempts(null);
    setLockedUntil(null);
    setCountdown(0);
  }, []);

  const triggerPinShake = useCallback(() => {
    setPinShake(true);
    setPin(["", "", "", ""]);
    setTimeout(() => { setPinShake(false); pinRefs.current[0]?.focus(); }, 500);
  }, []);

  const handlePinDigit = useCallback((index: number, value: string) => {
    if (pinVerifying || countdown > 0) return;
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[index] = digit;
    setPin(next);
    if (digit && index < 3) pinRefs.current[index + 1]?.focus();
    if (digit && index === 3 && next.every((d) => d)) verifyPinAndProceed(next.join(""));
  }, [pin, pinVerifying, countdown]);

  const handlePinKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus();
  }, [pin]);

  const verifyPinAndProceed = async (fullPin: string) => {
    setPinVerifying(true);
    try {
      const result = await verifyTransactionPin(fullPin);
      if (result.status === "success") setPhase("confirm");
      else if (result.status === "locked") { setLockedUntil(result.locked_until); setRemainingAttempts(0); triggerPinShake(); }
      else if (result.status === "invalid") { setRemainingAttempts(result.remaining_attempts); triggerPinShake(); }
      else if (result.status === "no_pin") { toast.error(bn ? "প্রথমে সেটিংস থেকে ট্রানজেকশন PIN সেট করুন" : "Please set your Transaction PIN in Settings first"); setPhase("form"); }
    } catch { triggerPinShake(); } finally { setPinVerifying(false); }
  };

  const formatCountdownTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleExecute = useCallback(async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPhase("executing");
    try {
      const payAmt = Number(dividendPayAmount);
      const newDueDividend = totalPayable - payAmt;
      const updatePayload: Record<string, any> = {
        due_dividend: newDueDividend,
        last_profit_date: format(new Date(), "yyyy-MM-dd"),
      };
      if (payoutMode === "reinvest") {
        updatePayload.capital = capital + payAmt;
        updatePayload.accumulated_profit = (investor.accumulated_profit || 0) + payAmt;
      }
      const { error: updErr } = await supabase.from("investors").update(updatePayload).eq("id", investor.id);
      if (updErr) throw updErr;

      const txNote = [
        payoutMode === "reinvest" ? "Reinvested to capital" : "Cash payout",
        newDueDividend > 0 ? `(Partial: ৳${newDueDividend} remaining due)` : "(Full payment)",
        dividendNotes ? `— ${dividendNotes}` : "",
      ].filter(Boolean).join(" ");

      const { error: txErr } = await supabase.from("transactions").insert({
        investor_id: investor.id, type: "investor_profit" as any, amount: payAmt, status: "paid" as any,
        transaction_date: format(new Date(), "yyyy-MM-dd"), notes: txNote, performed_by: user.id,
      });
      if (txErr) throw txErr;

      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? "লভ্যাংশ প্রদান সফল ✅" : "Dividend paid successfully ✅");
      setPhase("success");
    } catch (err: any) {
      toast.error(err.message || "Error");
      setPhase("confirm");
    } finally {
      setSubmitting(false);
    }
  }, [user, dividendPayAmount, totalPayable, payoutMode, capital, investor, dividendNotes, bn, queryClient, submitting]);

  const handleClose = useCallback(() => {
    setPhase("form");
    setPayoutMode(reinvest ? "reinvest" : "cash");
    setDividendPayAmount(String(totalPayable));
    setDividendNotes("");
    resetPin();
    onClose();
  }, [onClose, reinvest, totalPayable, resetPin]);

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o && !isLocked) handleClose(); }}>
      <DrawerContent
        onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}
      >
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2 text-success">
            <Banknote className="w-5 h-5" />
            {bn ? "লভ্যাংশ প্রদান" : "Pay Dividend"}
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই করুন" : "Verify your identity")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : (bn ? "ইনভেস্টরের লভ্যাংশ প্রদান করুন" : "Pay investor dividend")}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {/* FORM PHASE */}
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-success/5 border border-success/20">
                    <p className="text-[11px] text-muted-foreground">{bn ? "এই মাসের লভ্যাংশ" : "This Month's Profit"}</p>
                    <p className="text-lg font-bold text-success mt-0.5">৳{monthlyProfit.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{capital.toLocaleString()} × {profitPct}%</p>
                  </div>
                  <div className={`p-3 rounded-xl border ${dueDividend > 0 ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/40"}`}>
                    <p className="text-[11px] text-muted-foreground">{bn ? "পূর্ববর্তী বকেয়া" : "Previous Due"}</p>
                    <p className={`text-lg font-bold mt-0.5 ${dueDividend > 0 ? "text-destructive" : "text-muted-foreground"}`}>৳{dueDividend.toLocaleString()}</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-r from-success/10 to-success/5 border border-success/30">
                  <p className="text-xs font-bold text-success uppercase tracking-wider">{bn ? "মোট প্রদেয়" : "Total Payable"}</p>
                  <p className="text-3xl font-extrabold text-success mt-1">৳{totalPayable.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">{bn ? "প্রদানের পরিমাণ (৳)" : "Paying Amount (৳)"}</Label>
                  <Input type="number" value={dividendPayAmount} onChange={(e) => setDividendPayAmount(e.target.value)} placeholder={String(totalPayable)} max={totalPayable} min={1} className="text-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-bold mb-2 block">{bn ? "পরিশোধ পদ্ধতি" : "Payout Method"}</Label>
                  <RadioGroup value={payoutMode} onValueChange={(v) => setPayoutMode(v as "cash" | "reinvest")} className="space-y-2">
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors">
                      <RadioGroupItem value="cash" id="div-cash" />
                      <Label htmlFor="div-cash" className="text-sm cursor-pointer flex-1">💵 {bn ? "নগদ প্রদান" : "Cash Payout"}</Label>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors">
                      <RadioGroupItem value="reinvest" id="div-reinvest" />
                      <Label htmlFor="div-reinvest" className="text-sm cursor-pointer flex-1">🔄 {bn ? "মূলধনে পুনঃবিনিয়োগ" : "Reinvest to Capital"}</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <Label className="text-xs font-bold mb-1.5 block">{bn ? "নোটস (ঐচ্ছিক)" : "Notes (Optional)"}</Label>
                  <textarea value={dividendNotes} onChange={(e) => setDividendNotes(e.target.value)} placeholder={bn ? "মন্তব্য লিখুন..." : "Add remarks..."} rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                </div>
              </DrawerBody>
              <DrawerFooter className="flex-row gap-2">
                <Button variant="ghost" onClick={handleClose} className="flex-1">{bn ? "বাতিল" : "Cancel"}</Button>
                <Button onClick={() => setPhase("pin")} disabled={!isFormValid} className="flex-1 gap-1.5 bg-success hover:bg-success/90 text-success-foreground">
                  <ShieldCheck className="w-4 h-4" /> {bn ? "পরবর্তী ধাপ" : "Next Step"}
                </Button>
              </DrawerFooter>
            </motion.div>
          )}

          {/* PIN PHASE */}
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

          {/* CONFIRM PHASE */}
          {phase === "confirm" && (
            <motion.div key="confirm" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="flex flex-col items-center justify-center gap-5 py-8">
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{bn ? "লভ্যাংশ প্রদান" : "Dividend Payment"}</p>
                  <p className="text-3xl font-extrabold text-success">৳{Number(dividendPayAmount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{payoutMode === "reinvest" ? (bn ? "🔄 পুনঃবিনিয়োগ" : "🔄 Reinvest") : (bn ? "💵 নগদ" : "💵 Cash")}</p>
                </div>
                <ArcReactorButton onConfirmed={handleExecute} disabled={submitting} label={bn ? "ধরে রাখুন" : "Hold"} sublabel={bn ? "নিশ্চিত করুন" : "to confirm"} />
                <p className="text-[11px] text-muted-foreground text-center">{bn ? "নিশ্চিত করতে বোতামটি ২.৫ সেকেন্ড ধরে রাখুন" : "Hold the button for 2.5 seconds to confirm"}</p>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="ghost" onClick={() => setPhase("form")} disabled={submitting}>{bn ? "বাতিল" : "Cancel"}</Button>
              </DrawerFooter>
            </motion.div>
          )}

          {/* EXECUTING PHASE */}
          {phase === "executing" && (
            <motion.div key="executing" {...vaultTransition} className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">{bn ? "প্রক্রিয়াকরণ হচ্ছে..." : "Processing..."}</p>
            </motion.div>
          )}

          {/* SUCCESS PHASE */}
          {phase === "success" && (
            <motion.div key="success" {...vaultTransition} className="flex flex-col items-center justify-center gap-4 py-12">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </motion.div>
              <p className="text-lg font-bold text-success">{bn ? "লভ্যাংশ প্রদান সফল!" : "Dividend Paid!"}</p>
              <p className="text-sm text-muted-foreground">৳{Number(dividendPayAmount).toLocaleString()}</p>
              <Button onClick={handleClose} className="mt-4">{bn ? "বন্ধ করুন" : "Done"}</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}
