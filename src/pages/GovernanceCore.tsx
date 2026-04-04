import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import AppLayout from "@/components/AppLayout";
import { SectionHeader } from "@/components/SectionHeader";
import {
  ShieldAlert, Eye, AlertTriangle, Flame, Skull,
  Clock, AlertCircle, TrendingDown, XOctagon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  EscalationStage, AgingBucket, QueueRow, PolicyItem, StatusType,
} from "@/components/governance/types";
import { BUCKET_COLOR_MAP } from "@/components/governance/types";
import { EscalationCard } from "@/components/governance/EscalationCard";
import { AgingBucketCard } from "@/components/governance/AgingBucketCard";
import { PriorityTable } from "@/components/governance/PriorityTable";
import { DefaultPolicyPanel } from "@/components/governance/DefaultPolicyPanel";
import { SystemHealthIndicator } from "@/components/governance/SystemHealthIndicator";
import type { SystemStatus } from "@/components/governance/types";

/* ══════════════════════════════════════════════
   ICON MAPS (DB returns IDs, we map to icons)
   ══════════════════════════════════════════════ */

const STAGE_ICON_MAP: Record<string, LucideIcon> = {
  "pre-due": Eye,
  "early-1-7": ShieldAlert,
  "control-8-15": AlertTriangle,
  "escalation-16-30": Flame,
  "critical-31-59": Skull,
};

const BUCKET_ICON_MAP: Record<string, LucideIcon> = {
  "bucket-0-30": Clock,
  "bucket-31-60": AlertCircle,
  "bucket-61-90": TrendingDown,
  "bucket-90-plus": XOctagon,
};

/* ══════════════════════════════════════════════
   FALLBACK DATA (shown while loading / on error)
   ══════════════════════════════════════════════ */

const FALLBACK_STAGES: EscalationStage[] = [
  { id: "pre-due", icon: Eye, title: "Pre-Due Monitoring", desc: "পরিশোধের আগে পর্যবেক্ষণ", metric: "—", tag: "Passive" },
  { id: "early-1-7", icon: ShieldAlert, title: "Early Delinquency (1–7)", desc: "প্রাথমিক বিলম্ব সনাক্তকরণ", metric: "—", tag: "Soft Alert" },
  { id: "control-8-15", icon: AlertTriangle, title: "Control Risk (8–15)", desc: "ঝুঁকি নিয়ন্ত্রণ পর্যায়", metric: "—", tag: "Follow-up" },
  { id: "escalation-16-30", icon: Flame, title: "Escalation (16–30)", desc: "এসকেলেশন পর্যায়", metric: "—", tag: "Escalated" },
  { id: "critical-31-59", icon: Skull, title: "Critical Watch (31–59)", desc: "জরুরি নজরদারি", metric: "—", tag: "Critical" },
];

const FALLBACK_BUCKETS: AgingBucket[] = [
  { id: "bucket-0-30", icon: Clock, title: "0–30 দিন", label: "Current Risk", count: "—", color: "bg-warning" },
  { id: "bucket-31-60", icon: AlertCircle, title: "31–60 দিন", label: "Watchlist", count: "—", color: "bg-amber-500" },
  { id: "bucket-61-90", icon: TrendingDown, title: "61–90 দিন", label: "NPL Emerging", count: "—", color: "bg-destructive/70" },
  { id: "bucket-90-plus", icon: XOctagon, title: "90+ দিন", label: "NPL Confirmed", count: "—", color: "bg-destructive" },
];

const FALLBACK_POLICY: PolicyItem[] = [
  { label: "Default Trigger", value: "60 Days" },
  { label: "Audit Log", value: "Enabled" },
  { label: "Maker-Checker", value: "Required" },
  { label: "Cron Controlled", value: "Yes" },
];

/* ══════════════════════════════════════════════
   STATUS TYPE VALIDATOR
   ══════════════════════════════════════════════ */

const VALID_STATUSES: StatusType[] = ["Escalated", "Critical", "Follow-up", "Soft Alert", "Passive"];

const toStatusType = (s: string): StatusType =>
  VALID_STATUSES.includes(s as StatusType) ? (s as StatusType) : "Passive";

/* ══════════════════════════════════════════════
   PAGE COMPONENT
   ══════════════════════════════════════════════ */

const GovernanceCore = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("online");
  const [escalationStages, setEscalationStages] = useState<EscalationStage[]>(FALLBACK_STAGES);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>(FALLBACK_BUCKETS);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [policyItems, setPolicyItems] = useState<PolicyItem[]>(FALLBACK_POLICY);
  const [isLoading, setIsLoading] = useState(true);

  const fetchGovernanceData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Parallel fetch all 4 RPCs
      const [escRes, agingRes, queueRes, policyRes] = await Promise.allSettled([
        supabase.rpc("get_governance_escalation_overview"),
        supabase.rpc("get_governance_aging_buckets"),
        supabase.rpc("get_governance_collection_queue"),
        supabase.rpc("get_governance_policy_config"),
      ]);

      // 1️⃣ Escalation Stages
      if (escRes.status === "fulfilled" && escRes.value.data) {
        const mapped: EscalationStage[] = escRes.value.data.map((row: {
          stage_id: string;
          stage_title: string;
          stage_desc: string;
          stage_tag: string;
          metric: number;
        }) => ({
          id: row.stage_id,
          icon: STAGE_ICON_MAP[row.stage_id] ?? Eye,
          title: row.stage_title,
          desc: row.stage_desc,
          tag: row.stage_tag,
          metric: row.metric,
        }));
        setEscalationStages(mapped);
      }

      // 2️⃣ Aging Buckets
      if (agingRes.status === "fulfilled" && agingRes.value.data) {
        const mapped: AgingBucket[] = agingRes.value.data.map((row: {
          bucket_id: string;
          bucket_label: string;
          bucket_title: string;
          loan_count: number;
        }) => ({
          id: row.bucket_id,
          icon: BUCKET_ICON_MAP[row.bucket_id] ?? Clock,
          label: row.bucket_label,
          title: row.bucket_title,
          count: row.loan_count,
          color: BUCKET_COLOR_MAP[row.bucket_id] ?? "bg-muted",
        }));
        setAgingBuckets(mapped);
      }

      // 3️⃣ Collection Queue
      if (queueRes.status === "fulfilled" && queueRes.value.data) {
        const mapped: QueueRow[] = queueRes.value.data.map((row: {
          row_id: string;
          client_name: string;
          overdue_days: number;
          risk_score: number;
          priority_score: number;
          queue_status: string;
        }) => ({
          id: row.row_id,
          client: row.client_name,
          days: Number(row.overdue_days),
          risk: Number(row.risk_score),
          priority: Number(row.priority_score),
          status: toStatusType(row.queue_status),
        }));
        setQueueRows(mapped);
      }

      // 4️⃣ Policy Config
      if (policyRes.status === "fulfilled" && policyRes.value.data) {
        const mapped: PolicyItem[] = policyRes.value.data.map((row: {
          policy_label: string;
          policy_value: string;
        }) => ({
          label: row.policy_label,
          value: row.policy_value,
        }));
        setPolicyItems(mapped);
      }

      setSystemStatus("online");
    } catch (error: unknown) {
      console.error("Governance data fetch failed:", error instanceof Error ? error.message : error);
      setSystemStatus("degraded");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGovernanceData();
  }, [fetchGovernanceData]);

  // Memoized queue sorting by priority (highest first)
  const sortedQueue = useMemo(
    () => [...queueRows].sort((a, b) => b.priority - a.priority),
    [queueRows]
  );

  return (
    <AppLayout>
      <div className="min-h-screen pb-24">
        <PageHeader
          title="Governance Core"
          description="Overdue Escalation & Default Control System"
          badge="🛡️ গভর্নেন্স ইঞ্জিন"
          actions={<SystemHealthIndicator status={systemStatus} />}
        />

        {/* ── SECTION 1: Escalation Overview ── */}
        <SectionHeader title="Escalation Overview" subtitle="ঝুঁকি পর্যায় অনুযায়ী এসকেলেশন ম্যাপ" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
          {escalationStages.map((s) => (
            <EscalationCard key={s.id} stage={s} />
          ))}
        </div>

        {/* ── SECTION 2: Aging Buckets ── */}
        <SectionHeader title="Aging Bucket View" subtitle="ওভারডিউ বয়স বিশ্লেষণ" className="mt-10" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          {agingBuckets.map((b) => (
            <AgingBucketCard key={b.id} bucket={b} />
          ))}
        </div>

        {/* ── SECTION 3: Collection Priority Queue ── */}
        <SectionHeader title="Collection Priority Queue" subtitle="আদায় অগ্রাধিকার সারি" className="mt-10" />
        {sortedQueue.length > 0 ? (
          <PriorityTable rows={sortedQueue} />
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg mt-4 p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {isLoading ? "ডেটা লোড হচ্ছে..." : "কোনো ওভারডিউ ক্লায়েন্ট নেই ✅"}
            </p>
          </div>
        )}

        {/* ── SECTION 4: Default Policy Panel ── */}
        <SectionHeader title="Auto Default Policy" subtitle="স্বয়ংক্রিয় ডিফল্ট পলিসি কনফিগারেশন" className="mt-10" />
        <DefaultPolicyPanel items={policyItems} />
      </div>
    </AppLayout>
  );
};

export default GovernanceCore;
