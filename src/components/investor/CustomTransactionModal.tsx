import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  Loader2, Zap, Banknote, AlertTriangle, Settings2,
  ShieldCheck, Lock, CheckCircle2,
} from "lucide-react";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";
import confetti from "canvas-confetti";

interface Props {
  investorId: string;
  investorName: string;
  open: boolean;
  onClose: () => void;
}

type TransactionType = "extra_capital" | "penalty" | "adjustment";
type Phase = "form" | "pin" | "confirm" | "executing" | "success";

const TRANSACTION_TYPES: { value: TransactionType; labelBn: string; labelEn: string; icon: typeof Banknote; color: string }[] = [
  { value: "extra_capital", labelBn: "অতিরিক্ত মূলধন", labelEn: "Additional Capital", icon: Banknote, color: "text-success" },
  { value: "penalty", labelBn: "জরিমানা / বিলম্ব ফি", labelEn: "Penalty / Late Fee", icon: AlertTriangle, color: "text-destructive" },
  { value: "adjustment", labelBn: "সমন্বয় / কারেকশন", labelEn: "Adjustment / Correction", icon: Settings2, color: "text-warning" },
];

const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -40, scale: 0.92, transition: { duration: 0.25, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
};

export function CustomTransactionModal({ investorId, investorName, open, onClose }: Props) {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [phase, setPhase] = useState<Phase>("form");
  const [type, setType] = useState<TransactionType>("extra_capital");
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isFormValid = amount > 0;
  const isLocked = phase === "executing" || submitting;
  const selectedType = TRANSACTION_TYPES.find((t) => t.value === type);
  const TypeIcon = selectedType?.icon ?? Banknote;

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
    if (submitting) return;
    setSubmitting(true);
    setPhase("executing");
    try {
      const typeLabels: Record<TransactionType, string> = {
        extra_capital: bn ? "অতিরিক্ত মূলধন" : "Additional Capital",
        penalty: bn ? "জরিমানা" : "Penalty",
        adjustment: bn ? "সমন্বয়" : "Adjustment",
      };
      const fullNotes = `[${typeLabels[type]}] ${notes}`.trim();
      const { error } = await supabase.rpc("create_investor_weekly_transaction", {
        p_data: { investor_id: investorId, type, amount, notes: fullNotes },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary_metrics"] });
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? "লেনদেন সফল!" : "Transaction completed!");
      setPhase("success");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast.error(errMsg);
      setPhase("confirm");
    } finally { setSubmitting(false); }
  }, [submitting, type, amount, notes, investorId, bn, queryClient]);

  const handleClose = useCallback(() => {
    setPhase("form"); setType("extra_capital"); setAmount(0); setNotes(""); resetPin(); onClose();
  }, [onClose, resetPin]);

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o && !isLocked) handleClose(); }}>
      <DrawerContent onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {bn ? "কাস্টম লেনদেন" : "Custom Transaction"}
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই" : "Security verification")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : (bn ? `পার্টনার: ${investorName}` : `Partner: ${investorName}`)}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="type">{bn ? "লেনদেনের ধরন" : "Transaction Type"}</Label>
                  <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
                    <SelectTrigger id="type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <t.icon className={`w-4 h-4 ${t.color}`} />
                            <span>{bn ? t.labelBn : t.labelEn}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">{bn ? "পরিমাণ (৳)" : "Amount (৳)"}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">৳</span>
                    <Input id="amount" type="number" min={1} step={100} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className="pl-8 text-lg font-semibold" placeholder="0" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">{bn ? "নোট / রেফারেন্স" : "Note / Reference"}</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={bn ? "লেনদেনের বিবরণ..." : "Transaction details..."} rows={3} className="resize-none" />
                </div>
                {amount > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TypeIcon className={`w-5 h-5 ${selectedType?.color}`} />
                        <span className="text-sm font-medium">{bn ? selectedType?.labelBn : selectedType?.labelEn}</span>
                      </div>
                      <span className="text-lg font-bold text-primary">৳{amount.toLocaleString("bn-BD")}</span>
                    </div>
                  </div>
                )}
              </DrawerBody>
              <DrawerFooter className="flex-row gap-2">
                <Button variant="ghost" onClick={handleClose} className="flex-1">{bn ? "বাতিল" : "Cancel"}</Button>
                <Button onClick={() => setPhase("pin")} disabled={!isFormValid} className="flex-1 gap-1.5">
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
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">{bn ? selectedType?.labelBn : selectedType?.labelEn}</p>
                  <p className="text-3xl font-extrabold text-primary">৳{amount.toLocaleString("bn-BD")}</p>
                  <p className="text-xs text-muted-foreground">{investorName}</p>
                </div>
                <ArcReactorButton onConfirmed={handleExecute} disabled={submitting} label={bn ? "ধরে রাখুন" : "Hold"} sublabel={bn ? "নিশ্চিত করুন" : "to confirm"} />
                <p className="text-[11px] text-muted-foreground">{bn ? "বোতামটি ২.৫ সেকেন্ড ধরে রাখুন" : "Hold for 2.5s to confirm"}</p>
              </DrawerBody>
              <DrawerFooter><Button variant="ghost" onClick={() => setPhase("form")} disabled={submitting}>{bn ? "বাতিল" : "Cancel"}</Button></DrawerFooter>
            </motion.div>
          )}

          {phase === "executing" && (
            <motion.div key="executing" {...vaultTransition} className="flex flex-col items-center justify-center gap-4 py-16">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">{bn ? "প্রক্রিয়াকরণ হচ্ছে..." : "Processing..."}</p>
            </motion.div>
          )}

          {phase === "success" && (
            <motion.div key="success" {...vaultTransition} className="flex flex-col items-center justify-center gap-4 py-12">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-success" />
              </motion.div>
              <p className="text-lg font-bold text-success">{bn ? "লেনদেন সফল!" : "Transaction Complete!"}</p>
              <p className="text-sm text-muted-foreground">৳{amount.toLocaleString("bn-BD")}</p>
              <Button onClick={handleClose} className="mt-4">{bn ? "বন্ধ করুন" : "Done"}</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DrawerContent>
    </Drawer>
  );
}
