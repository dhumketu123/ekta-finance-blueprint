import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingDown, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessRules } from "@/hooks/useBusinessRules";

interface Props {
  open: boolean;
  onClose: () => void;
  preselectedLoanId?: string;
}

export default function EarlySettlementCalculator({ open, onClose, preselectedLoanId }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { rules: bizRules, isLoading: configLoading } = useBusinessRules();

  const [loanId, setLoanId] = useState(preselectedLoanId ?? "");

  const { data: activeLoans } = useQuery({
    queryKey: ["active_loans_settlement"],
    queryFn: async () => {
      const { data } = await supabase
        .from("loans")
        .select("id, loan_id, client_id, total_principal, total_interest, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, disbursement_date, maturity_date, loan_model, clients(name_en, name_bn)")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const selectedLoan = activeLoans?.find((l: any) => l.id === loanId) as any;

  // Config-driven calculation (no hardcoded values)
  const calculateSettlement = () => {
    if (!selectedLoan || configLoading) return null;

    const outstandingPrincipal = selectedLoan.outstanding_principal || 0;
    const outstandingInterest = selectedLoan.outstanding_interest || 0;
    const penalty = selectedLoan.penalty_amount || 0;
    const totalInterest = selectedLoan.total_interest || 0;

    // Fetch from unified business rules (tenant_rules > quantum config > defaults)
    const rebateFlat = bizRules.loan_rebate_flat;
    const rebateReducing = bizRules.loan_rebate_reducing;
    const processingFeePercent = bizRules.processing_fee_percent;
    const gracePeriodDays = bizRules.grace_period_days;
    const minimumNoticeDays = bizRules.minimum_notice_days;

    const paidInterest = totalInterest - outstandingInterest;
    const rebatePercent = selectedLoan.loan_model === "reducing" ? rebateReducing : rebateFlat;
    const interestRebate = Math.round(outstandingInterest * (rebatePercent / 100));

    // Grace period adjustment for penalty
    const penaltyWaiver = gracePeriodDays > 0 ? Math.min(penalty, penalty * (gracePeriodDays / 30)) : 0;

    // Processing fee
    const processingFee = Math.round(outstandingPrincipal * (processingFeePercent / 100));

    const adjustedInterest = outstandingInterest - interestRebate;
    const adjustedPenalty = penalty - penaltyWaiver;
    const settlementAmount = outstandingPrincipal + adjustedInterest + adjustedPenalty + processingFee;
    const totalSavings = interestRebate + penaltyWaiver;

    return {
      outstandingPrincipal,
      outstandingInterest,
      penalty,
      interestRebate,
      penaltyWaiver,
      adjustedInterest,
      adjustedPenalty,
      processingFee,
      settlementAmount,
      totalSavings,
      paidInterest,
      rebatePercent,
      gracePeriodDays,
      minimumNoticeDays,
      processingFeePercent,
    };
  };

  const result = calculateSettlement();

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="text-sm font-bold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            {bn ? "তাড়াতাড়ি পরিশোধ ক্যালকুলেটর" : "Early Settlement Calculator"}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>

        {configLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* Loan Selection */}
            <div>
              <Label className="text-xs">{bn ? "ঋণ নির্বাচন" : "Select Loan"} *</Label>
              <Select value={loanId} onValueChange={setLoanId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder={bn ? "ঋণ নির্বাচন করুন" : "Select a loan"} />
                </SelectTrigger>
                <SelectContent>
                  {(activeLoans ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.id} className="text-xs">
                      {l.loan_id || l.id.slice(0, 8)} — {bn ? l.clients?.name_bn : l.clients?.name_en} — ৳{l.outstanding_principal?.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Config info */}
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {bn ? `ছাড়: ${result?.rebatePercent ?? 0}%` : `Rebate: ${result?.rebatePercent ?? 0}%`}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {bn ? `গ্রেস: ${bizRules.grace_period_days} দিন` : `Grace: ${bizRules.grace_period_days} days`}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {bn ? `প্রসেসিং: ${bizRules.processing_fee_percent}%` : `Processing: ${bizRules.processing_fee_percent}%`}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {bn ? `নোটিস: ${bizRules.minimum_notice_days} দিন` : `Notice: ${bizRules.minimum_notice_days} days`}
              </span>
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-3 mt-4">
                <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                  <Row label={bn ? "বকেয়া মূলধন" : "Outstanding Principal"} value={result.outstandingPrincipal} />
                  <Row label={bn ? "বকেয়া সুদ" : "Outstanding Interest"} value={result.outstandingInterest} />
                  <Row label={bn ? "জরিমানা" : "Penalty"} value={result.penalty} />
                  {result.processingFee > 0 && (
                    <Row label={bn ? "প্রসেসিং ফি" : "Processing Fee"} value={result.processingFee} />
                  )}
                </div>

                {result.totalSavings > 0 && (
                  <div className="p-3 rounded-xl bg-success/10 border border-success/30 space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="w-3.5 h-3.5 text-success" />
                      <span className="text-xs font-bold text-success">{bn ? "ছাড় / সঞ্চয়" : "Rebate / Savings"}</span>
                    </div>
                    {result.interestRebate > 0 && (
                      <Row label={bn ? `সুদ ছাড় (${result.rebatePercent}%)` : `Interest Rebate (${result.rebatePercent}%)`} value={-result.interestRebate} isDiscount />
                    )}
                    {result.penaltyWaiver > 0 && (
                      <Row label={bn ? "জরিমানা মওকুফ" : "Penalty Waiver"} value={-result.penaltyWaiver} isDiscount />
                    )}
                  </div>
                )}

                <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{bn ? "মোট পরিশোধযোগ্য" : "Settlement Amount"}</span>
                    <span className="text-xl font-bold text-primary">৳{result.settlementAmount.toLocaleString()}</span>
                  </div>
                  {result.totalSavings > 0 && (
                    <p className="text-xs text-success mt-1">
                      {bn ? `আপনি ৳${result.totalSavings.toLocaleString()} সাশ্রয় করবেন` : `You save ৳${result.totalSavings.toLocaleString()}`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value, isDiscount = false }: { label: string; value: number; isDiscount?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${isDiscount ? "text-success" : ""}`}>
        {isDiscount ? "-" : ""}৳{Math.abs(value).toLocaleString()}
      </span>
    </div>
  );
}
