import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, TrendingDown, Loader2, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  preselectedLoanId?: string;
}

export default function EarlySettlementCalculator({ open, onClose, preselectedLoanId }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const [loanId, setLoanId] = useState(preselectedLoanId ?? "");
  const [manualDiscount, setManualDiscount] = useState<string>("");

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

  const calculateSettlement = () => {
    if (!selectedLoan) return null;

    const outstandingPrincipal = selectedLoan.outstanding_principal || 0;
    const outstandingInterest = selectedLoan.outstanding_interest || 0;
    const penalty = selectedLoan.penalty_amount || 0;

    // Fixed 2% processing fee on outstanding principal
    const processingFeePercent = 2;
    const processingFee = Math.round(outstandingPrincipal * (processingFeePercent / 100));

    // Manual admin discount
    const discount = Math.max(0, Number(manualDiscount) || 0);

    // Total = Principal + Interest + Penalty + Processing Fee - Manual Discount
    const grossTotal = outstandingPrincipal + outstandingInterest + penalty + processingFee;
    const settlementAmount = Math.max(0, grossTotal - discount);

    return {
      outstandingPrincipal,
      outstandingInterest,
      penalty,
      processingFee,
      processingFeePercent,
      discount,
      settlementAmount,
      grossTotal,
    };
  };

  const result = calculateSettlement();

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="text-sm font-bold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            {bn ? "আগাম নিষ্পত্তি ক্যালকুলেটর" : "Early Settlement Calculator"}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-4">
            {/* Loan Selection */}
            <div>
              <Label className="text-xs">{bn ? "ঋণ নির্বাচন" : "Select Loan"} *</Label>
              <Select value={loanId} onValueChange={(v) => { setLoanId(v); setManualDiscount(""); }}>
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

            {/* Policy info */}
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {bn ? "স্বয়ংক্রিয় ছাড়: ০%" : "Auto Rebate: 0%"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {bn ? "প্রসেসিং ফি: ২%" : "Processing Fee: 2%"}
              </span>
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-3 mt-2">
                <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                  <Row label={bn ? "বকেয়া মূলধন" : "Outstanding Principal"} value={result.outstandingPrincipal} />
                  <Row label={bn ? "বকেয়া সুদ" : "Outstanding Interest"} value={result.outstandingInterest} />
                  {result.penalty > 0 && <Row label={bn ? "জরিমানা" : "Penalty"} value={result.penalty} />}
                  <Row label={bn ? `প্রসেসিং ফি (${result.processingFeePercent}%)` : `Processing Fee (${result.processingFeePercent}%)`} value={result.processingFee} />
                </div>

                {/* Manual Discount Input */}
                <div className="p-3 rounded-xl border border-warning/30 bg-warning/5 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-warning" />
                    <span className="text-xs font-bold text-warning">
                      {bn ? "বিশেষ প্রশাসনিক ছাড় (ঐচ্ছিক)" : "Special Admin Discount (Optional)"}
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    value={manualDiscount}
                    onChange={(e) => setManualDiscount(e.target.value)}
                    placeholder={bn ? "ছাড়ের পরিমাণ ৳" : "Discount amount ৳"}
                    className="text-xs h-8 bg-background"
                  />
                </div>

                {/* Total Payable */}
                <div className="p-4 rounded-xl bg-primary/10 border-2 border-primary/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">{bn ? "মোট পরিশোধযোগ্য" : "Settlement Amount"}</span>
                    <span className="text-xl font-bold text-primary">৳{result.settlementAmount.toLocaleString()}</span>
                  </div>
                  {result.discount > 0 && (
                    <p className="text-xs text-success mt-1.5 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      {bn
                        ? `প্রশাসনিক ছাড় প্রয়োগ করা হয়েছে: -৳${result.discount.toLocaleString()}`
                        : `Admin discount applied: -৳${result.discount.toLocaleString()}`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
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
