import type { AgingBucket, QueueRow, PolicyItem } from "./types";

/* ══════════════════════════════════════════════
   SUMMARY REPORT GENERATOR
   ══════════════════════════════════════════════ */

export interface GovernanceSummary {
  totalClients: number;
  bucketCounts: Record<string, number>;
  highPriority: number;
  criticalStatuses: number;
  generatedAt: string;
}

export const generateSummaryReport = (
  buckets: AgingBucket[],
  queue: QueueRow[]
): GovernanceSummary => ({
  totalClients: queue.length,
  bucketCounts: buckets.reduce<Record<string, number>>((acc, b) => {
    acc[b.id] = typeof b.count === "number" ? b.count : 0;
    return acc;
  }, {}),
  highPriority: queue.filter((q) => q.priority > 80).length,
  criticalStatuses: queue.filter((q) => q.status === "Critical").length,
  generatedAt: new Date().toISOString(),
});

/* ══════════════════════════════════════════════
   POLICY VIOLATION DETECTOR
   ══════════════════════════════════════════════ */

export interface PolicyViolation {
  clientId: string;
  clientName: string;
  overdueDays: number;
  currentStatus: string;
  violation: string;
}

export const checkPolicyViolations = (
  _policy: PolicyItem[],
  queue: QueueRow[]
): PolicyViolation[] =>
  queue
    .filter((q) => q.days > 60 && q.status !== "Escalated")
    .map((q) => ({
      clientId: q.id,
      clientName: q.client,
      overdueDays: q.days,
      currentStatus: q.status,
      violation: "Exceeds 60-day Auto-Default threshold without Escalated status",
    }));
