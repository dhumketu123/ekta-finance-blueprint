import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOwners } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { Crown, Plus, Edit2, Trash2 } from "lucide-react";
import UserProfileForm from "@/components/forms/UserProfileForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const Owners = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const { data: owners, isLoading } = useOwners();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleEdit = (e: React.MouseEvent, o: any) => { e.stopPropagation(); setEditData(o); setFormOpen(true); };
  const handleDelete = (e: React.MouseEvent, o: any) => { e.stopPropagation(); setDeleteTarget(o); };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      // Remove the owner role (don't delete the auth user)
      await supabase.from("user_roles").delete().eq("user_id", deleteTarget.id).eq("role", "owner");
      toast({ title: lang === "bn" ? "মালিক সরানো হয়েছে" : "Owner removed" });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title={t("owners.title")}
        description={t("owners.description")}
        actions={
          isAdmin ? (
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditData(null); setFormOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> {lang === "bn" ? "মালিক যোগ করুন" : "Add Owner"}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : !owners || owners.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {lang === "bn" ? "কোনো মালিক পাওয়া যায়নি" : "No owners found"}
        </div>
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  {isAdmin && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.map((o: any) => {
                  const name = lang === "bn" ? (o.name_bn || o.name_en) : o.name_en;
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/owners/${o.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs">{o.phone || "—"}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={(e) => handleEdit(e, o)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={(e) => handleDelete(e, o)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="sm:hidden space-y-3">
            {owners.map((o: any) => {
              const name = lang === "bn" ? (o.name_bn || o.name_en) : o.name_en;
              return (
                <div key={o.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/owners/${o.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                    <Crown className="w-4.5 h-4.5 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{o.phone || "—"}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={(e) => handleEdit(e, o)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={(e) => handleDelete(e, o)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {formOpen && (
        <UserProfileForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditData(null); }}
          role="owner"
          editData={editData}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
          itemName={deleteTarget.name_en || deleteTarget.name_bn}
          loading={deleteLoading}
        />
      )}
    </AppLayout>
  );
};

export default Owners;
