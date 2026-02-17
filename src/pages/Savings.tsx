import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSavingsProducts } from "@/hooks/useSupabaseData";
import { sampleSavingsProducts } from "@/data/sampleData";
import { PiggyBank } from "lucide-react";

const Savings = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: dbSavings, isLoading } = useSavingsProducts();

  const hasDb = dbSavings && dbSavings.length > 0;
  const savings = hasDb ? dbSavings : sampleSavingsProducts;

  return (
    <AppLayout>
      <PageHeader title={t("savings.title")} description={t("savings.description")} />

      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.product")}</TableHead>
                  <TableHead>{t("table.frequency")}</TableHead>
                  <TableHead>{t("table.minAmount")}</TableHead>
                  <TableHead>{t("table.maxAmount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savings.map((sp: any) => {
                  const name = hasDb ? (lang === "bn" ? sp.product_name_bn : sp.product_name_en) : (lang === "bn" ? sp.nameBn : sp.nameEn);
                  const freq = hasDb ? sp.frequency : sp.frequency;
                  const minAmt = hasDb ? sp.min_amount : sp.minAmount;
                  const maxAmt = hasDb ? sp.max_amount : sp.maxAmount;

                  return (
                    <TableRow key={sp.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/savings/${sp.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs capitalize">{freq}</TableCell>
                      <TableCell className="text-xs">৳{Number(minAmt).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">৳{Number(maxAmt).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {savings.map((sp: any) => {
              const name = hasDb ? (lang === "bn" ? sp.product_name_bn : sp.product_name_en) : (lang === "bn" ? sp.nameBn : sp.nameEn);
              const freq = hasDb ? sp.frequency : sp.frequency;
              const minAmt = hasDb ? sp.min_amount : sp.minAmount;
              const maxAmt = hasDb ? sp.max_amount : sp.maxAmount;

              return (
                <div key={sp.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/savings/${sp.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <PiggyBank className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="capitalize">{freq}</span>
                      <span>•</span>
                      <span>৳{Number(minAmt).toLocaleString()} - ৳{Number(maxAmt).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
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
