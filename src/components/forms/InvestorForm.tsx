import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRecord, useUpdateRecord } from "@/hooks/useCrudOperations";
import { useLanguage } from "@/contexts/LanguageContext";

const schema = z.object({
  name_en: z.string().trim().min(1, "Name is required").max(100),
  name_bn: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).optional(),
  capital: z.coerce.number().min(0, "Capital must be >= 0"),
  monthly_profit_percent: z.coerce.number().min(0).max(100),
  reinvest: z.boolean().default(false),
  investment_model: z.enum(["profit_only", "profit_plus_principal"]).default("profit_only"),
  principal_amount: z.coerce.number().min(0).default(0),
});

interface Props {
  open: boolean;
  onClose: () => void;
  editData?: Record<string, any> | null;
}

export default function InvestorForm({ open, onClose, editData }: Props) {
  const { lang } = useLanguage();
  const create = useCreateRecord("investors");
  const update = useUpdateRecord("investors");
  const isEdit = !!editData;

  const [form, setForm] = useState({
    name_en: editData?.name_en ?? "",
    name_bn: editData?.name_bn ?? "",
    phone: editData?.phone ?? "",
    capital: editData?.capital ?? 0,
    monthly_profit_percent: editData?.monthly_profit_percent ?? 0,
    reinvest: editData?.reinvest ?? false,
    investment_model: editData?.investment_model ?? "profit_only",
    principal_amount: editData?.principal_amount ?? 0,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {isEdit ? (lang === "bn" ? "বিনিয়োগকারী সম্পাদনা" : "Edit Investor") : (lang === "bn" ? "নতুন বিনিয়োগকারী" : "New Investor")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name (English) *</Label>
            <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="text-sm" />
            {errors.name_en && <p className="text-xs text-destructive mt-1">{errors.name_en}</p>}
          </div>
          <div>
            <Label className="text-xs">Name (Bangla)</Label>
            <Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{lang === "bn" ? "মূলধন ৳" : "Capital ৳"} *</Label>
              <Input type="number" value={form.capital} onChange={(e) => setForm({ ...form, capital: Number(e.target.value) })} className="text-sm" />
              {errors.capital && <p className="text-xs text-destructive mt-1">{errors.capital}</p>}
            </div>
            <div>
              <Label className="text-xs">{lang === "bn" ? "মুনাফা %" : "Profit %"} *</Label>
              <Input type="number" step="0.1" value={form.monthly_profit_percent} onChange={(e) => setForm({ ...form, monthly_profit_percent: Number(e.target.value) })} className="text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">{lang === "bn" ? "বিনিয়োগ মডেল" : "Investment Model"}</Label>
            <Select value={form.investment_model} onValueChange={(v) => setForm({ ...form, investment_model: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profit_only">Profit Only</SelectItem>
                <SelectItem value="profit_plus_principal">Profit + Principal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">{lang === "bn" ? "পুনঃবিনিয়োগ" : "Auto Reinvest"}</Label>
            <Switch checked={form.reinvest} onCheckedChange={(v) => setForm({ ...form, reinvest: v })} />
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full text-xs">
            {isPending ? "..." : isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
