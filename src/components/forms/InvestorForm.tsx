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
import { useTenantId } from "@/hooks/useTenantId";
import { Check, ChevronLeft, ChevronRight, TrendingUp, ShieldCheck, UserCheck, FileCheck2, AlertTriangle, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  name_en: z.string().trim().min(1, "Name (English) is required").max(100),
  name_bn: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(20).optional(),
  nid_number: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  source_of_fund: z.string().optional(),
  capital: z.coerce.number().min(0, "Capital must be >= 0"),
  weekly_share: z.coerce.number().min(100, "Weekly share must be at least 100").default(100),
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
  isOwnerMode?: boolean;
}

const SOURCE_OF_FUND_OPTIONS = [
  { value: "business", label: "Business", labelBn: "ব্যবসা" },
  { value: "salary", label: "Salary", labelBn: "বেতন" },
  { value: "remittance", label: "Remittance", labelBn: "রেমিট্যান্স" },
  { value: "real_estate", label: "Real Estate", labelBn: "রিয়েল এস্টেট" },
  { value: "other", label: "Other", labelBn: "অন্যান্য" },
];

export default function InvestorForm({ open, onClose, editData, isOwnerMode = false }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const create = useCreateRecord("investors");
  const update = useUpdateRecord("investors");
  const { tenantId } = useTenantId();
  const isEdit = !!editData;

  const STEPS = useMemo(() => [
    { id: 1, title: isOwnerMode ? "Digital KYC & Identity" : "KYC & Identity", titleBn: isOwnerMode ? "ডিজিটাল KYC ও পরিচয়" : "পরিচয় যাচাই", icon: UserCheck },
    { id: 2, title: isOwnerMode ? "Core Capital Matrix" : "Financial Contract", titleBn: isOwnerMode ? "কোর ক্যাপিটাল ম্যাট্রিক্স" : "আর্থিক চুক্তি", icon: ShieldCheck },
    { id: 3, title: isOwnerMode ? "Succession Planning" : "Nominee", titleBn: isOwnerMode ? "উত্তরাধিকার পরিকল্পনা" : "নমিনি", icon: FileCheck2 },
    { id: 4, title: isOwnerMode ? "Equity Pact" : "Agreement", titleBn: isOwnerMode ? "ইকুইটি প্যাক্ট" : "চুক্তিনামা", icon: isOwnerMode ? Crown : Check },
  ], [isOwnerMode]);

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
    weekly_share: editData?.weekly_share ?? 100,
    monthly_profit_percent: editData?.monthly_profit_percent ?? 0,
    tenure_years: editData?.tenure_years ?? (isOwnerMode ? 5 : 1),
    investment_model: editData?.investment_model ?? (isOwnerMode ? "profit_plus_principal" : "profit_only"),
    reinvest: editData?.reinvest ?? (isOwnerMode ? true : false),
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
      if (!isOwnerMode && Number(form.monthly_profit_percent) <= 0) errs.monthly_profit_percent = "Profit % is required";
      if (Number(form.weekly_share) < 100) errs.weekly_share = "Weekly share must be at least 100";
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
    const data: Record<string, any> = { ...result.data };
    
    // Clean empty strings to null for optional fields
    const optionalFields = ["nid_number", "address", "source_of_fund", "nominee_name", "nominee_relation", "nominee_phone", "nominee_nid"];
    optionalFields.forEach((f) => { if (!data[f]) data[f] = null; });

    // Owner mode: force founder equity payload
    if (isOwnerMode) {
      data.monthly_profit_percent = 0;
      data.investment_model = "profit_only"; // stored as profit_only since founder_equity isn't in enum
      data.reinvest = true;
      data.tenure_years = 5;
      data.principal_amount = 0;
    }

    // Inject tenant_id for RLS compliance
    if (tenantId) {
      data.tenant_id = tenantId;
    }

    // For new investors, set weekly_paid_until to current date
    if (!isEdit) {
      data.weekly_paid_until = new Date().toISOString().split('T')[0];
      data.total_weekly_paid = 0;
    }

    if (isEdit) {
      await update.mutateAsync({ id: editData!.id, data });
    } else {
      await create.mutateAsync(data);
    }
    onClose();
  };

  const isPending = create.isPending || update.isPending;

  const modalTitle = isEdit
    ? (bn ? "বিনিয়োগকারী সম্পাদনা" : "Edit Investor")
    : isOwnerMode
      ? (bn ? "ফাউন্ডার ইকুইটি প্যাক্ট" : "Founder Equity Onboarding")
      : (bn ? "নতুন বিনিয়োগকারী অনবোর্ডিং" : "Enterprise Investor Onboarding");

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            {isOwnerMode && <Crown className="w-5 h-5 text-primary" />}
            {modalTitle}
          </DialogTitle>
          {isOwnerMode && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {bn ? "কোর ফাউন্ডিং শেয়ারহোল্ডার — ৫ বছরের জিরো-ডিভিডেন্ড কম্পাউন্ডিং ভিশন" : "Core Founding Shareholder — 5-Year Zero-Dividend Compounding Vision"}
            </p>
          )}
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
                      {bn ? s.titleBn : s.title}
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
                  <Label className="text-xs font-semibold">{bn ? "নাম (ইংরেজি)" : "Name (English)"} *</Label>
                  <Input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className="text-sm mt-1.5" placeholder="Full name in English" />
                  {errors.name_en && <p className="text-xs text-destructive mt-1">{errors.name_en}</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold">{bn ? "নাম (বাংলা)" : "Name (Bangla)"}</Label>
                  <Input value={form.name_bn} onChange={(e) => set("name_bn", e.target.value)} className="text-sm mt-1.5" placeholder="পূর্ণ নাম বাংলায়" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{bn ? "ফোন (WhatsApp)" : "Phone (WhatsApp)"}</Label>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="text-sm mt-1.5" placeholder="01XXXXXXXXX" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{bn ? "জাতীয় পরিচয়পত্র নম্বর" : "NID Number"}</Label>
                  <Input value={form.nid_number} onChange={(e) => set("nid_number", e.target.value)} className="text-sm mt-1.5" placeholder="NID / Smart Card No." />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">{bn ? "ঠিকানা" : "Address"}</Label>
                <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} className="text-sm mt-1.5 min-h-[70px]" placeholder={bn ? "সম্পূর্ণ ঠিকানা লিখুন" : "Full address"} />
              </div>
              {!isOwnerMode && (
                <div>
                  <Label className="text-xs font-semibold">{bn ? "অর্থের উৎস" : "Source of Fund"}</Label>
                  <Select value={form.source_of_fund} onValueChange={(v) => set("source_of_fund", v)}>
                    <SelectTrigger className="text-sm mt-1.5"><SelectValue placeholder={bn ? "নির্বাচন করুন" : "Select source"} /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OF_FUND_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{bn ? o.labelBn : o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Financial Contract / Core Capital Matrix */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">
                    {isOwnerMode
                      ? (bn ? "প্রাথমিক মূলধন (Initial Core Equity) ৳" : "Initial Core Equity ৳")
                      : (bn ? "মূলধন ৳" : "Capital Amount ৳")
                    } *
                  </Label>
                  <Input type="number" value={form.capital} onChange={(e) => set("capital", Number(e.target.value))} className="text-sm mt-1.5" />
                  {errors.capital && <p className="text-xs text-destructive mt-1">{errors.capital}</p>}
                </div>
                <div>
                  <Label className="text-xs font-semibold">
                    {isOwnerMode
                      ? (bn ? "সাপ্তাহিক ক্যাপিটাল ইনজেকশন ৳" : "Weekly Capital Injection ৳")
                      : (bn ? "সাপ্তাহিক শেয়ার ৳" : "Weekly Share ৳")
                    } *
                  </Label>
                  <Input type="number" step="100" value={form.weekly_share} onChange={(e) => set("weekly_share", Number(e.target.value))} className="text-sm mt-1.5" placeholder="100" />
                  {errors.weekly_share && <p className="text-xs text-destructive mt-1">{errors.weekly_share}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {bn ? "সর্বনিম্ন ১০০ এবং ১০০ এর গুণিতক হতে হবে" : "Minimum 100, must be multiple of 100"}
                  </p>
                </div>
              </div>

              {/* Owner Mode: Show locked-in summary instead of editable fields */}
              {isOwnerMode ? (
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary">
                      {bn ? "ফাউন্ডার ইকুইটি কনফিগারেশন (লকড)" : "Founder Equity Configuration (Locked)"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-background/60 rounded-lg p-3 text-center border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{bn ? "লক-ইন পিরিয়ড" : "Lock-in Period"}</p>
                      <p className="text-lg font-bold text-foreground">5 {bn ? "বছর" : "Years"}</p>
                    </div>
                    <div className="bg-background/60 rounded-lg p-3 text-center border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{bn ? "ডিভিডেন্ড মডেল" : "Dividend Model"}</p>
                      <p className="text-sm font-bold text-foreground">{bn ? "জিরো-ডিভিডেন্ড" : "Zero-Dividend"}</p>
                    </div>
                    <div className="bg-background/60 rounded-lg p-3 text-center border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{bn ? "রি-ইনভেস্ট" : "Reinvest"}</p>
                      <p className="text-sm font-bold text-primary">100% ✓</p>
                    </div>
                    <div className="bg-background/60 rounded-lg p-3 text-center border border-border/50">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{bn ? "মুনাফা হার" : "Profit Rate"}</p>
                      <p className="text-sm font-bold text-foreground">{bn ? "বোর্ড নির্ধারিত" : "Board-Decided"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold">{bn ? "মাসিক মুনাফা %" : "Monthly Profit %"} *</Label>
                      <Input type="number" step="0.1" value={form.monthly_profit_percent} onChange={(e) => set("monthly_profit_percent", Number(e.target.value))} className="text-sm mt-1.5" />
                      {errors.monthly_profit_percent && <p className="text-xs text-destructive mt-1">{errors.monthly_profit_percent}</p>}
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">{bn ? "মেয়াদ / লক-ইন পিরিয়ড" : "Tenure / Lock-in Period"}</Label>
                      <Select value={String(form.tenure_years)} onValueChange={(v) => set("tenure_years", Number(v))}>
                        <SelectTrigger className="text-sm mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((y) => (
                            <SelectItem key={y} value={String(y)}>{y} {bn ? "বছর" : (y === 1 ? "Year" : "Years")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">{bn ? "বিনিয়োগ মডেল" : "Investment Model"}</Label>
                    <Select value={form.investment_model} onValueChange={(v) => set("investment_model", v)}>
                      <SelectTrigger className="text-sm mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="profit_only">{bn ? "শুধুমাত্র মুনাফা" : "Profit Only"}</SelectItem>
                        <SelectItem value="profit_plus_principal">{bn ? "মুনাফা + মূলধন (কম্পাউন্ড)" : "Profit + Principal (Compound)"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <Label className="text-xs font-semibold">{bn ? "স্বয়ংক্রিয় পুনঃবিনিয়োগ" : "Auto Reinvest"}</Label>
                    <Switch checked={form.reinvest} onCheckedChange={(v) => set("reinvest", v)} />
                  </div>

                  {/* Anti-Loss Rule Warning */}
                  <div className="flex gap-3 p-3.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-yellow-700 dark:text-yellow-400 mb-1">
                        {bn ? "⚠️ মেয়াদপূর্তির পূর্বে ভাঙানোর নীতি" : "⚠️ Pre-mature Encashment Policy"}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {bn
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
                          {bn ? "💡 AI প্রজেকশন" : "💡 AI Projection"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {form.investment_model === "profit_only" ? (
                          <>
                            <div className="bg-background/60 rounded-md p-3 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">{bn ? "মাসিক পে-আউট" : "Monthly Payout"}</p>
                              <p className="text-lg font-bold text-primary">৳{projection.monthlyPayout.toLocaleString()}</p>
                            </div>
                            <div className="bg-background/60 rounded-md p-3 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">{bn ? `মোট মুনাফা (${projection.months} মাসে)` : `Total Profit (${projection.months}mo)`}</p>
                              <p className="text-lg font-bold text-success">৳{projection.totalProfit.toLocaleString()}</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="bg-background/60 rounded-md p-3 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">{bn ? "মোট মুনাফা" : "Total Profit"}</p>
                              <p className="text-lg font-bold text-success">৳{projection.totalProfit.toLocaleString()}</p>
                            </div>
                            <div className="bg-background/60 rounded-md p-3 text-center">
                              <p className="text-[10px] text-muted-foreground mb-1">{bn ? "পরিপক্কতায় মোট" : "At Maturity"}</p>
                              <p className="text-lg font-bold text-primary">৳{projection.maturityValue.toLocaleString()}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Nominee / Succession Planning */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              {isOwnerMode && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {bn
                    ? "আপনার অনুপস্থিতিতে ইকুইটি অংশের দাবিদার হিসেবে নমিনি নির্ধারণ করুন।"
                    : "Designate a nominee as the rightful claimant of your equity share in your absence."}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{bn ? "নমিনির নাম" : "Nominee Name"}</Label>
                  <Input value={form.nominee_name} onChange={(e) => set("nominee_name", e.target.value)} className="text-sm mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{bn ? "সম্পর্ক" : "Relationship"}</Label>
                  <Input value={form.nominee_relation} onChange={(e) => set("nominee_relation", e.target.value)} className="text-sm mt-1.5" placeholder={bn ? "স্ত্রী / স্বামী / সন্তান" : "Spouse / Child / Parent"} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold">{bn ? "নমিনির ফোন" : "Nominee Phone"}</Label>
                  <Input value={form.nominee_phone} onChange={(e) => set("nominee_phone", e.target.value)} className="text-sm mt-1.5" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">{bn ? "নমিনির NID" : "Nominee NID"}</Label>
                  <Input value={form.nominee_nid} onChange={(e) => set("nominee_nid", e.target.value)} className="text-sm mt-1.5" />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Agreement / Equity Pact */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              {isOwnerMode ? (
                <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-5 space-y-3 shadow-[0_0_20px_-5px_hsl(var(--primary)/0.15)]">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold text-primary">
                      {bn ? "কর্পোরেট ইকুইটি ও স্মার্ট প্যাক্ট" : "Corporate Equity & Smart Pact"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground leading-[1.8] max-h-52 overflow-y-auto pr-1 space-y-2">
                    <p><strong className="text-foreground">১. ফাউন্ডার স্ট্যাটাস:</strong> আমি এই প্রতিষ্ঠানের একজন মূল ফাউন্ডিং শেয়ারহোল্ডার হিসেবে যুক্ত হচ্ছি।</p>
                    <p><strong className="text-foreground">২. অটোমেটেড ক্যাপিটাল:</strong> সিস্টেমের নিয়ম অনুযায়ী আমি নিয়মিত সাপ্তাহিক "কোর ক্যাপিটাল" প্রদান করতে চুক্তিবদ্ধ।</p>
                    <p><strong className="text-foreground">৩. জিরো-ডিভিডেন্ড কম্পাউন্ডিং:</strong> আগামী ৫ বছর (৬০ মাস) যাবতীয় মুনাফা ১০০% রি-ইনভেস্ট বা কম্পাউন্ডিং করা হবে। এই সময়ে কোনো অন্তর্বর্তীকালীন লভ্যাংশ উত্তোলন করা হবে না।</p>
                    <p><strong className="text-foreground">৪. ফিউচার গভর্ন্যান্স:</strong> ৫ বছর পর কোম্পানির মোট ভ্যালুয়েশন (Valuation) এবং সঞ্চিত মূলধনের ওপর ভিত্তি করে বোর্ড সভার মাধ্যমে ডিভিডেন্ড বা স্যালারি মডেল নির্ধারণ করা হবে।</p>
                    <p><strong className="text-foreground">৫. ইমিউটেবল রেকর্ড:</strong> আমার প্রতিটি লেনদেন সিস্টেমে অপরিবর্তনীয় (Immutable) অডিট ট্রেইল হিসেবে সংরক্ষিত থাকবে।</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed max-h-48 overflow-y-auto">
                  {bn ? (
                    <>
                      <p className="font-bold mb-2">বিনিয়োগ চুক্তির শর্তাবলী:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>আমি নিশ্চিত করছি যে প্রদত্ত সকল তথ্য সঠিক।</li>
                        <li>আমি বুঝতে পারছি যে মুনাফার হার পরিবর্তনশীল হতে পারে।</li>
                        <li>মেয়াদপূর্তির আগে উত্তোলনে জরিমানা প্রযোজ্য হবে।</li>
                        <li>আমি সাপ্তাহিক শেয়ার প্রদান করতে সম্মত।</li>
                        <li>প্রতিষ্ঠানের নীতিমালা মেনে চলতে সম্মত আছি।</li>
                      </ul>
                    </>
                  ) : (
                    <>
                      <p className="font-bold mb-2">Investment Agreement Terms:</p>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>I confirm that all information provided is accurate.</li>
                        <li>I understand profit rates may vary.</li>
                        <li>Penalties apply for pre-mature withdrawal.</li>
                        <li>I agree to pay weekly share contributions.</li>
                        <li>I agree to follow institutional policies.</li>
                      </ul>
                    </>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <Checkbox id="agree" checked={agreed} onCheckedChange={(c) => setAgreed(!!c)} />
                <Label htmlFor="agree" className="text-xs cursor-pointer">
                  {isOwnerMode
                    ? (bn ? "আমি উপরের ইকুইটি প্যাক্ট পড়েছি এবং সম্পূর্ণ সম্মত আছি" : "I have read and fully agree to the Equity Pact above")
                    : (bn ? "আমি উপরের শর্তাবলী পড়েছি এবং সম্মত আছি" : "I have read and agree to the terms above")
                  }
                </Label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 pt-0 gap-3">
          <Button variant="outline" size="sm" onClick={prevStep} disabled={step === 1 || isPending} className="gap-1.5">
            <ChevronLeft className="w-4 h-4" /> {bn ? "পেছনে" : "Back"}
          </Button>
          {step < 4 ? (
            <Button size="sm" onClick={nextStep} className="gap-1.5">
              {bn ? "পরবর্তী" : "Next"} <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSubmit} disabled={!agreed || isPending} className="gap-1.5 min-w-[120px]">
              {isPending
                ? (bn ? "প্রক্রিয়াকরণ..." : "Processing...")
                : isOwnerMode
                  ? (bn ? "প্যাক্ট সম্পন্ন করুন" : "Sign Equity Pact")
                  : (bn ? "সম্পন্ন করুন" : "Complete")
              }
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
