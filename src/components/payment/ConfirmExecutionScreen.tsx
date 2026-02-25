import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import HoldToConfirmButton from "@/components/ui/HoldToConfirmButton";
import type { PendingTransaction } from "@/components/forms/LoanPaymentModal";

interface Props {
  transaction: PendingTransaction;
  loanDisplayId?: string;
  executePayment: (tx: PendingTransaction) => Promise<void>;
  onComplete: () => void;
  onCancel: () => void;
}

export default function ConfirmExecutionScreen({
  transaction,
  loanDisplayId,
  executePayment,
  onComplete,
  onCancel,
}: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [status, setStatus] = useState<"idle" | "executing" | "done">("idle");

  const triggerConfetti = useCallback(() => {
    confetti({
      particleCount: 60,
      spread: 55,
      origin: { y: 0.7 },
      disableForReducedMotion: true,
    });
  }, []);

  const handleConfirmed = useCallback(async () => {
    if (status !== "idle") return;
    setStatus("executing");
    try {
      await executePayment(transaction);
      setStatus("done");
      triggerConfetti();
      setTimeout(() => onComplete(), 1200);
    } catch {
      setStatus("idle");
    }
  }, [status, executePayment, transaction, triggerConfetti, onComplete]);

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <AnimatePresence mode="wait">
        {status === "done" ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-3"
          >
            <CheckCircle2 className="w-10 h-10 text-success" />
            <span className="text-sm font-semibold">
              {bn ? "পেমেন্ট সম্পন্ন!" : "Payment Complete!"}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 w-full"
          >
            {/* Amount */}
            <div className="text-center space-y-1">
              <p className="text-2xl font-bold text-foreground">
                ৳{transaction.amount.toLocaleString()}
              </p>
              {loanDisplayId && (
                <p className="text-xs text-muted-foreground font-mono">
                  {bn ? "ঋণ" : "Loan"}: {loanDisplayId}
                </p>
              )}
            </div>

            {/* Warning */}
            <div className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{bn ? "নিশ্চিত করতে বোতামটি ধরে রাখুন" : "Hold the button to confirm transaction"}</span>
            </div>

            {/* Hold button */}
            <HoldToConfirmButton
              onConfirmed={handleConfirmed}
              disabled={status === "executing"}
              label={
                status === "executing"
                  ? (bn ? "প্রক্রিয়াকরণ হচ্ছে..." : "Processing...")
                  : (bn ? "২ সেকেন্ড ধরে রাখুন" : "Hold for 2 seconds")
              }
            />

            {/* Cancel */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={status === "executing"}
              className="text-xs text-muted-foreground"
            >
              {bn ? "বাতিল" : "Cancel"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
