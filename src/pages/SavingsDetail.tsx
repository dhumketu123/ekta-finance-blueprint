import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSavingsProduct } from "@/hooks/useSupabaseData";
import { sampleSavingsProducts } from "@/data/sampleData";
import { PiggyBank, Settings } from "lucide-react";

const SavingsDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { data: dbSp, isLoading } = useSavingsProduct(id || "");

  const sampleSp = sampleSavingsProducts.find((s) => s.id === id);
  const hasDb = !!dbSp;
  const sp: any = hasDb ? dbSp : sampleSp;

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

  if (!sp) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = hasDb ? (lang === "bn" ? sp.product_name_bn : sp.product_name_en) : (lang === "bn" ? sp.nameBn : sp.nameEn);
  const nameEn = hasDb ? sp.product_name_en : sp.nameEn;
  const freq = hasDb ? sp.frequency : sp.frequency;
  const minAmt = hasDb ? sp.min_amount : sp.minAmount;
  const maxAmt = hasDb ? sp.max_amount : sp.maxAmount;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.savingsProduct")} — ${sp.id.slice(0, 8)}`} />

      <div className="card-elevated p-6 border-l-4 border-l-success">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center shrink-0">
            <PiggyBank className="w-7 h-7 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <span className="text-xs text-muted-foreground font-mono">{sp.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="card-elevated p-5 border-l-4 border-l-primary text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.frequency")}</p>
          <p className="mt-2 text-xl font-bold text-primary capitalize">{freq}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-warning text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.minAmount")}</p>
          <p className="mt-2 text-2xl font-bold text-warning">৳{Number(minAmt).toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.maxAmount")}</p>
          <p className="mt-2 text-2xl font-bold text-success">৳{Number(maxAmt).toLocaleString()}</p>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Settings className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.configuration")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.product")} value={name} />
          <DetailField label={t("detail.nameEn")} value={nameEn} />
          <DetailField label={t("table.frequency")} value={freq} />
          <DetailField label={t("table.minAmount")} value={`৳${Number(minAmt).toLocaleString()}`} />
          <DetailField label={t("table.maxAmount")} value={`৳${Number(maxAmt).toLocaleString()}`} highlight />
        </div>
      </div>
    </AppLayout>
  );
};

export default SavingsDetail;
