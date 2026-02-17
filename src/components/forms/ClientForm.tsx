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
  name_en: z.string().trim().min(1, "Name (English) is required").max(100),
  name_bn: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).optional(),
  area: z.string().trim().max(100).optional(),
  status: z.enum(["active", "pending", "overdue", "inactive"]).default("active"),
});

interface Props {
  open: boolean;
  onClose: () => void;
  editData?: Record<string, any> | null;
}

export default function ClientForm({ open, onClose, editData }: Props) {
  const { lang } = useLanguage();
  const create = useCreateRecord("clients");
  const update = useUpdateRecord("clients");
  const isEdit = !!editData;

  const [form, setForm] = useState({
    name_en: editData?.name_en ?? "",
    name_bn: editData?.name_bn ?? "",
    phone: editData?.phone ?? "",
    area: editData?.area ?? "",
    status: editData?.status ?? "active",
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
            {isEdit ? (lang === "bn" ? "গ্রাহক সম্পাদনা" : "Edit Client") : (lang === "bn" ? "নতুন গ্রাহক" : "New Client")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{lang === "bn" ? "নাম (ইংরেজি)" : "Name (English)"} *</Label>
            <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="text-sm" />
            {errors.name_en && <p className="text-xs text-destructive mt-1">{errors.name_en}</p>}
          </div>
          <div>
            <Label className="text-xs">{lang === "bn" ? "নাম (বাংলা)" : "Name (Bangla)"}</Label>
            <Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">{lang === "bn" ? "ফোন" : "Phone"}</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">{lang === "bn" ? "এলাকা" : "Area"}</Label>
            <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="text-sm" />
          </div>
          <div>
            <Label className="text-xs">{lang === "bn" ? "অবস্থা" : "Status"}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full text-xs">
            {isPending ? "..." : isEdit ? (lang === "bn" ? "আপডেট" : "Update") : (lang === "bn" ? "তৈরি করুন" : "Create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
