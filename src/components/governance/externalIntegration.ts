import type { EscalationActionType } from "./escalationActions";
import type { QueueRow } from "./types";
import { processEscalationActions } from "./escalationActions";

/* ══════════════════════════════════════════════
   EXTERNAL CHANNEL TYPES
   ══════════════════════════════════════════════ */

export type ExternalChannel = "SMS" | "Email" | "Slack";

export interface ExternalActionConfig {
  action: EscalationActionType;
  channels: ExternalChannel[];
  templateId: string;
}

/* ══════════════════════════════════════════════
   ACTION → CHANNEL CONFIG MAP
   ══════════════════════════════════════════════ */

export const EXTERNAL_ACTION_MAP: Record<EscalationActionType, ExternalActionConfig> = {
  "SMS Reminder":       { action: "SMS Reminder",       channels: ["SMS"],                    templateId: "sms_reminder_001" },
  "Soft Call":          { action: "Soft Call",           channels: ["SMS", "Email"],           templateId: "soft_call_001" },
  "Field Visit":        { action: "Field Visit",        channels: ["Email"],                  templateId: "field_visit_001" },
  "Manager Escalation": { action: "Manager Escalation", channels: ["Slack"],                  templateId: "manager_esc_001" },
  "Legal Notice":       { action: "Legal Notice",       channels: ["Email", "Slack"],         templateId: "legal_notice_001" },
  "Auto Default":       { action: "Auto Default",       channels: ["SMS", "Email", "Slack"],  templateId: "auto_default_001" },
};

/* ══════════════════════════════════════════════
   CHANNEL STYLE MAP (for UI)
   ══════════════════════════════════════════════ */

export const CHANNEL_STYLE_MAP: Record<ExternalChannel, string> = {
  SMS:   "bg-green-500/15 text-green-700",
  Email: "bg-blue-500/15 text-blue-700",
  Slack: "bg-purple-500/15 text-purple-700",
};

/* ══════════════════════════════════════════════
   CHANNEL STUBS (replace with real integrations)
   ══════════════════════════════════════════════ */

const sendSMS = async (clientId: string, templateId: string): Promise<void> => {
  // Future: call BulkSMSBD edge function
  console.log(`[SMS] Client ${clientId} — template ${templateId}`);
};

const sendEmail = async (clientId: string, templateId: string): Promise<void> => {
  // Future: call send-transactional-email edge function
  console.log(`[Email] Client ${clientId} — template ${templateId}`);
};

const sendSlackNotification = async (clientId: string, templateId: string): Promise<void> => {
  // Future: call Slack connector gateway
  console.log(`[Slack] Client ${clientId} — template ${templateId}`);
};

/* ══════════════════════════════════════════════
   EXTERNAL ACTION EXECUTOR
   ══════════════════════════════════════════════ */

export interface ExternalActionResult {
  clientId: string;
  action: EscalationActionType;
  channel: ExternalChannel;
  success: boolean;
  error?: string;
}

export const executeExternalAction = async (
  clientId: string,
  action: EscalationActionType
): Promise<ExternalActionResult[]> => {
  const config = EXTERNAL_ACTION_MAP[action];
  if (!config) return [];

  const results: ExternalActionResult[] = [];

  for (const channel of config.channels) {
    try {
      switch (channel) {
        case "SMS":
          await sendSMS(clientId, config.templateId);
          break;
        case "Email":
          await sendEmail(clientId, config.templateId);
          break;
        case "Slack":
          await sendSlackNotification(clientId, config.templateId);
          break;
      }
      results.push({ clientId, action, channel, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ExternalAction] ${action} via ${channel} failed for ${clientId}:`, errorMsg);
      results.push({ clientId, action, channel, success: false, error: errorMsg });
    }
  }

  return results;
};

/* ══════════════════════════════════════════════
   BATCH RUNNER WITH EXTERNAL CHANNELS
   ══════════════════════════════════════════════ */

export const runEscalationBatchWithExternal = async (
  queue: QueueRow[]
): Promise<{ executed: number; results: ExternalActionResult[] }> => {
  const actions = processEscalationActions(queue);
  let executed = 0;
  const allResults: ExternalActionResult[] = [];

  for (const a of actions) {
    if (!a.nextAction) continue;
    const results = await executeExternalAction(a.id, a.nextAction);
    allResults.push(...results);
    executed++;
  }

  return { executed, results: allResults };
};
