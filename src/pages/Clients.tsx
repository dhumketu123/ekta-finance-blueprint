import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Plus, Users, Search, Edit2, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClients } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useSoftDelete } from "@/hooks/useCrudOperations";
import ClientForm from "@/components/forms/ClientForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";

const Clients = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const { canEditClients, canDeleteClients } = usePermissions();
  const softDelete = useSoftDelete("clients");

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [search, setSearch] = useState("");

  const filtered = (clients ?? []).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name_en.toLowerCase().includes(q) || c.name_bn.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q) || c.area?.toLowerCase().includes(q);
  });

  const handleEdit = (e: React.MouseEvent, c: any) => { e.stopPropagation(); setEditData(c); setFormOpen(true); };
  const handleDelete = (e: React.MouseEvent, c: any) => { e.stopPropagation(); setDeleteTarget(c); };

  return (
    <AppLayout>
      <PageHeader
        title={t("clients.title")}
        description={t("clients.description")}
        actions={
          canEditClients ? (
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditData(null); setFormOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> {t("clients.add")}
            </Button>
          ) : null
        }
      />

      <div className="mb-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={lang === "bn" ? "গ্রাহক খুঁজুন..." : "Search clients..."} className="pl-9 text-xs h-9" />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {lang === "bn" ? "কোনো গ্রাহক পাওয়া যায়নি" : "No clients found"}
        </div>
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  <TableHead>{t("table.area")}</TableHead>
                  <TableHead>{t("table.loan")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  {(canEditClients || canDeleteClients) && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/clients/${c.id}`)}>
                    <TableCell><p className="text-xs font-medium">{lang === "bn" ? c.name_bn : c.name_en}</p></TableCell>
                    <TableCell className="text-xs">{c.phone || "—"}</TableCell>
                    <TableCell className="text-xs">{c.area || "—"}</TableCell>
                    <TableCell className="text-xs font-semibold">{c.loan_amount ? `৳${Number(c.loan_amount).toLocaleString()}` : "—"}</TableCell>
                    <TableCell><StatusBadge status={c.status === "overdue" ? "overdue" : c.status === "pending" ? "pending" : c.status === "active" ? "active" : "inactive"} /></TableCell>
                    {(canEditClients || canDeleteClients) && (
                      <TableCell>
                        <div className="flex gap-1">
                          {canEditClients && <button onClick={(e) => handleEdit(e, c)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                          {canDeleteClients && <button onClick={(e) => handleDelete(e, c)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="sm:hidden space-y-3">
            {filtered.map((c) => (
              <div key={c.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{lang === "bn" ? c.name_bn : c.name_en}</p>
                    <StatusBadge status={c.status === "overdue" ? "overdue" : c.status === "active" ? "active" : "inactive"} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    <span>{c.area || "—"}</span>
                    <span>•</span>
                    <span className="font-semibold text-foreground">{c.loan_amount ? `৳${Number(c.loan_amount).toLocaleString()}` : "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {formOpen && <ClientForm open={formOpen} onClose={() => { setFormOpen(false); setEditData(null); }} editData={editData} />}
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

export default Clients;
