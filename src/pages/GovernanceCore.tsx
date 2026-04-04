import type { LucideIcon } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import AppLayout from "@/components/AppLayout";
import { SectionHeader } from "@/components/SectionHeader";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  ShieldAlert, Eye, AlertTriangle, Flame, Skull,
  Clock, AlertCircle, TrendingDown, XOctagon,
} from "lucide-react";

/* ══════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════ */

interface EscalationStage {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  tag: string;
  metric: string;
}

interface AgingBucket {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  count: string;
  color: string;
}

interface QueueRow {
  id: string;
  client: string;
  days: string;
  risk: string;
  priority: string;
  status: string;
}

interface PolicyItem {
  label: string;
  value: string;
}

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
  { id: "q-001", client: "সদস্য-০০১", days: "42", risk: "78", priority: "94", status: "Escalated" },
  { id: "q-015", client: "সদস্য-০১৫", days: "31", risk: "65", priority: "82", status: "Critical" },
  { id: "q-023", client: "সদস্য-০২৩", days: "18", risk: "52", priority: "68", status: "Follow-up" },
  { id: "q-008", client: "সদস্য-০০৮", days: "9", risk: "38", priority: "45", status: "Soft Alert" },
  { id: "q-032", client: "সদস্য-০৩২", days: "3", risk: "15", priority: "20", status: "Passive" },
];

const policyItems: PolicyItem[] = [
  { label: "Default Trigger", value: "60 Days" },
  { label: "Audit Log", value: "Enabled" },
  { label: "Maker-Checker", value: "Required" },
  { label: "Cron Controlled", value: "Yes" },
];

/* ══════════════════════════════════════════════
   STATUS STYLE RESOLVER
   ══════════════════════════════════════════════ */

const statusStyles: Record<string, string> = {
  Escalated: "bg-destructive/20 text-destructive",
  Critical: "bg-amber-500/20 text-amber-600",
  "Follow-up": "bg-warning/20 text-warning-foreground",
  "Soft Alert": "bg-primary/15 text-primary",
  Passive: "bg-muted text-muted-foreground",
};

const getStatusStyle = (status: string): string =>
  statusStyles[status] ?? "bg-muted text-muted-foreground";

/* ══════════════════════════════════════════════
   PRESENTATIONAL COMPONENTS (Pure props, no state)
   ══════════════════════════════════════════════ */

const SystemHealthIndicator = ({ status }: { status: "online" | "offline" | "degraded" }) => {
  const dotColor = status === "online" ? "bg-success" : status === "degraded" ? "bg-warning" : "bg-destructive";
  const label = status === "online" ? "System Online" : status === "degraded" ? "Degraded" : "Offline";
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
      <span className={`h-2 w-2 rounded-full ${dotColor} animate-pulse`} />
      {label}
    </span>
  );
};

const EscalationCard = ({ stage }: { stage: EscalationStage }) => {
  const Icon = stage.icon;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg p-5 flex flex-col gap-3 transition-transform duration-200 hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-primary/10 text-primary">
          {stage.tag}
        </span>
      </div>
      <h3 className="text-sm font-bold text-foreground leading-tight">{stage.title}</h3>
      <p className="text-xs text-muted-foreground">{stage.desc}</p>
      <span className="mt-auto text-2xl font-extrabold text-foreground">{stage.metric}</span>
    </div>
  );
};

const AgingBucketCard = ({ bucket }: { bucket: AgingBucket }) => {
  const Icon = bucket.icon;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">{bucket.label}</span>
      </div>
      <h3 className="text-lg font-bold text-foreground">{bucket.title}</h3>
      <span className="text-3xl font-extrabold text-foreground">{bucket.count}</span>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
        <div className={`h-full w-1/3 rounded-full ${bucket.color}`} />
      </div>
    </div>
  );
};

const PriorityTable = ({ rows }: { rows: QueueRow[] }) => (
  <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg mt-4 overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead className="text-center">Overdue Days</TableHead>
          <TableHead className="text-center">Risk Score</TableHead>
          <TableHead className="text-center">Priority Score</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-semibold">{r.client}</TableCell>
            <TableCell className="text-center">{r.days}</TableCell>
            <TableCell className="text-center">{r.risk}</TableCell>
            <TableCell className="text-center">{r.priority}</TableCell>
            <TableCell className="text-right">
              <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${getStatusStyle(r.status)}`}>
                {r.status}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const DefaultPolicyPanel = ({ items }: { items: PolicyItem[] }) => (
  <div className="rounded-2xl border border-primary/30 bg-card/80 backdrop-blur-xl shadow-lg p-6 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
      {items.map((p) => (
        <div key={p.label} className="flex flex-col">
          <span className="text-xs text-muted-foreground">{p.label}</span>
          <span className="text-sm font-bold text-foreground">{p.value}</span>
        </div>
      ))}
    </div>
    <button
      type="button"
      className="flex-shrink-0 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-95 transition-all duration-200"
    >
      View Escalation Rules
    </button>
  </div>
);

/* ══════════════════════════════════════════════
   PAGE
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
      <PriorityTable rows={queueRows} />

      {/* ── SECTION 4: Default Policy Panel ── */}
      <SectionHeader title="Auto Default Policy" subtitle="স্বয়ংক্রিয় ডিফল্ট পলিসি কনফিগারেশন" className="mt-10" />
      <DefaultPolicyPanel items={policyItems} />
    </div>
  </AppLayout>
);

export default GovernanceCore;
