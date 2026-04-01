import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";
import { generateExitMouPdf } from "@/lib/exit-mou-pdf";
import {
  Shield, AlertTriangle, Calculator, FileText, Clock,
  TrendingDown, TrendingUp, ArrowRight, CheckCircle2, CircleDollarSign,
} from "lucide-react";

interface OwnerExitModalProps {
  open: boolean;
  onClose: () => void;
  owner: {
    id: string;
    name_en: string;
    name_bn: string;
    phone: string;
    created_at: string;
    owner_id?: string;
  };
  totalCapital: number;
  totalProfitEarned: number;
}

type ExitStep = "overview" | "settlement" | "confirm" | "pin" | "processing" | "success";

const VENTURE_YEARS = 15;
const VENTURE_DAYS = VENTURE_YEARS * 365;

const OwnerExitModal = ({ open, onClose, owner, totalCapital, totalProfitEarned }: OwnerExitModalProps) => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [step, setStep] = useState<ExitStep>("overview");
  const [penalty, setPenalty] = useState<number>(0);
  const [bonus, setBonus] = useState<number>(0);
  const [accruedProfit, setAccruedProfit] = useState<number>(0);
  const [nonCompeteMonths, setNonCompeteMonths] = useState<number>(24);
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  // Vesting calculations
  const tenureDays = useMemo(() => {
    const start = new Date(owner.created_at);
    const now = new Date();
    return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }, [owner.created_at]);

  const tenureYears = (tenureDays / 365).toFixed(1);
  const vestingPct = Math.min(100, (tenureDays / VENTURE_DAYS) * 100);
  const vestedCapital = totalCapital * (vestingPct / 100);

  const settlementAmount = totalCapital + totalProfitEarned + accruedProfit;
  const finalPayout = Math.max(0, settlementAmount - penalty + bonus);

  const handleProcessExit = async () => {
    setStep("processing");
    setProcessing(true);

    try {
      // 1. Generate PDF
      const pdfBlob = await generateExitMouPdf({
        ownerName: owner.name_en,
        ownerNameBn: owner.name_bn,
        ownerId: owner.owner_id || owner.id.slice(0, 8),
        phone: owner.phone,
        exitDate: new Date().toISOString().split("T")[0],
        tenureDays,
        totalCapital,
        totalProfitEarned,
        earlyExitPenalty: penalty,
        loyaltyBonus: bonus,
        finalPayout,
        nonCompeteMonths,
      });

      // 2. Upload PDF to legal-vault
      const fileName = `${owner.id}/exit-mou-${Date.now()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("legal-vault")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

      let legalDocUrl: string | null = null;
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("legal-vault").getPublicUrl(fileName);
        legalDocUrl = urlData?.publicUrl ?? null;
      }

      // 3. Call RPC
      const { data, error } = await supabase.rpc("process_owner_exit" as any, {
        _owner_user_id: owner.id,
        _total_capital: totalCapital,
        _total_profit_earned: totalProfitEarned,
        _early_exit_penalty: penalty,
        _loyalty_bonus: bonus,
        _non_compete_months: nonCompeteMonths,
        _notes: notes || null,
        _legal_doc_url: legalDocUrl,
        _accrued_profit: accruedProfit,
      });

      if (error) throw new Error(error.message);

      const result = data as unknown as { status: string; message: string; final_payout: number };
      if (result.status === "error") {
        toast.error(result.message);
        setStep("settlement");
        return;
      }

      setStep("success");
      toast.success(bn ? "মালিকের এক্সিট সেটেলমেন্ট সফল ✅" : "Owner exit settlement processed ✅");
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Exit processing failed";
      toast.error(msg);
      setStep("settlement");
    } finally {
      setProcessing(false);
    }
  };

  const resetAndClose = () => {
    setStep("overview");
    setPenalty(0);
    setBonus(0);
    setAccruedProfit(0);
    setNotes("");
    onClose();
  };

  const isLocked = step === "processing";

  return (
    <>
      <Dialog open={open && step !== "pin"} onOpenChange={isLocked ? undefined : resetAndClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col" onInteractOutside={isLocked ? (e) => e.preventDefault() : undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Shield className="w-5 h-5" />
              {bn ? "মালিক এক্সিট প্রোটোকল" : "Owner Exit Protocol"}
            </DialogTitle>
            <DialogDescription>
              {bn ? "কর্পোরেট-গ্রেড সেটেলমেন্ট ও রোল ট্রানজিশন" : "Corporate-grade settlement & role transition"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 py-2">
            {/* ── STEP 1: Overview ── */}
            {step === "overview" && (
              <div className="space-y-4">
                {/* Identity */}
                <div className="rounded-xl border border-border/50 p-4 bg-muted/30 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{bn ? owner.name_bn : owner.name_en}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{owner.owner_id || owner.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </div>

                {/* Tenure & Vesting */}
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {bn ? "ভেস্টিং স্ট্যাটাস" : "Vesting Status"}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-3 rounded-lg bg-primary/5">
                      <p className="text-2xl font-bold text-primary">{tenureYears}</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{bn ? "বছর সেবা" : "Years Served"}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-success/5">
                      <p className="text-2xl font-bold text-success">{vestingPct.toFixed(1)}%</p>
                      <p className="text-[10px] text-muted-foreground uppercase">{bn ? "ভেস্টেড" : "Vested"}</p>
                    </div>
                  </div>
                  {/* Vesting bar */}
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all duration-500"
                        style={{ width: `${vestingPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right">
                      {tenureDays} / {VENTURE_DAYS} {bn ? "দিন" : "days"} ({VENTURE_YEARS}-{bn ? "বছর পূর্ণ ভেস্টিং" : "year full vesting"})
                    </p>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                    {bn ? "আর্থিক সারসংক্ষেপ" : "Financial Summary"}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{bn ? "মোট মূলধন" : "Total Capital"}</span>
                      <span className="font-bold">৳{totalCapital.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{bn ? "ভেস্টেড মূলধন" : "Vested Capital"}</span>
                      <span className="font-bold text-success">৳{vestedCapital.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{bn ? "মোট মুনাফা" : "Total Profit"}</span>
                      <span className="font-bold">৳{totalProfitEarned.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/50 pt-2">
                      <span className="font-semibold">{bn ? "গ্রস সেটেলমেন্ট" : "Gross Settlement"}</span>
                      <span className="font-bold text-primary">৳{settlementAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                    <p className="text-xs text-warning">
                      {bn
                        ? "এক্সিটের পর এই মালিকের রোল 'Alumni'-তে পরিবর্তন হবে। তারা শুধুমাত্র তাদের ঐতিহাসিক ডেটা দেখতে পারবে।"
                        : "After exit, this owner's role will transition to 'Alumni'. They will only have read-only access to their historical data."}
                    </p>
                  </div>
                </div>

                <Button className="w-full gap-2" onClick={() => setStep("settlement")}>
                  {bn ? "সেটেলমেন্ট ক্যালকুলেটরে যান" : "Proceed to Settlement Calculator"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* ── STEP 2: Settlement Calculator ── */}
            {step === "settlement" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Calculator className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      {bn ? "সেটেলমেন্ট অ্যাডজাস্টমেন্ট" : "Settlement Adjustments"}
                    </h4>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="flex items-center gap-1.5 text-xs mb-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                        {bn ? "আর্লি এক্সিট পেনাল্টি (৳)" : "Early Exit Penalty (৳)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={penalty}
                        onChange={(e) => setPenalty(Number(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {bn
                          ? `${VENTURE_YEARS}-বছর চুক্তির আগে বের হওয়ায় পেনাল্টি`
                          : `Penalty for exiting before the ${VENTURE_YEARS}-year commitment`}
                      </p>
                    </div>

                    <div>
                      <Label className="flex items-center gap-1.5 text-xs mb-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-success" />
                        {bn ? "লয়্যালটি বোনাস (৳)" : "Loyalty Bonus (৳)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={bonus}
                        onChange={(e) => setBonus(Number(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {bn
                          ? "দীর্ঘ সেবা ও অবদানের জন্য বোনাস"
                          : "Bonus for extended service and contributions"}
                      </p>
                    </div>

                    <div>
                      <Label className="flex items-center gap-1.5 text-xs mb-1.5">
                        <CircleDollarSign className="w-3.5 h-3.5 text-primary" />
                        {bn ? "চলতি মাসের জমা মুনাফা (৳)" : "Current Month Accrued Profit (৳)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={accruedProfit || ""}
                        onChange={(e) => setAccruedProfit(Number(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {bn
                          ? "মাসের মাঝে বের হলে অপরিশোধিত প্রো-রাটা মুনাফা যোগ করুন"
                          : "Add unpaid pro-rata profit if exiting mid-month"}
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs mb-1.5 block">
                        {bn ? "নন-কম্পিট সময়কাল (মাস)" : "Non-Compete Period (months)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        value={nonCompeteMonths}
                        onChange={(e) => setNonCompeteMonths(Number(e.target.value) || 0)}
                      />
                    </div>

                    <div>
                      <Label className="text-xs mb-1.5 block">
                        {bn ? "নোটস / মন্তব্য" : "Notes / Remarks"}
                      </Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={bn ? "ঐচ্ছিক নোটস..." : "Optional notes..."}
                        rows={2}
                      />
                    </div>
                  </div>
                </div>

                {/* Final calculation summary */}
                <div className="rounded-xl border-2 border-primary/30 p-4 bg-primary/5 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                    {bn ? "চূড়ান্ত পেআউট সারাংশ" : "Final Payout Summary"}
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{bn ? "গ্রস সেটেলমেন্ট" : "Gross Settlement"}</span>
                      <span className="font-mono">৳{settlementAmount.toLocaleString()}</span>
                    </div>
                    {penalty > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>(-) {bn ? "পেনাল্টি" : "Penalty"}</span>
                        <span className="font-mono">-৳{penalty.toLocaleString()}</span>
                      </div>
                    )}
                    {bonus > 0 && (
                      <div className="flex justify-between text-success">
                        <span>(+) {bn ? "বোনাস" : "Bonus"}</span>
                        <span className="font-mono">+৳{bonus.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-primary/20 pt-2 text-base">
                      <span className="font-bold">{bn ? "চূড়ান্ত পেআউট" : "Final Payout"}</span>
                      <span className="font-bold text-primary text-lg">৳{finalPayout.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("overview")}>
                    {bn ? "পেছনে" : "Back"}
                  </Button>
                  <Button className="flex-1 gap-2" onClick={() => setStep("confirm")}>
                    <FileText className="w-4 h-4" />
                    {bn ? "এক্সিট প্রক্রিয়া শুরু" : "Process Exit"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: Final Confirmation ── */}
            {step === "confirm" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    <h4 className="font-bold text-sm">{bn ? "চূড়ান্ত নিশ্চিতকরণ" : "Final Confirmation"}</h4>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
                    <li>{bn ? "মালিকের রোল 'Alumni'-তে পরিবর্তন হবে" : "Owner role will transition to 'Alumni'"}</li>
                    <li>{bn ? "লাইভ কোম্পানি ডেটায় অ্যাক্সেস বন্ধ হবে" : "Access to live company data will be revoked"}</li>
                    <li>{bn ? `চূড়ান্ত পেআউট: ৳${finalPayout.toLocaleString()}` : `Final payout: ৳${finalPayout.toLocaleString()}`}</li>
                    <li>{bn ? "এক্সিট MoU ও NOC PDF তৈরি হবে" : "Exit MoU & NOC PDF will be auto-generated"}</li>
                    <li>{bn ? `${nonCompeteMonths} মাস নন-কম্পিট বাধ্যতামূলক` : `${nonCompeteMonths}-month non-compete obligation`}</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("settlement")}>
                    {bn ? "পেছনে" : "Back"}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 gap-2"
                    onClick={() => setStep("pin")}
                  >
                    <Shield className="w-4 h-4" />
                    {bn ? "পিন দিয়ে নিশ্চিত করুন" : "Confirm with PIN"}
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 5: Processing ── */}
            {step === "processing" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="relative h-12 w-12">
                  <div
                    className="absolute inset-0 rounded-full animate-spin"
                    style={{
                      background: "conic-gradient(from 0deg, transparent 60%, hsl(var(--primary)))",
                      maskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))",
                      WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px))",
                    }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold">{bn ? "এক্সিট প্রক্রিয়াধীন..." : "Processing Exit..."}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {bn ? "MoU জেনারেট, রোল ট্রানজিশন ও লেজার আপডেট হচ্ছে" : "Generating MoU, transitioning role & updating ledger"}
                  </p>
                </div>
              </div>
            )}

            {/* ── STEP 6: Success ── */}
            {step === "success" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-bold text-success">
                    {bn ? "এক্সিট সেটেলমেন্ট সম্পন্ন" : "Exit Settlement Complete"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {bn
                      ? `${owner.name_bn} এখন Alumni হিসেবে রোল পরিবর্তিত হয়েছে। Exit MoU লিগ্যাল ভল্টে সংরক্ষিত।`
                      : `${owner.name_en} has been transitioned to Alumni role. Exit MoU saved to Legal Vault.`}
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {bn ? "চূড়ান্ত পেআউট" : "Final Payout"}: ৳{finalPayout.toLocaleString()}
                  </p>
                </div>
                <Button
                  className="gap-2"
                  onClick={() => {
                    resetAndClose();
                    navigate("/owners");
                  }}
                >
                  {bn ? "মালিক তালিকায় ফিরুন" : "Return to Owners"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* T-PIN Modal */}
      <TransactionAuthModal
        open={step === "pin"}
        onClose={() => setStep("confirm")}
        onAuthorized={handleProcessExit}
      />
    </>
  );
};

export default OwnerExitModal;
