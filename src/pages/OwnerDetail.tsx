import { useMemo } from "react";
import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import DetailField from "@/components/DetailField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, Phone } from "lucide-react";
import { MetricCardSkeleton } from "@/components/ui/skeleton";

// Modular sub-components
import OwnerEquityHero from "@/components/owner/OwnerEquityHero";
import OwnerTimeline from "@/components/owner/OwnerTimeline";
import OwnerAnalyticsCards from "@/components/owner/OwnerAnalyticsCards";
import OwnerProfitTable from "@/components/owner/OwnerProfitTable";
import OwnerLegalVault from "@/components/owner/OwnerLegalVault";
import OwnerAdminControls from "@/components/owner/OwnerAdminControls";

const OwnerDetail = () => {
  const { id } = useParams();
  const { t, lang } = useLanguage();
  const { role } = useAuth();
  const bn = lang === "bn";
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const ownerLookupId = id || "";

  // ═══ DATA: Resolve investor record robustly ═══
  const { data: investorRecord, isLoading: investorLoading } = useQuery({
    queryKey: ["owner_investor_record", ownerLookupId],
    queryFn: async () => {
      // Try by investor.id first
      const byId = await supabase
        .from("investors")
        .select("id, user_id, investor_id, name_en, name_bn, phone, capital, share_percentage, total_weekly_paid, accumulated_profit, weekly_share, status, created_at")
        .eq("id", ownerLookupId)
        .is("deleted_at", null)
        .maybeSingle();
      if (byId.error) throw byId.error;
      if (byId.data) return byId.data;

      // Fallback: try by user_id
      const byUser = await supabase
        .from("investors")
        .select("id, user_id, investor_id, name_en, name_bn, phone, capital, share_percentage, total_weekly_paid, accumulated_profit, weekly_share, status, created_at")
        .eq("user_id", ownerLookupId)
        .is("deleted_at", null)
        .maybeSingle();
      if (byUser.error) throw byUser.error;
      return byUser.data;
    },
    enabled: !!ownerLookupId,
    staleTime: 60_000,
  });

  // Resolve IDs
  const ownerRefId = useMemo(
    () => investorRecord?.user_id ?? investorRecord?.id ?? ownerLookupId,
    [investorRecord, ownerLookupId]
  );

  // Build owner display object from investor record (no profiles dependency)
  const owner = useMemo(() => {
    if (!investorRecord) return null;
    return {
      id: investorRecord.id,
      user_id: investorRecord.user_id,
      name_en: investorRecord.name_en,
      name_bn: investorRecord.name_bn ?? "",
      phone: investorRecord.phone,
      owner_id: investorRecord.investor_id ?? investorRecord.id.slice(0, 8),
      created_at: investorRecord.created_at,
    };
  }, [investorRecord]);

  // Derived financial metrics (memoized)
  const sharePct = useMemo(() => investorRecord?.share_percentage ?? 0, [investorRecord]);
  const totalCapital = useMemo(
    () => (investorRecord?.capital ?? 0) + (investorRecord?.total_weekly_paid ?? 0),
    [investorRecord]
  );

  // Aggregate profit stats (lightweight query for totals only)
  const { data: profitAgg } = useQuery({
    queryKey: ["owner_profit_agg", ownerRefId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("owner_profit_shares")
        .select("share_amount, payment_status")
        .eq("owner_id", ownerRefId);
      if (error) throw error;
      const items = data ?? [];
      const totalEarned = items.reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
      const totalPaid = items.filter((ps) => ps.payment_status === "paid").reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
      const totalPending = items.filter((ps) => ps.payment_status === "pending").reduce((s, ps) => s + (ps.share_amount ?? 0), 0);
      return { totalEarned, totalPaid, totalPending };
    },
    enabled: !!ownerRefId,
    staleTime: 60_000,
  });

  const totalProfitEarned = profitAgg?.totalEarned ?? 0;
  const totalPaid = profitAgg?.totalPaid ?? 0;
  const totalPending = profitAgg?.totalPending ?? 0;

  // ═══ RENDER ═══
  if (investorLoading) {
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
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!owner) {
    return (
      <AppLayout>
        <PageHeader title={t("detail.notFound")} />
        <div className="card-elevated p-8 text-center space-y-3">
          <Crown className="w-12 h-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">{t("detail.notFoundDesc")}</p>
        </div>
      </AppLayout>
    );
  }

  const name = bn ? (owner.name_bn || owner.name_en) : owner.name_en;

  return (
    <AppLayout>
      <PageHeader
        title={name}
        description={`${bn ? "মালিক" : "Owner"} — ${owner.owner_id}`}
        badge={bn ? "👑 ফাউন্ডার ও ইকুইটি পার্টনার" : "👑 Founder & Equity Partner"}
      />

      {/* Section 1: Hero */}
      <OwnerEquityHero
        name={name}
        ownerId={owner.owner_id}
        phone={owner.phone}
        status={investorRecord?.status}
        sharePct={sharePct}
        bn={bn}
      />

      {/* Section 2: 15-Year Timeline */}
      <OwnerTimeline bn={bn} />

      {/* Section 3-4: Analytics Charts + Metric Cards */}
      <OwnerAnalyticsCards
        totalCapital={totalCapital}
        totalProfitEarned={totalProfitEarned}
        totalPaid={totalPaid}
        totalPending={totalPending}
        bn={bn}
      />

      {/* Section 5-6: Profit Trend Chart + Paginated Table */}
      <OwnerProfitTable ownerRefId={ownerRefId} bn={bn} />

      {/* Section 7: Legal Vault */}
      <OwnerLegalVault ownerRefId={ownerRefId} bn={bn} />

      {/* Section 8: Contact Details */}
      <Card className="border border-border/60">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <Phone className="w-4 h-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider">{t("detail.details")}</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <DetailField label={t("table.name")} value={name} />
            <DetailField label={t("detail.nameEn")} value={owner.name_en} />
            <DetailField label={t("table.phone")} value={owner.phone || "—"} />
          </div>
        </CardContent>
      </Card>

      {/* Section 9: Admin Controls */}
      <OwnerAdminControls
        owner={{
          id: ownerRefId,
          name_en: owner.name_en,
          name_bn: owner.name_bn,
          phone: owner.phone || "",
          created_at: owner.created_at,
          owner_id: owner.owner_id,
        }}
        ownerRefId={ownerRefId}
        totalCapital={totalCapital}
        totalProfitEarned={totalProfitEarned}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        bn={bn}
      />
    </AppLayout>
  );
};

export default OwnerDetail;
