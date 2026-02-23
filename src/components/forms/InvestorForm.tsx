import { useState, useMemo } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateRecord, useUpdateRecord } from "@/hooks/useCrudOperations";
import { useLanguage } from "@/contexts/LanguageContext";
import { Check, ChevronLeft, ChevronRight, TrendingUp, ShieldCheck, UserCheck, FileCheck2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  name_en: z.string().trim().min(1, "Name (English) is required").max(100),
  name_bn: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).optional(),
  nid_number: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  source_of_fund: z.string().optional(),
  capital: z.coerce.number().min(0, "Capital must be >= 0"),
  monthly_profit_percent: z.coerce.number().min(0).max(100),
  tenure_years: z.coerce.number().min(1).max(10).optional(),
  investment_model: z.enum(["profit_only", "profit_plus_principal"]).default("profit_only"),
  reinvest: z.boolean().default(false),
  principal_amount: z.coerce.number().min(0).default(0),
  nominee_name: z.string().trim().max(100).optional(),
  nominee_relation: z.string().trim().max(50).optional(),
  nominee_phone: z.string().trim().max(20).optional(),
  nominee_nid: z.string().trim().max(20).optional(),
});

interface Props {
  open: boolean;
  onClose: () => void;
  editData?: Record<string, any> | null;
}

const STEPS = [
  { id: 1, title: "KYC & Identity", titleBn: "পরিচয় যাচাই", icon: UserCheck },
  { id: 2, title: "Financial Contract", titleBn: "আর্থিক চুক্তি", icon: ShieldCheck },
  { id: 3, title: "Nominee", titleBn: "নমিনি", icon: FileCheck2 },
  { id: 4, title: "Agreement", titleBn: "চুক্তিনামা", icon: Check },
];

const SOURCE_OF_FUND_OPTIONS = [
  { value: "business", label: "Business", labelBn: "ব্যবসা" },
  { value: "salary", label: "Salary", labelBn: "বেতন" },
  { value: "remittance", label: "Remittance", labelBn: "রেমিট্যান্স" },
  { value: "real_estate", label: "Real Estate", labelBn: "রিয়েল এস্টেট" },
  { value: "other", label: "Other", labelBn: "অন্যান্য" },
];

export default function InvestorForm({ open, onClose, editData }: Props) {
  const { lang } = useLanguage();
  const create = useCreateRecord("investors");
  const update = useUpdateRecord("investors");
  const isEdit = !!editData;

  const [step, setStep] = useState(1);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({
    name_en: editData?.name_en ?? "",
    name_bn: editData?.name_bn ?? "",
    phone: editData?.phone ?? "",
    nid_number: editData?.nid_number ?? "",
    address: editData?.address ?? "",
    source_of_fund: editData?.source_of_fund ?? "",
    capital: editData?.capital ?? 0,
    monthly_profit_percent: editData?.monthly_profit_percent ?? 0,
    tenure_years: editData?.tenure_years ?? 1,
    investment_model: editData?.investment_model ?? "profit_only",
    reinvest: editData?.reinvest ?? false,
    principal_amount: editData?.principal_amount ?? 0,
    nominee_name: editData?.nominee_name ?? "",
    nominee_relation: editData?.nominee_relation ?? "",
    nominee_phone: editData?.nominee_phone ?? "",
    nominee_nid: editData?.nominee_nid ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: string, val: any) => setForm((p) => ({ ...p, [key]: val }));

  // AI Projection calculations
  const projection = useMemo(() => {
    const cap = Number(form.capital) || 0;
    const pct = Number(form.monthly_profit_percent) || 0;
    const years = Number(form.tenure_years) || 1;
    const months = years * 12;
    const monthlyRate = pct / 100;

    if (form.investment_model === "profit_only") {
      const monthlyPayout = Math.round(cap * monthlyRate);
      const totalProfit = monthlyPayout * months;
      return { monthlyPayout, totalProfit, maturityValue: cap + totalProfit, months };
    } else {
      // Compound interest
      const maturityValue = Math.round(cap * Math.pow(1 + monthlyRate, months));
      const totalProfit = maturityValue - cap;
      return { monthlyPayout: 0, totalProfit, maturityValue, months };
    }
  }, [form.capital, form.monthly_profit_percent, form.tenure_years, form.investment_model]);

  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.name_en.trim()) errs.name_en = "Name (English) is required";
    }
    if (s === 2) {
      if (Number(form.capital) <= 0) errs.capital = "Capital must be > 0";
      if (Number(form.monthly_profit_percent) <= 0) errs.monthly_profit_percent = "Profit % is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const nextStep = () => {
    if (validateStep(step)) setStep((s) => Math.min(s + 1, 4));
  };
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    const data = { ...result.data };
    // Clean empty strings to null for optional fields
    const optionalFields = ["nid_number", "address", "source_of_fund", "nominee_name", "nominee_relation", "nominee_phone", "nominee_nid"];
    optionalFields.forEach((f) => { if (!(data as any)[f]) (data as any)[f] = null; });

    if (isEdit) {
      await update.mutateAsync({ id: editData!.id, data });
    } else {
      await create.mutateAsync(data);
    }
    onClose();
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-base font-bold">
            {isEdit ? (lang === "bn" ? "বিনিয়োগকারী সম্পাদনা" : "Edit Investor") : (lang === "bn" ? "নতুন বিনিয়োগকারী অনবোর্ডিং" : "Enterprise Investor Onboarding")}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = step === s.id;
              const isDone = step > s.id;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                      isDone ? "bg-primary border-primary text-primary-foreground" :
                      isActive ? "border-primary bg-primary/10 text-primary" :
                      "border-muted-foreground/30 text-muted-foreground/50"
                    )}>
                      {isDone ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium text-center leading-tight max-w-[70px]",
                      isActive ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground/50"
                    )}>
                      {lang === "bn" ? s.titleBn : s.title}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      "h-0.5 flex-1 mx-2 mt-[-18px] rounded-full transition-all duration-300",
                      isDone ? "bg-primary" : "bg-muted-foreground/20"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 pt-5 space-y-4">
          {/* Step 1: KYC */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "নাম (ইংরেজি)" : "Name (English)"} *</Label>
                  <Input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className="text-sm mt-1.5" placeholder="Full name in English" />
                  {errors.name_en && <p className="text-xs text-destructive mt-1">{errors.name_en}</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "নাম (বাংলা)" : "Name (Bangla)"}</Label>
                  <Input value={form.name_bn} onChange={(e) => set("name_bn", e.target.value)} className="text-sm mt-1.5" placeholder="পূর্ণ নাম বাংলায়" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "ফোন" : "Phone"}</Label>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="text-sm mt-1.5" placeholder="01XXXXXXXXX" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "জাতীয় পরিচয়পত্র নম্বর" : "NID Number"}</Label>
                  <Input value={form.nid_number} onChange={(e) => set("nid_number", e.target.value)} className="text-sm mt-1.5" placeholder="NID / Smart Card No." />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">{lang === "bn" ? "ঠিকানা" : "Address"}</Label>
                <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} className="text-sm mt-1.5 min-h-[70px]" placeholder={lang === "bn" ? "সম্পূর্ণ ঠিকানা লিখুন" : "Full address"} />
              </div>
              <div>
                <Label className="text-xs font-semibold">{lang === "bn" ? "অর্থের উৎস" : "Source of Fund"}</Label>
                <Select value={form.source_of_fund} onValueChange={(v) => set("source_of_fund", v)}>
                  <SelectTrigger className="text-sm mt-1.5"><SelectValue placeholder={lang === "bn" ? "নির্বাচন করুন" : "Select source"} /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OF_FUND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{lang === "bn" ? o.labelBn : o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Financial Contract */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "মূলধন ৳" : "Capital Amount ৳"} *</Label>
                  <Input type="number" value={form.capital} onChange={(e) => set("capital", Number(e.target.value))} className="text-sm mt-1.5" />
                  {errors.capital && <p className="text-xs text-destructive mt-1">{errors.capital}</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "মাসিক মুনাফা %" : "Monthly Profit %"} *</Label>
                  <Input type="number" step="0.1" value={form.monthly_profit_percent} onChange={(e) => set("monthly_profit_percent", Number(e.target.value))} className="text-sm mt-1.5" />
                  {errors.monthly_profit_percent && <p className="text-xs text-destructive mt-1">{errors.monthly_profit_percent}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "মেয়াদ / লক-ইন পিরিয়ড" : "Tenure / Lock-in Period"}</Label>
                  <Select value={String(form.tenure_years)} onValueChange={(v) => set("tenure_years", Number(v))}>
                    <SelectTrigger className="text-sm mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y} {lang === "bn" ? "বছর" : (y === 1 ? "Year" : "Years")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "বিনিয়োগ মডেল" : "Investment Model"}</Label>
                  <Select value={form.investment_model} onValueChange={(v) => set("investment_model", v)}>
                    <SelectTrigger className="text-sm mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profit_only">{lang === "bn" ? "শুধুমাত্র মুনাফা" : "Profit Only"}</SelectItem>
                      <SelectItem value="profit_plus_principal">{lang === "bn" ? "মুনাফা + মূলধন (কম্পাউন্ড)" : "Profit + Principal (Compound)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <Label className="text-xs font-semibold">{lang === "bn" ? "স্বয়ংক্রিয় পুনঃবিনিয়োগ" : "Auto Reinvest"}</Label>
                <Switch checked={form.reinvest} onCheckedChange={(v) => set("reinvest", v)} />
              </div>

              {/* Anti-Loss Rule Warning */}
              <div className="flex gap-3 p-3.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-yellow-700 dark:text-yellow-400 mb-1">
                    {lang === "bn" ? "⚠️ মেয়াদপূর্তির পূর্বে ভাঙানোর নীতি" : "⚠️ Pre-mature Encashment Policy"}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {lang === "bn"
                      ? "মেয়াদপূর্তির আগে উত্তোলন করলে, পূর্ববর্তী মুনাফা জরিমানা হারে পুনঃগণনা করা হবে এবং মূলধনের বিপরীতে সমন্বয় করা হবে।"
                      : "If withdrawn before maturity, previous profits will be recalculated at a penalty rate, adjusting against the principal to ensure institutional liquidity."}
                  </p>
                </div>
              </div>

              {/* AI Projection Card */}
              {Number(form.capital) > 0 && Number(form.monthly_profit_percent) > 0 && (
                <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary">
                      {lang === "bn" ? "💡 AI প্রজেকশন" : "💡 AI Projection"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {form.investment_model === "profit_only" ? (
                      <>
                        <div className="bg-background/60 rounded-md p-3 text-center">
                          <p className="text-[10px] text-muted-foreground mb-1">{lang === "bn" ? "মাসিক পে-আউট" : "Monthly Payout"}</p>
                          <p className="text-lg font-bold text-primary">৳{projection.monthlyPayout.toLocaleString()}</p>
                        </div>
                        <div className="bg-background/60 rounded-md p-3 text-center">
                          <p className="text-[10px] text-muted-foreground mb-1">{lang === "bn" ? `মোট মুনাফা (${projection.months} মাসে)` : `Total Profit (${projection.months}mo)`}</p>
                          <p className="text-lg font-bold text-success">৳{projection.totalProfit.toLocaleString()}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-background/60 rounded-md p-3 text-center">
                          <p className="text-[10px] text-muted-foreground mb-1">{lang === "bn" ? "মোট মুনাফা" : "Total Profit"}</p>
                          <p className="text-lg font-bold text-success">৳{projection.totalProfit.toLocaleString()}</p>
                        </div>
                        <div className="bg-background/60 rounded-md p-3 text-center relative overflow-hidden">
                          <p className="text-[10px] text-muted-foreground mb-1">{lang === "bn" ? "ম্যাচুরিটি ভ্যালু" : "Maturity Value"}</p>
                          <p className="text-lg font-bold text-primary flex items-center justify-center gap-1">
                            <TrendingUp className="w-4 h-4 text-success" />
                            ৳{projection.maturityValue.toLocaleString()}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center italic">
                    {form.investment_model === "profit_plus_principal"
                      ? (lang === "bn" ? `কম্পাউন্ড রিটার্ন: ৳${Number(form.capital).toLocaleString()} → ৳${projection.maturityValue.toLocaleString()} (${projection.months} মাসে)` : `Compound: ৳${Number(form.capital).toLocaleString()} → ৳${projection.maturityValue.toLocaleString()} in ${projection.months} months`)
                      : (lang === "bn" ? `সরল মুনাফা: প্রতি মাসে ৳${projection.monthlyPayout.toLocaleString()} পে-আউট` : `Simple: ৳${projection.monthlyPayout.toLocaleString()}/month payout`)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Nominee */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "উত্তরাধিকারী / নমিনি তথ্য (100% শেয়ার)" : "Successor / Nominee Information (100% share)"}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "নমিনির নাম" : "Nominee Name"}</Label>
                  <Input value={form.nominee_name} onChange={(e) => set("nominee_name", e.target.value)} className="text-sm mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "সম্পর্ক" : "Relation to Investor"}</Label>
                  <Select value={form.nominee_relation} onValueChange={(v) => set("nominee_relation", v)}>
                    <SelectTrigger className="text-sm mt-1.5"><SelectValue placeholder={lang === "bn" ? "নির্বাচন করুন" : "Select"} /></SelectTrigger>
                    <SelectContent>
                      {[
                        { v: "spouse", en: "Spouse", bn: "স্বামী/স্ত্রী" },
                        { v: "son", en: "Son", bn: "পুত্র" },
                        { v: "daughter", en: "Daughter", bn: "কন্যা" },
                        { v: "father", en: "Father", bn: "পিতা" },
                        { v: "mother", en: "Mother", bn: "মাতা" },
                        { v: "brother", en: "Brother", bn: "ভাই" },
                        { v: "sister", en: "Sister", bn: "বোন" },
                        { v: "other", en: "Other", bn: "অন্যান্য" },
                      ].map((r) => (
                        <SelectItem key={r.v} value={r.v}>{lang === "bn" ? r.bn : r.en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "নমিনির ফোন" : "Nominee Phone"}</Label>
                  <Input value={form.nominee_phone} onChange={(e) => set("nominee_phone", e.target.value)} className="text-sm mt-1.5" placeholder="01XXXXXXXXX" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{lang === "bn" ? "নমিনির NID" : "Nominee NID"}</Label>
                  <Input value={form.nominee_nid} onChange={(e) => set("nominee_nid", e.target.value)} className="text-sm mt-1.5" />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Agreement */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <p className="text-xs font-semibold text-muted-foreground mb-3">{lang === "bn" ? "চুক্তি সারসংক্ষেপ" : "Agreement Summary"}</p>
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2.5">
                <SummaryRow label={lang === "bn" ? "বিনিয়োগকারী" : "Investor"} value={form.name_en || form.name_bn} />
                <SummaryRow label={lang === "bn" ? "মূলধন" : "Capital"} value={`৳${Number(form.capital).toLocaleString()}`} />
                <SummaryRow label={lang === "bn" ? "মুনাফা হার" : "Profit Rate"} value={`${form.monthly_profit_percent}% / ${lang === "bn" ? "মাস" : "month"}`} />
                <SummaryRow label={lang === "bn" ? "মেয়াদ" : "Tenure"} value={`${form.tenure_years} ${lang === "bn" ? "বছর" : "Year(s)"}`} />
                <SummaryRow label={lang === "bn" ? "মডেল" : "Model"} value={form.investment_model === "profit_only" ? (lang === "bn" ? "শুধুমাত্র মুনাফা" : "Profit Only") : (lang === "bn" ? "মুনাফা + মূলধন" : "Profit + Principal")} />
                {form.nominee_name && <SummaryRow label={lang === "bn" ? "নমিনি" : "Nominee"} value={`${form.nominee_name} (${form.nominee_relation || "—"})`} />}
                <div className="border-t border-border pt-2 mt-2">
                  <SummaryRow
                    label={lang === "bn" ? "প্রক্ষেপিত ম্যাচুরিটি" : "Projected Maturity"}
                    value={`৳${projection.maturityValue.toLocaleString()}`}
                    highlight
                  />
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-lg border border-border bg-muted/10">
                <Checkbox
                  id="agree"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="agree" className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none">
                  {lang === "bn"
                    ? "আমি একতা ফাইন্যান্সের বিনিয়োগ শর্তাবলী এবং লক-ইন নীতিমালায় সম্মত।"
                    : "I agree to the Ekta Finance Investment Terms & Lock-in conditions."}
                </label>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={prevStep} disabled={step === 1} className="text-xs gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> {lang === "bn" ? "পূর্ববর্তী" : "Back"}
            </Button>
            <span className="text-[10px] text-muted-foreground">{step}/4</span>
            {step < 4 ? (
              <Button size="sm" onClick={nextStep} className="text-xs gap-1">
                {lang === "bn" ? "পরবর্তী" : "Next"} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={isPending || !agreed} className="text-xs gap-1.5">
                {isPending ? "..." : isEdit ? (lang === "bn" ? "আপডেট" : "Update") : (lang === "bn" ? "তৈরি করুন" : "Create")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", highlight && "text-primary text-sm")}>{value}</span>
    </div>
  );
}
