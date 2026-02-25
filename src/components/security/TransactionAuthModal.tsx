import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ShieldCheck, CheckCircle2, Lock, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { verifyTransactionPin } from "@/services/transactionPinService";

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthorized: () => void;
}

type Step = "pin" | "success";

export default function TransactionAuthModal({ open, onClose, onAuthorized }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("pin");
      setPin(["", "", "", ""]);
      setVerifying(false);
      setShake(false);
      setRemainingAttempts(null);
      setLockedUntil(null);
      setCountdown(0);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [open]);

  // Countdown timer for lock
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

  const handleDigit = useCallback((index: number, value: string) => {
    if (verifying || countdown > 0) return;
    if (value.length > 1) return; // prevent paste
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[index] = digit;
    setPin(next);

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all 4 digits entered
    if (digit && index === 3 && next.every(d => d)) {
      verifyPin(next.join(""));
    }
  }, [pin, verifying, countdown]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [pin]);

  const verifyPin = async (fullPin: string) => {
    setVerifying(true);
    setShake(false);
    try {
      const result = await verifyTransactionPin(fullPin);

      if (result.status === "success") {
        setStep("success");
        setTimeout(() => {
          onAuthorized();
          onClose();
        }, 800);
      } else if (result.status === "locked") {
        setLockedUntil(result.locked_until);
        setRemainingAttempts(0);
        triggerShake();
      } else if (result.status === "invalid") {
        setRemainingAttempts(result.remaining_attempts);
        triggerShake();
      } else if (result.status === "no_pin") {
        onClose();
        toast.error(
          lang === "bn"
            ? "প্রথমে সেটিংস থেকে ট্রানজেকশন PIN সেট করুন"
            : "Please set your Transaction PIN in Settings first"
        );
      }
    } catch {
      triggerShake();
    } finally {
      setVerifying(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    setPin(["", "", "", ""]);
    setTimeout(() => {
      setShake(false);
      inputRefs.current[0]?.focus();
    }, 500);
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xs p-0 gap-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {step === "pin" && (
            <motion.div
              key="pin"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="p-6 flex flex-col items-center gap-5"
            >
              {/* Header */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  {bn ? "ট্রানজেকশন PIN" : "Transaction PIN"}
                </h3>
                <p className="text-xs text-muted-foreground text-center">
                  {bn ? "আপনার ৪-সংখ্যার PIN দিন" : "Enter your 4-digit PIN"}
                </p>
              </div>

              {/* PIN Inputs */}
              <motion.div
                className="flex gap-3"
                animate={shake ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={verifying || countdown > 0}
                    className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    autoComplete="off"
                  />
                ))}
              </motion.div>

              {/* Status messages */}
              {countdown > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>
                    {bn ? `লক করা আছে — ${formatCountdown(countdown)}` : `Locked — ${formatCountdown(countdown)}`}
                  </span>
                </motion.div>
              )}

              {remainingAttempts !== null && remainingAttempts > 0 && countdown === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-xs text-warning bg-warning/10 px-3 py-2 rounded-lg"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    {bn
                      ? `ভুল PIN — ${remainingAttempts} বার বাকি`
                      : `Wrong PIN — ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} left`}
                  </span>
                </motion.div>
              )}

              {verifying && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  {bn ? "যাচাই করা হচ্ছে..." : "Verifying..."}
                </p>
              )}
            </motion.div>
          )}

          {step === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="p-8 flex flex-col items-center gap-3"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center"
              >
                <CheckCircle2 className="w-8 h-8 text-success" />
              </motion.div>
              <p className="text-sm font-bold text-success">
                {bn ? "PIN যাচাই সফল" : "PIN Verified"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
