import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

const schema = z.object({
  name_en: z.string().trim().min(1, "Name is required").max(100),
  name_bn: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).optional(),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "At least 8 characters"),
});

type Role = "owner" | "field_officer";

interface Props {
  open: boolean;
  onClose: () => void;
  role: Role;
  editData?: Record<string, any> | null;
}

export default function UserProfileForm({ open, onClose, role, editData }: Props) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!editData;

  const [form, setForm] = useState({
    name_en: editData?.name_en ?? "",
    name_bn: editData?.name_bn ?? "",
    phone: editData?.phone ?? "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const roleLabel = role === "owner"
    ? (lang === "bn" ? "মালিক" : "Owner")
    : (lang === "bn" ? "ফিল্ড অফিসার" : "Field Officer");

  const queryKeyMap: Record<Role, string> = {
    owner: "owners",
    field_officer: "field_officers",
  };

  const handleUpdateProfile = async () => {
    if (!editData?.id) return;
    const { error } = await supabase
      .from("profiles")
      .update({
        name_en: form.name_en,
        name_bn: form.name_bn,
        phone: form.phone || null,
      })
      .eq("id", editData.id);
    if (error) throw error;
    toast({ title: lang === "bn" ? "আপডেট সফল" : "Updated successfully" });
    queryClient.invalidateQueries({ queryKey: [queryKeyMap[role]] });
    onClose();
  };

  const handleCreateUser = async () => {
    // Use admin API to create a new auth user via supabase
    // Since we can't use admin SDK from frontend, we invite via email
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name_en: form.name_en,
          name_bn: form.name_bn,
          phone: form.phone,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (signUpError) throw signUpError;

    const userId = data.user?.id;
    if (!userId) throw new Error("User creation failed");

    // Insert profile
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      name_en: form.name_en,
      name_bn: form.name_bn,
      phone: form.phone || null,
      role: role,
    });
    if (profileError) throw profileError;

    // Insert role
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: role as any,
    });
    if (roleError) throw roleError;

    toast({
      title: lang === "bn" ? "সফল! 🎉" : "Created! 🎉",
      description: lang === "bn"
        ? `${roleLabel} তৈরি হয়েছে। তাদের ইমেইলে নিশ্চিতকরণ পাঠানো হয়েছে।`
        : `${roleLabel} created. A confirmation email has been sent.`,
    });
    queryClient.invalidateQueries({ queryKey: [queryKeyMap[role]] });
    onClose();
  };

  const handleSubmit = async () => {
    const toValidate = isEdit
      ? { name_en: form.name_en, name_bn: form.name_bn, phone: form.phone, email: "a@a.com", password: "12345678" }
      : form;

    const result = schema.safeParse(toValidate);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      if (isEdit) {
        await handleUpdateProfile();
      } else {
        await handleCreateUser();
      }
    } catch (err: any) {
      toast({ title: lang === "bn" ? "ত্রুটি" : "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {isEdit
              ? (lang === "bn" ? `${roleLabel} সম্পাদনা` : `Edit ${roleLabel}`)
              : (lang === "bn" ? `নতুন ${roleLabel}` : `New ${roleLabel}`)}
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
            <Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} className="text-sm font-bangla" />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01XXXXXXXXX" className="text-sm" />
          </div>
          {!isEdit && (
            <>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" className="text-sm" />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
              </div>
              <div>
                <Label className="text-xs">Password * (min 8 chars)</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="text-sm" />
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang === "bn"
                  ? "একটি নতুন অ্যাকাউন্ট তৈরি হবে এবং ইমেইলে নিশ্চিতকরণ লিংক পাঠানো হবে।"
                  : "A new account will be created and a confirmation email will be sent."}
              </p>
            </>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="w-full text-xs">
            {loading ? "..." : isEdit ? (lang === "bn" ? "আপডেট করুন" : "Update") : (lang === "bn" ? "তৈরি করুন" : "Create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
