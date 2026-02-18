import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldOfficers } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { UserCog, Plus, Edit2, Trash2 } from "lucide-react";
import UserProfileForm from "@/components/forms/UserProfileForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const FieldOfficers = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const { data: officers, isLoading } = useFieldOfficers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleEdit = (e: React.MouseEvent, fo: any) => { e.stopPropagation(); setEditData(fo); setFormOpen(true); };
  const handleDelete = (e: React.MouseEvent, fo: any) => { e.stopPropagation(); setDeleteTarget(fo); };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await supabase.from("user_roles").delete().eq("user_id", deleteTarget.id).eq("role", "field_officer");
      toast({ title: lang === "bn" ? "ফিল্ড অফিসার সরানো হয়েছে" : "Field officer removed" });
      queryClient.invalidateQueries({ queryKey: ["field_officers"] });
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
        title={t("fieldOfficers.title")}
        description={t("fieldOfficers.description")}
        actions={
          isAdmin ? (
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditData(null); setFormOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> {lang === "bn" ? "অফিসার যোগ করুন" : "Add Officer"}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !officers || officers.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground">
          {lang === "bn" ? "কোনো ফিল্ড অফিসার পাওয়া যায়নি" : "No field officers found"}
        </div>
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  <TableHead>{t("table.clients")}</TableHead>
                  {isAdmin && <TableHead className="w-20"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {officers.map((fo: any) => {
                  const name = lang === "bn" ? (fo.name_bn || fo.name_en) : fo.name_en;
                  return (
                    <TableRow key={fo.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/field-officers/${fo.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs">{fo.phone || "—"}</TableCell>
                      <TableCell className="text-xs font-semibold">{fo.clientCount ?? 0}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <button onClick={(e) => handleEdit(e, fo)} className="p-1 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={(e) => handleDelete(e, fo)} className="p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
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
            {officers.map((fo: any) => {
              const name = lang === "bn" ? (fo.name_bn || fo.name_en) : fo.name_en;
              return (
                <div key={fo.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/field-officers/${fo.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserCog className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{fo.clientCount ?? 0} {t("table.clients")}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={(e) => handleEdit(e, fo)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={(e) => handleDelete(e, fo)} className="p-1.5 rounded hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card-elevated p-5">
            <h3 className="text-xs font-bold text-primary mb-1.5">{t("fieldOfficers.permissions")}</h3>
            <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ml-4">
              <li>{t("fieldOfficers.perm1")}</li>
              <li>{t("fieldOfficers.perm2")}</li>
              <li>{t("fieldOfficers.perm3")}</li>
            </ul>
          </div>
        </>
      )}

      {formOpen && (
        <UserProfileForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditData(null); }}
          role="field_officer"
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

export default FieldOfficers;
