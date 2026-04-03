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

const GlassCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 transition-all duration-300 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10">
    {children}
  </div>
);

const formatTaka = (value: number) => `৳${value.toLocaleString("en-BD")}`;

const mockIntelligence = {
  aum: 1250000,
  members: 85,
  netIncome: 350000,
  projected: 52000,
  riskIndex: 2.1,
  velocity: 1.5,
};

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
  const riskColor = mockIntelligence.riskIndex < 3 ? "text-emerald-400" : mockIntelligence.riskIndex < 6 ? "text-yellow-400" : "text-red-400";

  return (
    <AppLayout>
      <div className="relative min-h-screen overflow-hidden bg-[#0B1120] text-white -mx-4 -my-6 md:-mx-6 md:-my-8 lg:-mx-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(0,180,160,0.15),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(0,80,255,0.12),transparent_40%)] animate-pulse" />
        <div className="relative z-10 px-4 md:px-8 py-8 max-w-7xl mx-auto space-y-8 animate-[fadeIn_0.6s_ease-in-out]">

          <PageHeader title={name} description={`${t("detail.savingsProduct")} — ${sp?.id?.slice(0, 8)}`} />

          {/* Aura Header */}
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <div className="w-10 h-10 rounded-full bg-emerald-400 blur-md animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{name}</h1>
              <span className="inline-block mt-2 px-3 py-1 text-sm rounded-full bg-emerald-500/20 border border-emerald-400/40">🟢 Stable</span>
            </div>
          </div>

          {/* Quantum Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <GlassCard>
              <p className="text-white/70 text-sm">অ্যাক্টিভ পোর্টফোলিও (AUM)</p>
              <h2 className="text-2xl font-semibold mt-2">{formatTaka(mockIntelligence.aum)}</h2>
              <p className="text-emerald-400 text-sm mt-1">গত মাসে ৮% বৃদ্ধি</p>
            </GlassCard>
            <GlassCard>
              <p className="text-white/70 text-sm">সদস্য ইকোসিস্টেম</p>
              <h2 className="text-2xl font-semibold mt-2">{mockIntelligence.members} জন</h2>
            </GlassCard>
            <GlassCard>
              <p className="text-white/70 text-sm">বাস্তব লাভ (Net Income)</p>
              <h2 className="text-2xl font-semibold mt-2">{formatTaka(mockIntelligence.netIncome)}</h2>
            </GlassCard>
            <GlassCard>
              <p className="text-white/70 text-sm">প্রেডিক্টিভ লাভ (30D)</p>
              <h2 className="text-2xl font-semibold mt-2">{formatTaka(mockIntelligence.projected)}</h2>
            </GlassCard>
            <GlassCard>
              <p className="text-white/70 text-sm">রিস্ক ইনডেক্স (PAR)</p>
              <h2 className={`text-2xl font-semibold mt-2 ${riskColor}`}>{mockIntelligence.riskIndex}%</h2>
            </GlassCard>
            <GlassCard>
              <p className="text-white/70 text-sm">গ্রোথ ভেলোসিটি</p>
              <h2 className="text-2xl font-semibold mt-2">{mockIntelligence.velocity}x</h2>
            </GlassCard>
          </div>

          {/* Oracle Panel */}
          <GlassCard>
            <h3 className="text-lg font-semibold mb-4 text-amber-400">⚡ আর্টিফিশিয়াল ইন্টেলিজেন্স ভবিষ্যৎবাণী</h3>
            <div className="space-y-3 text-white/80 text-sm">
              <p>Insight 1: এই পণ্যটি আপনার মোট আয়ের ৩৫% কন্ট্রিবিউট করছে। Consider expanding its limit to capture 12% more market demand.</p>
              <p>Insight 2: আপনার প্রেডিক্টিভ লাভ অনুযায়ী, আগামী ৪৫ দিনে আপনার অতিরিক্ত ৳১৫,০০০ নগদ অর্থের প্রয়োজন হতে পারে।</p>
            </div>
          </GlassCard>

          {/* Existing Product Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
            <GlassCard>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{t("table.frequency")}</p>
                <p className="mt-2 text-xl font-bold text-cyan-400 capitalize">{sp.frequency}</p>
              </div>
            </GlassCard>
            <GlassCard>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{t("table.minAmount")}</p>
                <p className="mt-2 text-2xl font-bold text-amber-400">{formatTaka(Number(sp.min_amount))}</p>
              </div>
            </GlassCard>
            <GlassCard>
              <div className="text-center">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{t("table.maxAmount")}</p>
                <p className="mt-2 text-2xl font-bold text-emerald-400">{formatTaka(Number(sp.max_amount))}</p>
              </div>
            </GlassCard>
          </div>

          <GlassCard>
            <div className="flex items-center gap-2 text-emerald-400 mb-4">
              <Settings className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.configuration")}</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <DetailField label={t("detail.nameEn")} value={sp.product_name_en} />
              <DetailField label={t("table.frequency")} value={sp.frequency} />
              <DetailField label={t("table.minAmount")} value={formatTaka(Number(sp.min_amount))} />
              <DetailField label={t("table.maxAmount")} value={formatTaka(Number(sp.max_amount))} highlight />
            </div>
          </GlassCard>

          {canEditSavings && (
            <GlassCard>
              <div className="flex items-center gap-2 text-white/60 mb-4">
                <Settings className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">{lang === "bn" ? "ব্যবস্থাপনা" : "Management"}</h3>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs border-white/20 text-white hover:bg-white/10" onClick={() => setFormOpen(true)}>
                  <Edit2 className="w-3.5 h-3.5" /> {lang === "bn" ? "পণ্য সম্পাদনা" : "Edit Product"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => setDeleteTarget(sp)}>
                  <Trash2 className="w-3.5 h-3.5" /> {lang === "bn" ? "পণ্য মুছুন" : "Delete Product"}
                </Button>
              </div>
            </GlassCard>
          )}

        </div>
      </div>

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
