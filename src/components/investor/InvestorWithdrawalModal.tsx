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
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowDownCircle, ShieldCheck, Lock, AlertTriangle, CheckCircle2, Loader2, MessageCircle,
} from "lucide-react";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";
import confetti from "canvas-confetti";

interface Props {
  open: boolean;
  onClose: () => void;
  investor: any;
  capital: number;
}

type Phase = "form" | "pin" | "confirm" | "executing" | "success";

const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -40, scale: 0.92, transition: { duration: 0.25, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
};

export function InvestorWithdrawalModal({ open, onClose, investor, capital }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [phase, setPhase] = useState<Phase>("form");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const amt = Number(withdrawAmount);
  const isFormValid = amt > 0 && amt <= capital;
  const isLocked = phase === "executing" || submitting;

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
      const result = await verifyTransactionPin(fullPin);
      if (result.status === "success") setPhase("confirm");
      else if (result.status === "locked") { setLockedUntil(result.locked_until); setRemainingAttempts(0); triggerPinShake(); }
      else if (result.status === "invalid") { setRemainingAttempts(result.remaining_attempts); triggerPinShake(); }
      else if (result.status === "no_pin") { toast.error(bn ? "প্রথমে সেটিংস থেকে ট্রানজেকশন PIN সেট করুন" : "Set Transaction PIN in Settings first"); setPhase("form"); }
    } catch { triggerPinShake(); } finally { setPinVerifying(false); }
  };

  const formatCountdownTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleExecute = useCallback(async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPhase("executing");
    try {
      const { error: updErr } = await supabase.from("investors").update({ capital: capital - amt }).eq("id", investor.id);
      if (updErr) throw updErr;
      const { error: txErr } = await supabase.from("transactions").insert({
        investor_id: investor.id, type: "investor_principal_return" as any, amount: amt, status: "paid" as any,
        transaction_date: format(new Date(), "yyyy-MM-dd"), notes: "Capital withdrawal", performed_by: user.id,
      });
      if (txErr) throw txErr;
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? "উত্তোলন সফল ✅" : "Withdrawal successful ✅");
      setPhase("success");
    } catch (err: any) {
      toast.error(err.message || "Error");
      setPhase("confirm");
    } finally { setSubmitting(false); }
  }, [user, amt, capital, investor, bn, queryClient, submitting]);

  const handleClose = useCallback(() => {
    setPhase("form"); setWithdrawAmount(""); resetPin(); onClose();
  }, [onClose, resetPin]);

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o && !isLocked) handleClose(); }}>
      <DrawerContent onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2 text-destructive">
            <ArrowDownCircle className="w-5 h-5" />
            {bn ? "উত্তোলন" : "Withdrawal"}
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই" : "Security verification")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : (bn ? "ইনভেস্টরের মূলধন থেকে উত্তোলন" : "Withdraw from investor capital")}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-4">
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                  <p className="text-xs text-muted-foreground">{bn ? "বর্তমান মূলধন" : "Current Capital"}</p>
                  <p className="text-xl font-bold text-foreground">৳{capital.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs font-bold">{bn ? "উত্তোলনের পরিমাণ (৳)" : "Withdrawal Amount (৳)"}</Label>
                  <Input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="10000" max={capital} className="mt-1.5 text-lg font-bold" />
                </div>
                {withdrawAmount && Number(withdrawAmount) > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border/60">
                    <p className="text-xs text-muted-foreground">{bn ? "অবশিষ্ট মূলধন" : "Remaining Capital"}</p>
                    <p className={`text-xl font-bold ${Number(withdrawAmount) > capital ? "text-destructive" : "text-foreground"}`}>
                      ৳{Math.max(0, capital - Number(withdrawAmount)).toLocaleString()}
                    </p>
                  </div>
                )}
              </DrawerBody>
              <DrawerFooter className="flex-row gap-2">
                <Button variant="ghost" onClick={handleClose} className="flex-1">{bn ? "বাতিল" : "Cancel"}</Button>
                <Button onClick={() => setPhase("pin")} disabled={!isFormValid} className="flex-1 gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                  <ShieldCheck className="w-4 h-4" /> {bn ? "পরবর্তী ধাপ" : "Next Step"}
                </Button>
              </DrawerFooter>
            </motion.div>
          )}

          {phase === "pin" && (
            <motion.div key="pin" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="flex flex-col items-center justify-center gap-5 py-8">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center"><ShieldCheck className="w-7 h-7 text-primary" /></div>
                <div className="text-center">
                  <h3 className="text-sm font-bold">{bn ? "ট্রানজেকশন PIN" : "Transaction PIN"}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{bn ? "আপনার ৪-সংখ্যার PIN দিন" : "Enter your 4-digit PIN"}</p>
                </div>
                <motion.div className="flex gap-3" animate={pinShake ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : {}} transition={{ duration: 0.4 }}>
                  {pin.map((digit, i) => (
                    <input key={i} ref={(el) => { pinRefs.current[i] = el; }} type="password" inputMode="numeric" maxLength={1} value={digit}
                      onChange={(e) => handlePinDigit(i, e.target.value)} onKeyDown={(e) => handlePinKeyDown(i, e)} disabled={pinVerifying || countdown > 0}
                      className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-40" autoComplete="off" />
                  ))}
                </motion.div>
                {countdown > 0 && <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg"><Lock className="w-3.5 h-3.5" /> {bn ? `লক — ${formatCountdownTime(countdown)}` : `Locked — ${formatCountdownTime(countdown)}`}</div>}
                {remainingAttempts !== null && remainingAttempts > 0 && countdown === 0 && <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 px-3 py-2 rounded-lg"><AlertTriangle className="w-3.5 h-3.5" /> {bn ? `ভুল PIN — ${remainingAttempts} বার বাকি` : `Wrong — ${remainingAttempts} left`}</div>}
                {pinVerifying && <p className="text-xs text-muted-foreground animate-pulse">{bn ? "যাচাই হচ্ছে..." : "Verifying..."}</p>}
              </DrawerBody>
              <DrawerFooter><Button variant="ghost" onClick={() => { resetPin(); setPhase("form"); }}>{bn ? "পেছনে যান" : "Go Back"}</Button></DrawerFooter>
            </motion.div>
          )}

          {phase === "confirm" && (
            <motion.div key="confirm" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="flex flex-col items-center justify-center gap-5 py-8">
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{bn ? "উত্তোলন" : "Withdrawal"}</p>
                  <p className="text-3xl font-extrabold text-destructive">৳{amt.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{bn ? `অবশিষ্ট: ৳${(capital - amt).toLocaleString()}` : `Remaining: ৳${(capital - amt).toLocaleString()}`}</p>
                </div>
                <ArcReactorButton onConfirmed={handleExecute} disabled={submitting} label={bn ? "ধরে রাখুন" : "Hold"} sublabel={bn ? "নিশ্চিত করুন" : "to confirm"} />
                <p className="text-[11px] text-muted-foreground">{bn ? "বোতামটি ২.৫ সেকেন্ড ধরে রাখুন" : "Hold for 2.5s to confirm"}</p>
              </DrawerBody>
              <DrawerFooter><Button variant="ghost" onClick={() => setPhase("form")} disabled={submitting}>{bn ? "বাতিল" : "Cancel"}</Button></DrawerFooter>
            </motion.div>
          )}

          {phase === "executing" && (
            <motion.div key="executing" {...vaultTransition} className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-10 h-10 text-destructive animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">{bn ? "প্রক্রিয়াকরণ হচ্ছে..." : "Processing..."}</p>
            </motion.div>
          )}

          {phase === "success" && (
            <motion.div key="success" {...vaultTransition} className="flex flex-col items-center justify-center gap-4 py-12">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </motion.div>
              <p className="text-lg font-bold text-success">{bn ? "উত্তোলন সফল!" : "Withdrawal Complete!"}</p>
              <p className="text-sm text-muted-foreground">৳{amt.toLocaleString()}</p>
              <Button onClick={handleClose} className="mt-4">{bn ? "বন্ধ করুন" : "Done"}</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}
