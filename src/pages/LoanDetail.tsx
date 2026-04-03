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

const mockIntelligence = {
  aum: 1250000,
  members: 85,
  netIncome: 350000,
  projected: 52000,
  riskIndex: 2.1,
  velocity: 1.5,
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
          <div className="grid grid-cols-3 gap-4">
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
  const intelligence = mockIntelligence ?? { aum: 0, members: 0, netIncome: 0, projected: 0, riskIndex: 0, velocity: 0 };
  const riskColor = intelligence.riskIndex < 3 ? "text-emerald-600" : intelligence.riskIndex < 6 ? "text-yellow-600" : "text-red-600";

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
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{name}</h1>
            <span className="inline-block mt-2 px-3 py-1 text-sm rounded-full bg-emerald-500/10 border border-emerald-400/30 text-emerald-700">🟢 Stable</span>
          </div>
        </div>

        {/* Intelligence Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <InfoCard>
            <p className="text-muted-foreground text-sm">অ্যাক্টিভ পোর্টফোলিও (AUM)</p>
            <h2 className="text-2xl font-semibold mt-2 text-foreground">{formatTaka(intelligence.aum)}</h2>
            <p className="text-emerald-600 text-sm mt-1">গত মাসে ৮% বৃদ্ধি</p>
          </InfoCard>
          <InfoCard>
            <p className="text-muted-foreground text-sm">সদস্য ইকোসিস্টেম</p>
            <h2 className="text-2xl font-semibold mt-2 text-foreground">{intelligence.members} জন</h2>
          </InfoCard>
          <InfoCard>
            <p className="text-muted-foreground text-sm">বাস্তব লাভ (Net Income)</p>
            <h2 className="text-2xl font-semibold mt-2 text-foreground">{formatTaka(intelligence.netIncome)}</h2>
          </InfoCard>
          <InfoCard>
            <p className="text-muted-foreground text-sm">প্রেডিক্টিভ লাভ (30D)</p>
            <h2 className="text-2xl font-semibold mt-2 text-foreground">{formatTaka(intelligence.projected)}</h2>
          </InfoCard>
          <InfoCard>
            <p className="text-muted-foreground text-sm">রিস্ক ইনডেক্স (PAR)</p>
            <h2 className={`text-2xl font-semibold mt-2 ${riskColor}`}>{intelligence.riskIndex}%</h2>
          </InfoCard>
          <InfoCard>
            <p className="text-muted-foreground text-sm">গ্রোথ ভেলোসিটি</p>
            <h2 className="text-2xl font-semibold mt-2 text-foreground">{intelligence.velocity}x</h2>
          </InfoCard>
        </div>

        {/* Oracle Panel */}
        <InfoCard>
          <h3 className="text-lg font-semibold mb-4 text-amber-600">⚡ আর্টিফিশিয়াল ইন্টেলিজেন্স ভবিষ্যৎবাণী</h3>
          <div className="space-y-3 text-muted-foreground text-sm">
            <p>Insight 1: এই পণ্যটি আপনার মোট আয়ের ৩৫% কন্ট্রিবিউট করছে। Consider expanding its limit to capture 12% more market demand.</p>
            <p>Insight 2: আপনার প্রেডিক্টিভ লাভ অনুযায়ী, আগামী ৪৫ দিনে আপনার অতিরিক্ত ৳১৫,০০০ নগদ অর্থের প্রয়োজন হতে পারে।</p>
          </div>
        </InfoCard>

        {/* Configuration Matrix */}
        <InfoCard>
          <h3 className="text-sm uppercase tracking-widest text-muted-foreground mb-6">
            {t("detail.configuration")}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.interest")}</p>
              <p className="text-lg font-semibold text-foreground">{loan?.interest_rate ?? 0}%</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.tenure")}</p>
              <p className="text-lg font-semibold text-foreground">{loan?.tenure_months ?? 0} {t("table.months")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.maxConcurrent")}</p>
              <p className="text-lg font-semibold text-foreground">{loan?.max_concurrent ?? 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.paymentType")}</p>
              <p className="text-lg font-semibold text-foreground capitalize">{String(loan?.payment_type ?? "").replace("_", " ")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.minAmount")}</p>
              <p className="text-lg font-semibold text-foreground">{formatTaka(Number(loan?.min_amount ?? 0))}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("table.maxAmount")}</p>
              <p className="text-lg font-semibold text-foreground">{formatTaka(Number(loan?.max_amount ?? 0))}</p>
            </div>
          </div>
        </InfoCard>

        {/* Management */}
        {canEditLoans && (
          <InfoCard>
            <div className="flex items-center gap-2 text-muted-foreground mb-4">
              <Settings className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "ব্যবস্থাপনা" : "Management"}</h3>
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
