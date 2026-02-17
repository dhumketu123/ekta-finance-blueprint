import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton, SummaryCardSkeleton } from "@/components/ui/skeleton";
import { sampleSavingsProducts } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const Savings = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AppLayout>
      <PageHeader title={t("savings.title")} description={t("savings.description")} />

      {loading ? (
        <>
          <TableSkeleton rows={4} cols={5} />
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
                  <TableHead>{t("table.product")}</TableHead>
                  <TableHead>{t("table.frequency")}</TableHead>
                  <TableHead>{t("table.minAmount")}</TableHead>
                  <TableHead>{t("table.maxAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleSavingsProducts.map((sp) => (
                  <TableRow key={sp.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/savings/${sp.id}`)}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{sp.id}</TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{lang === "bn" ? sp.nameBn : sp.nameEn}</p>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{sp.frequency}</TableCell>
                    <TableCell className="text-xs">৳{sp.minAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs">৳{sp.maxAmount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="card-elevated p-5">
            <h3 className="text-xs font-bold text-primary mb-1.5">{t("savings.validationTitle")}</h3>
            <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ml-4">
              <li>{t("savings.rule1")}</li>
              <li>{t("savings.rule2")}</li>
              <li>{t("savings.rule3")}</li>
            </ul>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Savings;
