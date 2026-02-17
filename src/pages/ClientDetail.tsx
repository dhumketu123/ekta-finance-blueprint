import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import RepaymentProgress from "@/components/RepaymentProgress";
import { sampleClients } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClient, useTransactions } from "@/hooks/useSupabaseData";
import { User, Wallet, PiggyBank } from "lucide-react";

const ClientDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { data: dbClient, isLoading } = useClient(id || "");
  const { data: txns } = useTransactions({ client_id: id });

  // Fallback to sample data
  const sampleClient = sampleClients.find((c) => c.id === id);
  const hasDb = !!dbClient;
  const client: any = hasDb ? dbClient : sampleClient;

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

  const name = hasDb ? (lang === "bn" ? client.name_bn : client.name_en) : (lang === "bn" ? (client as any).nameBn : (client as any).nameEn);
  const nameEn = hasDb ? client.name_en : (client as any).nameEn;
  const phone = hasDb ? client.phone : (client as any).phone;
  const area = hasDb ? client.area : (client as any).area;
  const status = client.status;
  const loanAmount = hasDb ? (client.loan_amount ?? 0) : ((client as any).loanAmount ?? 0);
  const nextPaymentDate = hasDb ? client.next_payment_date : (client as any).nextDepositDate;

  // Calculate repayment from transactions
  const totalRepaid = txns
    ?.filter((tx: any) => tx.type === "loan_repayment" && tx.status === "paid")
    .reduce((s: number, tx: any) => s + tx.amount, 0) ?? 0;

  // Loan product info from joined data
  const loanProduct = hasDb ? (client as any).loan_products : null;
  const interestRate = loanProduct?.interest_rate ?? (client as any).interestRate;
  const tenure = loanProduct?.tenure_months ?? (client as any).tenure;
  const paymentType = loanProduct?.payment_type ?? (client as any).paymentType;

  // Total owed = principal + interest
  const totalOwed = loanAmount > 0 && interestRate ? loanAmount + (loanAmount * interestRate / 100) : loanAmount;

  // Savings product
  const savingsProduct = hasDb ? (client as any).savings_products : null;
  const savingsType = savingsProduct?.product_name_en ?? (client as any).savingsType?.toUpperCase() ?? "—";
  const frequency = savingsProduct?.frequency ?? (client as any).depositFrequency ?? "—";

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.client")} — ${client.id.slice(0, 8)}`} />

      {/* Hero card */}
      <div className="card-elevated p-6 border-l-4 border-l-primary animate-slide-up">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{client.id.slice(0, 8)}</span>
              <StatusBadge status={status as any} />
            </div>
          </div>
        </div>
      </div>

      {/* Repayment Progress */}
      {loanAmount > 0 && (
        <div className="card-elevated p-5 border-l-4 border-l-warning animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="w-4 h-4 text-warning" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-warning">Loan Repayment Progress</h3>
          </div>
          <RepaymentProgress
            totalAmount={totalOwed}
            paidAmount={totalRepaid}
            tenure={tenure}
            nextPaymentDate={nextPaymentDate}
          />
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Total Owed</p>
              <p className="text-sm font-bold text-foreground">৳{totalOwed.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Paid</p>
              <p className="text-sm font-bold text-success">৳{totalRepaid.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Remaining</p>
              <p className="text-sm font-bold text-destructive">৳{Math.max(totalOwed - totalRepaid, 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="card-elevated p-5 space-y-4 animate-slide-up" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center gap-2 text-primary">
            <User className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.personalInfo")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DetailField label={t("table.name")} value={name} />
            <DetailField label={t("detail.nameEn")} value={nameEn} />
            <DetailField label={t("table.phone")} value={phone || "—"} />
            <DetailField label={t("table.area")} value={area || "—"} />
          </div>
        </div>

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

        <div className="card-elevated p-5 space-y-4 md:col-span-2 animate-slide-up" style={{ animationDelay: "0.25s" }}>
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
    </AppLayout>
  );
};

export default ClientDetail;
