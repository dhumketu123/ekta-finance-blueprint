import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { hasTransactionPin, verifyTransactionPin, setTransactionPin } from "@/services/transactionPinService";
import { useLanguage } from "@/contexts/LanguageContext";
import { Lock, ShieldCheck, CheckCircle2, AlertTriangle, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = "check" | "setup" | "verifyCurrent" | "update" | "success";

function PinInputRow({
  pin,
  onChange,
  disabled,
  shake,
}: {
  pin: string[];
  onChange: (pin: string[]) => void;
  disabled?: boolean;
  shake?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleDigit = (index: number, value: string) => {
    if (disabled) return;
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[index] = digit;
    onChange(next);
    if (digit && index < 3) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  useEffect(() => {
    if (!disabled) refs.current[0]?.focus();
  }, [disabled]);

  return (
    <motion.div
      className="flex gap-3 justify-center"
      animate={shake ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      {pin.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          autoComplete="off"
        />
      ))}
    </motion.div>
  );
}

export default function SecuritySettingsCard() {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [step, setStep] = useState<Step>("check");
  const [currentPin, setCurrentPin] = useState(["", "", "", ""]);
  const [newPin, setNewPin] = useState(["", "", "", ""]);
  const [shake, setShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const exists = await hasTransactionPin();
        setHasPin(exists);
        setStep(exists ? "verifyCurrent" : "setup");
      } catch {
        // silent
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSetupPin = useCallback(async () => {
    if (newPin.some((d) => d === "")) return;
    setLoading(true);
    try {
      await setTransactionPin(newPin.join(""));
      toast.success(bn ? "আপনার PIN সফলভাবে সেট করা হয়েছে!" : "Transaction PIN set successfully!");
      setStep("success");
      setHasPin(true);
    } catch {
      toast.error(bn ? "PIN সেট করতে সমস্যা হয়েছে" : "Failed to set PIN");
    } finally {
      setLoading(false);
      setNewPin(["", "", "", ""]);
    }
  }, [newPin, bn]);

  const handleVerifyCurrentPin = useCallback(async () => {
    if (currentPin.some((d) => d === "")) return;
    setLoading(true);
    try {
      const result = await verifyTransactionPin(currentPin.join(""));
      if (result.status === "success") {
        setStep("update");
        setCurrentPin(["", "", "", ""]);
        setRemainingAttempts(null);
      } else if (result.status === "locked") {
        triggerShake();
        toast.error(bn ? "অনেক ভুল চেষ্টা। কিছুক্ষণ পর আবার চেষ্টা করুন।" : "Too many attempts. Try again later.");
      } else {
        triggerShake();
        setRemainingAttempts(result.remaining_attempts);
        setCurrentPin(["", "", "", ""]);
      }
    } catch {
      toast.error(bn ? "PIN যাচাই করতে সমস্যা হয়েছে" : "PIN verification failed");
    } finally {
      setLoading(false);
    }
  }, [currentPin, bn]);

  const handleUpdatePin = useCallback(async () => {
    if (newPin.some((d) => d === "")) return;
    setLoading(true);
    try {
      await setTransactionPin(newPin.join(""));
      toast.success(bn ? "আপনার PIN সফলভাবে পরিবর্তন হয়েছে!" : "Transaction PIN updated!");
      setStep("success");
      setNewPin(["", "", "", ""]);
    } catch {
      toast.error(bn ? "PIN পরিবর্তন করতে সমস্যা হয়েছে" : "Failed to update PIN");
    } finally {
      setLoading(false);
    }
  }, [newPin, bn]);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {step === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-5 py-4"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {bn
                ? "নিরাপদ লেনদেনের জন্য আপনার ৪-সংখ্যার ট্রানজেকশন PIN সেট করুন।"
                : "Set your 4-digit Transaction PIN for secure payments."}
            </p>
            <PinInputRow pin={newPin} onChange={setNewPin} disabled={loading} />
            <Button
              onClick={handleSetupPin}
              disabled={loading || newPin.some((d) => d === "")}
              size="sm"
              className="gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {bn ? "PIN সেট করুন" : "Set PIN"}
            </Button>
          </motion.div>
        )}

        {step === "verifyCurrent" && (
          <motion.div
            key="verify"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-5 py-4"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {bn
                ? "আপনার ট্রানজেকশন PIN পরিবর্তন করতে পারেন। প্রথমে বর্তমান PIN দিন।"
                : "To change your PIN, enter your current PIN first."}
            </p>
            <PinInputRow pin={currentPin} onChange={setCurrentPin} disabled={loading} shake={shake} />

            {remainingAttempts !== null && remainingAttempts > 0 && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>
                  {bn
                    ? `ভুল PIN — ${remainingAttempts} বার বাকি`
                    : `Wrong PIN — ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} left`}
                </span>
              </div>
            )}

            <Button
              onClick={handleVerifyCurrentPin}
              disabled={loading || currentPin.some((d) => d === "")}
              size="sm"
              className="gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {bn ? "যাচাই করুন" : "Verify"}
            </Button>
          </motion.div>
        )}

        {step === "update" && (
          <motion.div
            key="update"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex flex-col items-center gap-5 py-4"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {bn ? "নতুন ৪-সংখ্যার PIN দিন:" : "Enter your new 4-digit PIN:"}
            </p>
            <PinInputRow pin={newPin} onChange={setNewPin} disabled={loading} />
            <Button
              onClick={handleUpdatePin}
              disabled={loading || newPin.some((d) => d === "")}
              size="sm"
              className="gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {bn ? "পিন পরিবর্তন করুন" : "Update PIN"}
            </Button>
          </motion.div>
        )}

        {step === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-3 py-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"
            >
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </motion.div>
            <p className="text-sm font-bold text-emerald-600">
              {bn ? "আপনার PIN সফলভাবে সেট হয়েছে!" : "PIN configured successfully!"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep("verifyCurrent")}
              className="mt-2"
            >
              {bn ? "PIN পরিবর্তন করুন" : "Change PIN"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
