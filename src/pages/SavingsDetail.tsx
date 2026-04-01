import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSavingsProduct } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useSoftDelete } from "@/hooks/useCrudOperations";
import { PiggyBank, Settings, Edit2, Trash2 } from "lucide-react";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import SavingsProductForm from "@/components/forms/SavingsProductForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";

const SavingsDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { data: sp, isLoading } = useSavingsProduct(id || "");
  const { canEditSavings } = usePermissions();
  const softDelete = useSoftDelete("savings_products");

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const handleDeleteConfirmed = () => setPinOpen(true);
  const handlePinAuthorized = () => {
    setPinOpen(false);
    if (deleteTarget) {
      softDelete.mutate(deleteTarget.id, {
        onSuccess: () => navigate("/savings"),
        onSettled: () => setDeleteTarget(null),
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <PageHeader title="..." />
        <div className="space-y-4">
          <div className="card-elevated p-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!sp) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center space-y-3">
          <PiggyBank className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = lang === "bn" ? sp.product_name_bn : sp.product_name_en;

  return (
    <AppLayout>
      <PageHeader title={name} description={`${t("detail.savingsProduct")} — ${sp.id.slice(0, 8)}`} />

      <div className="card-elevated p-6 border-l-4 border-l-success">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center shrink-0">
            <PiggyBank className="w-7 h-7 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground truncate">{name}</h2>
            <span className="text-xs text-muted-foreground font-mono">{sp.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <div className="card-elevated p-5 border-l-4 border-l-primary text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.frequency")}</p>
          <p className="mt-2 text-xl font-bold text-primary capitalize">{sp.frequency}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-warning text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.minAmount")}</p>
          <p className="mt-2 text-2xl font-bold text-warning">৳{Number(sp.min_amount).toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success text-center">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("table.maxAmount")}</p>
          <p className="mt-2 text-2xl font-bold text-success">৳{Number(sp.max_amount).toLocaleString()}</p>
        </div>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Settings className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.configuration")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailField label={t("table.product")} value={name} />
          <DetailField label={t("detail.nameEn")} value={sp.product_name_en} />
          <DetailField label={t("table.frequency")} value={sp.frequency} />
          <DetailField label={t("table.minAmount")} value={`৳${Number(sp.min_amount).toLocaleString()}`} />
          <DetailField label={t("table.maxAmount")} value={`৳${Number(sp.max_amount).toLocaleString()}`} highlight />
        </div>
      </div>

      {/* Management Actions */}
      {canEditSavings && (
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "ব্যবস্থাপনা" : "Management"}</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setFormOpen(true)}>
              <Edit2 className="w-3.5 h-3.5" /> {lang === "bn" ? "পণ্য সম্পাদনা" : "Edit Product"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(sp)}>
              <Trash2 className="w-3.5 h-3.5" /> {lang === "bn" ? "পণ্য মুছুন" : "Delete Product"}
            </Button>
          </div>
        </div>
      )}

      {formOpen && <SavingsProductForm open={formOpen} onClose={() => setFormOpen(false)} editData={sp} />}

      {deleteTarget && !pinOpen && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
          itemName={lang === "bn" ? sp.product_name_bn || sp.product_name_en : sp.product_name_en}
          loading={softDelete.isPending}
        />
      )}

      <TransactionAuthModal
        open={pinOpen}
        onClose={() => { setPinOpen(false); setDeleteTarget(null); }}
        onAuthorized={handlePinAuthorized}
      />
    </AppLayout>
  );
};

export default SavingsDetail;
