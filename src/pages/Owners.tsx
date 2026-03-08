import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOwners } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantId } from "@/hooks/useTenantId";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Plus, Edit2, Trash2, Users, Landmark, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import UserProfileForm from "@/components/forms/UserProfileForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";
import { useToast } from "@/hooks/use-toast";

interface DashboardMetrics {
  total_clients: number;
  active_loans: number;
  total_investor_capital: number;
  total_interest_earned: number;
  total_outstanding: number;
}

const Owners = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const { data: owners, isLoading } = useOwners();
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const bn = lang === "bn";

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch executive dashboard metrics via RPC
  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["dashboard_summary_metrics", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_summary_metrics", {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return data?.[0] ?? {
        total_clients: 0,
        active_loans: 0,
        total_investor_capital: 0,
        total_interest_earned: 0,
        total_outstanding: 0,
      };
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  const handleEdit = (e: React.MouseEvent, o: any) => { e.stopPropagation(); setEditData(o); setFormOpen(true); };
  const handleDelete = (e: React.MouseEvent, o: any) => { e.stopPropagation(); setDeleteTarget(o); };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await supabase.from("user_roles").delete().eq("user_id", deleteTarget.id).eq("role", "owner");
      toast({ title: bn ? "মালিক সরানো হয়েছে" : "Owner removed" });
      queryClient.invalidateQueries({ queryKey: ["owners"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const formatCurrency = (val: number) => `৳${(val || 0).toLocaleString("bn-BD")}`;

  return (
    <AppLayout>
      <PageHeader
        title={t("owners.title")}
        description={t("owners.description")}
        actions={
          isAdmin ? (
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditData(null); setFormOpen(true); }}>
              <Plus className="w-3.5 h-3.5" /> {bn ? "মালিক যোগ করুন" : "Add Owner"}
            </Button>
          ) : null
        }
      />

      {/* Executive Financial Summary Dashboard */}
      <SectionHeader
        title={bn ? "এক্সিকিউটিভ আর্থিক সারসংক্ষেপ" : "Executive Financial Summary"}
        subtitle={bn ? "প্রতিষ্ঠানের সামগ্রিক আর্থিক চিত্র" : "Organization-wide financial overview"}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-4 mb-8">
        <MetricCard
          title={bn ? "মোট গ্রাহক" : "Total Clients"}
          value={metrics?.total_clients ?? 0}
          label={bn ? "নিবন্ধিত সদস্য" : "Registered members"}
          icon={<Users className="w-5 h-5" />}
          isLoading={metricsLoading}
          variant="default"
        />
        <MetricCard
          title={bn ? "সক্রিয় ঋণ" : "Active Loans"}
          value={metrics?.active_loans ?? 0}
          label={bn ? "চলমান ঋণ হিসাব" : "Running loan accounts"}
          icon={<Landmark className="w-5 h-5" />}
          isLoading={metricsLoading}
          variant="success"
        />
        <MetricCard
          title={bn ? "মোট বিনিয়োগ" : "Total Investment"}
          value={formatCurrency(metrics?.total_investor_capital ?? 0)}
          label={bn ? "বিনিয়োগকারী মূলধন" : "Investor capital"}
          icon={<Wallet className="w-5 h-5" />}
          isLoading={metricsLoading}
          variant="default"
        />
        <MetricCard
          title={bn ? "অর্জিত মুনাফা" : "Interest Earned"}
          value={formatCurrency(metrics?.total_interest_earned ?? 0)}
          label={bn ? "সুদ থেকে আয়" : "Revenue from interest"}
          icon={<TrendingUp className="w-5 h-5" />}
          isLoading={metricsLoading}
          variant="success"
        />
        <MetricCard
          title={bn ? "বকেয়া ঋণ" : "Outstanding Loans"}
          value={formatCurrency(metrics?.total_outstanding ?? 0)}
          label={bn ? "অপরিশোধিত মূলধন" : "Unpaid principal"}
          icon={<AlertTriangle className="w-5 h-5" />}
          isLoading={metricsLoading}
          variant="warning"
        />
      </div>

      {/* Owners List Section */}
      <SectionHeader
        title={bn ? "মালিকদের তালিকা" : "Owners List"}
        className="mt-6"
      />

      {isLoading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : !owners || owners.length === 0 ? (
        <div className="card-elevated p-8 text-center text-sm text-muted-foreground mt-4">
          {bn ? "কোনো মালিক পাওয়া যায়নি" : "No owners found"}
        </div>
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block mt-4">
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
                  const name = bn ? (o.name_bn || o.name_en) : o.name_en;
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/owners/${o.id}`)}>
                      <TableCell>
                        <p className="text-xs font-medium">{name}</p>
                        {o.owner_id && <p className="text-[10px] text-muted-foreground font-mono">{o.owner_id}</p>}
                      </TableCell>
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

          <div className="sm:hidden space-y-3 mt-4">
            {owners.map((o: any) => {
              const name = bn ? (o.name_bn || o.name_en) : o.name_en;
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
