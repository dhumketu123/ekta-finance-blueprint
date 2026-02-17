import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLoanProduct } from "@/hooks/useSupabaseData";
import { sampleLoanProducts } from "@/data/sampleData";
import { CreditCard, Settings } from "lucide-react";

const LoanDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { data: dbLoan, isLoading } = useLoanProduct(id || "");

  const sampleLoan = sampleLoanProducts.find((l) => l.id === id);
  const hasDb = !!dbLoan;
  const loan: any = hasDb ? dbLoan : sampleLoan;

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="card-elevated p-8 text-center animate-pulse">
          <div className="h-4 bg-muted rounded w-1/3 mx-auto" />
        </div>
      </AppLayout>
    );
  }

  if (!loan) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = hasDb ? (lang === "bn" ? loan.product_name_bn : loan.product_name_en) : (lang === "bn" ? loan.nameBn : loan.nameEn);
  const interest = hasDb ? loan.interest_rate : loan.interestRate;
  const tenure = hasDb ? loan.tenure_months : loan.tenure;
  const paymentType = hasDb ? loan.payment_type : loan.paymentType;
  const minAmt = hasDb ? loan.min_amount : loan.minAmount;
  const maxAmt = hasDb ? loan.max_amount : loan.maxAmount;
  const maxConc = hasDb ? loan.max_concurrent : loan.maxConcurrent;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.loanProduct")} — ${loan.id.slice(0, 8)}`} />

      <div className="card-elevated p-6 border-l-4 border-l-primary">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <CreditCard className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <span className="text-xs text-muted-foreground font-mono">{loan.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="card-elevated p-5 border-l-4 border-l-warning text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.interest")}</p>
          <p className="mt-2 text-2xl font-bold text-warning">{interest}%</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-primary text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.tenure")}</p>
          <p className="mt-2 text-2xl font-bold text-primary">{tenure} {t("table.months")}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.maxConcurrent")}</p>
          <p className="mt-2 text-2xl font-bold text-success">{maxConc}</p>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Settings className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.configuration")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.product")} value={name} />
          <DetailField label={t("table.paymentType")} value={String(paymentType).replace("_", " ")} />
          <DetailField label={t("table.minAmount")} value={`৳${Number(minAmt).toLocaleString()}`} />
          <DetailField label={t("table.maxAmount")} value={`৳${Number(maxAmt).toLocaleString()}`} highlight />
        </div>
      </div>
    </AppLayout>
  );
};

export default LoanDetail;
