import { useParams } from "react-router-dom";
import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import RepaymentProgress from "@/components/RepaymentProgress";
import ProfileCompletionRing from "@/components/ProfileCompletionRing";
import ClientPhotoUpload from "@/components/ClientPhotoUpload";
import LoanScheduleTable from "@/components/LoanScheduleTable";
import LoanDisbursementModal from "@/components/forms/LoanDisbursementModal";
import LoanPaymentModal from "@/components/forms/LoanPaymentModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClient, useTransactions } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { User, Wallet, PiggyBank, MapPin, Shield, TrendingUp, Banknote, CalendarDays } from "lucide-react";

const ClientDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { canEditClients, isAdmin } = usePermissions();
  const { data: client, isLoading } = useClient(id || "");
  const { data: txns } = useTransactions({ client_id: id });

  const [disburseOpen, setDisburseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen]   = useState(false);
  const [activeTab, setActiveTab]       = useState<"info" | "schedule">("info");

  // active loan for this client
  const { data: activeLoan } = useQuery({
    queryKey: ["loans", "client", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("id, loan_id, status, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, maturity_date, disbursement_date, loan_model")
        .eq("client_id", id!)
        .eq("status", "active")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="space-y-4">
          <div className="card-elevated p-8 animate-pulse"><div className="h-4 bg-muted rounded w-1/3 mx-auto" /></div>
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const c = client as any;
  const name = lang === "bn" ? (c.name_bn || c.name_en) : c.name_en;
  const loanAmount = c.loan_amount ?? 0;
  const nextPaymentDate = c.next_payment_date;

  const totalRepaid = txns
    ?.filter((tx: any) => ["loan_repayment","loan_principal","loan_interest"].includes(tx.type) && tx.status === "paid")
    .reduce((s: number, tx: any) => s + tx.amount, 0) ?? 0;

  const loanProduct  = c.loan_products;
  const interestRate = loanProduct?.interest_rate;
  const tenure       = loanProduct?.tenure_months;
  const paymentType  = loanProduct?.payment_type;
  const totalOwed    = loanAmount > 0 && interestRate
    ? loanAmount + (loanAmount * interestRate / 100)
    : loanAmount;

  const savingsProduct = c.savings_products;
  const savingsType    = savingsProduct?.product_name_en ?? "—";
  const frequency      = savingsProduct?.frequency ?? "—";

  const maritalMap: Record<string, string> = {
    unmarried: lang === "bn" ? "অবিবাহিত" : "Unmarried",
    married:   lang === "bn" ? "বিবাহিত" : "Married",
    widowed:   lang === "bn" ? "বিধবা/বিপত্নীক" : "Widowed",
    divorced:  lang === "bn" ? "তালাকপ্রাপ্ত" : "Divorced",
  };

  const hasActiveLoan = !!activeLoan;

  return (
    <AppLayout>
      <PageHeader
        title={name}
        description={`${t("detail.client")} — ${c.member_id ?? client.id.slice(0, 8)}`}
        actions={
          isAdmin || canEditClients ? (
            <div className="flex gap-2">
              {!hasActiveLoan && (
                <Button size="sm" className="gap-1.5 text-xs rounded-lg bg-primary text-primary-foreground" onClick={() => setDisburseOpen(true)}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  {lang === "bn" ? "ঋণ বিতরণ" : "Disburse Loan"}
                </Button>
              )}
              {hasActiveLoan && (
                <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg" onClick={() => setPaymentOpen(true)}>
                  <Banknote className="w-3.5 h-3.5" />
                  {lang === "bn" ? "পেমেন্ট" : "Payment"}
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {/* ── Hero card ── */}
      <div className="card-elevated p-6 border-l-4 border-l-primary animate-slide-up">
        <div className="flex items-center gap-5">
          <ProfileCompletionRing client={c} size={112} strokeWidth={5}>
            <ClientPhotoUpload clientId={client.id} currentPhotoUrl={c.photo_url} canEdit={canEditClients} />
          </ProfileCompletionRing>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{c.name_bn || ""}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {c.member_id ? (
                <span className="text-xs font-mono font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20 tracking-wider">
                  {c.member_id}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground font-mono">{client.id.slice(0, 8)}</span>
              )}
              <StatusBadge status={c.status as any} />
            </div>
            {c.occupation && (
              <p className="text-xs text-muted-foreground mt-1">
                {lang === "bn" ? "পেশা:" : "Occupation:"} <span className="text-foreground font-medium">{c.occupation}</span>
              </p>
            )}
          </div>
        </div>
        {canEditClients && (
          <p className="text-[10px] text-muted-foreground mt-3 italic">
            {lang === "bn" ? "ছবির উপর হোভার করুন প্রোফাইল ছবি পরিবর্তন করতে" : "Hover over photo to update profile picture"}
          </p>
        )}
      </div>

      {/* ── Active Loan Summary ── */}
      {hasActiveLoan && (
        <div className="card-elevated p-5 border-l-4 border-l-warning animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-warning" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-warning">
                {lang === "bn" ? "সক্রিয় ঋণ" : "Active Loan"}
              </h3>
            </div>
            {activeLoan.loan_id && (
              <span className="text-xs font-mono font-semibold bg-warning/10 text-warning px-2 py-0.5 rounded-md border border-warning/20">
                {activeLoan.loan_id}
              </span>
            )}
          </div>
          <RepaymentProgress totalAmount={totalOwed} paidAmount={totalRepaid} tenure={tenure} nextPaymentDate={nextPaymentDate} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "বকেয়া আসল" : "Outstanding"}</p>
              <p className="text-sm font-bold text-destructive">৳{Number(activeLoan.outstanding_principal).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "বকেয়া সুদ" : "Interest Due"}</p>
              <p className="text-sm font-bold text-warning">৳{Number(activeLoan.outstanding_interest).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "কিস্তির পরিমাণ" : "EMI"}</p>
              <p className="text-sm font-bold text-primary">৳{Number(activeLoan.emi_amount).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1"><CalendarDays className="w-3 h-3" />{lang === "bn" ? "পরিপক্কতা" : "Maturity"}</p>
              <p className="text-sm font-bold">{activeLoan.maturity_date ?? "—"}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs: Info | Schedule ── */}
      <div className="flex gap-1 border-b border-border">
        {(["info", "schedule"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "info"
              ? (lang === "bn" ? "তথ্য" : "Info")
              : (lang === "bn" ? "কিস্তির সময়সূচি" : "Installment Schedule")}
          </button>
        ))}
      </div>

      {/* ── INFO TAB ── */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Personal */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.15s" }}>
            <div className="flex items-center gap-2 text-primary">
              <User className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.personalInfo")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DetailField label={t("table.name")} value={name} />
              <DetailField label={lang === "bn" ? "ফোন" : "Phone"} value={c.phone || "—"} />
              <DetailField label={lang === "bn" ? "পিতা/স্বামী" : "Father / Husband"} value={c.father_or_husband_name || "—"} />
              <DetailField label={lang === "bn" ? "মাতার নাম" : "Mother Name"} value={c.mother_name || "—"} />
              <DetailField label={lang === "bn" ? "NID নম্বর" : "NID Number"} value={c.nid_number || "—"} />
              <DetailField label={lang === "bn" ? "জন্ম তারিখ" : "Date of Birth"} value={c.date_of_birth || "—"} />
              <DetailField label={lang === "bn" ? "বৈবাহিক অবস্থা" : "Marital Status"} value={maritalMap[c.marital_status] || "—"} />
              <DetailField label={lang === "bn" ? "পেশা" : "Occupation"} value={c.occupation || "—"} />
            </div>
          </div>

          {/* Loan Info */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center gap-2 text-primary">
              <Wallet className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.loanInfo")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DetailField label={t("table.loan")} value={loanAmount ? `৳${loanAmount.toLocaleString()}` : "—"} highlight={!!loanAmount} />
              <DetailField label={t("table.interest")} value={interestRate ? `${interestRate}%` : "—"} />
              <DetailField label={t("table.tenure")} value={tenure ? `${tenure} ${t("table.months")}` : "—"} />
              <DetailField label={t("table.paymentType")} value={paymentType?.replace("_", " ") || "—"} />
            </div>
          </div>

          {/* Address */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.22s" }}>
            <div className="flex items-center gap-2 text-primary">
              <MapPin className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "ঠিকানা" : "Address"}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DetailField label={lang === "bn" ? "গ্রাম" : "Village"} value={c.village || "—"} />
              <DetailField label={lang === "bn" ? "ডাকঘর" : "Post Office"} value={c.post_office || "—"} />
              <DetailField label={lang === "bn" ? "ইউনিয়ন" : "Union"} value={c.union_name || "—"} />
              <DetailField label={lang === "bn" ? "উপজেলা" : "Upazila"} value={c.upazila || "—"} />
              <DetailField label={lang === "bn" ? "জেলা" : "District"} value={c.district || "—"} />
              <DetailField label={lang === "bn" ? "এলাকা" : "Area"} value={c.area || "—"} />
            </div>
          </div>

          {/* Nominee */}
          <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.25s" }}>
            <div className="flex items-center gap-2 text-primary">
              <Shield className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "নমিনি" : "Nominee"}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DetailField label={lang === "bn" ? "নমিনির নাম" : "Nominee Name"} value={c.nominee_name || "—"} />
              <DetailField label={lang === "bn" ? "সম্পর্ক" : "Relation"} value={c.nominee_relation || "—"} />
              <DetailField label={lang === "bn" ? "নমিনির ফোন" : "Nominee Phone"} value={c.nominee_phone || "—"} />
              <DetailField label={lang === "bn" ? "নমিনির NID" : "Nominee NID"} value={c.nominee_nid || "—"} />
            </div>
          </div>

          {/* Savings */}
          <div className="card-elevated p-5 space-y-4 md:col-span-2 animate-slide-up" style={{ animationDelay: "0.28s" }}>
            <div className="flex items-center gap-2 text-primary">
              <PiggyBank className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.savingsInfo")}</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <DetailField label={t("table.savings")} value={savingsType} />
              <DetailField label={t("detail.frequency")} value={frequency} />
              <DetailField label={t("detail.nextDeposit")} value={nextPaymentDate || "—"} />
            </div>
          </div>
        </div>
      )}

      {/* ── SCHEDULE TAB ── */}
      {activeTab === "schedule" && (
        <div className="animate-slide-up">
          {hasActiveLoan ? (
            <LoanScheduleTable loanId={activeLoan.id} />
          ) : (
            <div className="card-elevated p-10 text-center space-y-3">
              <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">
                {lang === "bn" ? "কোনো সক্রিয় ঋণ নেই" : "No Active Loan"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === "bn" ? "ঋণ বিতরণ করুন তারপর কিস্তির সময়সূচি দেখা যাবে" : "Disburse a loan to view the installment schedule"}
              </p>
              {(isAdmin || canEditClients) && (
                <Button size="sm" className="gap-1.5 text-xs mt-2" onClick={() => setDisburseOpen(true)}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  {lang === "bn" ? "ঋণ বিতরণ করুন" : "Disburse Loan"}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {disburseOpen && (
        <LoanDisbursementModal open={disburseOpen} onClose={() => setDisburseOpen(false)} prefilledClientId={id} />
      )}
      {paymentOpen && activeLoan && (
        <LoanPaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} prefilledLoanId={activeLoan.id} />
      )}
    </AppLayout>
  );
};

export default ClientDetail;
