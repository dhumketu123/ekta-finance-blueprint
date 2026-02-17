import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton, SummaryCardSkeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { sampleInvestors } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const Investors = () => {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

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

      {loading ? (
        <>
          <TableSkeleton rows={5} cols={5} />
          <div className="mt-4">
            <SummaryCardSkeleton />
          </div>
        </>
      ) : (
        <>
          <div className="card-elevated overflow-hidden">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.id")}</TableHead>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  <TableHead>{t("table.capital")}</TableHead>
                  <TableHead>{t("table.monthlyProfit")}</TableHead>
                  <TableHead>{t("table.monthlyProfitAmount")}</TableHead>
                  <TableHead>{t("table.reinvest")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleInvestors.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{inv.id}</TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{lang === "bn" ? inv.nameBn : inv.nameEn}</p>
                    </TableCell>
                    <TableCell className="text-xs">{inv.phone}</TableCell>
                    <TableCell className="text-xs font-semibold">৳{inv.capital.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{inv.monthlyProfitPercent}%</TableCell>
                    <TableCell className="text-xs text-success font-semibold">
                      ৳{((inv.capital * inv.monthlyProfitPercent) / 100).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="card-elevated p-5">
            <h3 className="text-xs font-bold text-primary mb-1.5">{t("investors.reinvestTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {t("investors.reinvestDescBn")}
            </p>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Investors;
