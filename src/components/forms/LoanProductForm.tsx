import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRecord, useUpdateRecord } from "@/hooks/useCrudOperations";
import { useLanguage } from "@/contexts/LanguageContext";

const schema = z.object({
  product_name_en: z.string().trim().min(1, "Product name is required").max(100),
  product_name_bn: z.string().trim().max(100).default(""),
  interest_rate: z.coerce.number().min(0).max(100),
  tenure_months: z.coerce.number().int().min(1).max(360),
  payment_type: z.enum(["monthly", "weekly", "emi", "bullet", "monthly_profit"]).default("monthly"),
  min_amount: z.coerce.number().min(0),
  max_amount: z.coerce.number().min(0),
  max_concurrent: z.coerce.number().int().min(1).default(1),
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {isEdit ? (lang === "bn" ? "ঋণ পণ্য সম্পাদনা" : "Edit Loan Product") : (lang === "bn" ? "নতুন ঋণ পণ্য" : "New Loan Product")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
          <Button onClick={handleSubmit} disabled={isPending} className="w-full text-xs">
            {isPending ? "..." : isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
