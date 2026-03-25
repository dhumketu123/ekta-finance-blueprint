import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import TablePagination from "@/components/TablePagination";
import { Plus, CreditCard, Search, Edit2, Trash2, Banknote, FlaskConical, TrendingUp } from "lucide-react";
import LoanDisbursementModal from "@/components/forms/LoanDisbursementModal";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { usePermissions } from "@/hooks/usePermissions";
import { useSoftDelete } from "@/hooks/useCrudOperations";
import LoanProductForm from "@/components/forms/LoanProductForm";
import LoanPaymentModal from "@/components/forms/LoanPaymentModal";
import PaymentTestPanel from "@/components/forms/PaymentTestPanel";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";

const Loans = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { canEditLoans, isAdmin } = usePermissions();
  const softDelete = useSoftDelete("loan_products");

  const [formOpen, setFormOpen]       = useState(false);
  const [editData, setEditData]       = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [testOpen, setTestOpen]       = useState(false);
  const [disburseOpen, setDisburseOpen] = useState(false);
  const [search, setSearch]           = useState("");

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

  const handleEdit = (e: React.MouseEvent, lp: any) => { e.stopPropagation(); setEditData(lp); setFormOpen(true); };
  const handleDelete = (e: React.MouseEvent, lp: any) => { e.stopPropagation(); setDeleteTarget(lp); };

  return (
    <AppLayout>
      {/* Premium Glassmorphic Hero Card */}
      <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 md:p-8 shadow-xl mb-6 border border-slate-700/50">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">
              {t("loans.title")}
            </h1>
            <p className="text-sm md:text-base text-slate-300 max-w-2xl leading-relaxed">
              {lang === "bn"
                ? "ঋণ পণ্য কনফিগার ও পরিচালনা করুন। সুদের হার নির্ধারণ, মেয়াদ কাস্টমাইজ এবং স্মার্ট ভ্যালিডেশন নিয়ম প্রয়োগ করুন।"
                : "Configure and manage loan products. Define interest rates, customize tenures, and enforce smart validation rules for your cooperative."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canEditLoans && (
              <Button size="sm" className="gap-1.5 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all" onClick={() => { setEditData(null); setFormOpen(true); }}>
                <Plus className="w-3.5 h-3.5" /> {lang === "bn" ? "নতুন পণ্য" : "New Product"}
              </Button>
            )}
            {(isAdmin || canEditLoans) && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 transition-all" onClick={() => setDisburseOpen(true)}>
                <TrendingUp className="w-3.5 h-3.5" /> {lang === "bn" ? "ঋণ বিতরণ" : "Disburse Loan"}
              </Button>
            )}
            {(isAdmin || canEditLoans) && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/10 transition-all" onClick={() => setPaymentOpen(true)}>
                <Banknote className="w-3.5 h-3.5" /> {lang === "bn" ? "পেমেন্ট" : "Payment"}
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-all" onClick={() => setTestOpen(true)}>
                <FlaskConical className="w-3.5 h-3.5" /> Test
              </Button>
            )}
          </div>
        </div>
      </div>

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
                  <TableHead>{t("table.interest")}</TableHead>
                  <TableHead>{t("table.tenure")}</TableHead>
                  <TableHead>{t("table.paymentType")}</TableHead>
                  <TableHead>{t("table.minAmount")}</TableHead>
                  <TableHead>{t("table.maxAmount")}</TableHead>
                  <TableHead>{t("table.maxConcurrent")}</TableHead>
                  {canEditLoans && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lp: any) => (
                  <TableRow key={lp.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/loans/${lp.id}`)}>
                    <TableCell><p className="text-xs font-medium">{lang === "bn" ? lp.product_name_bn : lp.product_name_en}</p></TableCell>
                    <TableCell className="text-xs font-semibold">{lp.interest_rate}%</TableCell>
                    <TableCell className="text-xs">{lp.tenure_months} {t("table.months")}</TableCell>
                    <TableCell className="text-xs capitalize">{String(lp.payment_type).replace("_", " ")}</TableCell>
                    <TableCell className="text-xs">৳{Number(lp.min_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">৳{Number(lp.max_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-center">{lp.max_concurrent}</TableCell>
                    {canEditLoans && (
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={(e) => handleEdit(e, lp)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={(e) => handleDelete(e, lp)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                        </div>
                      </TableCell>
                    )}
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

      {formOpen && <LoanProductForm open={formOpen} onClose={() => { setFormOpen(false); setEditData(null); }} editData={editData} />}
      {paymentOpen && <LoanPaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} />}
      {testOpen && <PaymentTestPanel open={testOpen} onClose={() => setTestOpen(false)} />}
      {disburseOpen && <LoanDisbursementModal open={disburseOpen} onClose={() => setDisburseOpen(false)} />}
      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => { softDelete.mutate(deleteTarget.id); setDeleteTarget(null); }}
          itemName={deleteTarget.product_name_en}
          loading={softDelete.isPending}
        />
      )}
    </AppLayout>
  );
};

export default Loans;
