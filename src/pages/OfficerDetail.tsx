import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldOfficer } from "@/hooks/useSupabaseData";
import { sampleOfficers } from "@/data/sampleData";
import { UserCheck, MapPin } from "lucide-react";

const OfficerDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { data: dbOfficer, isLoading } = useFieldOfficer(id || "");

  const sampleOfficer = sampleOfficers.find((o) => o.id === id);
  const hasDb = !!dbOfficer;
  const officer: any = hasDb ? dbOfficer : sampleOfficer;

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

  if (!officer) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = hasDb ? (lang === "bn" ? officer.name_bn : officer.name_en) : (lang === "bn" ? officer.nameBn : officer.nameEn);
  const nameEn = hasDb ? officer.name_en : officer.nameEn;
  const phone = officer.phone;
  const areas = hasDb ? (officer.assignedAreas ?? []) : (officer.assignedAreas ?? []);
  const clientCount = officer.clientCount ?? 0;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.officer")} — ${officer.id.slice(0, 8)}`} />

      <div className="card-elevated p-6 border-l-4 border-l-primary">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <UserCheck className="w-7 h-7 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <span className="text-xs text-muted-foreground font-mono">{officer.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <UserCheck className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.contactInfo")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DetailField label={t("table.name")} value={name} />
            <DetailField label={t("detail.nameEn")} value={nameEn} />
            <DetailField label={t("table.phone")} value={phone || "—"} />
            <DetailField label={t("table.clients")} value={clientCount} highlight />
          </div>
        </div>

        {areas.length > 0 && (
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <MapPin className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("table.assignedAreas")}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {areas.map((area: string) => (
                <Badge key={area} variant="secondary" className="text-xs px-3 py-1 rounded-full">{area}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default OfficerDetail;
