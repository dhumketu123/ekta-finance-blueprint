import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantRules, useUpdateTenantRule } from "@/hooks/useTenantRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface RuleField {
  key: string;
  labelEn: string;
  labelBn: string;
  type: "number" | "select";
  unit?: string;
  options?: { value: string; labelEn: string; labelBn: string }[];
  min?: number;
  max?: number;
}

const RULE_FIELDS: RuleField[] = [
  { key: "dps_interest_rate", labelEn: "DPS Interest Rate", labelBn: "ডিপিএস সুদের হার", type: "number", unit: "%", min: 0, max: 50 },
  { key: "penalty_late_fee_rate", labelEn: "Late Fee / Penalty Rate", labelBn: "জরিমানা / বিলম্ব ফি হার", type: "number", unit: "%", min: 0, max: 20 },
  { key: "min_loan_amount", labelEn: "Minimum Loan Amount", labelBn: "সর্বনিম্ন ঋণের পরিমাণ", type: "number", unit: "৳", min: 0 },
  { key: "max_loan_amount", labelEn: "Maximum Loan Amount", labelBn: "সর্বোচ্চ ঋণের পরিমাণ", type: "number", unit: "৳", min: 0 },
  { key: "grace_period_days", labelEn: "Grace Period", labelBn: "গ্রেস পিরিয়ড", type: "number", unit: "days", min: 0, max: 90 },
  { key: "defaulter_threshold_days", labelEn: "Defaulter Threshold", labelBn: "ডিফল্টার থ্রেশহোল্ড", type: "number", unit: "days", min: 1, max: 365 },
  {
    key: "approval_workflow",
    labelEn: "Approval Workflow",
    labelBn: "অনুমোদন প্রক্রিয়া",
    type: "select",
    options: [
      { value: "maker_checker", labelEn: "Maker-Checker (4-Eyes)", labelBn: "মেকার-চেকার (৪-আইজ)" },
      { value: "auto_approve", labelEn: "Auto Approve", labelBn: "অটো অনুমোদন" },
      { value: "admin_only", labelEn: "Admin Only", labelBn: "শুধু অ্যাডমিন" },
    ],
  },
];

export default function TenantRulesSettings() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { rules, isLoading } = useTenantRules();
  const updateMut = useUpdateTenantRule();

  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (rules) setForm({ ...rules });
  }, [rules]);

  const handleSaveAll = async () => {
    try {
      for (const field of RULE_FIELDS) {
        const val = form[field.key];
        if (val !== undefined && val !== rules[field.key]) {
          await updateMut.mutateAsync({
            ruleKey: field.key,
            ruleValue: field.type === "number" ? Number(val) : val,
          });
        }
      }
      toast.success(bn ? "সব নিয়ম সংরক্ষিত ✅" : "All rules saved ✅");
    } catch {
      // Individual errors handled by mutation
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {RULE_FIELDS.map((field) => (
          <div key={field.key}>
            <Label className="text-xs font-medium text-muted-foreground">
              {bn ? field.labelBn : field.labelEn}
              {field.unit && <span className="ml-1 text-[10px] opacity-60">({field.unit})</span>}
            </Label>

            {field.type === "number" ? (
              <Input
                type="number"
                value={form[field.key] ?? ""}
                onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                min={field.min}
                max={field.max}
                className="mt-1.5 h-9 text-sm"
              />
            ) : field.type === "select" && field.options ? (
              <Select
                value={String(form[field.key] ?? "")}
                onValueChange={(v) => setForm({ ...form, [field.key]: v })}
              >
                <SelectTrigger className="mt-1.5 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {bn ? opt.labelBn : opt.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ))}
      </div>

      <Button onClick={handleSaveAll} disabled={updateMut.isPending} size="sm" className="w-full gap-1.5 text-xs">
        {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        {bn ? "নিয়মাবলী সংরক্ষণ করুন" : "Save Rules"}
      </Button>
    </div>
  );
}
