import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuantumConfig, useUpdateQuantumConfig, type QuantumLedgerConfig } from "@/hooks/useQuantumConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";

export default function QuantumLedgerSettings() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { config, isLoading } = useQuantumConfig();
  const updateMut = useUpdateQuantumConfig();

  const [form, setForm] = useState<QuantumLedgerConfig>(config);

  useEffect(() => { if (config) setForm(config); }, [config]);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const toggleFields: { key: keyof QuantumLedgerConfig; labelBn: string; labelEn: string }[] = [
    { key: "voice_enabled", labelBn: "ভয়েস লেজার", labelEn: "Voice Ledger" },
    { key: "bulk_collection_enabled", labelBn: "বাল্ক কালেকশন", labelEn: "Bulk Collection" },
    { key: "ai_prediction_enabled", labelBn: "AI প্রেডিকশন", labelEn: "AI Prediction" },
    { key: "audit_lock_enabled", labelBn: "অডিট লক", labelEn: "Audit Lock" },
  ];

  const numericFields: { key: keyof QuantumLedgerConfig; labelBn: string; labelEn: string; unit: string }[] = [
    { key: "grace_period_days", labelBn: "গ্রেস পিরিয়ড", labelEn: "Grace Period", unit: bn ? "দিন" : "days" },
    { key: "late_fee_rate", labelBn: "জরিমানা হার", labelEn: "Late Fee Rate", unit: "%" },
    { key: "defaulter_threshold", labelBn: "ডিফল্টার থ্রেশহোল্ড", labelEn: "Defaulter Threshold", unit: bn ? "দিন" : "days" },
    { key: "loan_rebate_flat", labelBn: "ফ্ল্যাট ঋণ ছাড়", labelEn: "Flat Loan Rebate", unit: "%" },
    { key: "loan_rebate_reducing", labelBn: "রিডিউসিং ঋণ ছাড়", labelEn: "Reducing Loan Rebate", unit: "%" },
    { key: "processing_fee_percent", labelBn: "প্রসেসিং ফি", labelEn: "Processing Fee", unit: "%" },
    { key: "minimum_notice_days", labelBn: "সর্বনিম্ন নোটিশ", labelEn: "Minimum Notice", unit: bn ? "দিন" : "days" },
  ];

  return (
    <div className="space-y-5">
      {/* Toggle switches */}
      <div className="space-y-3">
        {toggleFields.map(f => (
          <div key={f.key} className="flex items-center justify-between">
            <Label className="text-xs font-medium">{bn ? f.labelBn : f.labelEn}</Label>
            <Switch
              checked={!!form[f.key]}
              onCheckedChange={(v) => setForm(prev => ({ ...prev, [f.key]: v }))}
            />
          </div>
        ))}
      </div>

      {/* Numeric fields */}
      <div className="grid grid-cols-2 gap-3">
        {numericFields.map(f => (
          <div key={f.key}>
            <Label className="text-[10px] text-muted-foreground">{bn ? f.labelBn : f.labelEn} ({f.unit})</Label>
            <Input
              type="number"
              value={form[f.key] as number}
              onChange={(e) => setForm(prev => ({ ...prev, [f.key]: Number(e.target.value) }))}
              className="text-sm mt-1 h-8"
            />
          </div>
        ))}
      </div>

      <Button
        onClick={() => updateMut.mutate(form)}
        disabled={updateMut.isPending}
        size="sm"
        className="w-full gap-1.5 text-xs"
      >
        {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        {bn ? "কনফিগ সংরক্ষণ করুন" : "Save Config"}
      </Button>
    </div>
  );
}
