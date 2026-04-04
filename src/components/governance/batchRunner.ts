import type { ExternalActionResult, ExternalChannel } from "./externalIntegration";
import { runEscalationBatchWithExternal } from "./externalIntegration";
import type { QueueRow } from "./types";
import { supabase } from "@/integrations/supabase/client";

/* ══════════════════════════════════════════════
   GOVERNANCE ACTION LOG
   ══════════════════════════════════════════════ */

export interface GovernanceActionLog {
  id: string;
  clientId: string;
  action: string;
  channel: ExternalChannel;
  success: boolean;
  error?: string;
  executedAt: string;
}

/* ══════════════════════════════════════════════
   RESULTS → LOG MAPPER
   ══════════════════════════════════════════════ */

export const mapResultsToLogs = (results: ExternalActionResult[]): GovernanceActionLog[] =>
  results.map((r) => ({
    id: crypto.randomUUID(),
    clientId: r.clientId,
    action: r.action,
    channel: r.channel,
    success: r.success,
    error: r.error,
    executedAt: new Date().toISOString(),
  }));

/* ══════════════════════════════════════════════
   AUDIT LOGGER (writes to governance_action_logs)
   ══════════════════════════════════════════════ */

export const logActionResults = async (
  results: ExternalActionResult[],
  tenantId?: string,
): Promise<GovernanceActionLog[]> => {
  const logs = mapResultsToLogs(results);

  // Write to governance_action_logs table
  if (logs.length > 0) {
    try {
      const dbRows = logs.map((l) => ({
        id: l.id,
        client_id: l.clientId,
        action: l.action,
        channel: l.channel,
        success: l.success,
        error: l.error || null,
        tenant_id: tenantId || "default",
        executed_at: l.executedAt,
      }));

      const { error } = await supabase
        .from("governance_action_logs" as any)
        .insert(dbRows);

      if (error) {
        console.error("[GovernanceAudit] DB insert failed:", error.message);
      }
    } catch (err) {
      // Non-blocking: log but don't crash the batch
      console.error("[GovernanceAudit] DB write error:", err instanceof Error ? err.message : err);
    }
  }

  return logs;
};

/* ══════════════════════════════════════════════
   BATCH RUNNER (accepts queue directly)
   ══════════════════════════════════════════════ */

export interface BatchRunResult {
  executed: number;
  successCount: number;
  failureCount: number;
  logs: GovernanceActionLog[];
}

export const runGovernanceBatch = async (queue: QueueRow[], tenantId?: string): Promise<BatchRunResult> => {
  const { executed, results } = await runEscalationBatchWithExternal(queue);
  const logs = await logActionResults(results, tenantId);

  return {
    executed,
    successCount: logs.filter((l) => l.success).length,
    failureCount: logs.filter((l) => !l.success).length,
    logs,
  };
};
