import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRecord, useUpdateRecord } from "@/hooks/useCrudOperations";
import { useLanguage } from "@/contexts/LanguageContext";
import { Landmark } from "lucide-react";

const schema = z.object({
  product_name_en: z.string().trim().min(1, "Product name is required").max(100),
  product_name_bn: z.string().trim().max(100).default(""),
  interest_rate: z.coerce.number().min(0).max(100),
  tenure_months: z.coerce.number().int().min(1).max(360),
  payment_type: z.enum(["monthly", "weekly", "emi", "bullet", "monthly_profit"]).default("monthly"),
  min_amount: z.coerce.number().min(0),
  max_amount: z.coerce.number().min(0),
  max_concurrent: z.coerce.number().int().min(1).default(1),
  payment_frequency: z.string().default("Monthly"),
  upfront_savings_pct: z.coerce.number().min(0).max(100).default(0),
  compulsory_savings_amount: z.coerce.number().min(0).default(0),
});

interface Props {
  open: boolean;
  onClose: () => void;
  editData?: Record<string, any> | null;
}

export default function LoanProductForm({ open, onClose, editData }: Props) {
  const { lang } = useLanguage();
  const create = useCreateRecord("loan_products");
  const update = useUpdateRecord("loan_products");
  const isEdit = !!editData;

  const [form, setForm] = useState({
    product_name_en: editData?.product_name_en ?? "",
    product_name_bn: editData?.product_name_bn ?? "",
    interest_rate: editData?.interest_rate ?? 0,
    tenure_months: editData?.tenure_months ?? 12,
    payment_type: editData?.payment_type ?? "monthly",
    min_amount: editData?.min_amount ?? 0,
    max_amount: editData?.max_amount ?? 0,
    max_concurrent: editData?.max_concurrent ?? 1,
    payment_frequency: editData?.payment_frequency ?? "Monthly",
    upfront_savings_pct: editData?.upfront_savings_pct ?? 0,
    compulsory_savings_amount: editData?.compulsory_savings_amount ?? 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    if (isEdit) {
      await update.mutateAsync({ id: editData!.id, data: result.data });
    } else {
      await create.mutateAsync(result.data);
    }
    onClose();
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {isEdit ? (lang === "bn" ? "ঋণ পণ্য সম্পাদনা" : "Edit Loan Product") : (lang === "bn" ? "নতুন ঋণ পণ্য" : "New Loan Product")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name (English) *</Label>
              <Input value={form.product_name_en} onChange={(e) => setForm({ ...form, product_name_en: e.target.value })} className="text-sm" />
              {errors.product_name_en && <p className="text-xs text-destructive mt-1">{errors.product_name_en}</p>}
            </div>
            <div>
              <Label className="text-xs">Name (Bangla)</Label>
              <Input value={form.product_name_bn} onChange={(e) => setForm({ ...form, product_name_bn: e.target.value })} className="text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{lang === "bn" ? "সুদ %" : "Interest %"} *</Label>
              <Input type="number" step="0.1" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: Number(e.target.value) })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "মেয়াদ (মাস)" : "Tenure (months)"} *</Label>
              <Input type="number" value={form.tenure_months} onChange={(e) => setForm({ ...form, tenure_months: Number(e.target.value) })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "সর্বোচ্চ সমসাময়িক" : "Max Concurrent"}</Label>
              <Input type="number" value={form.max_concurrent} onChange={(e) => setForm({ ...form, max_concurrent: Number(e.target.value) })} className="text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">{lang === "bn" ? "পরিশোধের ধরন" : "Payment Type"}</Label>
            <Select value={form.payment_type} onValueChange={(v) => setForm({ ...form, payment_type: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="emi">EMI</SelectItem>
                <SelectItem value="bullet">Bullet</SelectItem>
                <SelectItem value="monthly_profit">Monthly Profit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "bn" ? "সর্বনিম্ন ৳" : "Min Amount ৳"}</Label>
              <Input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "সর্বোচ্চ ৳" : "Max Amount ৳"}</Label>
              <Input type="number" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })} className="text-sm" />
            </div>
          </div>

          {/* MFI / NGO Rules Section */}
          <div className="relative rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-slate-900/20 to-transparent p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <Landmark className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-300">
                  {lang === "bn" ? "MFI / NGO নিয়ম (BRAC/গ্রামীণ মডেল)" : "MFI / NGO Rules (BRAC/Grameen Model)"}
                </p>
              </div>
            </div>

            <div>
              <Label className="text-xs">{lang === "bn" ? "পেমেন্ট ফ্রিকোয়েন্সি" : "Payment Frequency"}</Label>
              <Select value={form.payment_frequency} onValueChange={(v) => setForm({ ...form, payment_frequency: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Weekly">{lang === "bn" ? "সাপ্তাহিক" : "Weekly"}</SelectItem>
                  <SelectItem value="Monthly">{lang === "bn" ? "মাসিক" : "Monthly"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">{lang === "bn" ? "অগ্রিম সঞ্চয় প্রয়োজন (%)" : "Upfront Savings Required (%)"}</Label>
              <Input
                type="number"
                step="0.1"
                value={form.upfront_savings_pct || ""}
                placeholder="0"
                onChange={(e) => setForm({ ...form, upfront_savings_pct: Number(e.target.value) })}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {lang === "bn"
                  ? "ঋণ বিতরণের আগে ক্লায়েন্টের সঞ্চয়ে ঋণের এই শতাংশ থাকতে হবে।"
                  : "Client must have this % of loan amount in savings before disbursement."}
              </p>
            </div>

            <div>
              <Label className="text-xs">{lang === "bn" ? "বাধ্যতামূলক সঞ্চয় / DPS (৳)" : "Compulsory Savings / DPS (৳)"}</Label>
              <Input
                type="number"
                value={form.compulsory_savings_amount || ""}
                placeholder="0"
                onChange={(e) => setForm({ ...form, compulsory_savings_amount: Number(e.target.value) })}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {lang === "bn"
                  ? "প্রতিটি কিস্তির সাথে স্বয়ংক্রিয়ভাবে সংগ্রহ করা নির্দিষ্ট সঞ্চয়ের পরিমাণ।"
                  : "Fixed savings amount collected automatically with every installment."}
              </p>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full text-xs">
            {isPending ? "..." : isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
