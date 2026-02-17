import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const schema = z.object({
  loan_id: z.string().uuid("Invalid Loan ID"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  reference_id: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

interface Props {
  open: boolean;
  onClose: () => void;
  prefilledLoanId?: string;
}

interface PaymentResult {
  loan_id: string;
  total_payment: number;
  penalty_paid: number;
  interest_paid: number;
  principal_paid: number;
  new_outstanding: number;
  loan_closed: boolean;
}

export default function LoanPaymentModal({ open, onClose, prefilledLoanId }: Props) {
  const { lang } = useLanguage();
  const [form, setForm] = useState({
    loan_id: prefilledLoanId ?? "",
    amount: "",
    reference_id: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PaymentResult | null>(null);

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ ...form, amount: Number(form.amount) });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.rpc("apply_loan_payment", {
        _loan_id: parsed.data.loan_id,
        _amount: parsed.data.amount,
        _performed_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        _reference_id: parsed.data.reference_id || null,
      });

      if (error) throw error;
      setResult(data as unknown as PaymentResult);
      toast.success(lang === "bn" ? "পেমেন্ট সফল" : "Payment successful");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setResult(null);
    setForm({ loan_id: prefilledLoanId ?? "", amount: "", reference_id: "", notes: "" });
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {lang === "bn" ? "ঋণ পরিশোধ" : "Loan Payment"}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-semibold">
                {result.loan_closed ? (lang === "bn" ? "ঋণ বন্ধ হয়েছে!" : "Loan Closed!") : (lang === "bn" ? "পেমেন্ট সফল" : "Payment Applied")}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 rounded bg-destructive/10">
                <span>{lang === "bn" ? "জরিমানা প্রদান" : "Penalty Paid"}</span>
                <span className="font-bold">৳{Number(result.penalty_paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-warning/10">
                <span>{lang === "bn" ? "সুদ প্রদান" : "Interest Paid"}</span>
                <span className="font-bold">৳{Number(result.interest_paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-success/10">
                <span>{lang === "bn" ? "আসল প্রদান" : "Principal Paid"}</span>
                <span className="font-bold">৳{Number(result.principal_paid).toLocaleString()}</span>
              </div>
              <div className="flex justify-between p-2 rounded bg-muted font-bold">
                <span>{lang === "bn" ? "অবশিষ্ট" : "Remaining"}</span>
                <span>৳{Number(result.new_outstanding).toLocaleString()}</span>
              </div>
            </div>
            <Button onClick={resetAndClose} className="w-full text-xs">
              {lang === "bn" ? "বন্ধ করুন" : "Close"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Loan ID *</Label>
              <Input value={form.loan_id} onChange={(e) => setForm({ ...form, loan_id: e.target.value })} className="text-sm font-mono" placeholder="UUID" />
              {errors.loan_id && <p className="text-xs text-destructive mt-1">{errors.loan_id}</p>}
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "পরিমাণ ৳" : "Amount ৳"} *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="text-sm" />
              {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
            </div>
            <div>
              <Label className="text-xs">Reference ID</Label>
              <Input value={form.reference_id} onChange={(e) => setForm({ ...form, reference_id: e.target.value })} className="text-sm" placeholder="Optional unique reference" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="text-sm" rows={2} />
            </div>
            <div className="flex items-start gap-2 p-2 rounded bg-muted text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{lang === "bn" ? "পেমেন্ট অগ্রাধিকার: জরিমানা → সুদ → আসল" : "Payment priority: Penalty → Interest → Principal"}</span>
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full text-xs">
              {loading ? "..." : lang === "bn" ? "পেমেন্ট করুন" : "Submit Payment"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
