import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

const phoneRegex = /^[0-9+\-\s()]{7,20}$/;

const schema = z.object({
  // Core
  name_en: z.string().trim().min(1, "Name (English) is required").max(100),
  name_bn: z.string().trim().max(100).default(""),
  phone: z.string().trim().regex(phoneRegex, "Invalid phone").optional().or(z.literal("")),
  area: z.string().trim().max(100).optional(),
  status: z.enum(["active", "pending", "overdue", "inactive"]).default("active"),
  // Identity
  father_or_husband_name: z.string().trim().max(100).optional(),
  mother_name: z.string().trim().max(100).optional(),
  nid_number: z.string().trim().max(20).optional().or(z.literal("")),
  date_of_birth: z.string().optional(),
  marital_status: z.enum(["unmarried", "married", "widowed", "divorced", ""]).optional(),
  occupation: z.string().trim().max(100).optional(),
  // Address
  village: z.string().trim().max(100).optional(),
  post_office: z.string().trim().max(100).optional(),
  union_name: z.string().trim().max(100).optional(),
  upazila: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  // Nominee
  nominee_name: z.string().trim().max(100).optional(),
  nominee_relation: z.string().trim().max(50).optional(),
  nominee_phone: z.string().trim().regex(phoneRegex, "Invalid nominee phone").optional().or(z.literal("")),
  nominee_nid: z.string().trim().max(20).optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  editData?: Record<string, any> | null;
}

const SectionHeader = ({ title }: { title: string }) => (
  <div className="border-l-2 border-primary pl-3 mb-3 mt-4">
    <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{title}</p>
  </div>
);

const Field = ({
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </Label>
    {children}
    {error && <p className="text-[10px] text-destructive">{error}</p>}
  </div>
);

export default function ClientForm({ open, onClose, editData }: Props) {
  const { lang } = useLanguage();
  const create = useCreateRecord("clients");
  const update = useUpdateRecord("clients");
  const isEdit = !!editData;

  const [form, setForm] = useState<FormData>({
    name_en: editData?.name_en ?? "",
    name_bn: editData?.name_bn ?? "",
    phone: editData?.phone ?? "",
    area: editData?.area ?? "",
    status: editData?.status ?? "active",
    father_or_husband_name: editData?.father_or_husband_name ?? "",
    mother_name: editData?.mother_name ?? "",
    nid_number: editData?.nid_number ?? "",
    date_of_birth: editData?.date_of_birth ?? "",
    marital_status: editData?.marital_status ?? "",
    occupation: editData?.occupation ?? "",
    village: editData?.village ?? "",
    post_office: editData?.post_office ?? "",
    union_name: editData?.union_name ?? "",
    upazila: editData?.upazila ?? "",
    district: editData?.district ?? "",
    nominee_name: editData?.nominee_name ?? "",
    nominee_relation: editData?.nominee_relation ?? "",
    nominee_phone: editData?.nominee_phone ?? "",
    nominee_nid: editData?.nominee_nid ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof FormData, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async () => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});

    // Strip empty strings to null for optional fields
    const clean: any = { ...result.data };
    const optionals = ["phone","area","father_or_husband_name","mother_name","nid_number","date_of_birth","marital_status","occupation","village","post_office","union_name","upazila","district","nominee_name","nominee_relation","nominee_phone","nominee_nid"];
    optionals.forEach((k) => { if (clean[k] === "") clean[k] = null; });

    if (isEdit) {
      await update.mutateAsync({ id: editData!.id, data: clean });
    } else {
      await create.mutateAsync(clean);
    }
    onClose();
  };

  const isPending = create.isPending || update.isPending;
  const t = (bn: string, en: string) => lang === "bn" ? bn : en;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {isEdit ? t("গ্রাহক সম্পাদনা", "Edit Client") : t("নতুন গ্রাহক", "New Client")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 pb-2">
          {/* ── Basic ── */}
          <SectionHeader title={t("মূল তথ্য", "Basic Info")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("নাম (ইংরেজি)", "Name (English)")} required error={errors.name_en}>
              <Input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("নাম (বাংলা)", "Name (Bangla)")} error={errors.name_bn}>
              <Input value={form.name_bn} onChange={(e) => set("name_bn", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("ফোন", "Phone")} error={errors.phone}>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="text-sm h-8" placeholder="01XXXXXXXXX" />
            </Field>
            <Field label={t("এলাকা", "Area")} error={errors.area}>
              <Input value={form.area} onChange={(e) => set("area", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("অবস্থা", "Status")} error={errors.status}>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="text-sm h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* ── Identity ── */}
          <SectionHeader title={t("পরিচয় তথ্য", "Identity")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("পিতা/স্বামীর নাম", "Father / Husband Name")} error={errors.father_or_husband_name}>
              <Input value={form.father_or_husband_name} onChange={(e) => set("father_or_husband_name", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("মাতার নাম", "Mother Name")} error={errors.mother_name}>
              <Input value={form.mother_name} onChange={(e) => set("mother_name", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("জাতীয় পরিচয়পত্র নম্বর", "NID Number")} error={errors.nid_number}>
              <Input value={form.nid_number} onChange={(e) => set("nid_number", e.target.value)} className="text-sm h-8" placeholder="10 or 17 digits" />
            </Field>
            <Field label={t("জন্ম তারিখ", "Date of Birth")} error={errors.date_of_birth}>
              <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("বৈবাহিক অবস্থা", "Marital Status")} error={errors.marital_status}>
              <Select value={form.marital_status || ""} onValueChange={(v) => set("marital_status", v)}>
                <SelectTrigger className="text-sm h-8"><SelectValue placeholder={t("নির্বাচন করুন", "Select")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unmarried">{t("অবিবাহিত", "Unmarried")}</SelectItem>
                  <SelectItem value="married">{t("বিবাহিত", "Married")}</SelectItem>
                  <SelectItem value="widowed">{t("বিধবা/বিপত্নীক", "Widowed")}</SelectItem>
                  <SelectItem value="divorced">{t("তালাকপ্রাপ্ত", "Divorced")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("পেশা", "Occupation")} error={errors.occupation}>
              <Input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} className="text-sm h-8" />
            </Field>
          </div>

          {/* ── Address ── */}
          <SectionHeader title={t("ঠিকানা", "Address")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("গ্রাম", "Village")} error={errors.village}>
              <Input value={form.village} onChange={(e) => set("village", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("ডাকঘর", "Post Office")} error={errors.post_office}>
              <Input value={form.post_office} onChange={(e) => set("post_office", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("ইউনিয়ন", "Union")} error={errors.union_name}>
              <Input value={form.union_name} onChange={(e) => set("union_name", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("উপজেলা", "Upazila")} error={errors.upazila}>
              <Input value={form.upazila} onChange={(e) => set("upazila", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("জেলা", "District")} error={errors.district} required>
              <Input value={form.district} onChange={(e) => set("district", e.target.value)} className="text-sm h-8" />
            </Field>
          </div>

          {/* ── Nominee ── */}
          <SectionHeader title={t("নমিনি তথ্য", "Nominee Info")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("নমিনির নাম", "Nominee Name")} error={errors.nominee_name}>
              <Input value={form.nominee_name} onChange={(e) => set("nominee_name", e.target.value)} className="text-sm h-8" />
            </Field>
            <Field label={t("সম্পর্ক", "Relation")} error={errors.nominee_relation}>
              <Input value={form.nominee_relation} onChange={(e) => set("nominee_relation", e.target.value)} className="text-sm h-8" placeholder={t("যেমন: স্বামী, পিতা", "e.g. Husband, Father")} />
            </Field>
            <Field label={t("নমিনির ফোন", "Nominee Phone")} error={errors.nominee_phone}>
              <Input value={form.nominee_phone} onChange={(e) => set("nominee_phone", e.target.value)} className="text-sm h-8" placeholder="01XXXXXXXXX" />
            </Field>
            <Field label={t("নমিনির NID", "Nominee NID")} error={errors.nominee_nid}>
              <Input value={form.nominee_nid} onChange={(e) => set("nominee_nid", e.target.value)} className="text-sm h-8" />
            </Field>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={isPending} className="w-full text-xs mt-2">
          {isPending ? "..." : isEdit ? t("আপডেট করুন", "Update") : t("তৈরি করুন", "Create")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
