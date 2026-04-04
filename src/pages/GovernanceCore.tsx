import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import AppLayout from "@/components/AppLayout";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Eye, Clock } from "lucide-react";

import type {
  EscalationStage, AgingBucket, QueueRow, PolicyItem,
} from "@/components/governance/types";
import {
  STAGE_ICON_MAP, BUCKET_ICON_MAP, BUCKET_COLOR_MAP,
  toStatusType,
  FALLBACK_STAGES, FALLBACK_BUCKETS, FALLBACK_POLICY,
} from "@/components/governance/types";
import { EscalationCard } from "@/components/governance/EscalationCard";
import { AgingBucketCard } from "@/components/governance/AgingBucketCard";
import { PriorityTable } from "@/components/governance/PriorityTable";
import { DefaultPolicyPanel } from "@/components/governance/DefaultPolicyPanel";
import { SystemHealthIndicator } from "@/components/governance/SystemHealthIndicator";
import TablePagination from "@/components/TablePagination";
import { GovernanceAlertsPanel } from "@/components/governance/GovernanceAlertsPanel";
import type { SystemStatus } from "@/components/governance/types";

const PAGE_SIZE = 10;

const GovernanceCore = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("online");
  const [escalationStages, setEscalationStages] = useState<EscalationStage[]>(FALLBACK_STAGES);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucket[]>(FALLBACK_BUCKETS);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [policyItems, setPolicyItems] = useState<PolicyItem[]>(FALLBACK_POLICY);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  const fetchGovernanceData = useCallback(async () => {
    setIsLoading(true);
    try {
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
          tag: toStatusType(row.stage_tag),
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
        setPage(1);
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
    const interval = setInterval(fetchGovernanceData, 60000);
    return () => clearInterval(interval);
  }, [fetchGovernanceData]);

  // Real-time critical alert toast (fires once per data refresh, not on every render)
  const prevCriticalRef = useRef(0);
  useEffect(() => {
    const criticalCount = queueRows.filter((q) => q.status === "Critical").length;
    if (criticalCount > 0 && criticalCount !== prevCriticalRef.current) {
      toast.error("Critical Clients Alert!", {
        description: `${criticalCount} client(s) require immediate attention.`,
      });
    }
    prevCriticalRef.current = criticalCount;
  }, [queueRows]);

  // Memoized queue sorting by priority (highest first)
  const sortedQueue = useMemo(
    () => [...queueRows].sort((a, b) => b.priority - a.priority),
    [queueRows]
  );

  const totalPages = Math.ceil(sortedQueue.length / PAGE_SIZE);
  const paginatedQueue = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedQueue.slice(start, start + PAGE_SIZE);
  }, [sortedQueue, page]);

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
        {paginatedQueue.length > 0 ? (
          <>
            <PriorityTable rows={paginatedQueue} />
            <TablePagination
              page={page}
              totalPages={totalPages}
              totalCount={sortedQueue.length}
              onPageChange={setPage}
            />
          </>
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
        <div className="mt-4">
          <Button variant="outline" onClick={() => setIsModalOpen(true)}>
            View Escalation Rules
          </Button>
        </div>

        {/* ── Escalation Rules Modal ── */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Escalation Rules</DialogTitle>
              <DialogDescription>
                এসকেলেশন নিয়মাবলী — পরবর্তী ব্যাচে ডায়নামিক ইমপ্লিমেন্টেশন হবে।
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pre-Due</span>
                <span className="font-medium">SMS Reminder</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">1–7 Days</span>
                <span className="font-medium">Soft Call</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">8–15 Days</span>
                <span className="font-medium">Field Visit</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">16–30 Days</span>
                <span className="font-medium">Manager Escalation</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">31–59 Days</span>
                <span className="font-medium">Legal Notice</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">60+ Days</span>
                <span className="font-medium text-destructive">Auto Default</span>
              </div>
            </div>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Close
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default GovernanceCore;
