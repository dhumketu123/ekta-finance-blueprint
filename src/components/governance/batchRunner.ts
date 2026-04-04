import type { ExternalActionResult, ExternalChannel } from "./externalIntegration";
import { runEscalationBatchWithExternal } from "./externalIntegration";
import type { QueueRow } from "./types";

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
   AUDIT LOGGER (DB stub — ready for Supabase)
   ══════════════════════════════════════════════ */

export const logActionResults = async (results: ExternalActionResult[]): Promise<GovernanceActionLog[]> => {
  const logs = mapResultsToLogs(results);

  // Future: insert into governance_action_logs table via Supabase
  // await supabase.from("governance_action_logs").insert(logs);
  console.table(logs);

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

export const runGovernanceBatch = async (queue: QueueRow[]): Promise<BatchRunResult> => {
  const { executed, results } = await runEscalationBatchWithExternal(queue);
  const logs = await logActionResults(results);

  return {
    executed,
    successCount: logs.filter((l) => l.success).length,
    failureCount: logs.filter((l) => !l.success).length,
    logs,
  };
};
