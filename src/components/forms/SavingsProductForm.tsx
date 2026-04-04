import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCreateRecord, useUpdateRecord } from "@/hooks/useCrudOperations";
import { useLanguage } from "@/contexts/LanguageContext";

const schema = z.object({
  product_name_en: z.string().trim().min(1, "Product name is required").max(100),
  product_name_bn: z.string().trim().max(100).default(""),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("monthly"),
  min_amount: z.coerce.number().min(0),
  max_amount: z.coerce.number().min(0),
  product_type: z.enum(["general", "locked", "dps", "fixed"]).default("general"),
  minimum_balance: z.coerce.number().min(0).default(0),
  lock_period_days: z.coerce.number().int().min(0).default(0),
  profit_rate: z.coerce.number().min(0).max(100).default(0),
  partial_payment_allowed: z.boolean().default(true),
  advance_lock: z.boolean().default(false),
});

interface Props {
  open: boolean;
  onClose: () => void;
  editData?: Record<string, any> | null;
}

export default function SavingsProductForm({ open, onClose, editData }: Props) {
  const { lang } = useLanguage();
  const create = useCreateRecord("savings_products");
  const update = useUpdateRecord("savings_products");
  const isEdit = !!editData;

  const [form, setForm] = useState({
    product_name_en: editData?.product_name_en ?? "",
    product_name_bn: editData?.product_name_bn ?? "",
    frequency: editData?.frequency ?? "monthly",
    min_amount: editData?.min_amount ?? 0,
    max_amount: editData?.max_amount ?? 0,
    product_type: editData?.product_type ?? "general",
    minimum_balance: editData?.minimum_balance ?? 0,
    lock_period_days: editData?.lock_period_days ?? 0,
    profit_rate: editData?.profit_rate ?? 0,
    partial_payment_allowed: editData?.partial_payment_allowed ?? true,
    advance_lock: editData?.advance_lock ?? false,
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
            {isEdit ? (lang === "bn" ? "সঞ্চয় পণ্য সম্পাদনা" : "Edit Savings Product") : (lang === "bn" ? "নতুন সঞ্চয় পণ্য" : "New Savings Product")}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "bn" ? "ফ্রিকোয়েন্সি" : "Frequency"}</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "পণ্যের ধরন" : "Product Type"}</Label>
              <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">{lang === "bn" ? "সাধারণ সঞ্চয়" : "General Savings"}</SelectItem>
                  <SelectItem value="dps">{lang === "bn" ? "ডিপিএস (DPS)" : "DPS (Deposit Pension)"}</SelectItem>
                  <SelectItem value="fixed">{lang === "bn" ? "স্থায়ী আমানত (FD)" : "Fixed Deposit (FD)"}</SelectItem>
                  <SelectItem value="locked">{lang === "bn" ? "লকড সঞ্চয়" : "Locked Savings"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Min Amount ৳</Label>
              <Input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: Number(e.target.value) })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">Max Amount ৳</Label>
              <Input type="number" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: Number(e.target.value) })} className="text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "bn" ? "মুনাফার হার %" : "Profit Rate %"}</Label>
              <Input type="number" step="0.1" value={form.profit_rate} onChange={(e) => setForm({ ...form, profit_rate: Number(e.target.value) })} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "লক সময়কাল (দিন)" : "Lock Period (days)"}</Label>
              <Input type="number" value={form.lock_period_days} onChange={(e) => setForm({ ...form, lock_period_days: Number(e.target.value) })} className="text-sm" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">{lang === "bn" ? "আংশিক পেমেন্ট অনুমোদিত" : "Partial Payment Allowed"}</Label>
            <Switch checked={form.partial_payment_allowed} onCheckedChange={(v) => setForm({ ...form, partial_payment_allowed: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">{lang === "bn" ? "অগ্রিম লক" : "Advance Lock"}</Label>
            <Switch checked={form.advance_lock} onCheckedChange={(v) => setForm({ ...form, advance_lock: v })} />
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full text-xs">
            {isPending ? "..." : isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
