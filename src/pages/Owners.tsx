import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { BusinessHealthAnalytics } from "@/components/dashboard/BusinessHealthAnalytics";
import { FridayExpressGrid } from "@/components/investor/FridayExpressGrid";
import { CapitalInjectionModal } from "@/components/investor/CapitalInjectionModal";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvestors } from "@/hooks/useSupabaseData";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantId } from "@/hooks/useTenantId";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Users, Landmark, TrendingUp, Wallet, AlertTriangle, Plus, Briefcase, Beaker } from "lucide-react";
import InvestorForm from "@/components/forms/InvestorForm";

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
  const { toast } = useToast();
  const { isAdmin, isOwner, isTreasurer } = usePermissions();
  const { data: investors, isLoading, error } = useInvestors();
  const { tenantId } = useTenantId();

  // DEBUG: Log investor fetch results
  console.log('DEBUG - Current Tenant ID:', tenantId);
  console.log('DEBUG - Raw Investors Data fetched:', investors);
  console.log('DEBUG - Fetch Error (if any):', error);
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [capitalModalOpen, setCapitalModalOpen] = useState(false);
  const [seedingLoading, setSeedingLoading] = useState(false);

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
    staleTime: 2 * 60 * 1000,
  });

  const formatCurrency = (val: number) => `৳${(val || 0).toLocaleString("bn-BD")}`;

  const handleSeedDummyData = async () => {
    if (!tenantId) {
      toast({ title: "Error", description: "Unable to determine tenant ID", variant: "destructive" });
      return;
    }

    setSeedingLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const dummyInvestors = [
      {
        name_bn: "মোঃ শফিকুল ইসলাম",
        name_en: "Shafiqul Islam",
        phone: "01711000001",
        capital: 5000,
        weekly_share: 100,
        status: "active" as const,
        tenant_id: tenantId,
        weekly_paid_until: today,
        monthly_profit_percent: 0,
        investment_model: "profit_only" as const,
        reinvest: false,
        principal_amount: 0,
        tenure_years: 1,
      },
      {
        name_bn: "আব্দুল্লাহ আল নোমান",
        name_en: "Abdullah Al Noman",
        phone: "01811000002",
        capital: 20000,
        weekly_share: 200,
        status: "active" as const,
        tenant_id: tenantId,
        weekly_paid_until: today,
        monthly_profit_percent: 0,
        investment_model: "profit_only" as const,
        reinvest: false,
        principal_amount: 0,
        tenure_years: 1,
      },
      {
        name_bn: "কাজী জহিরুল হক",
        name_en: "Kazi Zahirul Haque",
        phone: "01911000003",
        capital: 2000,
        weekly_share: 100,
        status: "active" as const,
        tenant_id: tenantId,
        weekly_paid_until: today,
        monthly_profit_percent: 0,
        investment_model: "profit_only" as const,
        reinvest: false,
        principal_amount: 0,
        tenure_years: 1,
      },
    ];

    const { error } = await supabase.from("investors").insert(dummyInvestors);

    setSeedingLoading(false);

    if (error) {
      console.error("SEEDER DB ERROR:", error);
      toast({
        title: bn ? "ত্রুটি" : "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: bn ? "সফল" : "Success",
        description: bn ? "ডামি ডেটা লোড হয়েছে!" : "Dummy data loaded successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary_metrics"] });
    }
  };

  const canManageInvestors = isAdmin || isOwner || isTreasurer;

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "মালিক ও পার্টনার" : "Owners & Partners"}
        description={bn ? "বিনিয়োগকারী ও মালিকদের সাপ্তাহিক সংগ্রহ ব্যবস্থাপনা" : "Weekly collection management for investors & owners"}
        actions={
          canManageInvestors ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs rounded-lg"
                onClick={handleSeedDummyData}
                disabled={seedingLoading}
              >
                <Beaker className="w-3.5 h-3.5" /> {bn ? "🧪 ডামি ডেটা" : "🧪 Seed Data"}
              </Button>
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

      {/* Executive Financial Summary Dashboard */}
      <SectionHeader
        title={bn ? "এক্সিকিউটিভ আর্থিক সারসংক্ষেপ" : "Executive Financial Summary"}
        subtitle={bn ? "প্রতিষ্ঠানের সামগ্রিক আর্থিক চিত্র" : "Organization-wide financial overview"}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-4 mb-6">
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

      {/* DEBUG INDICATOR - Remove after investigation */}
      <div className="p-2 bg-red-100 text-red-800 text-xs font-mono mt-2 rounded border border-red-300">
        DEBUG MODE: TenantID={tenantId || 'NULL'} | DataCount={investors?.length || 0} | Error={error ? String(error) : 'none'} | ActiveCount={investors?.filter((i: any) => i.status === 'active' && !i.deleted_at).length || 0}
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : !investors || investors.length === 0 ? (
        <div className="card-elevated p-8 text-center mt-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {bn ? "কোনো পার্টনার/বিনিয়োগকারী পাওয়া যায়নি" : "No partners/investors found"}
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
          <FridayExpressGrid investors={investors.filter((inv: any) => inv.status === 'active' && !inv.deleted_at)} />
        </div>
      )}

      {/* Investor Form Modal */}
      {formOpen && (
        <InvestorForm
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditData(null); }}
          editData={editData}
          isOwnerMode
        />
      )}

      {/* Capital Injection Modal */}
      <CapitalInjectionModal
        open={capitalModalOpen}
        onClose={() => setCapitalModalOpen(false)}
      />
    </AppLayout>
  );
};

export default Owners;
