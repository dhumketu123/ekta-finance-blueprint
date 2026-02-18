import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import TablePagination from "@/components/TablePagination";
import { Plus, TrendingUp, Search, Edit2, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePaginatedQuery } from "@/hooks/usePaginatedQuery";
import { usePermissions } from "@/hooks/usePermissions";
import { useSoftDelete } from "@/hooks/useCrudOperations";
import InvestorForm from "@/components/forms/InvestorForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";

const Investors = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { canEditInvestors } = usePermissions();
  const softDelete = useSoftDelete("investors");

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [search, setSearch] = useState("");

  const { data: investors, isLoading, page, setPage, totalPages, totalCount } = usePaginatedQuery({
    table: "investors",
    queryKey: ["investors"],
    pageSize: 10,
  });

  const filtered = (investors ?? []).filter((inv: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return inv.name_en.toLowerCase().includes(q) || inv.name_bn.toLowerCase().includes(q) || inv.phone?.toLowerCase().includes(q);
  });

  const handleEdit = (e: React.MouseEvent, inv: any) => { e.stopPropagation(); setEditData(inv); setFormOpen(true); };
  const handleDelete = (e: React.MouseEvent, inv: any) => { e.stopPropagation(); setDeleteTarget(inv); };

  return (
    <AppLayout>
      <PageHeader
        title={t("investors.title")}
        description={t("investors.description")}
        actions={
          canEditInvestors ? (
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditData(null); setFormOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> {t("investors.add")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === "bn" ? "বিনিয়োগকারী খুঁজুন..." : "Search investors..."} className="pl-9 text-xs h-9" />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {lang === "bn" ? "কোনো বিনিয়োগকারী পাওয়া যায়নি" : "No investors found"}
        </div>
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
                  {canEditInvestors && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv: any) => {
                  const capital = Number(inv.capital);
                  const profitPct = Number(inv.monthly_profit_percent);
                  const profitAmt = Math.round(capital * profitPct / 100);

                  return (
                    <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/investors/${inv.id}`)}>
                      <TableCell>
                        <p className="text-xs font-medium">{lang === "bn" ? inv.name_bn : inv.name_en}</p>
                        {inv.investor_id && <p className="text-[10px] text-muted-foreground font-mono">{inv.investor_id}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{inv.phone || "—"}</TableCell>
                      <TableCell className="text-xs font-semibold">৳{capital.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{profitPct}%</TableCell>
                      <TableCell className="text-xs text-success font-semibold">৳{profitAmt.toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={inv.reinvest ? "active" : "inactive"} /></TableCell>
                      {canEditInvestors && (
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={(e) => handleEdit(e, inv)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={(e) => handleDelete(e, inv)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </div>

          <div className="sm:hidden space-y-3">
            {filtered.map((inv: any) => {
              const capital = Number(inv.capital);
              const profitPct = Number(inv.monthly_profit_percent);
              return (
                <div key={inv.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/investors/${inv.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4.5 h-4.5 text-success" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{lang === "bn" ? inv.name_bn : inv.name_en}</p>
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
            <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
          </div>

          <div className="card-elevated p-5">
            <h3 className="text-xs font-bold text-primary mb-1.5">{t("investors.reinvestTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("investors.reinvestDescBn")}</p>
          </div>
        </>
      )}

      {formOpen && <InvestorForm open={formOpen} onClose={() => { setFormOpen(false); setEditData(null); }} editData={editData} />}
      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => { softDelete.mutate(deleteTarget.id); setDeleteTarget(null); }}
          itemName={deleteTarget.name_en}
          loading={softDelete.isPending}
        />
      )}
    </AppLayout>
  );
};

export default Investors;
