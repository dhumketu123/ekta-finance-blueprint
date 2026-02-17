import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import { sampleOwners } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";
import { Crown, Phone } from "lucide-react";

const OwnerDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const owner = sampleOwners.find((o) => o.id === id);

  if (!owner) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = lang === "bn" ? owner.nameBn : owner.nameEn;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.owner")} — ${owner.id}`} />

      <div className="card-elevated p-6 border-l-4 border-l-warning">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center shrink-0">
            <Crown className="w-7 h-7 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{owner.id}</span>
              <StatusBadge status={owner.advanceDepositStatus ? "active" : "inactive"} />
            </div>
          </div>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Phone className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.details")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.name")} value={name} />
          <DetailField label={t("detail.nameEn")} value={owner.nameEn} />
          <DetailField label={t("table.phone")} value={owner.phone} />
          <DetailField label={t("table.weeklyDeposit")} value={`৳${owner.weeklyDeposit.toLocaleString()}`} highlight />
          <DetailField label={t("table.advanceStatus")} value={owner.advanceDepositStatus ? "✅ Active" : "❌ Inactive"} />
        </div>
      </div>
    </AppLayout>
  );
};

export default OwnerDetail;
