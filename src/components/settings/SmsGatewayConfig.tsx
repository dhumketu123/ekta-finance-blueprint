import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Radio, Smartphone, Globe, CheckCircle2, AlertCircle } from "lucide-react";

type GatewayMode = "api" | "mobile_native" | "webhook";

interface GatewayConfig {
  mode: GatewayMode;
  webhook_url: string;
  active: boolean;
}

const GATEWAY_OPTIONS: { mode: GatewayMode; iconFn: () => JSX.Element; labelBn: string; labelEn: string; descBn: string; descEn: string }[] = [
  {
    mode: "api",
    iconFn: () => <Radio className="w-5 h-5" />,
    labelBn: "থার্ড-পার্টি API",
    labelEn: "Third-party API",
    descBn: "BulkSMSBD / Twilio — API Key থাকলে স্বয়ংক্রিয় SMS",
    descEn: "BulkSMSBD / Twilio — Auto SMS when API Key configured",
  },
  {
    mode: "mobile_native",
    iconFn: () => <Smartphone className="w-5 h-5" />,
    labelBn: "মোবাইল নেটিভ (sms: intent)",
    labelEn: "Mobile Native (sms: intent)",
    descBn: "'SMS পাঠান' বোতাম চাপলে ডিফল্ট মেসেজিং অ্যাপ খুলবে",
    descEn: "'Send SMS' button opens default messaging app",
  },
  {
    mode: "webhook",
    iconFn: () => <Globe className="w-5 h-5" />,
    labelBn: "লোকাল ওয়েবহুক গেটওয়ে",
    labelEn: "Local Webhook Gateway",
    descBn: "কাস্টম URL-এ POST request — নম্বর ও মেসেজ সহ",
    descEn: "POST request to custom URL with number & message",
  },
];

export default function SmsGatewayConfig() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const qc = useQueryClient();

  const { data: setting, isLoading } = useQuery({
    queryKey: ["system_settings", "sms_gateway"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("*")
        .eq("setting_key", "sms_gateway")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const config: GatewayConfig = setting?.setting_value ?? { mode: "api", webhook_url: "", active: true };

  const [mode, setMode] = useState<GatewayMode>(config.mode);
  const [webhookUrl, setWebhookUrl] = useState(config.webhook_url);
  const [active, setActive] = useState(config.active);

  useEffect(() => {
    if (setting?.setting_value) {
      const c = setting.setting_value as GatewayConfig;
      setMode(c.mode);
      setWebhookUrl(c.webhook_url || "");
      setActive(c.active ?? true);
    }
  }, [setting]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const newValue: GatewayConfig = { mode, webhook_url: webhookUrl.trim(), active };
      const { error } = await supabase
        .from("system_settings" as any)
        .update({ setting_value: newValue as any, updated_at: new Date().toISOString() })
        .eq("setting_key", "sms_gateway");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system_settings"] });
      toast.success(bn ? "গেটওয়ে কনফিগ সংরক্ষিত ✅" : "Gateway config saved ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {bn ? "SMS ডেলিভারি" : "SMS Delivery"}
        </span>
        <Badge
          variant={active ? "default" : "secondary"}
          className={`text-[10px] cursor-pointer transition-colors ${active ? "bg-success/10 text-success border-success/20" : ""}`}
          onClick={() => setActive(!active)}
        >
          {active ? (bn ? "✅ সক্রিয়" : "✅ Active") : (bn ? "⏸ নিষ্ক্রিয়" : "⏸ Inactive")}
        </Badge>
      </div>

      {/* Gateway mode selector */}
      <div className="space-y-2">
        <Label className="text-xs">{bn ? "ডেলিভারি মোড" : "Delivery Mode"}</Label>
        <div className="grid gap-2">
          {GATEWAY_OPTIONS.map((opt) => {
            const selected = mode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setMode(opt.mode)}
                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <div className={`mt-0.5 ${selected ? "text-primary" : "text-muted-foreground"}`}>
                  {opt.iconFn()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{bn ? opt.labelBn : opt.labelEn}</span>
                    {selected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {bn ? opt.descBn : opt.descEn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Webhook URL — only shown when webhook mode */}
      {mode === "webhook" && (
        <div>
          <Label className="text-xs">Webhook URL *</Label>
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-gateway.local/send-sms"
            className="text-sm mt-1 font-mono"
          />
          <div className="flex items-start gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              {bn
                ? "POST request পাঠানো হবে: { phone, message, event_type }"
                : "Will send POST: { phone, message, event_type }"}
            </span>
          </div>
        </div>
      )}

      {/* API mode info */}
      {mode === "api" && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 text-[10px] text-muted-foreground">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {bn
              ? "SMS_API_KEY এবং SMS_SENDER_ID সিক্রেট কনফিগার করা প্রয়োজন। Edge Function স্বয়ংক্রিয়ভাবে SMS পাঠাবে।"
              : "Requires SMS_API_KEY and SMS_SENDER_ID secrets configured. Edge function sends SMS automatically."}
          </span>
        </div>
      )}

      {/* Mobile native info */}
      {mode === "mobile_native" && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 text-[10px] text-muted-foreground">
          <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {bn
              ? "নোটিফিকেশন পেজে প্রতিটি বিজ্ঞপ্তিতে 'ফোনে পাঠান' বোতাম দেখাবে। ক্লিক করলে ডিফল্ট SMS অ্যাপ খুলবে।"
              : "Each notification will show a 'Send via Phone' button. Clicking opens the default SMS app with pre-filled message."}
          </span>
        </div>
      )}

      <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="sm" className="w-full gap-1.5 text-xs">
        {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        {bn ? "কনফিগ সংরক্ষণ করুন" : "Save Gateway Config"}
      </Button>
    </div>
  );
}
