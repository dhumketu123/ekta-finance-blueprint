import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function EarlySettlementCalculator({ open, onClose }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const [loanId, setLoanId] = useState("");
  const [graceDays, setGraceDays] = useState("0");

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

  // Calculate early settlement
  const calculateSettlement = () => {
    if (!selectedLoan) return null;

    const outstandingPrincipal = selectedLoan.outstanding_principal || 0;
    const outstandingInterest = selectedLoan.outstanding_interest || 0;
    const penalty = selectedLoan.penalty_amount || 0;
    const totalInterest = selectedLoan.total_interest || 0;

    // Interest rebate calculation
    // If settling early, remaining unpaid interest gets a discount
    const paidInterest = totalInterest - outstandingInterest;
    const interestRebate = selectedLoan.loan_model === "reducing"
      ? Math.round(outstandingInterest * 0.5) // 50% rebate on reducing balance
      : Math.round(outstandingInterest * 0.3); // 30% rebate on flat

    // Grace period adjustment
    const grace = Number(graceDays) || 0;
    const penaltyWaiver = grace > 0 ? Math.min(penalty, penalty * (grace / 30)) : 0;

    const adjustedInterest = outstandingInterest - interestRebate;
    const adjustedPenalty = penalty - penaltyWaiver;
    const settlementAmount = outstandingPrincipal + adjustedInterest + adjustedPenalty;
    const totalSavings = interestRebate + penaltyWaiver;

    return {
      outstandingPrincipal,
      outstandingInterest,
      penalty,
      interestRebate,
      penaltyWaiver,
      adjustedInterest,
      adjustedPenalty,
      settlementAmount,
      totalSavings,
      paidInterest,
    };
  };

  const result = calculateSettlement();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            {bn ? "তাড়াতাড়ি পরিশোধ ক্যালকুলেটর" : "Early Settlement Calculator"}
          </DialogTitle>
        </DialogHeader>

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

          {/* Grace Period */}
          <div>
            <Label className="text-xs">{bn ? "গ্রেস পিরিয়ড (দিন)" : "Grace Period (days)"}</Label>
            <Input type="number" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} className="text-sm" placeholder="0" />
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-3 mt-4">
              <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                <Row label={bn ? "বকেয়া মূলধন" : "Outstanding Principal"} value={result.outstandingPrincipal} />
                <Row label={bn ? "বকেয়া সুদ" : "Outstanding Interest"} value={result.outstandingInterest} />
                <Row label={bn ? "জরিমানা" : "Penalty"} value={result.penalty} />
              </div>

              {result.totalSavings > 0 && (
                <div className="p-3 rounded-xl bg-success/10 border border-success/30 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-3.5 h-3.5 text-success" />
                    <span className="text-xs font-bold text-success">{bn ? "ছাড় / সঞ্চয়" : "Rebate / Savings"}</span>
                  </div>
                  {result.interestRebate > 0 && (
                    <Row label={bn ? "সুদ ছাড়" : "Interest Rebate"} value={-result.interestRebate} isDiscount />
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
      </DialogContent>
    </Dialog>
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
