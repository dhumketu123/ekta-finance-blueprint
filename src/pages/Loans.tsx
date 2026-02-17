import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { sampleLoanProducts } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const Loans = () => {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AppLayout>
      <PageHeader title={t("loans.title")} description={t("loans.description")} />

      {loading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : (
        <div className="card-elevated overflow-hidden">
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.product")}</TableHead>
                <TableHead>{t("table.interest")}</TableHead>
                <TableHead>{t("table.tenure")}</TableHead>
                <TableHead>{t("table.paymentType")}</TableHead>
                <TableHead>{t("table.minAmount")}</TableHead>
                <TableHead>{t("table.maxAmount")}</TableHead>
                <TableHead>{t("table.maxConcurrent")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleLoanProducts.map((lp) => (
                <TableRow key={lp.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{lp.id}</TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{lang === "bn" ? lp.nameBn : lp.nameEn}</p>
                  </TableCell>
                  <TableCell className="text-xs font-semibold">{lp.interestRate}%</TableCell>
                  <TableCell className="text-xs">{lp.tenure} {t("table.months")}</TableCell>
                  <TableCell className="text-xs capitalize">{lp.paymentType.replace("_", " ")}</TableCell>
                  <TableCell className="text-xs">৳{lp.minAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">৳{lp.maxAmount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-center">{lp.maxConcurrent}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  );
};

export default Loans;
