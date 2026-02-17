import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLoanProducts } from "@/hooks/useSupabaseData";
import { sampleLoanProducts } from "@/data/sampleData";
import { CreditCard } from "lucide-react";

const Loans = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: dbLoans, isLoading } = useLoanProducts();

  const hasDb = dbLoans && dbLoans.length > 0;
  const loans = hasDb ? dbLoans : sampleLoanProducts;

  return (
    <AppLayout>
      <PageHeader title={t("loans.title")} description={t("loans.description")} />

      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
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
                {loans.map((lp: any) => {
                  const name = hasDb ? (lang === "bn" ? lp.product_name_bn : lp.product_name_en) : (lang === "bn" ? lp.nameBn : lp.nameEn);
                  const interest = hasDb ? lp.interest_rate : lp.interestRate;
                  const tenure = hasDb ? lp.tenure_months : lp.tenure;
                  const paymentType = hasDb ? lp.payment_type : lp.paymentType;
                  const minAmt = hasDb ? lp.min_amount : lp.minAmount;
                  const maxAmt = hasDb ? lp.max_amount : lp.maxAmount;
                  const maxConc = hasDb ? lp.max_concurrent : lp.maxConcurrent;

                  return (
                    <TableRow key={lp.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/loans/${lp.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs font-semibold">{interest}%</TableCell>
                      <TableCell className="text-xs">{tenure} {t("table.months")}</TableCell>
                      <TableCell className="text-xs capitalize">{String(paymentType).replace("_", " ")}</TableCell>
                      <TableCell className="text-xs">৳{Number(minAmt).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">৳{Number(maxAmt).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-center">{maxConc}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {loans.map((lp: any) => {
              const name = hasDb ? (lang === "bn" ? lp.product_name_bn : lp.product_name_en) : (lang === "bn" ? lp.nameBn : lp.nameEn);
              const interest = hasDb ? lp.interest_rate : lp.interestRate;
              const tenure = hasDb ? lp.tenure_months : lp.tenure;
              const paymentType = hasDb ? lp.payment_type : lp.paymentType;

              return (
                <div key={lp.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/loans/${lp.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                    <CreditCard className="w-4.5 h-4.5 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{interest}%</span>
                      <span>•</span>
                      <span>{tenure} {t("table.months")}</span>
                      <span>•</span>
                      <span className="capitalize">{String(paymentType).replace("_", " ")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Loans;
