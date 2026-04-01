import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import TablePagination from "@/components/TablePagination";
import { Plus, CreditCard, Search, Banknote, FlaskConical, TrendingUp } from "lucide-react";
import LoanDisbursementModal from "@/components/forms/LoanDisbursementModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { usePermissions } from "@/hooks/usePermissions";
import LoanProductForm from "@/components/forms/LoanProductForm";
import LoanPaymentModal from "@/components/forms/LoanPaymentModal";
import PaymentTestPanel from "@/components/forms/PaymentTestPanel";

const Loans = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { canEditLoans, isAdmin } = usePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: loans, isLoading, page, setPage, totalPages, totalCount } = usePaginatedQuery({
    table: "loan_products",
    queryKey: ["loan_products"],
    pageSize: 10,
  });

  const filtered = (loans ?? []).filter((lp: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return lp.product_name_en.toLowerCase().includes(q) || lp.product_name_bn.toLowerCase().includes(q);
  });

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "ঋণ পণ্য" : "Loan Products"}
        description={lang === "bn" ? "ঋণ পণ্য কনফিগার ও পরিচালনা করুন। সুদের হার নির্ধারণ, মেয়াদ কাস্টমাইজ এবং স্মার্ট ভ্যালিডেশন নিয়ম প্রয়োগ করুন।" : "Configure and manage loan products. Define interest rates, customize tenures, and enforce smart validation rules."}
        badge={lang === "bn" ? "💳 ঋণ ইঞ্জিন" : "💳 Loan Engine"}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {canEditLoans && (
              <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setFormOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> {lang === "bn" ? "নতুন পণ্য" : "New Product"}
              </Button>
            )}
            {(isAdmin || canEditLoans) && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg shadow-sm" onClick={() => setDisburseOpen(true)}>
                <TrendingUp className="w-3.5 h-3.5" /> {lang === "bn" ? "ঋণ বিতরণ" : "Disburse Loan"}
              </Button>
            )}
            {(isAdmin || canEditLoans) && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg shadow-sm" onClick={() => setPaymentOpen(true)}>
                <Banknote className="w-3.5 h-3.5" /> {lang === "bn" ? "পেমেন্ট" : "Payment"}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg shadow-sm" onClick={() => setTestOpen(true)}>
                <FlaskConical className="w-3.5 h-3.5" /> Test
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === "bn" ? "পণ্য খুঁজুন..." : "Search products..."} className="pl-9 text-xs h-9" />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {lang === "bn" ? "কোনো ঋণ পণ্য পাওয়া যায়নি" : "No loan products found"}
        </div>
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.product")}</TableHead>
                  <TableHead>{lang === "bn" ? "সুদ / ফ্রিকোয়েন্সি" : "Interest / Freq."}</TableHead>
                  <TableHead>{t("table.tenure")}</TableHead>
                  <TableHead>{t("table.minAmount")}</TableHead>
                  <TableHead>{t("table.maxAmount")}</TableHead>
                  <TableHead>{lang === "bn" ? "MFI নিয়ম" : "MFI Rules"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lp: any) => (
                  <TableRow key={lp.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/loans/${lp.id}`)}>
                    <TableCell><p className="text-xs font-medium">{lang === "bn" ? lp.product_name_bn : lp.product_name_en}</p></TableCell>
                    <TableCell className="text-xs">
                      <span className="font-semibold">{lp.interest_rate}%</span>
                      <span className="text-muted-foreground"> / {lp.payment_frequency || "Monthly"}</span>
                    </TableCell>
                    <TableCell className="text-xs">{lp.tenure_months} {t("table.months")}</TableCell>
                    <TableCell className="text-xs">৳{Number(lp.min_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">৳{Number(lp.max_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(lp.upfront_savings_pct > 0 || lp.compulsory_savings_amount > 0) ? (
                          <>
                            {lp.upfront_savings_pct > 0 && (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                                {lp.upfront_savings_pct}% Upfront
                              </span>
                            )}
                            {lp.compulsory_savings_amount > 0 && (
                              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
                                +৳{Number(lp.compulsory_savings_amount).toLocaleString()}/Inst.
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Standard
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </div>

          <div className="sm:hidden space-y-3">
            {filtered.map((lp: any) => (
              <div key={lp.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/loans/${lp.id}`)}>
                <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4.5 h-4.5 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{lang === "bn" ? lp.product_name_bn : lp.product_name_en}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{lp.interest_rate}%</span>
                    <span>•</span>
                    <span>{lp.tenure_months} {t("table.months")}</span>
                    <span>•</span>
                    <span className="capitalize">{String(lp.payment_type).replace("_", " ")}</span>
                  </div>
                </div>
              </div>
            ))}
            <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </div>
        </>
      )}

      {formOpen && <LoanProductForm open={formOpen} onClose={() => setFormOpen(false)} editData={null} />}
      {paymentOpen && <LoanPaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} />}
      {testOpen && <PaymentTestPanel open={testOpen} onClose={() => setTestOpen(false)} />}
      {disburseOpen && <LoanDisbursementModal open={disburseOpen} onClose={() => setDisburseOpen(false)} />}
    </AppLayout>
  );
};

export default Loans;
