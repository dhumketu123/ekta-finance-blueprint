import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLoanProduct } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useSoftDelete } from "@/hooks/useCrudOperations";
import { CreditCard, Settings, Edit2, Trash2 } from "lucide-react";
import { MetricCardSkeleton } from "@/components/ui/skeleton";
import LoanProductForm from "@/components/forms/LoanProductForm";
import DeleteConfirmDialog from "@/components/forms/DeleteConfirmDialog";
import TransactionAuthModal from "@/components/security/TransactionAuthModal";

const InfoCard = ({ children }: { children: React.ReactNode }) => (
  <div className="card-elevated rounded-2xl p-6 transition-all duration-300 hover:shadow-lg">
    {children}
  </div>
);

const formatTaka = (value: number) => {
  const safe = isNaN(value) ? 0 : value;
  return `৳${safe.toLocaleString("en-BD")}`;
};

const LoanDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { data: loan, isLoading } = useLoanProduct(id || "");
  const { canEditLoans } = usePermissions();
  const softDelete = useSoftDelete("loan_products");

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [pinOpen, setPinOpen] = useState(false);

  const handleDeleteConfirmed = () => setPinOpen(true);
  const handlePinAuthorized = () => {
    setPinOpen(false);
    if (deleteTarget) {
      softDelete.mutate(deleteTarget.id, {
        onSuccess: () => navigate("/loans"),
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!loan) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center space-y-3">
          <CreditCard className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = lang === "bn" ? loan.product_name_bn : loan.product_name_en;
  const hasUpfront = Number(loan.upfront_savings_pct ?? 0) > 0;
  const hasCompulsory = Number(loan.compulsory_savings_amount ?? 0) > 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader title={name} description={`${t("detail.loanProduct")} — ${loan?.id?.slice(0, 8)}`} />

        {/* Aura Header */}
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CreditCard className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{name}</p>
            <span className="inline-block mt-2 px-3 py-1 text-sm rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-700">
              🟢 {lang === "bn" ? "সক্রিয়" : "Active"}
            </span>
          </div>
        </div>

        {/* Configuration Matrix */}
        <InfoCard>
          <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
            {t("detail.configuration")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.interest")}</p>
              <p className="text-lg font-semibold text-foreground">{loan.interest_rate ?? 0}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.tenure")}</p>
              <p className="text-lg font-semibold text-foreground">{loan.tenure_months ?? 0} {t("table.months")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{lang === "bn" ? "ফ্রিকোয়েন্সি" : "Frequency"}</p>
              <p className="text-lg font-semibold text-foreground capitalize">{loan.payment_frequency || "Monthly"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.paymentType")}</p>
              <p className="text-lg font-semibold text-foreground capitalize">{String(loan.payment_type ?? "monthly").replace("_", " ")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.minAmount")}</p>
              <p className="text-lg font-semibold text-foreground">{formatTaka(Number(loan.min_amount ?? 0))}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.maxAmount")}</p>
              <p className="text-lg font-semibold text-foreground">{formatTaka(Number(loan.max_amount ?? 0))}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.maxConcurrent")}</p>
              <p className="text-lg font-semibold text-foreground">{loan.max_concurrent ?? 1}</p>
            </div>
          </div>
        </InfoCard>

        {/* MFI Rules */}
        {(hasUpfront || hasCompulsory) && (
          <InfoCard>
            <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-4">
              {lang === "bn" ? "MFI সঞ্চয় নিয়ম" : "MFI Savings Rules"}
            </h2>
            <div className="flex flex-wrap gap-3">
              {hasUpfront && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-400/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">{lang === "bn" ? "অগ্রিম সঞ্চয়" : "Upfront Savings"}</span>
                  <span className="text-lg font-bold text-emerald-600">{loan.upfront_savings_pct}%</span>
                </div>
              )}
              {hasCompulsory && (
                <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-400/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">{lang === "bn" ? "বাধ্যতামূলক DPS/কিস্তি" : "Compulsory DPS/Inst."}</span>
                  <span className="text-lg font-bold text-blue-600">{formatTaka(Number(loan.compulsory_savings_amount))}</span>
                </div>
              )}
            </div>
          </InfoCard>
        )}

        {/* Management */}
        {canEditLoans && (
          <InfoCard>
            <div className="flex items-center gap-2 text-muted-foreground mb-4">
              <Settings className="w-4 h-4" />
              <h2 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "ব্যবস্থাপনা" : "Management"}</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setFormOpen(true)}>
                <Edit2 className="w-3.5 h-3.5" /> {lang === "bn" ? "পণ্য সম্পাদনা" : "Edit Product"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(loan)}>
                <Trash2 className="w-3.5 h-3.5" /> {lang === "bn" ? "পণ্য মুছুন" : "Delete Product"}
              </Button>
            </div>
          </InfoCard>
        )}
      </div>

      {formOpen && <LoanProductForm open={formOpen} onClose={() => setFormOpen(false)} editData={loan} />}

      {deleteTarget && !pinOpen && (
        <DeleteConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
          itemName={lang === "bn" ? loan.product_name_bn || loan.product_name_en : loan.product_name_en}
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

export default LoanDetail;
