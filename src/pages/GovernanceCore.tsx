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

/* ── Static data ── */
const escalationStages = [
  { icon: Eye, title: "Pre-Due Monitoring", desc: "পরিশোধের আগে পর্যবেক্ষণ", metric: "—", tag: "Passive" },
  { icon: ShieldAlert, title: "Early Delinquency (1–7)", desc: "প্রাথমিক বিলম্ব সনাক্তকরণ", metric: "—", tag: "Soft Alert" },
  { icon: AlertTriangle, title: "Control Risk (8–15)", desc: "ঝুঁকি নিয়ন্ত্রণ পর্যায়", metric: "—", tag: "Follow-up" },
  { icon: Flame, title: "Escalation (16–30)", desc: "এসকেলেশন পর্যায়", metric: "—", tag: "Escalated" },
  { icon: Skull, title: "Critical Watch (31–59)", desc: "জরুরি নজরদারি", metric: "—", tag: "Critical" },
];

const agingBuckets = [
  { icon: Clock, title: "0–30 দিন", label: "Current Risk", count: "—", color: "bg-warning" },
  { icon: AlertCircle, title: "31–60 দিন", label: "Watchlist", count: "—", color: "bg-amber-500" },
  { icon: TrendingDown, title: "61–90 দিন", label: "NPL Emerging", count: "—", color: "bg-destructive/70" },
  { icon: XOctagon, title: "90+ দিন", label: "NPL Confirmed", count: "—", color: "bg-destructive" },
];

const queueRows = [
  { client: "সদস্য-০০১", days: 42, risk: 78, priority: 94, status: "Escalated" },
  { client: "সদস্য-০১৫", days: 31, risk: 65, priority: 82, status: "Critical" },
  { client: "সদস্য-০২৩", days: 18, risk: 52, priority: 68, status: "Follow-up" },
  { client: "সদস্য-০০৮", days: 9, risk: 38, priority: 45, status: "Soft Alert" },
  { client: "সদস্য-০৩২", days: 3, risk: 15, priority: 20, status: "Passive" },
];

const policyItems = [
  { label: "Default Trigger", value: "60 Days" },
  { label: "Audit Log", value: "Enabled" },
  { label: "Maker-Checker", value: "Required" },
  { label: "Cron Controlled", value: "Yes" },
];

const statusColor: Record<string, string> = {
  Escalated: "bg-destructive/20 text-destructive",
  Critical: "bg-amber-500/20 text-amber-600",
  "Follow-up": "bg-warning/20 text-warning-foreground",
  "Soft Alert": "bg-primary/15 text-primary",
  Passive: "bg-muted text-muted-foreground",
};

/* ── Page ── */
const GovernanceCore = () => (
  <AppLayout>
    <div className="min-h-screen pb-24">
      <PageHeader
        title="Governance Core"
        description="Overdue Escalation & Default Control System"
        badge="🛡️ গভর্নেন্স ইঞ্জিন"
        actions={
          <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            System Online
          </span>
        }
      />

      {/* ── SECTION 1: Escalation Overview ── */}
      <SectionHeader title="Escalation Overview" subtitle="ঝুঁকি পর্যায় অনুযায়ী এসকেলেশন ম্যাপ" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
        {escalationStages.map((s) => (
          <div
            key={s.title}
            className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg p-5 flex flex-col gap-3 transition-transform duration-200 hover:-translate-y-1"
          >
            <div className="flex items-center justify-between">
              <s.icon className="h-5 w-5 text-primary" />
              <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-primary/10 text-primary">
                {s.tag}
              </span>
            </div>
            <h3 className="text-sm font-bold text-foreground leading-tight">{s.title}</h3>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
            <span className="mt-auto text-2xl font-extrabold text-foreground">{s.metric}</span>
          </div>
        ))}
      </div>

      {/* ── SECTION 2: Aging Buckets ── */}
      <SectionHeader title="Aging Bucket View" subtitle="ওভারডিউ বয়স বিশ্লেষণ" className="mt-10" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        {agingBuckets.map((b) => (
          <div
            key={b.title}
            className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg p-5 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <b.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">{b.label}</span>
            </div>
            <h3 className="text-lg font-bold text-foreground">{b.title}</h3>
            <span className="text-3xl font-extrabold text-foreground">{b.count}</span>
            {/* Risk color indicator bar */}
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
              <div className={`h-full w-1/3 rounded-full ${b.color}`} />
            </div>
          </div>
        ))}
      </div>

      {/* ── SECTION 3: Collection Priority Queue ── */}
      <SectionHeader title="Collection Priority Queue" subtitle="আদায় অগ্রাধিকার সারি" className="mt-10" />

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
            {queueRows.map((r) => (
              <TableRow key={r.client}>
                <TableCell className="font-semibold">{r.client}</TableCell>
                <TableCell className="text-center">{r.days}</TableCell>
                <TableCell className="text-center">{r.risk}</TableCell>
                <TableCell className="text-center">{r.priority}</TableCell>
                <TableCell className="text-right">
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${statusColor[r.status] ?? "bg-muted text-muted-foreground"}`}>
                    {r.status}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── SECTION 4: Default Policy Panel ── */}
      <SectionHeader title="Auto Default Policy" subtitle="স্বয়ংক্রিয় ডিফল্ট পলিসি কনফিগারেশন" className="mt-10" />

      <div className="rounded-2xl border border-primary/30 bg-card/80 backdrop-blur-xl shadow-lg p-6 mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {policyItems.map((p) => (
            <div key={p.label} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{p.label}</span>
              <span className="text-sm font-bold text-foreground">{p.value}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="flex-shrink-0 rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-black shadow-md hover:bg-emerald-400 active:scale-95 transition-all duration-200"
        >
          View Escalation Rules
        </button>
      </div>
    </div>
  </AppLayout>
);

export default GovernanceCore;
