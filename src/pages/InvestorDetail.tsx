import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import { sampleInvestors } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";
import { TrendingUp, Phone, Wallet, RotateCcw } from "lucide-react";

const InvestorDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const inv = sampleInvestors.find((i) => i.id === id);

  if (!inv) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = lang === "bn" ? inv.nameBn : inv.nameEn;
  const monthlyProfit = (inv.capital * inv.monthlyProfitPercent) / 100;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.investor")} — ${inv.id}`} />

      <div className="card-elevated p-6 border-l-4 border-l-success">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-7 h-7 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{inv.id}</span>
              <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="card-elevated p-5 border-l-4 border-l-primary text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.capital")}</p>
          <p className="mt-2 text-2xl font-bold text-primary">৳{inv.capital.toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("detail.monthlyProfitAmt")}</p>
          <p className="mt-2 text-2xl font-bold text-success">৳{monthlyProfit.toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-warning text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.monthlyProfit")}</p>
          <p className="mt-2 text-2xl font-bold text-warning">{inv.monthlyProfitPercent}%</p>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Phone className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.contactInfo")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.name")} value={name} />
          <DetailField label={t("detail.nameEn")} value={inv.nameEn} />
          <DetailField label={t("table.phone")} value={inv.phone} />
          <DetailField label={t("table.reinvest")} value={inv.reinvest ? "✅ Yes" : "❌ No"} />
        </div>
      </div>
    </AppLayout>
  );
};

export default InvestorDetail;
