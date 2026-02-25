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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save, User, MessageSquare, Atom, ShieldCheck, Settings, Lock, KeyRound } from "lucide-react";
import { z } from "zod";
import SmsGatewayConfig from "@/components/settings/SmsGatewayConfig";
import QuantumLedgerSettings from "@/components/settings/QuantumLedgerSettings";
import SecuritySettingsCard from "@/components/settings/SecuritySettingsCard";

const profileSchema = z.object({
  name_en: z.string().trim().min(1, "Name is required").max(100),
  name_bn: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
});

const systemSections = [
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

const premiumCard = "bg-card rounded-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-border p-6";

const SettingsPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const bn = lang === "bn";

  // Profile
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
        .update({ name_en: data.name_en, name_bn: data.name_bn || "", phone: data.phone || null })
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

  // Maker-Checker toggle
  const [makerCheckerEnabled, setMakerCheckerEnabled] = useState(false);
  const [makerCheckerLoading, setMakerCheckerLoading] = useState(true);

  useEffect(() => {
    const fetchMakerChecker = async () => {
      try {
        const { data } = await supabase
          .from("system_settings" as any)
          .select("setting_value")
          .eq("setting_key", "maker_checker_enabled")
          .single();
        if (data) setMakerCheckerEnabled((data as any).setting_value === '"true"');
      } catch {
        // silent
      } finally {
        setMakerCheckerLoading(false);
      }
    };
    fetchMakerChecker();
  }, []);

  const handleMakerCheckerToggle = async (checked: boolean) => {
    setMakerCheckerEnabled(checked);
    try {
      await supabase
        .from("system_settings" as any)
        .update({ setting_value: checked ? '"true"' : '"false"' } as any)
        .eq("setting_key", "maker_checker_enabled");
      toast.success(checked ? (bn ? "সিকিউরিটি চালু হয়েছে" : "Security enabled") : (bn ? "সিকিউরিটি বন্ধ করা হয়েছে" : "Security disabled"));
    } catch {
      toast.error(bn ? "আপডেট ব্যর্থ" : "Update failed");
      setMakerCheckerEnabled(!checked);
    }
  };

  return (
    <AppLayout>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6 h-12 bg-muted/60 rounded-xl p-1">
          <TabsTrigger value="profile" className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md gap-1.5">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">{bn ? "প্রোফাইল" : "Profile"}</span>
            <span className="sm:hidden">👤</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">{bn ? "সিকিউরিটি" : "Security"}</span>
            <span className="sm:hidden">🛡️</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="rounded-lg text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:shadow-md gap-1.5">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">{bn ? "সিস্টেম" : "System"}</span>
            <span className="sm:hidden">⚙️</span>
          </TabsTrigger>
        </TabsList>

        {/* ===== PROFILE TAB ===== */}
        <TabsContent value="profile" className="space-y-6 mt-0">
          <div className={premiumCard}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {bn ? "প্রোফাইল তথ্য" : "Profile Information"}
              </h2>
            </div>
            {profileLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{bn ? "নাম (ইংরেজি) *" : "Name (English) *"}</Label>
                    <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} className="mt-1.5" placeholder="John Doe" />
                    {errors.name_en && <p className="text-xs text-destructive mt-1">{errors.name_en}</p>}
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">{bn ? "নাম (বাংলা)" : "Name (Bangla)"}</Label>
                    <Input value={form.name_bn} onChange={(e) => setForm({ ...form, name_bn: e.target.value })} className="mt-1.5" placeholder="জন ডো" />
                  </div>
                </div>
                <div className="max-w-sm">
                  <Label className="text-xs font-medium text-muted-foreground">{bn ? "ফোন নম্বর" : "Phone Number"}</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" placeholder="+880..." />
                  {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
                </div>
                <div className="max-w-sm">
                  <Label className="text-xs font-medium text-muted-foreground">{bn ? "ইমেইল" : "Email"}</Label>
                  <Input value={user?.email || ""} disabled className="mt-1.5 bg-muted/50" />
                </div>
                <Button onClick={handleSave} disabled={updateMut.isPending} size="sm" className="gap-1.5 text-xs mt-2">
                  {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {bn ? "সংরক্ষণ করুন" : "Save Changes"}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ===== SECURITY TAB ===== */}
        <TabsContent value="security" className="space-y-6 mt-0">
          {/* Maker-Checker Card */}
          <div className={`rounded-xl p-6 transition-all duration-300 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] ${
            makerCheckerEnabled
              ? "bg-emerald-50/30 border-2 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
              : "bg-card border border-border"
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                  makerCheckerEnabled
                    ? "bg-emerald-100 dark:bg-emerald-900/50"
                    : "bg-muted"
                }`}>
                  <ShieldCheck className={`w-6 h-6 ${
                    makerCheckerEnabled ? "text-emerald-600" : "text-muted-foreground"
                  }`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    {bn ? "ফোর-আইজ সিকিউরিটি (Maker-Checker)" : "Four-Eyes Security (Maker-Checker)"}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-md">
                    {bn
                      ? "একই অফিসার লেনদেন এন্ট্রি এবং অনুমোদন করতে পারবেন না। জালিয়াতি রোধে এটি ব্যবহার করুন।"
                      : "The same officer cannot both create and approve a transaction. Use this to prevent fraud."}
                  </p>
                  {makerCheckerEnabled && (
                    <div className="flex items-center gap-1.5 mt-2.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {bn ? "সক্রিয় — সর্বোচ্চ নিরাপত্তা" : "Active — Maximum Security"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="pt-1">
                {makerCheckerLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <Switch checked={makerCheckerEnabled} onCheckedChange={handleMakerCheckerToggle} />
                )}
              </div>
            </div>
          </div>

          {/* Transaction PIN Card */}
          <div className={premiumCard}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 rounded-lg bg-primary/10">
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {bn ? "ট্রানজেকশন PIN" : "Transaction PIN"}
              </h2>
            </div>
            <SecuritySettingsCard />
          </div>

          {/* SMS Gateway */}
          <div className={premiumCard}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {bn ? "SMS গেটওয়ে কনফিগারেশন" : "SMS Gateway Configuration"}
              </h2>
            </div>
            <SmsGatewayConfig />
          </div>

          {/* Quantum Ledger */}
          <div className={premiumCard}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="p-2 rounded-lg bg-primary/10">
                <Atom className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                {bn ? "কোয়ান্টাম লেজার কনফিগ" : "Quantum Ledger Config"}
              </h2>
            </div>
            <QuantumLedgerSettings />
          </div>
        </TabsContent>

        {/* ===== SYSTEM TAB ===== */}
        <TabsContent value="system" className="space-y-6 mt-0">
          {systemSections.map((section) => (
            <div key={section.titleEn} className={premiumCard + " !p-0 overflow-hidden"}>
              <div className="px-6 py-4 border-b border-border bg-muted/30">
                <h2 className="text-sm font-bold text-foreground">
                  {bn ? section.titleBn : section.titleEn}
                </h2>
              </div>
              <div className="divide-y divide-border">
                {section.items.map((item) => (
                  <div key={item.labelEn} className="px-6 py-3.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                    <p className="text-xs font-medium text-foreground">
                      {bn ? item.labelBn : item.labelEn}
                    </p>
                    <p className="text-xs text-muted-foreground text-right max-w-[300px]">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default SettingsPage;
