import type { LucideIcon } from "lucide-react";
import {
  Eye, ShieldAlert, AlertTriangle, Flame, Skull,
  Clock, AlertCircle, TrendingDown, XOctagon,
} from "lucide-react";

/* ══════════════════════════════════════════════
   STRICT ENUMS
   ══════════════════════════════════════════════ */

export type StatusType =
  | "Escalated"
  | "Critical"
  | "Follow-up"
  | "Soft Alert"
  | "Passive";

export type SystemStatus = "online" | "offline" | "degraded";

/* ══════════════════════════════════════════════
   INTERFACES
   ══════════════════════════════════════════════ */

export interface EscalationStage {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  tag: StatusType;
  metric: number | string;
}

export interface AgingBucket {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  count: number | string;
  color: string;
}

export interface QueueRow {
  id: string;
  client: string;
  days: number;
  risk: number;
  priority: number;
  status: StatusType;
}

export interface PolicyItem {
  label: string;
  value: string;
}

/* ══════════════════════════════════════════════
   STATUS STYLE RESOLVER
   ══════════════════════════════════════════════ */

const statusStyles: Record<StatusType, string> = {
  Escalated: "bg-destructive/20 text-destructive",
  Critical: "bg-amber-500/20 text-amber-600",
  "Follow-up": "bg-warning/20 text-warning-foreground",
  "Soft Alert": "bg-primary/15 text-primary",
  Passive: "bg-muted text-muted-foreground",
};

export const getStatusStyle = (status: StatusType): string =>
  statusStyles[status] ?? "bg-muted text-muted-foreground";

/* ══════════════════════════════════════════════
   ICON MAPS
   ══════════════════════════════════════════════ */

export const STAGE_ICON_MAP: Record<string, LucideIcon> = {
  "pre-due": Eye,
  "early-1-7": ShieldAlert,
  "control-8-15": AlertTriangle,
  "escalation-16-30": Flame,
  "critical-31-59": Skull,
};

export const BUCKET_ICON_MAP: Record<string, LucideIcon> = {
  "bucket-0-30": Clock,
  "bucket-31-60": AlertCircle,
  "bucket-61-90": TrendingDown,
  "bucket-90-plus": XOctagon,
};

/* ══════════════════════════════════════════════
   STAGE → TAG / COLOR MAPPING
   ══════════════════════════════════════════════ */

export const STAGE_TAG_MAP: Record<string, StatusType> = {
  "pre-due": "Passive",
  "early-1-7": "Soft Alert",
  "control-8-15": "Follow-up",
  "escalation-16-30": "Escalated",
  "critical-31-59": "Critical",
};

export const BUCKET_COLOR_MAP: Record<string, string> = {
  "bucket-0-30": "bg-warning",
  "bucket-31-60": "bg-amber-500",
  "bucket-61-90": "bg-destructive/70",
  "bucket-90-plus": "bg-destructive",
};

/* ══════════════════════════════════════════════
   STATUS VALIDATOR
   ══════════════════════════════════════════════ */

const VALID_STATUSES: StatusType[] = ["Escalated", "Critical", "Follow-up", "Soft Alert", "Passive"];

export const toStatusType = (s: string): StatusType =>
  VALID_STATUSES.includes(s as StatusType) ? (s as StatusType) : "Passive";

/* ══════════════════════════════════════════════
   FALLBACK DATA
   ══════════════════════════════════════════════ */

export const FALLBACK_STAGES: EscalationStage[] = [
  { id: "pre-due", icon: Eye, title: "Pre-Due Monitoring", desc: "পরিশোধের আগে পর্যবেক্ষণ", metric: "—", tag: "Passive" },
  { id: "early-1-7", icon: ShieldAlert, title: "Early Delinquency (1–7)", desc: "প্রাথমিক বিলম্ব সনাক্তকরণ", metric: "—", tag: "Soft Alert" },
  { id: "control-8-15", icon: AlertTriangle, title: "Control Risk (8–15)", desc: "ঝুঁকি নিয়ন্ত্রণ পর্যায়", metric: "—", tag: "Follow-up" },
  { id: "escalation-16-30", icon: Flame, title: "Escalation (16–30)", desc: "এসকেলেশন পর্যায়", metric: "—", tag: "Escalated" },
  { id: "critical-31-59", icon: Skull, title: "Critical Watch (31–59)", desc: "জরুরি নজরদারি", metric: "—", tag: "Critical" },
];

export const FALLBACK_BUCKETS: AgingBucket[] = [
  { id: "bucket-0-30", icon: Clock, title: "0–30 দিন", label: "Current Risk", count: "—", color: "bg-warning" },
  { id: "bucket-31-60", icon: AlertCircle, title: "31–60 দিন", label: "Watchlist", count: "—", color: "bg-amber-500" },
  { id: "bucket-61-90", icon: TrendingDown, title: "61–90 দিন", label: "NPL Emerging", count: "—", color: "bg-destructive/70" },
  { id: "bucket-90-plus", icon: XOctagon, title: "90+ দিন", label: "NPL Confirmed", count: "—", color: "bg-destructive" },
];

export const FALLBACK_POLICY: PolicyItem[] = [
  { label: "Default Trigger", value: "60 Days" },
  { label: "Audit Log", value: "Enabled" },
  { label: "Maker-Checker", value: "Required" },
  { label: "Cron Controlled", value: "Yes" },
];
