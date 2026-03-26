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
  PlusCircle, ShieldCheck, Lock, AlertTriangle, CheckCircle2, Loader2, MessageCircle, MessageSquare, X,
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

export function InvestorCapitalAddModal({ open, onClose, investor, capital }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [phase, setPhase] = useState<Phase>("form");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isFormValid = capitalAmount && Number(capitalAmount) > 0;
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
      const amt = Number(capitalAmount);
      const fee = Number(feeAmount) || 0;
      const { error: updErr } = await supabase.from("investors").update({ capital: capital + amt, principal_amount: (investor.principal_amount || 0) + amt }).eq("id", investor.id);
      if (updErr) throw updErr;
      const { error: txErr } = await supabase.from("transactions").insert({
        investor_id: investor.id, type: "savings_deposit", amount: amt, status: "paid",
        transaction_date: format(new Date(), "yyyy-MM-dd"), notes: `Capital addition${fee > 0 ? ` (Fee: ৳${fee})` : ""}`, performed_by: user.id,
      });
      if (txErr) throw txErr;
      if (fee > 0) {
        await supabase.from("transactions").insert({
          investor_id: investor.id, type: "loan_penalty", amount: fee, status: "paid",
          transaction_date: format(new Date(), "yyyy-MM-dd"), notes: "Capital addition processing fee", performed_by: user.id,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? "মূলধন যোগ সফল ✅" : "Capital added ✅");
      setPhase("success");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast.error(errMsg || "Error");
      setPhase("confirm");
    } finally { setSubmitting(false); }
  }, [user, capitalAmount, feeAmount, capital, investor, bn, queryClient, submitting]);

  const handleClose = useCallback(() => {
    setPhase("form"); setCapitalAmount(""); setFeeAmount(""); resetPin(); onClose();
  }, [onClose, resetPin]);

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o && !isLocked) handleClose(); }}>
      <DrawerContent onInteractOutside={(e) => { if (isLocked) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (isLocked) e.preventDefault(); }}>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2 text-primary">
            <PlusCircle className="w-5 h-5" />
            {bn ? "মূলধন যোগ" : "Add Capital"}
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই" : "Security verification")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : (bn ? "ইনভেস্টরের মূলধনে অর্থ যোগ করুন" : "Add funds to investor capital")}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-4">
                <div>
                  <Label className="text-xs font-bold">{bn ? "মূলধন পরিমাণ (৳)" : "Capital Amount (৳)"}</Label>
                  <Input type="number" value={capitalAmount} onChange={(e) => setCapitalAmount(e.target.value)} placeholder="50000" className="mt-1.5 text-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-bold">{bn ? "ফি (ঐচ্ছিক)" : "Fee (Optional)"}</Label>
                  <Input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} placeholder="0" className="mt-1.5" />
                </div>
                {capitalAmount && Number(capitalAmount) > 0 && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-xs text-muted-foreground">{bn ? "নতুন মোট মূলধন" : "New Total Capital"}</p>
                    <p className="text-xl font-bold text-primary">৳{(capital + Number(capitalAmount)).toLocaleString()}</p>
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

          {/* ═══ PHASE 3: Hold-to-Confirm (Arc Reactor) ═══ */}
          {phase === "confirm" && (
            <motion.div key="confirm" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody>
                <div className="rounded-xl bg-background/60 dark:bg-background/40 backdrop-blur-md border border-border/50 p-6 flex flex-col items-center gap-6">
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final Confirmation"}
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      ৳{Number(capitalAmount).toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      → {investor.name_bn || investor.name_en || ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bn ? `নতুন মোট: ৳${(capital + Number(capitalAmount)).toLocaleString()}` : `New total: ৳${(capital + Number(capitalAmount)).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <ArcReactorButton
                      onConfirmed={handleExecute}
                      holdDuration={2500}
                      size={110}
                      disabled={submitting}
                      label={bn ? "মূলধন জমা নিশ্চিত করতে ধরে রাখুন" : "Hold to confirm capital deposit"}
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
              <p className="text-sm font-medium text-muted-foreground">{bn ? "মূলধন জমা প্রক্রিয়াকরণ হচ্ছে..." : "Processing capital deposit..."}</p>
            </motion.div>
          )}

          {/* ═══ PHASE 5: Success ═══ */}
          {phase === "success" && (() => {
            const amt = Number(capitalAmount);
            const newTotal = capital + amt;
            const name = investor.name_bn || investor.name_en || "";
            const rawPhone = (investor.phone || "").replace(/[০-৯]/g, (d: string) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d]/g, "");
            const cleanPhone = rawPhone.slice(-10);
            const finalPhone = cleanPhone.length === 10 ? "880" + cleanPhone : "";
            const msg = `নিরাপত্তা আপডেট 🔒\n\nসম্মানিত ${name},\nআপনার ভল্টে নতুন ফান্ড সফলভাবে জমা হয়েছে।\n\n📥 জমার পরিমাণ: ${amt.toLocaleString()} ৳\n💼 সর্বমোট মূলধন: ${newTotal.toLocaleString()} ৳\n\nআপনার ফান্ড একতা ফাইন্যান্স-এর সিকিউরড ভল্টে সম্পূর্ণ সুরক্ষিত আছে এবং পরবর্তী লভ্যাংশ চক্রের জন্য সক্রিয় করা হয়েছে।\n\n— একতা ফাইন্যান্স`;
            const encoded = encodeURIComponent(msg);
            return (
              <motion.div key="success" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
                <DrawerBody>
                  <div className="space-y-6 py-4">
                    <div className="flex flex-col items-center justify-center text-center space-y-3">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                      </motion.div>
                      <div>
                        <p className="text-lg font-semibold text-foreground">{bn ? "মূলধন সফলভাবে জমা হয়েছে!" : "Capital Added Successfully!"}</p>
                        <p className="text-sm text-muted-foreground mt-1">{name} — ৳{amt.toLocaleString()}</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 w-full">
                        <p className="text-xs text-muted-foreground">{bn ? "মোট মূলধন" : "Total Capital"}</p>
                        <p className="text-2xl font-bold text-primary">৳{newTotal.toLocaleString()}</p>
                      </div>
                    </div>
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
