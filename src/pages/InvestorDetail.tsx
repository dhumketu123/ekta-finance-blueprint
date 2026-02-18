import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import StatusBadge from "@/components/StatusBadge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvestor, useTransactions } from "@/hooks/useSupabaseData";
import { sampleInvestors } from "@/data/sampleData";
import { TrendingUp, Phone, Wallet } from "lucide-react";

const InvestorDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { data: dbInvestor, isLoading } = useInvestor(id || "");
  const { data: txns } = useTransactions({ investor_id: id });

  const sampleInv = sampleInvestors.find((i) => i.id === id);
  const hasDb = !!dbInvestor;
  const inv: any = hasDb ? dbInvestor : sampleInv;

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

  const name = hasDb ? (lang === "bn" ? inv.name_bn : inv.name_en) : (lang === "bn" ? inv.nameBn : inv.nameEn);
  const nameEn = hasDb ? inv.name_en : inv.nameEn;
  const phone = inv.phone;
  const capital = Number(hasDb ? inv.capital : inv.capital);
  const profitPct = Number(hasDb ? inv.monthly_profit_percent : inv.monthlyProfitPercent);
  const reinvest = inv.reinvest;
  const monthlyProfit = Math.round(capital * profitPct / 100);

  const totalProfitPaid = txns
    ?.filter((tx: any) => tx.type === "investor_profit" && tx.status === "paid")
    .reduce((s: number, tx: any) => s + tx.amount, 0) ?? 0;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.investor")} — ${inv.investor_id ?? inv.id.slice(0, 8)}`} />

      <div className="card-elevated p-6 border-l-4 border-l-success">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-7 h-7 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">{inv.investor_id ?? inv.id.slice(0, 8)}</span>
              <StatusBadge status={reinvest ? "active" : "inactive"} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="card-elevated p-5 border-l-4 border-l-primary text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.capital")}</p>
          <p className="mt-2 text-2xl font-bold text-primary">৳{capital.toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("detail.monthlyProfitAmt")}</p>
          <p className="mt-2 text-2xl font-bold text-success">৳{monthlyProfit.toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-warning text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.monthlyProfit")}</p>
          <p className="mt-2 text-2xl font-bold text-warning">{profitPct}%</p>
        </div>
      </div>

      {totalProfitPaid > 0 && (
        <div className="card-elevated p-5 border-l-4 border-l-accent">
          <div className="flex items-center gap-2 text-accent mb-2">
            <Wallet className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "মোট লভ্যাংশ প্রদান" : "Total Profit Paid"}</h3>
          </div>
          <p className="text-2xl font-bold text-accent">৳{totalProfitPaid.toLocaleString()}</p>
        </div>
      )}

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Phone className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.contactInfo")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.name")} value={name} />
          <DetailField label={t("detail.nameEn")} value={nameEn} />
          <DetailField label={t("table.phone")} value={phone || "—"} />
          <DetailField label={t("table.reinvest")} value={reinvest ? "✅ Yes" : "❌ No"} />
        </div>
      </div>
    </AppLayout>
  );
};

export default InvestorDetail;
