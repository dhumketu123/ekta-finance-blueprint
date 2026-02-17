import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOwner } from "@/hooks/useSupabaseData";
import { sampleOwners } from "@/data/sampleData";
import { Crown, Phone } from "lucide-react";

const OwnerDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { data: dbOwner, isLoading } = useOwner(id || "");

  const sampleOwner = sampleOwners.find((o) => o.id === id);
  const hasDb = !!dbOwner;
  const owner: any = hasDb ? dbOwner : sampleOwner;

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

  const name = hasDb ? (lang === "bn" ? owner.name_bn : owner.name_en) : (lang === "bn" ? owner.nameBn : owner.nameEn);
  const nameEn = hasDb ? owner.name_en : owner.nameEn;
  const phone = owner.phone;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.owner")} — ${owner.id.slice(0, 8)}`} />

      <div className="card-elevated p-6 border-l-4 border-l-warning">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center shrink-0">
            <Crown className="w-7 h-7 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <span className="text-xs text-muted-foreground font-mono">{owner.id.slice(0, 8)}</span>
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
          <DetailField label={t("detail.nameEn")} value={nameEn} />
          <DetailField label={t("table.phone")} value={phone || "—"} />
        </div>
      </div>
    </AppLayout>
  );
};

export default OwnerDetail;
