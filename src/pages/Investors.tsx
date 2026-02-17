import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Plus, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvestors } from "@/hooks/useSupabaseData";
import { sampleInvestors } from "@/data/sampleData";

const Investors = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: dbInvestors, isLoading } = useInvestors();

  const hasDb = dbInvestors && dbInvestors.length > 0;
  const investors = hasDb ? dbInvestors : sampleInvestors;

  return (
    <AppLayout>
      <PageHeader
        title={t("investors.title")}
        description={t("investors.description")}
        actions={
          <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> {t("investors.add")}
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  <TableHead>{t("table.capital")}</TableHead>
                  <TableHead>{t("table.monthlyProfit")}</TableHead>
                  <TableHead>{t("table.monthlyProfitAmount")}</TableHead>
                  <TableHead>{t("table.reinvest")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((inv: any) => {
                  const name = hasDb ? (lang === "bn" ? inv.name_bn : inv.name_en) : (lang === "bn" ? inv.nameBn : inv.nameEn);
                  const capital = Number(hasDb ? inv.capital : inv.capital);
                  const profitPct = Number(hasDb ? inv.monthly_profit_percent : inv.monthlyProfitPercent);
                  const profitAmt = Math.round(capital * profitPct / 100);

                  return (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/investors/${inv.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs">{inv.phone || "—"}</TableCell>
                      <TableCell className="text-xs font-semibold">৳{capital.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{profitPct}%</TableCell>
                      <TableCell className="text-xs text-success font-semibold">৳{profitAmt.toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={inv.reinvest ? "active" : "inactive"} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {investors.map((inv: any) => {
              const name = hasDb ? (lang === "bn" ? inv.name_bn : inv.name_en) : (lang === "bn" ? inv.nameBn : inv.nameEn);
              const capital = Number(hasDb ? inv.capital : inv.capital);
              const profitPct = Number(hasDb ? inv.monthly_profit_percent : inv.monthlyProfitPercent);

              return (
                <div key={inv.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/investors/${inv.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4.5 h-4.5 text-success" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">৳{capital.toLocaleString()}</span>
                      <span>•</span>
                      <span>{profitPct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card-elevated p-5">
            <h3 className="text-xs font-bold text-primary mb-1.5">{t("investors.reinvestTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("investors.reinvestDescBn")}</p>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Investors;
