import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import { sampleClients } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";
import { User, Phone, MapPin, Wallet, PiggyBank, Calendar, CreditCard } from "lucide-react";

const ClientDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const client = sampleClients.find((c) => c.id === id);

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

  const name = lang === "bn" ? client.nameBn : client.nameEn;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.client")} — ${client.id}`} />

      {/* Hero card */}
      <div className="card-elevated p-6 border-l-4 border-l-primary">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{client.id}</span>
              <StatusBadge status={client.status} />
              {client.loanStatus !== "none" && (
                <StatusBadge status={client.loanStatus === "active" ? "active" : "inactive"} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <User className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.personalInfo")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DetailField label={t("table.name")} value={name} />
            <DetailField label={t("detail.nameEn")} value={client.nameEn} />
            <DetailField label={t("table.phone")} value={client.phone} />
            <DetailField label={t("table.area")} value={client.area} />
            <DetailField label={t("table.officer")} value={client.assignedOfficer} />
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Wallet className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.loanInfo")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DetailField label={t("table.loan")} value={client.loanAmount ? `৳${client.loanAmount.toLocaleString()}` : "—"} highlight={!!client.loanAmount} />
            <DetailField label={t("table.interest")} value={client.interestRate ? `${client.interestRate}%` : "—"} />
            <DetailField label={t("table.tenure")} value={client.tenure ? `${client.tenure} ${t("table.months")}` : "—"} />
            <DetailField label={t("table.paymentType")} value={client.paymentType?.replace("_", " ") || "—"} />
          </div>
        </div>

        <div className="card-elevated p-5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 text-primary">
            <PiggyBank className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.savingsInfo")}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DetailField label={t("table.savings")} value={client.savingsType?.toUpperCase() || "—"} />
            <DetailField label={t("detail.frequency")} value={client.depositFrequency || "—"} />
            <DetailField label={t("detail.nextDeposit")} value={client.nextDepositDate || "—"} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ClientDetail;
