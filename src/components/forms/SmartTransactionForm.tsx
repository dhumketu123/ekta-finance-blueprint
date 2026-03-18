import { useState, useEffect, useRef } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, ArrowDownCircle, ArrowUpCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useSubmitFinancialTransaction,
  TX_TYPE_LABELS,
  MANUAL_TYPES,
  type FinTransactionType,
} from "@/hooks/useFinancialTransactions";
import { toast } from "sonner";

type CashDirection = "cash_in" | "cash_out";

const CASH_IN_TYPES: { type: FinTransactionType; icon: string }[] = [
  { type: "savings_deposit", icon: "💰" },
  { type: "loan_repayment", icon: "📥" },
  { type: "admission_fee", icon: "📋" },
  { type: "share_capital_deposit", icon: "🏦" },
  { type: "insurance_premium", icon: "🛡️" },
];

const CASH_OUT_TYPES: { type: FinTransactionType; icon: string }[] = [
  { type: "loan_disbursement", icon: "💸" },
  { type: "savings_withdrawal", icon: "📤" },
  { type: "insurance_claim_payout", icon: "🏥" },
  { type: "adjustment_entry", icon: "⚙️" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  prefillClientId?: string;
}

// Duplicate submission guard — 3 second cooldown
let lastSubmitTime = 0;

export default function SmartTransactionForm({ open, onClose, prefillClientId }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const submitMut = useSubmitFinancialTransaction();

  const [direction, setDirection] = useState<CashDirection | "">("");
  const [txType, setTxType] = useState<FinTransactionType | "">("");
  const [memberId, setMemberId] = useState(prefillClientId || "");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [notes, setNotes] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const recognitionRef = useRef<any>(null);

  // Load clients
  const { data: clients } = useQuery({
    queryKey: ["clients_smart_tx"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name_en, name_bn, member_id, phone")
        .is("deleted_at", null)
        .order("name_en");
      return data ?? [];
    },
  });

  // Load loans for selected client
  const { data: clientLoans } = useQuery({
    queryKey: ["smart_tx_loans", memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loans")
        .select("id, loan_id, outstanding_principal, status")
        .eq("client_id", memberId)
        .eq("status", "active")
        .is("deleted_at", null);
      return data ?? [];
    },
    enabled: !!memberId && (txType === "loan_repayment" || txType === "loan_disbursement"),
  });

  // Load savings for selected client
  const { data: clientSavings } = useQuery({
    queryKey: ["smart_tx_savings", memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from("savings_accounts")
        .select("id, balance, status")
        .eq("client_id", memberId)
        .eq("status", "active")
        .is("deleted_at", null);
      return data ?? [];
    },
    enabled: !!memberId && (txType === "savings_deposit" || txType === "savings_withdrawal"),
  });

  const subTypes = direction === "cash_in" ? CASH_IN_TYPES : direction === "cash_out" ? CASH_OUT_TYPES : [];
  const needsAccount = ["loan_repayment", "loan_disbursement", "savings_deposit", "savings_withdrawal"].includes(txType);
  const isLoanType = txType === "loan_repayment" || txType === "loan_disbursement";
  const accounts = isLoanType ? clientLoans : clientSavings;

  // Reset downstream when direction changes
  useEffect(() => { setTxType(""); setMemberId(prefillClientId || ""); setAccountId(""); setAmount(""); setLateFee(""); }, [direction, prefillClientId]);
  useEffect(() => { setAccountId(""); }, [memberId, txType]);

  // ── Voice Ledger (Web Speech API) — Enhanced multi-amount parsing ──
  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error(bn ? "আপনার ব্রাউজার ভয়েস সাপোর্ট করে না" : "Voice not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); toast.error(bn ? "ভয়েস ইনপুট ব্যর্থ" : "Voice input failed"); };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setVoiceText(transcript);
      parseVoiceInput(transcript);
    };

    recognition.start();
  };

  const stopVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  };

  const parseVoiceInput = (text: string) => {
    const lowerText = text.toLowerCase();

    // ── Global match for all numbers ──
    const numbers = text.match(/\d+/g);

    // ── Detect transaction type with priority order ──
    const loanKeywords = ["কিস্তি", "installment", "পরিশোধ", "repayment", "ঋণ", "loan"];
    const savingsKeywords = ["জমা", "deposit", "সঞ্চয়", "savings"];
    const lateFeeKeywords = ["জরিমানা", "late", "fee", "ফি", "বিলম্ব", "লেট"];
    const cashOutKeywords = ["বিতরণ", "disbursement", "উত্তোলন", "withdrawal", "খরচ", "expense"];

    const isLoan = loanKeywords.some(k => lowerText.includes(k));
    const isSavings = savingsKeywords.some(k => lowerText.includes(k));
    const isLateFee = lateFeeKeywords.some(k => lowerText.includes(k));
    const isCashOut = cashOutKeywords.some(k => lowerText.includes(k));

    // Priority: 1) loan_repayment 2) savings_deposit 3) late_fee 4) fallback cash_in
    if (isLoan) {
      setDirection("cash_in");
      setTxType("loan_repayment");
    } else if (isSavings) {
      setDirection("cash_in");
      setTxType("savings_deposit");
    } else if (isCashOut) {
      setDirection("cash_out");
    } else {
      setDirection("cash_in");
    }

    // ── Parse amounts: if late fee detected, split amounts ──
    if (numbers && numbers.length > 0) {
      if (isLateFee && numbers.length >= 2) {
        // First number = installment, second = late fee
        setAmount(numbers[0]);
        setLateFee(numbers[1]);
      } else if (isLateFee && numbers.length === 1) {
        setLateFee(numbers[0]);
      } else {
        setAmount(numbers[0]);
        if (numbers.length >= 2 && isLoan) {
          setLateFee(numbers[1]); // second number as late fee
        }
      }
    }

    // ── Match client name ──
    if (clients) {
      const matched = clients.find(
        (c) =>
          lowerText.includes(c.name_en.toLowerCase()) ||
          lowerText.includes(c.name_bn.toLowerCase())
      );
      if (matched) setMemberId(matched.id);
    }

    setNotes(text);
  };

  const handleSubmit = () => {
    // Rate limit: prevent duplicate within 3 seconds
    const now = Date.now();
    if (now - lastSubmitTime < 3000) {
      toast.error(bn ? "অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন" : "Please wait before submitting again");
      return;
    }

    if (!txType || !amount || Number(amount) <= 0) {
      toast.error(bn ? "ধরন ও পরিমাণ আবশ্যক" : "Type and amount required");
      return;
    }

    // Account validation: block submit if account required but missing
    if (needsAccount && !accountId) {
      toast.error(bn ? "অ্যাকাউন্ট নির্বাচন আবশ্যক" : "Account selection required");
      return;
    }

    lastSubmitTime = now;

    const totalAmount = Number(amount) + (Number(lateFee) || 0);

    submitMut.mutate(
      {
        transaction_type: txType as FinTransactionType,
        amount: totalAmount,
        member_id: memberId || undefined,
        account_id: accountId || undefined,
        notes: lateFee ? `${notes || ""} [Late Fee: ৳${lateFee}]`.trim() : notes || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          setDirection("");
          setTxType("");
          setMemberId("");
          setAccountId("");
          setAmount("");
          setLateFee("");
          setNotes("");
          setVoiceText("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            {bn ? "স্মার্ট লেনদেন" : "Smart Transaction"}
            <Button
              size="sm"
              variant={listening ? "destructive" : "outline"}
              className="ml-auto h-8 text-xs gap-1.5"
              onClick={listening ? stopVoice : startVoice}
            >
              {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {listening ? (bn ? "বন্ধ করুন" : "Stop") : (bn ? "ভয়েস ইনপুট" : "Voice Input")}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {voiceText && (
          <div className="p-2 rounded-lg bg-accent/30 border border-accent/50 text-xs">
            <span className="font-medium">{bn ? "ভয়েস:" : "Voice:"}</span> {voiceText}
          </div>
        )}

        <div className="space-y-4">
          {/* Step 1: Cash Direction */}
          <div>
            <Label className="text-xs font-semibold mb-2 block">{bn ? "ক্যাশ দিক" : "Cash Direction"} *</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDirection("cash_in")}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  direction === "cash_in"
                    ? "border-success bg-success/10 shadow-sm"
                    : "border-border hover:border-success/50 hover:bg-success/5"
                }`}
              >
                <ArrowDownCircle className={`w-6 h-6 ${direction === "cash_in" ? "text-success" : "text-muted-foreground"}`} />
                <div className="text-left">
                  <p className="text-sm font-semibold">{bn ? "ক্যাশ ইন" : "Cash In"}</p>
                  <p className="text-[10px] text-muted-foreground">{bn ? "জমা / আদায়" : "Receipts"}</p>
                </div>
              </button>
              <button
                onClick={() => setDirection("cash_out")}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                  direction === "cash_out"
                    ? "border-destructive bg-destructive/10 shadow-sm"
                    : "border-border hover:border-destructive/50 hover:bg-destructive/5"
                }`}
              >
                <ArrowUpCircle className={`w-6 h-6 ${direction === "cash_out" ? "text-destructive" : "text-muted-foreground"}`} />
                <div className="text-left">
                  <p className="text-sm font-semibold">{bn ? "ক্যাশ আউট" : "Cash Out"}</p>
                  <p className="text-[10px] text-muted-foreground">{bn ? "বিতরণ / খরচ" : "Payments"}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Sub-type */}
          {direction && (
            <div>
              <Label className="text-xs font-semibold mb-2 block">{bn ? "লেনদেনের ধরন" : "Transaction Type"} *</Label>
              <div className="grid grid-cols-2 gap-2">
                {subTypes.map(({ type, icon }) => {
                  const label = TX_TYPE_LABELS[type];
                  const isManual = MANUAL_TYPES.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => setTxType(type)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all text-xs ${
                        txType === type
                          ? "border-primary bg-primary/10 shadow-sm font-semibold"
                          : "border-border hover:border-primary/40 hover:bg-primary/5"
                      }`}
                    >
                      <span className="text-base">{icon}</span>
                      <span>{bn ? label?.bn : label?.en}</span>
                      {isManual && <AlertTriangle className="w-3 h-3 text-warning ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Member */}
          {txType && (
            <div>
              <Label className="text-xs">{bn ? "সদস্য" : "Member"} {needsAccount ? "*" : ""}</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder={bn ? "সদস্য নির্বাচন" : "Select member"} />
                </SelectTrigger>
                <SelectContent>
                  {(clients ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {bn ? c.name_bn || c.name_en : c.name_en}
                      {c.member_id && ` (${c.member_id})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 4: Account (Loan/Savings) */}
          {txType && memberId && needsAccount && (
            <div>
              <Label className="text-xs">{isLoanType ? (bn ? "ঋণ" : "Loan") : (bn ? "সঞ্চয়" : "Savings")} *</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder={bn ? "নির্বাচন করুন" : "Select account"} />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {isLoanType
                        ? `${a.loan_id ?? a.id.slice(0, 8)} — ৳${a.outstanding_principal?.toLocaleString()}`
                        : `৳${a.balance?.toLocaleString()}`}
                    </SelectItem>
                  ))}
                  {(!accounts || accounts.length === 0) && (
                    <SelectItem value="none" disabled className="text-xs">
                      {bn ? "কোনো একাউন্ট নেই" : "No accounts found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 5: Amount + Late Fee */}
          {txType && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{bn ? "পরিমাণ ৳" : "Amount ৳"} *</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="text-base font-bold"
                />
              </div>
              {(txType === "loan_repayment") && (
                <div>
                  <Label className="text-xs">{bn ? "জরিমানা ৳" : "Late Fee ৳"}</Label>
                  <Input
                    type="number"
                    value={lateFee}
                    onChange={(e) => setLateFee(e.target.value)}
                    placeholder="0"
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* Total display when late fee present */}
          {txType && lateFee && Number(lateFee) > 0 && (
            <div className="flex justify-between items-center p-2 rounded-lg bg-primary/5 text-xs">
              <span className="text-muted-foreground">{bn ? "মোট" : "Total"}</span>
              <span className="font-bold text-primary">৳{(Number(amount || 0) + Number(lateFee)).toLocaleString()}</span>
            </div>
          )}

          {/* Step 6: Notes */}
          {txType && (
            <div>
              <Label className="text-xs">{bn ? "নোট" : "Notes"}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
          )}

          {/* Manual warning */}
          {txType && MANUAL_TYPES.includes(txType as FinTransactionType) && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{bn ? "ম্যানুয়াল অনুমোদন ও কারণ প্রয়োজন" : "Requires manual approval with reason"}</span>
            </div>
          )}

          {/* Submit */}
          {txType && (
            <Button onClick={handleSubmit} disabled={submitMut.isPending} className="w-full text-sm">
              {submitMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {bn ? "লেনদেন জমা দিন" : "Submit Transaction"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
