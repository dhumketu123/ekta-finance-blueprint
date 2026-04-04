import { useState } from "react";
import { z } from "zod";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLoanProducts, useClients } from "@/hooks/useSupabaseData";
import { useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Calculator, CalendarDays, TrendingUp, ShieldCheck, Send, MessageCircle, MessageSquare } from "lucide-react";
import { useBusinessRules, validateLoanAmount, shouldUseMakerChecker } from "@/hooks/useBusinessRules";
import { formatLocalDate } from "@/lib/date-utils";

const schema = z.object({
  client_id:         z.string().uuid("গ্রাহক নির্বাচন করুন"),
  loan_product_id:   z.string().uuid("ঋণ পণ্য নির্বাচন করুন"),
  principal_amount:  z.coerce.number().positive("পরিমাণ অবশ্যই ০ এর বেশি হতে হবে"),
  disbursement_date: z.string().min(1, "তারিখ প্রয়োজন"),
  loan_model:        z.enum(["flat", "reducing"]),
  notes:             z.string().trim().max(500).optional(),
});

interface Props {
  open: boolean;
  onClose: () => void;
  prefilledClientId?: string;
}

interface DisburseResult {
  loan_id: string;
  loan_ref: string;
  principal: number;
  total_interest: number;
  total_owed: number;
  emi_amount: number;
  tenure: number;
  payment_type: string;
  loan_model: string;
  disbursement_date: string;
  maturity_date: string;
}

export default function LoanDisbursementModal({ open, onClose, prefilledClientId }: Props) {
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const { data: loanProducts = [] } = useLoanProducts();
  const { isAdmin } = usePermissions();
  const { rules: bizRules } = useBusinessRules();

  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    client_id:         prefilledClientId ?? "",
    loan_product_id:   "",
    principal_amount:  "",
    disbursement_date: today,
    loan_model:        "flat" as "flat" | "reducing",
    notes:             "",
  });
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<DisburseResult | null>(null);
  const [submitted, setSubmitted] = useState(false); // for Maker-Checker success

  const selectedProduct = loanProducts.find((p: any) => p.id === form.loan_product_id) as any;
  const principal = Number(form.principal_amount) || 0;

  const preview = (() => {
    if (!selectedProduct || !principal) return null;
    const r   = selectedProduct.interest_rate;
    const t   = selectedProduct.tenure_months;
    const pt  = selectedProduct.payment_type;

    if (pt === "bullet") {
      const interest = Math.round(principal * r / 100 * t / 12 * 100) / 100;
      return { interest, emi: principal + interest, label: lang === "bn" ? "মেয়াদ শেষে একসাথে" : "Lump sum at maturity" };
    }
    if (pt === "monthly_profit") {
      const monthlyProfit = Math.round(principal * r / 100 * 100) / 100;
      const interest = Math.round(monthlyProfit * t * 100) / 100;
      return { interest, emi: monthlyProfit, label: lang === "bn" ? "মাসিক মুনাফা + মেয়াদ শেষে আসল" : "Monthly profit + Principal at end" };
    }
    if (form.loan_model === "reducing") {
      const mr  = r / 100 / 12;
      const emi = Math.round(principal * mr * Math.pow(1+mr,t) / (Math.pow(1+mr,t)-1) * 100) / 100;
      return { interest: Math.round((emi*t - principal)*100)/100, emi, label: lang === "bn" ? "হ্রাসমান ব্যালেন্স EMI" : "Reducing Balance EMI" };
    }
    const interest = Math.round(principal * r / 100 * 100) / 100;
    const emi      = Math.round((principal + interest) / t * 100) / 100;
    return { interest, emi, label: lang === "bn" ? "সমান মাসিক কিস্তি (Flat)" : "Equal Installment (Flat)" };
  })();

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ ...form, principal_amount: Number(form.principal_amount) });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }

    // ── Tenant-rule loan amount validation ──
    const amountError = validateLoanAmount(
      parsed.data.principal_amount,
      bizRules,
      lang === "bn" ? "bn" : "en"
    );
    if (amountError) {
      setErrors({ principal_amount: amountError });
      return;
    }

    setErrors({});
    setLoading(true);

    // ── Approval workflow from tenant rules ──
    const useMakerChecker = shouldUseMakerChecker(bizRules);

    try {
      const user = (await supabase.auth.getUser()).data.user;

      if (isAdmin || bizRules.approval_workflow === "auto_approve") {
        // Admin or auto_approve: Direct disbursement
        const { data, error } = await supabase.rpc("disburse_loan" as any, {
          _client_id:         parsed.data.client_id,
          _loan_product_id:   parsed.data.loan_product_id,
          _principal_amount:  parsed.data.principal_amount,
          _disbursement_date: parsed.data.disbursement_date,
          _assigned_officer:  user?.id ?? null,
          _notes:             parsed.data.notes || null,
          _loan_model:        parsed.data.loan_model,
        });
        if (error) throw error;
        setResult(data as unknown as DisburseResult);
        qc.invalidateQueries({ queryKey: ["clients"] });
        qc.invalidateQueries({ queryKey: ["loans"] });
        qc.invalidateQueries({ queryKey: ["transactions"] });
        toast.success(lang === "bn" ? "ঋণ সফলভাবে বিতরণ হয়েছে" : "Loan disbursed successfully");
      } else {
        // Non-admin: Submit for approval (Maker-Checker)
        const refId = `DISB_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const { error } = await supabase.from("pending_transactions").insert([{
          type: "loan_disbursement" as any,
          reference_id: refId,
          amount: parsed.data.principal_amount,
          client_id: parsed.data.client_id,
          submitted_by: user?.id,
          notes: parsed.data.notes || null,
          metadata: {
            loan_product_id: parsed.data.loan_product_id,
            principal_amount: parsed.data.principal_amount,
            disbursement_date: parsed.data.disbursement_date,
            loan_model: parsed.data.loan_model,
            product_name: selectedProduct?.product_name_en || "",
          },
        }]);
        if (error) throw error;
        setSubmitted(true);
        qc.invalidateQueries({ queryKey: ["pending_transactions"] });
        toast.success(lang === "bn" ? "ঋণ বিতরণ অনুমোদনের জন্য জমা দেওয়া হয়েছে" : "Disbursement submitted for approval");
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "An unknown error occurred";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setResult(null);
    setSubmitted(false);
    setForm({ client_id: prefilledClientId ?? "", loan_product_id: "", principal_amount: "", disbursement_date: today, loan_model: "flat", notes: "" });
    setErrors({});
    onClose();
  };

  const paymentTypeLabel = (pt: string) => {
    const map: Record<string, string> = {
      monthly: lang === "bn" ? "মাসিক" : "Monthly",
      weekly:  lang === "bn" ? "সাপ্তাহিক" : "Weekly",
      emi:     "EMI",
      bullet:  lang === "bn" ? "বুলেট" : "Bullet",
      monthly_profit: lang === "bn" ? "মাসিক মুনাফা" : "Monthly Profit",
    };
    return map[pt] ?? pt;
  };

  const bn = lang === "bn";

  return (
    <Drawer open={open} onOpenChange={resetAndClose}>
      <DrawerContent>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="text-sm font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {bn ? "ঋণ বিতরণ" : "Loan Disbursement"}
            {!isAdmin && (
              <span className="ml-auto text-[10px] font-normal bg-warning/10 text-warning px-2 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {bn ? "অনুমোদন প্রয়োজন" : "Requires Approval"}
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>

        {/* Maker-Checker submission success */}
        {submitted ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Send className="w-5 h-5" />
              <span className="text-sm font-bold">
                {bn ? "অনুমোদনের জন্য জমা দেওয়া হয়েছে!" : "Submitted for Approval!"}
              </span>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-2">
              <p className="text-muted-foreground">
                {bn
                  ? "আপনার ঋণ বিতরণ অনুরোধ Admin/Treasurer অনুমোদনের জন্য অপেক্ষমান। অনুমোদিত হলে ঋণ স্বয়ংক্রিয়ভাবে বিতরণ হবে।"
                  : "Your disbursement request is pending Admin/Treasurer approval. Once approved, the loan will be automatically disbursed."}
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "পরিমাণ" : "Amount"}</span>
                <span className="font-bold">৳{principal.toLocaleString()}</span>
              </div>
              {selectedProduct && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{bn ? "পণ্য" : "Product"}</span>
                  <span className="font-bold">{bn ? selectedProduct.product_name_bn : selectedProduct.product_name_en}</span>
                </div>
              )}
            </div>
            <Button onClick={resetAndClose} className="w-full text-xs">
              {bn ? "বন্ধ করুন" : "Close"}
            </Button>
          </div>
        ) : result ? (
          /* ── DIRECT DISBURSEMENT SUCCESS (Admin) ── */
          (() => {
            const selectedClient = (clients as any[]).find((c) => c.id === form.client_id);
            const cName = selectedClient ? (bn ? (selectedClient.name_bn || selectedClient.name_en) : selectedClient.name_en) : "";
            const cPhone = selectedClient?.phone || "";
            const normalizePhone = (phone: string) => {
              const raw = phone.replace(/[০-৯]/g, (d: string) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/[^\d]/g, "");
              const last10 = raw.slice(-10);
              return last10.length === 10 ? "880" + last10 : "";
            };
            const finalPhone = normalizePhone(cPhone);
            const nextDue = (result as any).next_due_date ? formatLocalDate((result as any).next_due_date, "bn") : "";
            const disbMsg = `সম্মানিত ${cName},\nঋণ বিতরণ ✅ নং: ${result.loan_ref}\nআসল: ৳${Number(result.principal).toLocaleString()} কিস্তি: ৳${Number(result.emi_amount).toLocaleString()}\nমেয়াদ: ${formatLocalDate(result.maturity_date, "bn")}${nextDue ? ` প্রথম কিস্তি: ${nextDue}` : ""}\n— একতা ফাইন্যান্স`;
            const encoded = encodeURIComponent(disbMsg);
            return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-bold">
                {bn ? "ঋণ সফলভাবে বিতরণ হয়েছে!" : "Loan Disbursed Successfully!"}
              </span>
            </div>
            <div className="rounded-lg border p-3 bg-muted/40 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "ঋণ নং" : "Loan Ref"}</span>
                <span className="font-bold text-primary">{result.loan_ref}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "আসল" : "Principal"}</span>
                <span className="font-bold">৳{Number(result.principal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "মোট সুদ" : "Total Interest"}</span>
                <span className="font-bold text-warning">৳{Number(result.total_interest).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">{bn ? "মোট দেনা" : "Total Owed"}</span>
                <span className="font-bold text-destructive">৳{Number(result.total_owed).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "কিস্তি" : "Installment"}</span>
                <span className="font-bold">৳{Number(result.emi_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "মেয়াদোত্তীর্ণ তারিখ" : "Maturity"}</span>
                <span className="font-bold">{formatLocalDate(result.maturity_date, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "বিতরণ তারিখ" : "Disbursement"}</span>
                <span className="font-bold">{formatLocalDate(result.disbursement_date, lang)}</span>
              </div>
              {(result as any).next_due_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{bn ? "প্রথম কিস্তি" : "First Installment"}</span>
                  <span className="font-bold text-primary">{formatLocalDate((result as any).next_due_date, lang)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{bn ? "পরিশোধ ধরন" : "Payment Type"}</span>
                <span className="font-bold capitalize">{paymentTypeLabel(result.payment_type)}</span>
              </div>
            </div>

            {/* WhatsApp + SMS Buttons */}
            {finalPhone && (
              <div className="flex gap-2 w-full">
                <Button className="flex-1 gap-2 bg-success hover:bg-success/90 text-success-foreground shadow-lg text-xs" onClick={() => window.open(`https://wa.me/${finalPhone}?text=${encoded}`, "_blank")}>
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </Button>
                <Button className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-lg text-xs" onClick={() => window.open(`sms:+${finalPhone}?body=${encoded}`, "_self")}>
                  <MessageSquare className="w-4 h-4" /> SMS
                </Button>
              </div>
            )}

            <Button onClick={resetAndClose} variant="outline" className="w-full text-xs">
              {bn ? "বন্ধ করুন" : "Close"}
            </Button>
          </div>
            );
          })()
        ) : (
          /* ── FORM ── */
          <div className="space-y-3">
            {!prefilledClientId && (
              <div>
                <Label className="text-xs">{bn ? "গ্রাহক *" : "Client *"}</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger className="text-xs h-9"><SelectValue placeholder={bn ? "গ্রাহক নির্বাচন করুন" : "Select client"} /></SelectTrigger>
                  <SelectContent>
                    {(clients as any[]).map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {bn ? (c.name_bn || c.name_en) : c.name_en}
                        {c.member_id && <span className="ml-2 text-muted-foreground font-mono">({c.member_id})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.client_id && <p className="text-xs text-destructive mt-1">{errors.client_id}</p>}
              </div>
            )}

            <div>
              <Label className="text-xs">{bn ? "ঋণ পণ্য *" : "Loan Product *"}</Label>
              <Select value={form.loan_product_id} onValueChange={(v) => setForm({ ...form, loan_product_id: v })}>
                <SelectTrigger className="text-xs h-9"><SelectValue placeholder={bn ? "পণ্য নির্বাচন করুন" : "Select product"} /></SelectTrigger>
                <SelectContent>
                  {(loanProducts as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {bn ? (p.product_name_bn || p.product_name_en) : p.product_name_en}
                      <span className="ml-2 text-muted-foreground">({p.interest_rate}% · {p.tenure_months}m)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.loan_product_id && <p className="text-xs text-destructive mt-1">{errors.loan_product_id}</p>}
            </div>

            {/* Trust Tier Hint for selected client */}
            {form.client_id && (() => {
              const selectedClient = (clients as any[]).find((c) => c.id === form.client_id);
              const tier = selectedClient?.trust_tier || 'Standard';
              const score = selectedClient?.trust_score || 0;
              if (tier === 'Standard') return null;
              const isElite = tier === 'Gold' || tier === 'Platinum';
              const tierBn: Record<string, string> = { Silver: 'সিলভার', Gold: 'গোল্ড', Platinum: 'প্লাটিনাম' };
              return (
                <div className={`rounded-xl border p-3 text-xs backdrop-blur-md ${
                  isElite
                    ? 'border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20'
                    : 'border-border/40 bg-muted/40'
                }`}>
                  <p className="font-bold">
                    {isElite ? '🏆' : '🌟'}{' '}
                    {bn
                      ? `${tierBn[tier] || tier} মেম্বার (পয়েন্ট: ${score})। ${isElite ? 'দুর্দান্ত রেকর্ড! আপনি চাইলে এখানে ম্যানুয়ালি সুদে বিশেষ ছাড় দিতে পারেন।' : 'ভালো পেমেন্ট ইতিহাস। সুদে ছাড় বিবেচনা করতে পারেন।'}`
                      : `${tier} Member (Score: ${score}). ${isElite ? 'Excellent track record. You may manually offer a special interest rate discount here.' : 'Good payment history. Consider an interest discount.'}`}
                  </p>
                </div>
              );
            })()}

            {selectedProduct && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-muted-foreground">{bn ? "সুদের হার" : "Rate"}</p>
                  <p className="font-bold text-primary">{selectedProduct.interest_rate}%</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">{bn ? "মেয়াদ" : "Tenure"}</p>
                  <p className="font-bold">{selectedProduct.tenure_months}m</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground">{bn ? "ধরন" : "Type"}</p>
                  <p className="font-bold capitalize">{paymentTypeLabel(selectedProduct.payment_type)}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{bn ? "আসল পরিমাণ ৳ *" : "Principal ৳ *"}</Label>
                 <Input
                   type="number"
                   value={form.principal_amount}
                   onChange={(e) => setForm({ ...form, principal_amount: e.target.value })}
                   className="text-sm h-9"
                   placeholder={`৳${bizRules.min_loan_amount.toLocaleString()} – ৳${bizRules.max_loan_amount.toLocaleString()}`}
                 />
                 <p className="text-[10px] text-muted-foreground mt-0.5">
                   {bn ? `সীমা: ৳${bizRules.min_loan_amount.toLocaleString()} – ৳${bizRules.max_loan_amount.toLocaleString()}` : `Limit: ৳${bizRules.min_loan_amount.toLocaleString()} – ৳${bizRules.max_loan_amount.toLocaleString()}`}
                 </p>
                {errors.principal_amount && <p className="text-xs text-destructive mt-1">{errors.principal_amount}</p>}
              </div>
              <div>
                <Label className="text-xs">{bn ? "সুদ পদ্ধতি" : "Interest Method"}</Label>
                <Select value={form.loan_model} onValueChange={(v: any) => setForm({ ...form, loan_model: v })}>
                  <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat" className="text-xs">{bn ? "সমান (Flat)" : "Flat Rate"}</SelectItem>
                    <SelectItem value="reducing" className="text-xs">{bn ? "হ্রাসমান (Reducing)" : "Reducing Balance"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {preview && principal > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-warning">
                  <Calculator className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold">{bn ? "হিসাবের পূর্বরূপ" : "Calculation Preview"}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{preview.label}</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-muted-foreground">{bn ? "মোট সুদ" : "Interest"}</p>
                    <p className="font-bold text-warning">৳{preview.interest.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{bn ? "কিস্তি" : "Installment"}</p>
                    <p className="font-bold text-primary">৳{preview.emi.toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{bn ? "মোট দেনা" : "Total"}</p>
                    <p className="font-bold text-destructive">৳{(principal + preview.interest).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" />
                {bn ? "বিতরণের তারিখ *" : "Disbursement Date *"}
              </Label>
              <Input
                type="date"
                value={form.disbursement_date}
                onChange={(e) => setForm({ ...form, disbursement_date: e.target.value })}
                className="text-sm h-9"
              />
              {errors.disbursement_date && <p className="text-xs text-destructive mt-1">{errors.disbursement_date}</p>}
            </div>

            <div>
              <Label className="text-xs">{bn ? "নোট (ঐচ্ছিক)" : "Notes (Optional)"}</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="text-sm"
                rows={2}
                placeholder={bn ? "কোনো বিশেষ তথ্য..." : "Any special notes..."}
              />
            </div>

            <div className="flex items-start gap-2 p-2 rounded bg-muted text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-warning" />
              <span>
                {isAdmin
                  ? (bn ? "Admin হিসেবে সরাসরি ঋণ বিতরণ হবে। এটি অপরিবর্তনীয়।" : "As Admin, this will disburse directly. This is irreversible.")
                  : (bn ? "অনুমোদনের জন্য জমা হবে। Admin/Treasurer অনুমোদন করলে ঋণ বিতরণ হবে।" : "Will be submitted for approval. Loan will be disbursed once Admin/Treasurer approves.")}
              </span>
            </div>

            <Button onClick={handleSubmit} disabled={loading} className="w-full text-xs font-bold h-9 bg-primary text-primary-foreground hover:bg-primary/90">
              {loading
                ? (bn ? "প্রক্রিয়া চলছে..." : "Processing...")
                : isAdmin
                  ? (bn ? "ঋণ বিতরণ নিশ্চিত করুন" : "Confirm Disbursement")
                  : (bn ? "অনুমোদনের জন্য জমা দিন" : "Submit for Approval")}
            </Button>
          </div>
        )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
