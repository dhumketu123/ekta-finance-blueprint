import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import TablePagination from "@/components/TablePagination";
import { Plus, PiggyBank, Search, ArrowDownCircle, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { usePermissions } from "@/hooks/usePermissions";
import SavingsProductForm from "@/components/forms/SavingsProductForm";
import SavingsTransactionModal from "@/components/forms/SavingsTransactionModal";

const Savings = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { canEditSavings, canRecordPayments, isAdmin, isOwner } = usePermissions();

  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [txModalOpen, setTxModalOpen] = useState(false);

  const { data: savings, isLoading, error, page, setPage, totalPages, totalCount } = usePaginatedQuery({
    table: "savings_products",
    queryKey: ["savings_products"],
    pageSize: 10,
  });

  const filtered = (savings ?? []).filter((sp: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const nameEn = (sp.product_name_en ?? "").toLowerCase();
    const nameBn = (sp.product_name_bn ?? "").toLowerCase();
    return nameEn.includes(q) || nameBn.includes(q);
  });

  const canDoSavingsTx = canRecordPayments || isAdmin || isOwner;

  const handleRowClick = useCallback((id: string) => {
    navigate(`/savings/${id}`);
  }, [navigate]);

  return (
    <AppLayout>
      <PageHeader
        title={t("savings.title")}
        description={t("savings.description")}
        badge={lang === "bn" ? "🏦 সঞ্চয় ইঞ্জিন" : "🏦 Savings Engine"}
        actions={
          <div className="flex gap-2">
            {canEditSavings && (
              <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setFormOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> {lang === "bn" ? "নতুন পণ্য" : "New Product"}
              </Button>
            )}
            {canDoSavingsTx && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg" onClick={() => setTxModalOpen(true)}>
                <ArrowDownCircle className="w-3.5 h-3.5" /> {lang === "bn" ? "জমা/উত্তোলন" : "Deposit/Withdraw"}
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === "bn" ? "পণ্য খুঁজুন..." : "Search products..."}
            className="pl-9 text-xs h-9"
            aria-label={lang === "bn" ? "পণ্য খুঁজুন" : "Search products"}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : error ? (
        <div className="card-elevated p-8 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-destructive/50 mx-auto" />
          <p className="text-sm text-destructive font-medium">
            {lang === "bn" ? "ডেটা লোড করতে সমস্যা হয়েছে" : "Failed to load data"}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "bn" ? "পৃষ্ঠাটি রিফ্রেশ করে আবার চেষ্টা করুন।" : "Please refresh the page and try again."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-8 text-center space-y-3">
          <PiggyBank className="w-10 h-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? (lang === "bn" ? `"${search}" এর জন্য কোনো পণ্য পাওয়া যায়নি` : `No products found for "${search}"`)
              : (lang === "bn" ? "কোনো সঞ্চয় পণ্য পাওয়া যায়নি" : "No savings products found")}
          </p>
        </div>
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
                {filtered.map((sp: any) => (
                  <TableRow
                    key={sp.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => handleRowClick(sp.id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(sp.id); } }}
                  >
                    <TableCell><p className="text-xs font-medium">{lang === "bn" ? sp.product_name_bn : sp.product_name_en}</p></TableCell>
                    <TableCell className="text-xs capitalize">{sp.frequency ?? "-"}</TableCell>
                    <TableCell className="text-xs">৳{Number(sp.min_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">৳{Number(sp.max_amount ?? 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </div>

          <div className="sm:hidden space-y-3">
            {filtered.map((sp: any) => (
              <div
                key={sp.id}
                className="card-elevated p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => handleRowClick(sp.id)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(sp.id); } }}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <PiggyBank className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{lang === "bn" ? sp.product_name_bn : sp.product_name_en}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span className="capitalize">{sp.frequency ?? "-"}</span>
                    <span>•</span>
                    <span>৳{Number(sp.min_amount ?? 0).toLocaleString()} - ৳{Number(sp.max_amount ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
            <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
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

      {formOpen && <SavingsProductForm open={formOpen} onClose={() => setFormOpen(false)} editData={null} />}
      {txModalOpen && <SavingsTransactionModal open={txModalOpen} onClose={() => setTxModalOpen(false)} />}
    </AppLayout>
  );
};

export default Savings;
