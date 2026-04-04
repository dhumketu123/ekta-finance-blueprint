import PageHeader from "@/components/PageHeader";
import AppLayout from "@/components/AppLayout";
import { SectionHeader } from "@/components/SectionHeader";
import {
  ShieldAlert, Eye, AlertTriangle, Flame, Skull,
  Clock, AlertCircle, TrendingDown, XOctagon,
} from "lucide-react";

import type { EscalationStage, AgingBucket, QueueRow, PolicyItem } from "@/components/governance/types";
import { EscalationCard } from "@/components/governance/EscalationCard";
import { AgingBucketCard } from "@/components/governance/AgingBucketCard";
import { PriorityTable } from "@/components/governance/PriorityTable";
import { DefaultPolicyPanel } from "@/components/governance/DefaultPolicyPanel";
import { SystemHealthIndicator } from "@/components/governance/SystemHealthIndicator";

/* ══════════════════════════════════════════════
   STATIC DATA
   ══════════════════════════════════════════════ */

const escalationStages: EscalationStage[] = [
  { id: "pre-due", icon: Eye, title: "Pre-Due Monitoring", desc: "পরিশোধের আগে পর্যবেক্ষণ", metric: "—", tag: "Passive" },
  { id: "early-1-7", icon: ShieldAlert, title: "Early Delinquency (1–7)", desc: "প্রাথমিক বিলম্ব সনাক্তকরণ", metric: "—", tag: "Soft Alert" },
  { id: "control-8-15", icon: AlertTriangle, title: "Control Risk (8–15)", desc: "ঝুঁকি নিয়ন্ত্রণ পর্যায়", metric: "—", tag: "Follow-up" },
  { id: "escalation-16-30", icon: Flame, title: "Escalation (16–30)", desc: "এসকেলেশন পর্যায়", metric: "—", tag: "Escalated" },
  { id: "critical-31-59", icon: Skull, title: "Critical Watch (31–59)", desc: "জরুরি নজরদারি", metric: "—", tag: "Critical" },
];

const agingBuckets: AgingBucket[] = [
  { id: "bucket-0-30", icon: Clock, title: "0–30 দিন", label: "Current Risk", count: "—", color: "bg-warning" },
  { id: "bucket-31-60", icon: AlertCircle, title: "31–60 দিন", label: "Watchlist", count: "—", color: "bg-amber-500" },
  { id: "bucket-61-90", icon: TrendingDown, title: "61–90 দিন", label: "NPL Emerging", count: "—", color: "bg-destructive/70" },
  { id: "bucket-90-plus", icon: XOctagon, title: "90+ দিন", label: "NPL Confirmed", count: "—", color: "bg-destructive" },
];

const queueRows: QueueRow[] = [
  { id: "q-001", client: "সদস্য-০০১", days: 42, risk: 78, priority: 94, status: "Escalated" },
  { id: "q-015", client: "সদস্য-০১৫", days: 31, risk: 65, priority: 82, status: "Critical" },
  { id: "q-023", client: "সদস্য-০২৩", days: 18, risk: 52, priority: 68, status: "Follow-up" },
  { id: "q-008", client: "সদস্য-০০৮", days: 9, risk: 38, priority: 45, status: "Soft Alert" },
  { id: "q-032", client: "সদস্য-০৩২", days: 3, risk: 15, priority: 20, status: "Passive" },
];

const policyItems: PolicyItem[] = [
  { label: "Default Trigger", value: "60 Days" },
  { label: "Audit Log", value: "Enabled" },
  { label: "Maker-Checker", value: "Required" },
  { label: "Cron Controlled", value: "Yes" },
];

/* ══════════════════════════════════════════════
   PAGE (Layout Assembly Only)
   ══════════════════════════════════════════════ */

const GovernanceCore = () => (
  <AppLayout>
    <div className="min-h-screen pb-24">
      <PageHeader
        title="Governance Core"
        description="Overdue Escalation & Default Control System"
        badge="🛡️ গভর্নেন্স ইঞ্জিন"
        actions={<SystemHealthIndicator status="online" />}
      />

      <SectionHeader title="Escalation Overview" subtitle="ঝুঁকি পর্যায় অনুযায়ী এসকেলেশন ম্যাপ" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
        {escalationStages.map((s) => (
          <EscalationCard key={s.id} stage={s} />
        ))}
      </div>

      <SectionHeader title="Aging Bucket View" subtitle="ওভারডিউ বয়স বিশ্লেষণ" className="mt-10" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {agingBuckets.map((b) => (
          <AgingBucketCard key={b.id} bucket={b} />
        ))}
      </div>

      <SectionHeader title="Collection Priority Queue" subtitle="আদায় অগ্রাধিকার সারি" className="mt-10" />
      <PriorityTable rows={queueRows} />

      <SectionHeader title="Auto Default Policy" subtitle="স্বয়ংক্রিয় ডিফল্ট পলিসি কনফিগারেশন" className="mt-10" />
      <DefaultPolicyPanel items={policyItems} />
    </div>
  </AppLayout>
);

export default GovernanceCore;
