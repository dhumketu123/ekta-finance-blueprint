import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLoanProducts, useClients } from "@/hooks/useSupabaseData";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Calculator, CalendarDays, TrendingUp } from "lucide-react";

const schema = z.object({
  client_id:         z.string().uuid("গ্রাহক নির্বাচন করুন"),
  loan_product_id:   z.string().uuid("ঋণ পণ্য নির্বাচন করুন"),
  principal_amount:  z.coerce.number().positive("পরিমাণ অবশ্যই ০ এর বেশি হতে হবে"),
  disbursement_date: z.string().min(1, "তারিখ প্রয়োজন"),
  loan_model:        z.enum(["flat", "reducing"]),
  notes:             z.string().trim().max(500).optional(),
});

interface Props {
  open: boolean;
  onClose: () => void;
  prefilledClientId?: string;
}

interface DisburseResult {
  loan_id: string;
  loan_ref: string;
  principal: number;
  total_interest: number;
  total_owed: number;
  emi_amount: number;
  tenure: number;
  payment_type: string;
  loan_model: string;
  disbursement_date: string;
  maturity_date: string;
}

export default function LoanDisbursementModal({ open, onClose, prefilledClientId }: Props) {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const { data: loanProducts = [] } = useLoanProducts();

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    client_id:         prefilledClientId ?? "",
    loan_product_id:   "",
    principal_amount:  "",
    disbursement_date: today,
    loan_model:        "flat" as "flat" | "reducing",
    notes:             "",
  });
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<DisburseResult | null>(null);

  // selected product for preview
  const selectedProduct = loanProducts.find((p: any) => p.id === form.loan_product_id) as any;
  const principal = Number(form.principal_amount) || 0;

  const preview = (() => {
    if (!selectedProduct || !principal) return null;
    const r   = selectedProduct.interest_rate;
    const t   = selectedProduct.tenure_months;
    const pt  = selectedProduct.payment_type;

    if (pt === "bullet") {
      const interest = Math.round(principal * r / 100 * t / 12 * 100) / 100;
      return { interest, emi: principal + interest, label: lang === "bn" ? "মেয়াদ শেষে একসাথে" : "Lump sum at maturity" };
    }
    if (pt === "monthly_profit") {
      const monthlyProfit = Math.round(principal * r / 100 * 100) / 100;
      const interest = Math.round(monthlyProfit * t * 100) / 100;
      return { interest, emi: monthlyProfit, label: lang === "bn" ? "মাসিক মুনাফা + মেয়াদ শেষে আসল" : "Monthly profit + Principal at end" };
    }
    if (form.loan_model === "reducing") {
      const mr  = r / 100 / 12;
      const emi = Math.round(principal * mr * Math.pow(1+mr,t) / (Math.pow(1+mr,t)-1) * 100) / 100;
      return { interest: Math.round((emi*t - principal)*100)/100, emi, label: lang === "bn" ? "হ্রাসমান ব্যালেন্স EMI" : "Reducing Balance EMI" };
    }
    // flat
    const interest = Math.round(principal * r / 100 * 100) / 100;
    const emi      = Math.round((principal + interest) / t * 100) / 100;
    return { interest, emi, label: lang === "bn" ? "সমান মাসিক কিস্তি (Flat)" : "Equal Installment (Flat)" };
  })();

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ ...form, principal_amount: Number(form.principal_amount) });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase.rpc("disburse_loan" as any, {
        _client_id:         parsed.data.client_id,
        _loan_product_id:   parsed.data.loan_product_id,
        _principal_amount:  parsed.data.principal_amount,
        _disbursement_date: parsed.data.disbursement_date,
        _assigned_officer:  user?.id ?? null,
        _notes:             parsed.data.notes || null,
        _loan_model:        parsed.data.loan_model,
      });
      if (error) throw error;
      setResult(data as unknown as DisburseResult);
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(lang === "bn" ? "ঋণ সফলভাবে বিতরণ হয়েছে" : "Loan disbursed successfully");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setResult(null);
    setForm({ client_id: prefilledClientId ?? "", loan_product_id: "", principal_amount: "", disbursement_date: today, loan_model: "flat", notes: "" });
    setErrors({});
    onClose();
  };

  const paymentTypeLabel = (pt: string) => {
    const map: Record<string, string> = {
      monthly: lang === "bn" ? "মাসিক" : "Monthly",
      weekly:  lang === "bn" ? "সাপ্তাহিক" : "Weekly",
      emi:     "EMI",
      bullet:  lang === "bn" ? "বুলেট" : "Bullet",
      monthly_profit: lang === "bn" ? "মাসিক মুনাফা" : "Monthly Profit",
    };
    return map[pt] ?? pt;
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {lang === "bn" ? "ঋণ বিতরণ" : "Loan Disbursement"}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          /* ── SUCCESS SCREEN ── */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-bold">
                {lang === "bn" ? "ঋণ সফলভাবে বিতরণ হয়েছে!" : "Loan Disbursed Successfully!"}
              </span>
            </div>
            <div className="rounded-lg border p-3 bg-muted/40 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === "bn" ? "ঋণ নং" : "Loan Ref"}</span>
                <span className="font-bold text-primary">{result.loan_ref}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === "bn" ? "আসল" : "Principal"}</span>
                <span className="font-bold">৳{Number(result.principal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === "bn" ? "মোট সুদ" : "Total Interest"}</span>
                <span className="font-bold text-warning">৳{Number(result.total_interest).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">{lang === "bn" ? "মোট দেনা" : "Total Owed"}</span>
                <span className="font-bold text-destructive">৳{Number(result.total_owed).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === "bn" ? "কিস্তি" : "Installment"}</span>
                <span className="font-bold">৳{Number(result.emi_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === "bn" ? "মেয়াদোত্তীর্ণ তারিখ" : "Maturity"}</span>
                <span className="font-bold">{result.maturity_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{lang === "bn" ? "পরিশোধ ধরন" : "Payment Type"}</span>
                <span className="font-bold capitalize">{paymentTypeLabel(result.payment_type)}</span>
              </div>
            </div>
            <Button onClick={resetAndClose} className="w-full text-xs">
              {lang === "bn" ? "বন্ধ করুন" : "Close"}
            </Button>
          </div>
        ) : (
          /* ── FORM ── */
          <div className="space-y-3">
            {/* Client */}
            {!prefilledClientId && (
              <div>
                <Label className="text-xs">{lang === "bn" ? "গ্রাহক *" : "Client *"}</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger className="text-xs h-9"><SelectValue placeholder={lang === "bn" ? "গ্রাহক নির্বাচন করুন" : "Select client"} /></SelectTrigger>
                  <SelectContent>
                    {(clients as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {lang === "bn" ? (c.name_bn || c.name_en) : c.name_en}
                        {c.member_id && <span className="ml-2 text-muted-foreground font-mono">({c.member_id})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.client_id && <p className="text-xs text-destructive mt-1">{errors.client_id}</p>}
              </div>
            )}

            {/* Loan Product */}
            <div>
              <Label className="text-xs">{lang === "bn" ? "ঋণ পণ্য *" : "Loan Product *"}</Label>
              <Select value={form.loan_product_id} onValueChange={(v) => setForm({ ...form, loan_product_id: v })}>
                <SelectTrigger className="text-xs h-9"><SelectValue placeholder={lang === "bn" ? "পণ্য নির্বাচন করুন" : "Select product"} /></SelectTrigger>
                <SelectContent>
                  {(loanProducts as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {lang === "bn" ? (p.product_name_bn || p.product_name_en) : p.product_name_en}
                      <span className="ml-2 text-muted-foreground">({p.interest_rate}% · {p.tenure_months}m)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.loan_product_id && <p className="text-xs text-destructive mt-1">{errors.loan_product_id}</p>}
            </div>

            {/* Selected product summary */}
            {selectedProduct && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-muted-foreground">{lang === "bn" ? "সুদের হার" : "Rate"}</p>
                  <p className="font-bold text-primary">{selectedProduct.interest_rate}%</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">{lang === "bn" ? "মেয়াদ" : "Tenure"}</p>
                  <p className="font-bold">{selectedProduct.tenure_months}m</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">{lang === "bn" ? "ধরন" : "Type"}</p>
                  <p className="font-bold capitalize">{paymentTypeLabel(selectedProduct.payment_type)}</p>
                </div>
              </div>
            )}

            {/* Principal + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{lang === "bn" ? "আসল পরিমাণ ৳ *" : "Principal ৳ *"}</Label>
                <Input
                  type="number"
                  value={form.principal_amount}
                  onChange={(e) => setForm({ ...form, principal_amount: e.target.value })}
                  className="text-sm h-9"
                  placeholder={selectedProduct ? `${selectedProduct.min_amount}–${selectedProduct.max_amount}` : "0"}
                />
                {errors.principal_amount && <p className="text-xs text-destructive mt-1">{errors.principal_amount}</p>}
              </div>
              <div>
                <Label className="text-xs">{lang === "bn" ? "সুদ পদ্ধতি" : "Interest Method"}</Label>
                <Select value={form.loan_model} onValueChange={(v: any) => setForm({ ...form, loan_model: v })}>
                  <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat" className="text-xs">{lang === "bn" ? "সমান (Flat)" : "Flat Rate"}</SelectItem>
                    <SelectItem value="reducing" className="text-xs">{lang === "bn" ? "হ্রাসমান (Reducing)" : "Reducing Balance"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Live Preview */}
            {preview && principal > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-warning">
                  <Calculator className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold">{lang === "bn" ? "হিসাবের পূর্বরূপ" : "Calculation Preview"}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{preview.label}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground">{lang === "bn" ? "মোট সুদ" : "Interest"}</p>
                    <p className="font-bold text-warning">৳{preview.interest.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{lang === "bn" ? "কিস্তি" : "Installment"}</p>
                    <p className="font-bold text-primary">৳{preview.emi.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{lang === "bn" ? "মোট দেনা" : "Total"}</p>
                    <p className="font-bold text-destructive">৳{(principal + preview.interest).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Disbursement Date */}
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" />
                {lang === "bn" ? "বিতরণের তারিখ *" : "Disbursement Date *"}
              </Label>
              <Input
                type="date"
                value={form.disbursement_date}
                onChange={(e) => setForm({ ...form, disbursement_date: e.target.value })}
                className="text-sm h-9"
              />
              {errors.disbursement_date && <p className="text-xs text-destructive mt-1">{errors.disbursement_date}</p>}
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">{lang === "bn" ? "নোট (ঐচ্ছিক)" : "Notes (Optional)"}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="text-sm"
                rows={2}
                placeholder={lang === "bn" ? "কোনো বিশেষ তথ্য..." : "Any special notes..."}
              />
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-2 rounded bg-muted text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" />
              <span>
                {lang === "bn"
                  ? "ঋণ বিতরণ একটি অপরিবর্তনীয় আর্থিক লেনদেন। নিশ্চিত হয়ে এগিয়ে যান।"
                  : "Loan disbursement is an irreversible financial transaction. Confirm before proceeding."}
              </span>
            </div>

            <Button onClick={handleSubmit} disabled={loading} className="w-full text-xs font-bold h-9 bg-primary text-primary-foreground hover:bg-primary/90">
              {loading ? (lang === "bn" ? "প্রক্রিয়া চলছে..." : "Processing...") : (lang === "bn" ? "ঋণ বিতরণ নিশ্চিত করুন" : "Confirm Disbursement")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
