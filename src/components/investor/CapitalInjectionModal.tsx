import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvestors } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CalendarIcon,
  Landmark,
  MessageCircle,
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";

interface CapitalInjectionModalProps {
  open: boolean;
  onClose: () => void;
}

interface SuccessData {
  investorName: string;
  amount: number;
  totalCapital: number;
  phone: string | null;
}

type Phase = "form" | "pin" | "confirm" | "executing" | "success";

// ── Combined slide + fade + scale variants (glass pop) ──
const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -40, scale: 0.95 },
  transition: { duration: 0.28, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
};

export const CapitalInjectionModal = ({
  open,
  onClose,
}: CapitalInjectionModalProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const queryClient = useQueryClient();
  const { data: investors } = useInvestors();

  // ── Form State ──
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState<string>("");

  // ── Flow State ──
  const [phase, setPhase] = useState<Phase>("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  // ── PIN State ──
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Memoized Helpers ──
  const formatCurrency = useCallback(
    (val: number) => `৳${val.toLocaleString("bn-BD")}`,
    []
  );

  const isFormValid = Boolean(
    selectedInvestorId && amount && Number(amount) > 0
  );

  const displayAmount = useMemo(
    () => (amount ? Number(amount).toLocaleString() : ""),
    [amount]
  );

  const formattedPreview = useMemo(
    () => (amount && Number(amount) > 0 ? formatCurrency(Number(amount)) : null),
    [amount, formatCurrency]
  );

  const selectedInvestor = useMemo(
    () => investors?.find((inv) => inv.id === selectedInvestorId),
    [investors, selectedInvestorId]
  );

  const selectedInvestorName = useMemo(
    () =>
      selectedInvestor
        ? bn
          ? selectedInvestor.name_bn
          : selectedInvestor.name_en
        : "",
    [selectedInvestor, bn]
  );

  // ── Countdown for PIN lock ──
  useEffect(() => {
    if (!lockedUntil) {
      setCountdown(0);
      return;
    }
    const calc = () => {
      const diff = Math.max(
        0,
        Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000)
      );
      setCountdown(diff);
      if (diff <= 0) {
        setLockedUntil(null);
        setRemainingAttempts(null);
      }
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [lockedUntil]);

  // ── Input Handlers ──
  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
      setAmount(raw);
    },
    []
  );

  // ── PIN Logic ──
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
    setTimeout(() => {
      setPinShake(false);
      pinRefs.current[0]?.focus();
    }, 500);
  }, []);

  const handlePinDigit = useCallback(
    (index: number, value: string) => {
      if (pinVerifying || countdown > 0) return;
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...pin];
      next[index] = digit;
      setPin(next);

      if (digit && index < 3) {
        pinRefs.current[index + 1]?.focus();
      }

      // Auto-verify on 4th digit
      if (digit && index === 3 && next.every((d) => d)) {
        verifyPinAndProceed(next.join(""));
      }
    },
    [pin, pinVerifying, countdown]
  );

  const handlePinKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !pin[index] && index > 0) {
        pinRefs.current[index - 1]?.focus();
      }
    },
    [pin]
  );

  const verifyPinAndProceed = async (fullPin: string) => {
    setPinVerifying(true);
    setPinShake(false);
    try {
      const result = await verifyTransactionPin(fullPin);
      if (result.status === "success") {
        setPhase("confirm");
      } else if (result.status === "locked") {
        setLockedUntil(result.locked_until);
        setRemainingAttempts(0);
        triggerPinShake();
      } else if (result.status === "invalid") {
        setRemainingAttempts(result.remaining_attempts);
        triggerPinShake();
      } else if (result.status === "no_pin") {
        toast.error(
          bn
            ? "প্রথমে সেটিংস থেকে ট্রানজেকশন PIN সেট করুন"
            : "Please set your Transaction PIN in Settings first"
        );
        setPhase("form");
      }
    } catch {
      triggerPinShake();
    } finally {
      setPinVerifying(false);
    }
  };

  const formatCountdownTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Submit (unchanged business logic) ──
  const handleSubmit = useCallback(async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    setPhase("executing");

    try {
      const { error } = await supabase.rpc(
        "create_investor_weekly_transaction",
        {
          p_data: {
            investor_id: selectedInvestorId,
            type: "capital",
            amount: Number(amount),
            transaction_date: format(date, "yyyy-MM-dd"),
            notes:
              note ||
              (bn ? "ত্রৈমাসিক মূলধন জমা" : "Quarterly Capital Injection"),
          },
        }
      );

      if (error) throw error;

      const { data: updatedInvestor } = await supabase
        .from("investors")
        .select("name_bn, name_en, capital, phone")
        .eq("id", selectedInvestorId)
        .single();

      if (updatedInvestor) {
        setSuccessData({
          investorName: bn
            ? updatedInvestor.name_bn
            : updatedInvestor.name_en,
          amount: Number(amount),
          totalCapital: updatedInvestor.capital,
          phone: updatedInvestor.phone,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({
        queryKey: ["investor_weekly_transactions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard_summary_metrics"],
      });

      toast.success(
        bn ? "মূলধন সফলভাবে জমা হয়েছে" : "Capital added successfully"
      );
      setPhase("success");
    } catch (err: any) {
      console.error("Capital injection error:", err);
      const fallback = bn
        ? "মূলধন জমা ব্যর্থ হয়েছে। অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"
        : "Failed to add capital. Please check your connection and try again.";
      toast.error(err?.message || fallback);
      setPhase("confirm");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedInvestorId, amount, date, note, bn, isFormValid, queryClient]);

  // ── WhatsApp Receipt (unchanged) ──
  const handleWhatsAppReceipt = useCallback(() => {
    if (!successData?.phone) {
      toast.error(bn ? "ফোন নম্বর পাওয়া যায়নি" : "Phone number not found");
      return;
    }
    const phone = successData.phone.replace(/\D/g, "").replace(/^0/, "880");
    const message = encodeURIComponent(
      `সম্মানিত পার্টনার ${successData.investorName}, আপনার ৳${successData.amount.toLocaleString("bn-BD")} ত্রৈমাসিক মূলধন সফলভাবে জমা হয়েছে। মোট মূলধন: ৳${successData.totalCapital.toLocaleString("bn-BD")}। ধন্যবাদ, একতা ফাইন্যান্স।`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  }, [successData, bn]);

  // ── Close & Reset ──
  const handleClose = useCallback(() => {
    setSelectedInvestorId("");
    setAmount("");
    setDate(new Date());
    setNote("");
    setSuccessData(null);
    setPhase("form");
    resetPin();
    onClose();
  }, [onClose, resetPin]);

  // Focus first PIN input when entering PIN phase
  useEffect(() => {
    if (phase === "pin") {
      resetPin();
      setTimeout(() => pinRefs.current[0]?.focus(), 150);
    }
  }, [phase, resetPin]);

  const isLocked = phase === "executing" || isSubmitting;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isLocked) handleClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md p-0 flex flex-col max-h-[90vh] gap-0 overflow-hidden"
        hideClose={isLocked}
        aria-live="polite"
        onInteractOutside={(e) => {
          if (isLocked) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isLocked) e.preventDefault();
        }}
      >
        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Landmark className="w-5 h-5" />
              {bn ? "ত্রৈমাসিক মূলধন জমা" : "Quarterly Capital Injection"}
            </DialogTitle>
            <DialogDescription>
              {phase === "pin"
                ? bn
                  ? "নিরাপত্তা যাচাই করুন"
                  : "Verify your identity"
                : phase === "confirm"
                  ? bn
                    ? "চূড়ান্ত নিশ্চিতকরণ"
                    : "Final confirmation"
                  : bn
                    ? "পার্টনারের মূলধন অ্যাকাউন্টে অর্থ জমা করুন"
                    : "Add funds to partner's capital account"}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Animated Phase Content ── */}
        <AnimatePresence mode="wait">
          {/* ═══ PHASE 1: Form ═══ */}
          {phase === "form" && (
            <motion.div
              key="form"
              {...vaultTransition}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2">
                <div className="flex flex-col gap-4">
                  {/* Partner Selection */}
                  <div className="space-y-2">
                    <Label>
                      {bn ? "পার্টনার নির্বাচন করুন" : "Select Partner"}
                    </Label>
                    <Select
                      value={selectedInvestorId}
                      onValueChange={setSelectedInvestorId}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue
                          placeholder={
                            bn
                              ? "পার্টনার নির্বাচন করুন..."
                              : "Select partner..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {investors?.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {bn ? inv.name_bn : inv.name_en} —{" "}
                            {formatCurrency(inv.capital)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Amount */}
                  <div className="space-y-2">
                    <Label>{bn ? "পরিমাণ (৳)" : "Amount (৳)"}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-base">
                        ৳
                      </span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={bn ? "পরিমাণ লিখুন" : "Enter amount"}
                        value={displayAmount}
                        onChange={handleAmountChange}
                        className="pl-8 text-right text-lg font-semibold tracking-wide h-11"
                        autoComplete="off"
                        aria-label={bn ? "পরিমাণ" : "Amount in Taka"}
                      />
                    </div>
                    {formattedPreview && (
                      <p className="text-xs text-muted-foreground text-right">
                        {formattedPreview}
                      </p>
                    )}
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <Label>{bn ? "তারিখ" : "Date"}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full h-11 justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date
                            ? format(date, "PPP")
                            : bn
                              ? "তারিখ নির্বাচন করুন"
                              : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={(d) => d && setDate(d)}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Note */}
                  <div className="space-y-2">
                    <Label>{bn ? "নোট (ঐচ্ছিক)" : "Note (Optional)"}</Label>
                    <Textarea
                      placeholder={
                        bn ? "বিস্তারিত নোট লিখুন..." : "Add a note..."
                      }
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-border/50 px-6 py-4 flex flex-col sm:flex-row-reverse gap-2">
                <Button
                  onClick={() => setPhase("pin")}
                  disabled={!isFormValid}
                  className="w-full sm:w-auto gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md rounded-lg transition-all duration-200"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {bn ? "নিরাপদে এগিয়ে যান" : "Proceed Securely"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="w-full sm:w-auto gap-2 border-border hover:bg-accent rounded-lg transition-all duration-200"
                >
                  <X className="w-4 h-4" />
                  {bn ? "বাতিল করুন" : "Cancel"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ═══ PHASE 2: PIN ═══ */}
          {phase === "pin" && (
            <motion.div
              key="pin"
              {...vaultTransition}
              className="flex flex-col flex-1 min-h-0"
            >
              {/* Glassmorphism vault overlay */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                <div className="rounded-xl bg-background/60 dark:bg-background/40 backdrop-blur-md border border-border/50 p-6 flex flex-col items-center gap-5">
                  {/* Summary */}
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {bn ? "জমার পরিমাণ যাচাই হচ্ছে" : "Authenticating Deposit"}
                    </p>
                    <p className="text-xl font-bold text-foreground">
                      {formattedPreview}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedInvestorName}
                    </p>
                  </div>

                  {/* PIN label */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {bn ? "৪-সংখ্যার PIN দিন" : "Enter 4-digit PIN"}
                    </p>
                  </div>

                  {/* PIN inputs */}
                  <motion.div
                    className="flex gap-3"
                    animate={
                      pinShake
                        ? { x: [0, -12, 12, -8, 8, -4, 4, 0] }
                        : {}
                    }
                    transition={pinShake ? { type: "spring", stiffness: 400, damping: 15 } : {}}
                  >
                    {pin.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          pinRefs.current[i] = el;
                        }}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handlePinDigit(i, e.target.value)}
                        onKeyDown={(e) => handlePinKeyDown(i, e)}
                        disabled={pinVerifying || countdown > 0}
                        aria-label={`PIN digit ${i + 1}`}
                        aria-invalid={remainingAttempts !== null && remainingAttempts < 3}
                        className="w-12 h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        autoComplete="off"
                      />
                    ))}
                  </motion.div>

                  {/* Lock message */}
                  {countdown > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {bn
                          ? `লক করা আছে — ${formatCountdownTime(countdown)}`
                          : `Locked — ${formatCountdownTime(countdown)}`}
                      </span>
                    </motion.div>
                  )}

                  {/* Wrong PIN */}
                  {remainingAttempts !== null &&
                    remainingAttempts > 0 &&
                    countdown === 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>
                          {bn
                            ? `ভুল PIN — ${remainingAttempts} বার বাকি`
                            : `Wrong PIN — ${remainingAttempts} attempt${remainingAttempts > 1 ? "s" : ""} left`}
                        </span>
                      </motion.div>
                    )}

                  {pinVerifying && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      {bn ? "যাচাই করা হচ্ছে..." : "Verifying..."}
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-border/50 px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetPin();
                    setPhase("form");
                  }}
                  disabled={pinVerifying}
                  className="w-full gap-2"
                >
                  <X className="w-4 h-4" />
                  {bn ? "ফিরে যান" : "Go Back"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ═══ PHASE 3: Hold-to-Confirm (Arc Reactor) ═══ */}
          {phase === "confirm" && (
            <motion.div
              key="confirm"
              {...vaultTransition}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
                <div className="rounded-xl bg-background/60 dark:bg-background/40 backdrop-blur-md border border-border/50 p-6 flex flex-col items-center gap-6">
                  {/* Deposit summary */}
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final Confirmation"}
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {formattedPreview}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      → {selectedInvestorName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(date, "PPP")}
                    </p>
                  </div>

                  {/* Arc Reactor Button */}
                  <div className="flex flex-col items-center gap-3">
                    <ArcReactorButton
                      onConfirmed={handleSubmit}
                      holdDuration={2500}
                      size={110}
                      disabled={isSubmitting}
                      label={
                        bn
                          ? "মূলধন জমা নিশ্চিত করতে ধরে রাখুন"
                          : "Hold to confirm capital deposit"
                      }
                      sublabel={bn ? "ধরুন" : "HOLD"}
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {bn
                        ? "নিশ্চিত করতে বোতাম ধরে রাখুন"
                        : "Hold the button to confirm"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-border/50 px-6 py-4">
                <Button
                  variant="outline"
                  onClick={() => setPhase("pin")}
                  disabled={isSubmitting}
                  className="w-full gap-2"
                >
                  <X className="w-4 h-4" />
                  {bn ? "ফিরে যান" : "Go Back"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ═══ PHASE 4: Executing ═══ */}
          {phase === "executing" && (
            <motion.div
              key="executing"
              {...vaultTransition}
              className="flex-1 min-h-0 px-6 py-12 flex flex-col items-center justify-center gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
              >
                <Loader2 className="w-10 h-10 text-emerald-600" />
              </motion.div>
              <p className="text-sm font-medium text-muted-foreground">
                {bn ? "মূলধন জমা প্রক্রিয়াকরণ হচ্ছে..." : "Processing capital deposit..."}
              </p>
            </motion.div>
          )}

          {/* ═══ PHASE 5: Success ═══ */}
          {phase === "success" && successData && (
            <motion.div
              key="success"
              {...vaultTransition}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="flex-1 min-h-0 overflow-y-auto px-6">
                <div className="space-y-6 py-4">
                  <div className="flex flex-col items-center justify-center text-center space-y-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 15,
                      }}
                      className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    </motion.div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        {bn
                          ? "মূলধন সফলভাবে জমা হয়েছে!"
                          : "Capital Added Successfully!"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {successData.investorName} —{" "}
                        {formatCurrency(successData.amount)}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 w-full">
                      <p className="text-xs text-muted-foreground">
                        {bn ? "মোট মূলধন" : "Total Capital"}
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        {formatCurrency(successData.totalCapital)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border/50">
                    {successData.phone && (
                      <Button
                        onClick={handleWhatsAppReceipt}
                        className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                      >
                        <MessageCircle className="w-4 h-4" />
                        {bn
                          ? "WhatsApp রসিদ পাঠান"
                          : "Send WhatsApp Receipt"}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleClose}
                      className="flex-1"
                    >
                      {bn ? "বন্ধ করুন" : "Close"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};
