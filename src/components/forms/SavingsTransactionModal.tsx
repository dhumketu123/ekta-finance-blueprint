import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useClients } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowDownCircle, ArrowUpCircle, ShieldCheck, Lock, AlertTriangle,
  CheckCircle2, Loader2, MessageCircle, MessageSquare, X,
} from "lucide-react";
import { verifyTransactionPin } from "@/services/transactionPinService";
import ArcReactorButton from "@/components/ui/ArcReactorButton";
import confetti from "canvas-confetti";
import { normalizePhone } from "@/lib/phone-utils";
import { buildReceiptMessage } from "@/services/messageBuilder";
import { logReceiptSend } from "@/services/receiptAuditLogger";

interface Props {
  open: boolean;
  onClose: () => void;
  prefillClientId?: string;
  prefillSavingsId?: string;
  prefillType?: "savings_deposit" | "savings_withdrawal";
}

type Phase = "form" | "pin" | "confirm" | "executing" | "success";

const vaultTransition = {
  initial: { opacity: 0, x: 40, scale: 0.92 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.3, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
  exit: { opacity: 0, x: -40, scale: 0.92, transition: { duration: 0.25, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] } },
};

export default function SavingsTransactionModal({ open, onClose, prefillClientId, prefillSavingsId, prefillType }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const bn = lang === "bn";
  const queryClient = useQueryClient();
  const { data: clients, isLoading: clientsLoading } = useClients();

  const [phase, setPhase] = useState<Phase>("form");
  const [clientId, setClientId] = useState(prefillClientId || "");
  const [savingsId, setSavingsId] = useState(prefillSavingsId || "");
  const [txType, setTxType] = useState<"savings_deposit" | "savings_withdrawal">(prefillType || "savings_deposit");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{ amount: number; newBalance: number; clientName: string; clientPhone: string } | null>(null);

  // PIN state
  const [pin, setPin] = useState(["", "", "", ""]);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const isLocked = phase === "executing" || submitting;
  const isDeposit = txType === "savings_deposit";

  const { data: savingsAccounts } = useQuery({
    queryKey: ["client_savings_modal", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_accounts")
        .select("id, balance, savings_product_id, savings_products(product_name_en, product_name_bn, min_amount)")
        .eq("client_id", clientId)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const selectedAccount = savingsAccounts?.find((s) => s.id === savingsId);
  const numAmount = Number(amount);
  const isFormValid = (() => {
    if (!clientId || !savingsId || numAmount <= 0) return false;
    if (!isDeposit && selectedAccount && numAmount > selectedAccount.balance) return false;
    if (isDeposit && selectedAccount) {
      const minAmt = (selectedAccount as any).savings_products?.min_amount;
      if (minAmt && numAmount < minAmt) return false;
    }
    return true;
  })();

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
    const errs: Record<string, string> = {};
    if (!clientId) errs.client = bn ? "গ্রাহক নির্বাচন করুন" : "Select a client";
    if (!savingsId) errs.savings = bn ? "অ্যাকাউন্ট নির্বাচন করুন" : "Select account";
    if (numAmount <= 0) errs.amount = bn ? "পরিমাণ ০ এর বেশি হতে হবে" : "Amount must be > 0";
    if (!isDeposit && selectedAccount && numAmount > selectedAccount.balance) {
      errs.amount = bn ? `ব্যালেন্স ৳${selectedAccount.balance.toLocaleString()} এর বেশি উত্তোলন করা যাবে না` : `Cannot exceed balance ৳${selectedAccount.balance.toLocaleString()}`;
    }
    if (isDeposit && selectedAccount) {
      const minAmt = (selectedAccount as any).savings_products?.min_amount;
      if (minAmt && numAmount < minAmt) errs.amount = bn ? `সর্বনিম্ন জমা ৳${Number(minAmt).toLocaleString()}` : `Min deposit ৳${Number(minAmt).toLocaleString()}`;
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setPhase("pin");
  }, [clientId, savingsId, numAmount, isDeposit, selectedAccount, bn]);

  // Execute after PIN + Hold — uses bank-grade RPC
  const handleExecute = useCallback(async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPhase("executing");
    try {
      const refId = `SAV_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Call server-side RPC for atomic, ledger-grade transaction
      const { data, error } = await supabase.rpc("process_savings_transaction" as any, {
        _savings_account_id: savingsId,
        _amount: numAmount,
        _transaction_type: txType,
        _performed_by: user.id,
        _reference_id: refId,
        _notes: notes.trim() || null,
      });
      if (error) throw error;

      const result = data as any;

      // Get client info for receipt
      const client = clients?.find((c) => c.id === clientId);
      const cName = client ? (bn ? client.name_bn : client.name_en) || client.name_en : "";
      const cPhone = client?.phone || "";

      setSuccessData({
        amount: numAmount,
        newBalance: Number(result?.new_balance ?? (isDeposit ? (selectedAccount?.balance || 0) + numAmount : (selectedAccount?.balance || 0) - numAmount)),
        clientName: cName,
        clientPhone: cPhone,
      });

      queryClient.invalidateQueries({ queryKey: ["savings"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client_savings_modal"] });
      queryClient.invalidateQueries({ queryKey: ["financial_transactions"] });

      confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 }, disableForReducedMotion: true });
      toast.success(bn ? (isDeposit ? "জমা সফল ✅" : "উত্তোলন সফল ✅") : (isDeposit ? "Deposit successful ✅" : "Withdrawal successful ✅"));
      setPhase("success");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast.error(errMsg || (bn ? "লেনদেন ব্যর্থ। আবার চেষ্টা করুন।" : "Transaction failed. Try again."));
      setPhase("form");
    } finally { setSubmitting(false); }
  }, [user, submitting, isDeposit, selectedAccount, numAmount, savingsId, txType, clientId, notes, clients, bn, queryClient]);

  const handleClose = useCallback(() => {
    if (isLocked) return;
    setPhase("form");
    setClientId(prefillClientId || "");
    setSavingsId(prefillSavingsId || "");
    setTxType(prefillType || "savings_deposit");
    setAmount(""); setNotes(""); setErrors({});
    setSuccessData(null);
    resetPin();
    onClose();
  }, [onClose, prefillClientId, prefillSavingsId, prefillType, resetPin, isLocked]);

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
          <DrawerTitle className="flex items-center gap-2">
            {isDeposit ? (
              <ArrowDownCircle className="w-5 h-5 text-success" />
            ) : (
              <ArrowUpCircle className="w-5 h-5 text-warning" />
            )}
            <span className={isDeposit ? "text-success" : "text-warning"}>
              {bn ? (isDeposit ? "সঞ্চয় জমা" : "সঞ্চয় উত্তোলন") : (isDeposit ? "Savings Deposit" : "Savings Withdrawal")}
            </span>
          </DrawerTitle>
          <DrawerDescription>
            {phase === "pin" ? (bn ? "নিরাপত্তা যাচাই করুন" : "Verify your identity")
              : phase === "confirm" ? (bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final confirmation")
              : phase === "success" ? (bn ? "লেনদেন সম্পন্ন" : "Transaction complete")
              : (bn ? "সঞ্চয় অ্যাকাউন্টে লেনদেন করুন" : "Manage savings account")}
          </DrawerDescription>
        </DrawerHeader>

        <AnimatePresence mode="wait">
          {/* ═══ PHASE 1: Form ═══ */}
          {phase === "form" && (
            <motion.div key="form" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody className="space-y-4">
                {/* Type Toggle */}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={isDeposit ? "default" : "outline"}
                    className={`flex-1 text-xs gap-1.5 ${isDeposit ? "bg-success hover:bg-success/90 text-success-foreground" : ""}`}
                    onClick={() => setTxType("savings_deposit")}>
                    <ArrowDownCircle className="w-3.5 h-3.5" /> {bn ? "জমা" : "Deposit"}
                  </Button>
                  <Button type="button" size="sm" variant={!isDeposit ? "default" : "outline"}
                    className={`flex-1 text-xs gap-1.5 ${!isDeposit ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}`}
                    onClick={() => setTxType("savings_withdrawal")}>
                    <ArrowUpCircle className="w-3.5 h-3.5" /> {bn ? "উত্তোলন" : "Withdraw"}
                  </Button>
                </div>

                {/* Client */}
                {!prefillClientId && (
                  <div>
                    <Label className="text-xs font-bold">{bn ? "গ্রাহক *" : "Client *"}</Label>
                    <Select value={clientId} onValueChange={(v) => { setClientId(v); setSavingsId(""); }}>
                      <SelectTrigger className="mt-1.5 text-sm"><SelectValue placeholder={bn ? "গ্রাহক নির্বাচন" : "Select client"} /></SelectTrigger>
                      <SelectContent>
                        {clientsLoading ? (
                          <SelectItem value="loading" disabled>{bn ? "লোড হচ্ছে..." : "Loading..."}</SelectItem>
                        ) : clients?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{bn ? c.name_bn || c.name_en : c.name_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.client && <p className="text-xs text-destructive mt-1">{errors.client}</p>}
                  </div>
                )}

                {/* Savings Account */}
                {clientId && (
                  <div>
                    <Label className="text-xs font-bold">{bn ? "সঞ্চয় অ্যাকাউন্ট *" : "Savings Account *"}</Label>
                    <Select value={savingsId} onValueChange={setSavingsId}>
                      <SelectTrigger className="mt-1.5 text-sm"><SelectValue placeholder={bn ? "অ্যাকাউন্ট নির্বাচন" : "Select account"} /></SelectTrigger>
                      <SelectContent>
                        {savingsAccounts?.length ? savingsAccounts.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {(s as any).savings_products?.[bn ? "product_name_bn" : "product_name_en"] || s.id.slice(0, 8)} — ৳{s.balance.toLocaleString()}
                          </SelectItem>
                        )) : (
                          <SelectItem value="none" disabled>{bn ? "সক্রিয় অ্যাকাউন্ট নেই" : "No active accounts"}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {errors.savings && <p className="text-xs text-destructive mt-1">{errors.savings}</p>}
                  </div>
                )}

                {/* Balance info */}
                {selectedAccount && (
                  <div className="rounded-lg bg-muted/30 border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">{bn ? "বর্তমান ব্যালেন্স" : "Current Balance"}</p>
                    <p className="text-xl font-bold text-foreground">৳{selectedAccount.balance.toLocaleString()}</p>
                  </div>
                )}

                {/* Amount */}
                <div>
                  <Label className="text-xs font-bold">{bn ? "পরিমাণ (৳)" : "Amount (৳)"} *</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 text-lg font-bold" placeholder="0" min={0} />
                  {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
                </div>

                {/* Preview */}
                {selectedAccount && numAmount > 0 && (
                  <div className={`p-3 rounded-lg border ${isDeposit ? "bg-success/5 border-success/10" : "bg-warning/5 border-warning/10"}`}>
                    <p className="text-xs text-muted-foreground">{bn ? "নতুন ব্যালেন্স" : "New Balance"}</p>
                    <p className={`text-xl font-bold ${!isDeposit && numAmount > selectedAccount.balance ? "text-destructive" : isDeposit ? "text-success" : "text-foreground"}`}>
                      ৳{(isDeposit ? selectedAccount.balance + numAmount : Math.max(0, selectedAccount.balance - numAmount)).toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <Label className="text-xs font-bold">{bn ? "নোটস (ঐচ্ছিক)" : "Notes (Optional)"}</Label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={bn ? "মন্তব্য লিখুন..." : "Add remarks..."} rows={2} className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 mt-1.5" maxLength={500} />
                </div>
              </DrawerBody>
              <DrawerFooter className="flex-row gap-2">
                <Button variant="ghost" onClick={handleClose} className="flex-1">{bn ? "বাতিল" : "Cancel"}</Button>
                <Button onClick={handleNextStep} disabled={!isFormValid} className={`flex-1 gap-1.5 ${isDeposit ? "bg-success hover:bg-success/90 text-success-foreground" : "bg-warning hover:bg-warning/90 text-warning-foreground"}`}>
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

          {/* ═══ PHASE 3: Hold-to-Confirm ═══ */}
          {phase === "confirm" && (
            <motion.div key="confirm" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
              <DrawerBody>
                <div className="rounded-xl bg-background/60 dark:bg-background/40 backdrop-blur-md border border-border/50 p-6 flex flex-col items-center gap-6">
                  <div className="text-center space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      {bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final Confirmation"}
                    </p>
                    <p className={`text-2xl font-bold ${isDeposit ? "text-success" : "text-warning"}`}>
                      {isDeposit ? "+" : "−"}৳{numAmount.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {bn ? (isDeposit ? "সঞ্চয় জমা" : "সঞ্চয় উত্তোলন") : (isDeposit ? "Savings Deposit" : "Savings Withdrawal")}
                    </p>
                    {selectedAccount && (
                      <p className="text-xs text-muted-foreground">
                        {bn ? "নতুন ব্যালেন্স" : "New Balance"}: ৳{(isDeposit ? selectedAccount.balance + numAmount : selectedAccount.balance - numAmount).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-3">
                    <ArcReactorButton
                      onConfirmed={handleExecute}
                      holdDuration={2500}
                      size={110}
                      disabled={submitting}
                      label={bn ? (isDeposit ? "জমা নিশ্চিত করতে ধরে রাখুন" : "উত্তোলন নিশ্চিত করতে ধরে রাখুন") : (isDeposit ? "Hold to confirm deposit" : "Hold to confirm withdrawal")}
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
                  <X className="w-4 h-4" /> {bn ? "ফিরে যান" : "Go Back"}
                </Button>
              </DrawerFooter>
            </motion.div>
          )}

          {/* ═══ PHASE 4: Executing ═══ */}
          {phase === "executing" && (
            <motion.div key="executing" {...vaultTransition} className="flex-1 min-h-0 px-6 py-12 flex flex-col items-center justify-center gap-4">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}>
                <Loader2 className={`w-10 h-10 ${isDeposit ? "text-success" : "text-warning"}`} />
              </motion.div>
              <p className="text-sm font-medium text-muted-foreground">
                {bn ? (isDeposit ? "জমা প্রক্রিয়াকরণ হচ্ছে..." : "উত্তোলন প্রক্রিয়াকরণ হচ্ছে...") : (isDeposit ? "Processing deposit..." : "Processing withdrawal...")}
              </p>
            </motion.div>
          )}

          {/* ═══ PHASE 5: Success + Receipt ═══ */}
          {phase === "success" && successData && (() => {
            const finalPhone = normalizePhone(successData.clientPhone);
            const mockTarget = successData.newBalance === 0 ? 10000 : Math.ceil(successData.newBalance / 50000) * 50000 + 10000;
            const remaining = Math.max(0, mockTarget - successData.newBalance);
            const receiptMsg = isDeposit
              ? `সম্মানিত ${successData.clientName},\nসঞ্চয় জমা ✅ ৳${successData.amount.toLocaleString()}\nমোট: ৳${successData.newBalance.toLocaleString()}${remaining > 0 ? ` বাকি: ৳${remaining.toLocaleString()}` : ""}\n— একতা ফাইন্যান্স`
              : `সম্মানিত ${successData.clientName},\nসঞ্চয় উত্তোলন ✅ ৳${successData.amount.toLocaleString()}\nব্যালেন্স: ৳${successData.newBalance.toLocaleString()}\n— একতা ফাইন্যান্স`;
            const encoded = encodeURIComponent(receiptMsg);
            return (
              <motion.div key="success" {...vaultTransition} className="flex flex-col flex-1 min-h-0">
                <DrawerBody>
                  <div className="space-y-5 py-3">
                    <div className="flex flex-col items-center justify-center text-center space-y-3">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                      </motion.div>
                      <div>
                        <p className="text-lg font-semibold text-foreground">
                          {bn ? (isDeposit ? "জমা সফল!" : "উত্তোলন সফল!") : (isDeposit ? "Deposit Successful!" : "Withdrawal Successful!")}
                        </p>
                        {successData.clientName && <p className="text-sm text-muted-foreground mt-1">{successData.clientName} — {isDeposit ? "+" : "−"}৳{successData.amount.toLocaleString()}</p>}
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3 w-full">
                        <p className="text-xs text-muted-foreground">{bn ? "বর্তমান ব্যালেন্স" : "Current Balance"}</p>
                        <p className="text-2xl font-bold text-primary">৳{successData.newBalance.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-4 border-t border-border/50">
                      {finalPhone && (
                        <div className="flex gap-2 w-full">
                          <Button className="flex-1 gap-2 bg-success hover:bg-success/90 text-success-foreground shadow-lg" onClick={() => window.open(`https://wa.me/${finalPhone}?text=${encoded}`, "_blank")}>
                            <MessageCircle className="w-4 h-4" /> {bn ? "💬 স্মার্ট রসিদ" : "💬 Smart Receipt"}
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
