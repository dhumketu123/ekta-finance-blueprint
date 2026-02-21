import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, User, MessageSquare } from "lucide-react";
import { z } from "zod";
import SmsGatewayConfig from "@/components/settings/SmsGatewayConfig";

const profileSchema = z.object({
  name_en: z.string().trim().min(1, "Name is required").max(100),
  name_bn: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
});

const settingsSections = [
  {
    titleBn: "ব্যাকআপ ও পুনরুদ্ধার",
    titleEn: "Backup & Recovery",
    items: [
      { labelBn: "দৈনিক ইনক্রিমেন্টাল ব্যাকআপ", labelEn: "Daily Incremental Backup", value: "Enabled" },
      { labelBn: "সাপ্তাহিক সম্পূর্ণ ব্যাকআপ", labelEn: "Weekly Full Backup", value: "Every Sunday 2:00 AM" },
      { labelBn: "সফট ডিলিট", labelEn: "Soft Delete", value: "30-day recovery window" },
    ],
  },
  {
    titleBn: "স্থানীয়করণ",
    titleEn: "Localization",
    items: [
      { labelBn: "ডিফল্ট ভাষা", labelEn: "Default Language", value: "বাংলা (Bangla)" },
      { labelBn: "দ্বিতীয় ভাষা", labelEn: "Secondary Language", value: "English" },
      { labelBn: "মুদ্রা", labelEn: "Currency", value: "৳ BDT" },
    ],
  },
  {
    titleBn: "সম্মতি",
    titleEn: "Compliance",
    items: [
      { labelBn: "ক্ষুদ্রঋণ নিয়ন্ত্রণ", labelEn: "Microfinance Regulation", value: "Bangladesh MRA Guidelines" },
      { labelBn: "ডেটা গোপনীয়তা", labelEn: "Data Privacy", value: "Local data privacy laws applicable" },
    ],
  },
  {
    titleBn: "ভূমিকা অনুমতি",
    titleEn: "Role Permissions",
    items: [
      { labelBn: "অ্যাডমিন", labelEn: "Admin", value: "Full access — view, edit, approve, disburse, notifications" },
      { labelBn: "মাঠকর্মী", labelEn: "Field Officer", value: "View assigned clients, record loans/savings, send messages" },
      { labelBn: "মালিক", labelEn: "Owner", value: "View reports, deposit, profit distribution" },
      { labelBn: "বিনিয়োগকারী", labelEn: "Investor", value: "View own capital, profit, reinvest toggle" },
    ],
  },
];

const SettingsPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bn = lang === "bn";

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("name_en, name_bn, phone, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const [form, setForm] = useState({ name_en: "", name_bn: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setForm({
        name_en: profile.name_en || "",
        name_bn: profile.name_bn || "",
        phone: profile.phone || "",
      });
    }
  }, [profile]);

  const updateMut = useMutation({
    mutationFn: async (data: { name_en: string; name_bn?: string; phone?: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          name_en: data.name_en,
          name_bn: data.name_bn || "",
          phone: data.phone || null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_profile"] });
      qc.invalidateQueries({ queryKey: ["profile-avatar"] });
      toast.success(bn ? "প্রোফাইল আপডেট হয়েছে" : "Profile updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    updateMut.mutate({ name_en: parsed.data.name_en!, name_bn: parsed.data.name_bn, phone: parsed.data.phone });
  };

  return (
    <AppLayout>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="space-y-6">
        {/* Profile Section */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border bg-primary/5 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-primary">
              {bn ? "প্রোফাইল তথ্য" : "Profile Information"}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {profileLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">{bn ? "নাম (ইংরেজি) *" : "Name (English) *"}</Label>
                    <Input
                      value={form.name_en}
                      onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                      className="text-sm mt-1"
                      placeholder="John Doe"
                    />
                    {errors.name_en && <p className="text-xs text-destructive mt-1">{errors.name_en}</p>}
                  </div>
                  <div>
                    <Label className="text-xs">{bn ? "নাম (বাংলা)" : "Name (Bangla)"}</Label>
                    <Input
                      value={form.name_bn}
                      onChange={(e) => setForm({ ...form, name_bn: e.target.value })}
                      className="text-sm mt-1"
                      placeholder="জন ডো"
                    />
                  </div>
                </div>
                <div className="max-w-sm">
                  <Label className="text-xs">{bn ? "ফোন নম্বর" : "Phone Number"}</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="text-sm mt-1"
                    placeholder="+880..."
                  />
                  {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                </div>
                <div className="max-w-sm">
                  <Label className="text-xs">{bn ? "ইমেইল" : "Email"}</Label>
                  <Input value={user?.email || ""} disabled className="text-sm mt-1 bg-muted" />
                </div>
                <Button onClick={handleSave} disabled={updateMut.isPending} size="sm" className="gap-1.5 text-xs">
                  {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {bn ? "সংরক্ষণ করুন" : "Save Changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* SMS Gateway Configuration */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border bg-primary/5 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-primary">
              {bn ? "SMS গেটওয়ে কনফিগারেশন" : "SMS Gateway Configuration"}
            </h2>
          </div>
          <div className="p-5">
            <SmsGatewayConfig />
          </div>
        </div>

        {/* Existing settings sections */}
        {settingsSections.map((section) => (
          <div key={section.titleEn} className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border bg-primary/5">
              <h2 className="text-sm font-bold text-primary">
                {bn ? section.titleBn : section.titleEn}
              </h2>
            </div>
            <div className="divide-y divide-border">
              {section.items.map((item) => (
                <div key={item.labelEn} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <p className="text-xs font-medium">
                    {bn ? item.labelBn : item.labelEn}
                  </p>
                  <p className="text-xs text-muted-foreground text-right max-w-[300px]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
