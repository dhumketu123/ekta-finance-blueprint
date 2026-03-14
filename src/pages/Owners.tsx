import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { BusinessHealthAnalytics } from "@/components/dashboard/BusinessHealthAnalytics";
import { FridayExpressGrid } from "@/components/investor/FridayExpressGrid";
import { MasterTreasury } from "@/components/investor/MasterTreasury";
import { FoundersWallets } from "@/components/investor/FoundersWallets";
import { CapitalInjectionModal } from "@/components/investor/CapitalInjectionModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvestors } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantId } from "@/hooks/useTenantId";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plus, Briefcase } from "lucide-react";
import InvestorForm from "@/components/forms/InvestorForm";

interface DashboardMetrics {
  total_clients: number;
  active_loans: number;
  total_investor_capital: number;
  total_interest_earned: number;
  total_outstanding: number;
}

// Skeleton components for professional loading states
const TreasurySkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="rounded-2xl bg-muted/40 border border-border/30 p-6 sm:p-8 space-y-4">
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-3 w-48" />
      <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-border/30">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  </div>
);

const WalletsSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="flex items-center gap-2">
      <Skeleton className="h-7 w-7 rounded-lg" />
      <Skeleton className="h-4 w-32" />
    </div>
    <div className="flex gap-3 overflow-hidden">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 w-[180px] flex-shrink-0 rounded-xl" />
      ))}
    </div>
  </div>
);

const GridSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <Skeleton className="h-16 rounded-lg" />
    <div className="rounded-xl border border-border/30 overflow-hidden">
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full border-t border-border/10" />
      ))}
    </div>
  </div>
);

const Owners = () => {
  const { lang } = useLanguage();
  const { isAdmin, isOwner, isTreasurer } = usePermissions();
  const { data: investors, isLoading } = useInvestors();
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [capitalModalOpen, setCapitalModalOpen] = useState(false);

  // Dashboard metrics with 60s cache to avoid re-fetching on navigation
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
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
  });

  const canManageInvestors = isAdmin || isOwner || isTreasurer;
  const activeInvestors = investors?.filter((inv: any) => inv.status === 'active' && !inv.deleted_at) || [];
  const dashboardLoading = metricsLoading || isLoading;

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "ফাউন্ডার ও ইকুইটি পার্টনার" : "Founders & Equity Partners"}
        description={bn ? "কোর ফাউন্ডিং মেম্বারদের ইকুইটি, সাপ্তাহিক ইনজেকশন ও সার্বিক পোর্টফোলিও ব্যবস্থাপনা" : "Equity, weekly injections, and portfolio management for core founders"}
        actions={
          canManageInvestors ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs rounded-lg shadow-sm border-primary/30 text-primary hover:bg-primary/5"
                onClick={() => setCapitalModalOpen(true)}
              >
                <Briefcase className="w-3.5 h-3.5" /> {bn ? "মূলধন জমা" : "Add Capital"}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => { setEditData(null); setFormOpen(true); }}
              >
                <Plus className="w-3.5 h-3.5" /> {bn ? "পার্টনার যোগ করুন" : "Add Partner"}
              </Button>
            </div>
          ) : null
        }
      />

      {/* Master Treasury */}
      <SectionHeader
        title={bn ? "মাস্টার ট্রেজারি" : "Master Treasury"}
        subtitle={bn ? "কোম্পানির সম্পূর্ণ আর্থিক অবস্থান একনজরে" : "Complete financial position at a glance"}
      />
      <div className="mt-4 mb-8">
        {dashboardLoading ? (
          <TreasurySkeleton />
        ) : (
          <MasterTreasury
            investors={activeInvestors}
            metrics={metrics || null}
            isLoading={false}
          />
        )}
      </div>

      {/* Founders' Smart Wallets */}
      <div className="mb-8">
        {dashboardLoading ? (
          <WalletsSkeleton />
        ) : activeInvestors.length > 0 ? (
          <FoundersWallets investors={activeInvestors} />
        ) : null}
      </div>

      {/* Business Health Analytics */}
      <SectionHeader
        title={bn ? "ব্যবসায়িক স্বাস্থ্য বিশ্লেষণ" : "Business Health Analytics"}
        subtitle={bn ? "ঋণ পোর্টফোলিও ও আদায় কর্মক্ষমতা" : "Loan portfolio & recovery performance"}
        className="mt-6"
      />
      <div className="mt-4 mb-8">
        <BusinessHealthAnalytics />
      </div>

      {/* Friday Express Collection Grid */}
      <SectionHeader
        title={bn ? "⚡ ফ্রাইডে এক্সপ্রেস সংগ্রহ" : "⚡ Friday Express Collection"}
        subtitle={bn ? "সাপ্তাহিক শেয়ার সংগ্রহ - একক ক্লিকে সকল পার্টনারের কালেকশন" : "Weekly share collection - Bulk process all partner payments"}
        className="mt-6"
      />

      {isLoading ? (
        <div className="mt-4">
          <GridSkeleton />
        </div>
      ) : !investors || investors.length === 0 ? (
        <div className="card-elevated p-8 text-center mt-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {bn ? "কোনো ফাউন্ডিং পার্টনার পাওয়া যায়নি" : "No founding partners found"}
          </p>
          {canManageInvestors && (
            <Button
              size="sm"
              onClick={() => { setEditData(null); setFormOpen(true); }}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> {bn ? "প্রথম পার্টনার যোগ করুন" : "Add First Partner"}
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <FridayExpressGrid investors={activeInvestors} />
        </div>
      )}

      {/* Modals */}
      {formOpen && (
        <InvestorForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditData(null); }}
          editData={editData}
          isOwnerMode
        />
      )}

      <CapitalInjectionModal
        open={capitalModalOpen}
        onClose={() => setCapitalModalOpen(false)}
      />
    </AppLayout>
  );
};

export default Owners;
