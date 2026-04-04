import type { LucideIcon } from "lucide-react";

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
  tag: string;
  metric: string;
}

export interface AgingBucket {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  count: string;
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
