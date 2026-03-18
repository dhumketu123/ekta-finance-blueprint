import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantId } from "@/hooks/useTenantId";
import { useBusinessRules } from "@/hooks/useBusinessRules";
import { useSmsGateway, buildSmsIntentUri } from "@/hooks/useSmsGateway";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import HoldToConfirmButton from "@/components/ui/HoldToConfirmButton";
import {
  PiggyBank, Sparkles, TrendingUp, CheckCircle2, ChevronRight, ChevronLeft,
  Star, Shield, Clock, Banknote, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  clientPhone?: string | null;
}

interface SavingsProduct {
  id: string;
  product_name_en: string;
  product_name_bn: string;
  frequency: string;
  min_amount: number;
  max_amount: number;
  profit_rate: number;
  product_type: string;
  minimum_balance: number;
  lock_period_days: number;
}

type WizardStep = 1 | 2 | 3;

const FREQ_MAP: Record<string, { en: string; bn: string; perYear: number }> = {
  daily: { en: "Daily", bn: "দৈনিক", perYear: 365 },
  weekly: { en: "Weekly", bn: "সাপ্তাহিক", perYear: 52 },
  monthly: { en: "Monthly", bn: "মাসিক", perYear: 12 },
};

const TYPE_MAP: Record<string, { en: string; bn: string; icon: string }> = {
  general: { en: "General Savings", bn: "সাধারণ সঞ্চয়", icon: "🏦" },
  dps: { en: "DPS (Deposit)", bn: "ডিপিএস (ডিপোজিট)", icon: "📈" },
  fixed: { en: "Fixed Deposit", bn: "স্থায়ী আমানত", icon: "🔒" },
};

export default function CreateSavingsAccountModal({ open, onClose, clientId, clientName, clientPhone }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: gateway } = useSmsGateway();
  const { rules: bizRules } = useBusinessRules();
  const { tenantId } = useTenantId();

  const [step, setStep] = useState<WizardStep>(1);
  const [selectedProduct, setSelectedProduct] = useState<SavingsProduct | null>(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [collectFirstDeposit, setCollectFirstDeposit] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAuthorized, setPinAuthorized] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(false);
  const [newAccountId, setNewAccountId] = useState<string | null>(null);

  // Fetch active savings products
  const { data: products, isLoading } = useQuery({
    queryKey: ["savings_products_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_products")
        .select("id, product_name_en, product_name_bn, frequency, min_amount, max_amount, profit_rate, product_type, minimum_balance, lock_period_days")
        .is("deleted_at", null)
        .order("product_name_en");
      if (error) throw error;
      return (data ?? []) as SavingsProduct[];
    },
    enabled: open,
  });

  // Projection calculations
  const projection = useMemo(() => {
    if (!selectedProduct || depositAmount <= 0) return null;
    const freq = FREQ_MAP[selectedProduct.frequency];
    if (!freq) return null;
    // For DPS products, use tenant dps_interest_rate; otherwise use product rate
    const effectiveRate = selectedProduct.product_type === "dps" && bizRules.dps_interest_rate
      ? bizRules.dps_interest_rate
      : selectedProduct.profit_rate;
    const r = effectiveRate / 100; // annual rate
    const n = freq.perYear; // deposits per year
    const t = 1; // 1 year projection
    const P = depositAmount; // per-period deposit
    const totalDeposited = P * n * t;
    // Future Value of annuity: FV = P * [((1 + r/n)^(n*t) - 1) / (r/n)]
    let maturityValue: number;
    if (r > 0) {
      const rn = r / n;
      maturityValue = P * ((Math.pow(1 + rn, n * t) - 1) / rn);
    } else {
      maturityValue = totalDeposited;
    }
    const projectedProfit = maturityValue - totalDeposited;
    return { totalDeposited, projectedProfit, maturityValue };
  }, [selectedProduct, depositAmount]);

  const resetState = useCallback(() => {
    setStep(1);
    setSelectedProduct(null);
    setDepositAmount(0);
    setCollectFirstDeposit(false);
    setPinOpen(false);
    setPinAuthorized(false);
    setExecuting(false);
    setDone(false);
    setNewAccountId(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleProductSelect = useCallback((p: SavingsProduct) => {
    setSelectedProduct(p);
    setDepositAmount(p.min_amount || 100);
    setStep(2);
  }, []);

  const handleProceedToConfirm = useCallback(() => {
    setStep(3);
  }, []);

  const handleInitiateExecution = useCallback(() => {
    setPinOpen(true);
  }, []);

  const handlePinAuthorized = useCallback(() => {
    setPinAuthorized(true);
    setPinOpen(false);
  }, []);

  const executeAccountCreation = useCallback(async () => {
    if (!selectedProduct || !user) return;
    setExecuting(true);
    try {
      // 1. Insert savings account
      const insertPayload: any = {
          client_id: clientId,
          savings_product_id: selectedProduct.id,
          balance: 0,
          status: "active",
          notes: `Opened via wizard. Product: ${selectedProduct.product_name_en}`,
        };
      if (tenantId) insertPayload.tenant_id = tenantId;

      const { data: newAccount, error: accErr } = await supabase
        .from("savings_accounts")
        .insert(insertPayload as any)
        .select("id")
        .single();
      if (accErr) throw accErr;

      setNewAccountId(newAccount.id);

      // 2. If first deposit toggle is ON, create pending transaction
      if (collectFirstDeposit && depositAmount > 0) {
        const refId = `SAV_OPEN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { error: txErr } = await supabase
          .from("pending_transactions")
          .insert({
            type: "savings_deposit" as any,
            reference_id: refId,
            amount: depositAmount,
            client_id: clientId,
            savings_id: newAccount.id,
            submitted_by: user.id,
            notes: bn ? "অ্যাকাউন্ট খোলার প্রথম জমা" : "Initial deposit on account opening",
          });
        if (txErr) throw txErr;
      }

      // 3. Success!
      setDone(true);
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true });

      // Invalidate queries
      qc.invalidateQueries({ queryKey: ["savings-accounts-all"] });
      qc.invalidateQueries({ queryKey: ["pending_transactions"] });
      qc.invalidateQueries({ queryKey: ["client_savings_modal"] });

      toast.success(bn ? "সঞ্চয় অ্যাকাউন্ট সফলভাবে খোলা হয়েছে! 🎉" : "Savings account opened successfully! 🎉");
    } catch (err: any) {
      toast.error(err.message || "Failed to create account");
      setExecuting(false);
    }
  }, [selectedProduct, user, clientId, collectFirstDeposit, depositAmount, bn, qc]);

  // SMS logic
  const handleSendWelcomeSms = useCallback(() => {
    if (!clientPhone || !selectedProduct) return;
    const freqLabel = FREQ_MAP[selectedProduct.frequency]?.[bn ? "bn" : "en"] ?? selectedProduct.frequency;
    const msg = bn
      ? `প্রিয় ${clientName}, আপনার "${selectedProduct.product_name_bn}" সঞ্চয় অ্যাকাউন্ট সফলভাবে খোলা হয়েছে। ${freqLabel} জমার পরিমাণ: ৳${depositAmount.toLocaleString()}। ধন্যবাদ — একতা ফাইন্যান্স`
      : `Dear ${clientName}, your "${selectedProduct.product_name_en}" savings account has been opened. ${freqLabel} deposit: ৳${depositAmount.toLocaleString()}. Thank you — Ekta Finance`;

    if (gateway?.mode === "mobile_native" || !gateway?.active) {
      const uri = buildSmsIntentUri(clientPhone, msg);
      window.open(uri, "_blank");
    } else {
      toast.info(bn ? "SMS পাঠানো হচ্ছে..." : "Sending SMS...");
      // API mode would go through edge function
    }
  }, [clientPhone, selectedProduct, clientName, depositAmount, bn, gateway]);

  const freqInfo = selectedProduct ? FREQ_MAP[selectedProduct.frequency] : null;
  const typeInfo = selectedProduct ? (TYPE_MAP[selectedProduct.product_type] ?? TYPE_MAP.general) : null;

  return (
    <>
      <Dialog open={open && !pinOpen} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent
          className="sm:max-w-lg p-0 gap-0 overflow-hidden border-0"
          style={{
            background: "hsl(var(--card) / 0.92)",
            backdropFilter: "blur(20px) saturate(1.6)",
            WebkitBackdropFilter: "blur(20px) saturate(1.6)",
            boxShadow: "0 24px 80px -16px hsl(var(--primary) / 0.2), 0 0 0 1px hsl(var(--border) / 0.5)",
          }}
          hideClose={done}
        >
          {/* Progress bar */}
          {!done && (
            <div className="flex gap-1 p-3 pb-0">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-muted">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: step >= s ? "100%" : "0%" }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ═══ STEP 1: Select Product ═══ */}
            {step === 1 && !done && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                className="p-5 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <PiggyBank className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {bn ? "সঞ্চয় পণ্য নির্বাচন করুন" : "Choose Savings Product"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {bn ? `${clientName} — নতুন অ্যাকাউন্ট` : `${clientName} — New Account`}
                    </p>
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : !products?.length ? (
                  <div className="text-center py-8">
                    <PiggyBank className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {bn ? "কোনো সঞ্চয় পণ্য পাওয়া যায়নি" : "No savings products found"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {products.map((p) => {
                      const fInfo = FREQ_MAP[p.frequency];
                      const tInfo = TYPE_MAP[p.product_type] ?? TYPE_MAP.general;
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleProductSelect(p)}
                          className="w-full text-left p-4 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">{tInfo.icon}</span>
                              <div>
                                <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                  {bn ? p.product_name_bn || p.product_name_en : p.product_name_en}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success font-semibold border border-success/20">
                                    {fInfo?.bn ?? p.frequency}
                                  </span>
                                  {p.profit_rate > 0 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
                                      {p.profit_rate}% {bn ? "মুনাফা" : "profit"}
                                    </span>
                                  )}
                                  {p.lock_period_days > 0 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-semibold border border-warning/20">
                                      <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                                      {p.lock_period_days}d lock
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  ৳{p.min_amount.toLocaleString()} — ৳{p.max_amount > 0 ? p.max_amount.toLocaleString() : "∞"}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* ═══ STEP 2: Wealth Calculator ═══ */}
            {step === 2 && !done && selectedProduct && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                className="p-5 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {bn ? "সম্পদ ক্যালকুলেটর" : "Wealth Calculator"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {bn ? (selectedProduct.product_name_bn || selectedProduct.product_name_en) : selectedProduct.product_name_en}
                    </p>
                  </div>
                </div>

                {/* Deposit amount slider */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      {bn ? `${freqInfo?.bn} জমার পরিমাণ` : `${freqInfo?.en} Deposit Amount`}
                    </Label>
                    <span className="text-lg font-extrabold text-primary">৳{depositAmount.toLocaleString()}</span>
                  </div>
                  <Slider
                    min={selectedProduct.min_amount || 10}
                    max={selectedProduct.max_amount > 0 ? selectedProduct.max_amount : 100000}
                    step={selectedProduct.min_amount >= 100 ? 100 : 10}
                    value={[depositAmount]}
                    onValueChange={([v]) => setDepositAmount(v)}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>৳{(selectedProduct.min_amount || 10).toLocaleString()}</span>
                    <span>৳{(selectedProduct.max_amount > 0 ? selectedProduct.max_amount : 100000).toLocaleString()}</span>
                  </div>
                </div>

                {/* Future Projection Card */}
                {projection && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 border border-success/30"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--success) / 0.08), hsl(var(--success) / 0.02))",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-success" />
                      <p className="text-xs font-bold text-success">
                        {bn ? "১ বছরের প্রজেকশন" : "1-Year Projection"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">{bn ? "মোট জমা" : "Total Saved"}</p>
                        <p className="text-sm font-bold text-foreground">৳{Math.round(projection.totalDeposited).toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">{bn ? "প্রত্যাশিত মুনাফা" : "Est. Profit"}</p>
                        <p className="text-sm font-bold text-primary">৳{Math.round(projection.projectedProfit).toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">{bn ? "পরিপক্ক মূল্য" : "Maturity Value"}</p>
                        <p className="text-lg font-extrabold text-success">৳{Math.round(projection.maturityValue).toLocaleString()}</p>
                      </div>
                    </div>
                    {selectedProduct.profit_rate > 0 && (
                      <p className="text-[10px] text-muted-foreground text-center mt-2">
                        * {bn ? `${selectedProduct.profit_rate}% বার্ষিক হারে গণনা করা হয়েছে` : `Calculated at ${selectedProduct.profit_rate}% annual rate`}
                      </p>
                    )}
                  </motion.div>
                )}

                {/* Navigation */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                    {bn ? "পিছনে" : "Back"}
                  </Button>
                  <Button size="sm" className="flex-1 gap-1.5 text-xs" onClick={handleProceedToConfirm}>
                    {bn ? "পরবর্তী ধাপ" : "Next Step"}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 3: Setup & Confirm ═══ */}
            {step === 3 && !done && selectedProduct && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.25 }}
                className="p-5 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {bn ? "নিশ্চিতকরণ" : "Confirmation"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {bn ? "বিবরণ যাচাই করুন" : "Review details before opening"}
                    </p>
                  </div>
                </div>

                {/* Summary card */}
                <div className="rounded-xl p-4 border border-border bg-muted/30 space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{bn ? "গ্রাহক" : "Client"}</span>
                    <span className="font-bold">{clientName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{bn ? "পণ্য" : "Product"}</span>
                    <span className="font-bold">
                      {bn ? (selectedProduct.product_name_bn || selectedProduct.product_name_en) : selectedProduct.product_name_en}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{bn ? "ফ্রিকোয়েন্সি" : "Frequency"}</span>
                    <span className="font-semibold">{freqInfo?.[bn ? "bn" : "en"]}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{bn ? "জমার পরিমাণ" : "Deposit"}</span>
                    <span className="font-bold text-primary">৳{depositAmount.toLocaleString()}</span>
                  </div>
                  {selectedProduct.profit_rate > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bn ? "মুনাফার হার" : "Profit Rate"}</span>
                      <span className="font-semibold text-success">{selectedProduct.profit_rate}%</span>
                    </div>
                  )}
                </div>

                {/* First deposit toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-success/5">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-success" />
                    <Label className="text-xs font-semibold cursor-pointer">
                      {bn ? "আজকের প্রথম জমা এখনই গ্রহণ করুন" : "Collect first deposit now"}
                    </Label>
                  </div>
                  <Switch checked={collectFirstDeposit} onCheckedChange={setCollectFirstDeposit} />
                </div>
                {collectFirstDeposit && (
                  <p className="text-[10px] text-muted-foreground px-1">
                    {bn
                      ? `৳${depositAmount.toLocaleString()} অনুমোদনের জন্য জমা হবে`
                      : `৳${depositAmount.toLocaleString()} will be submitted for approval`}
                  </p>
                )}

                {/* Action area */}
                {!pinAuthorized ? (
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setStep(2)}>
                      <ChevronLeft className="w-3.5 h-3.5" />
                      {bn ? "পিছনে" : "Back"}
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5 text-xs bg-success hover:bg-success/90 text-success-foreground" onClick={handleInitiateExecution}>
                      <Shield className="w-3.5 h-3.5" />
                      {bn ? "PIN দিয়ে নিশ্চিত করুন" : "Confirm with PIN"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <p className="text-xs text-muted-foreground text-center">
                      {bn ? "অ্যাকাউন্ট খুলতে বোতামটি ধরে রাখুন" : "Hold the button to open account"}
                    </p>
                    <HoldToConfirmButton
                      onConfirmed={executeAccountCreation}
                      disabled={executing}
                      label={bn ? "ধরে রাখুন" : "Hold to confirm"}
                    />
                    {executing && (
                      <p className="text-xs text-muted-foreground animate-pulse">
                        {bn ? "অ্যাকাউন্ট তৈরি হচ্ছে..." : "Creating account..."}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ═══ SUCCESS SCREEN ═══ */}
            {done && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, type: "spring" }}
                className="p-8 flex flex-col items-center gap-4"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-10 h-10 text-success" />
                </motion.div>

                <div className="text-center">
                  <h2 className="text-lg font-extrabold text-foreground">
                    {bn ? "অভিনন্দন! 🎉" : "Congratulations! 🎉"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {bn ? "সঞ্চয় অ্যাকাউন্ট সফলভাবে খোলা হয়েছে" : "Savings account opened successfully"}
                  </p>
                </div>

                <div className="w-full rounded-xl p-4 border border-success/30 bg-success/5 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{bn ? "পণ্য" : "Product"}</span>
                    <span className="font-bold">
                      {bn ? (selectedProduct?.product_name_bn || selectedProduct?.product_name_en) : selectedProduct?.product_name_en}
                    </span>
                  </div>
                  {collectFirstDeposit && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bn ? "প্রথম জমা" : "First Deposit"}</span>
                      <span className="font-bold text-success">৳{depositAmount.toLocaleString()} ⏳</span>
                    </div>
                  )}
                  {projection && selectedProduct?.profit_rate && selectedProduct.profit_rate > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{bn ? "১ বছরে" : "In 1 Year"}</span>
                      <span className="font-extrabold text-success text-sm">৳{Math.round(projection.maturityValue).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 w-full">
                  {clientPhone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      onClick={handleSendWelcomeSms}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {bn ? "স্বাগত SMS" : "Welcome SMS"}
                    </Button>
                  )}
                  <Button size="sm" className="flex-1 gap-1.5 text-xs" onClick={handleClose}>
                    <Star className="w-3.5 h-3.5" />
                    {bn ? "সম্পন্ন" : "Done"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* PIN Auth Modal */}
      <TransactionAuthModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onAuthorized={handlePinAuthorized}
      />
    </>
  );
}
