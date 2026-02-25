import { useState, useCallback } from "react";
import confetti from "canvas-confetti";
import HoldToConfirmButton from "@/components/ui/HoldToConfirmButton";
import { useLanguage } from "@/contexts/LanguageContext";
import type { PendingTransaction } from "@/components/forms/LoanPaymentModal";

interface Props {
  transaction: PendingTransaction;
  loanDisplayId?: string;
  executePayment: (tx: PendingTransaction) => Promise<void>;
  onComplete: () => void;
  onCancel: () => void;
}

export default function ConfirmExecutionScreen({ transaction, loanDisplayId, executePayment, onComplete, onCancel }: Props) {
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
    <div className="flex flex-col items-center gap-4 p-4">
      {status === "done" ? (
        <h2>{bn ? "পেমেন্ট সম্পন্ন!" : "Payment Complete!"}</h2>
      ) : (
        <>
          <div className="text-xl font-bold">৳{transaction.amount.toLocaleString()}</div>
          {loanDisplayId && <div>{bn ? "ঋণ" : "Loan"}: {loanDisplayId}</div>}
          <div>{bn ? "নিশ্চিত করতে বোতামটি ধরে রাখুন" : "Hold the button to confirm transaction"}</div>
          <HoldToConfirmButton onConfirmed={handleConfirmed} disabled={status === "executing"} />
          <button className="mt-2 text-sm text-destructive" onClick={onCancel} disabled={status === "executing"}>
            {bn ? "বাতিল" : "Cancel"}
          </button>
        </>
      )}
    </div>
  );
}
