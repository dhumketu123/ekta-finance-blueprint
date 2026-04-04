import type { QueueRow, StatusType } from "./types";

/* ══════════════════════════════════════════════
   ESCALATION ACTION TYPES
   ══════════════════════════════════════════════ */

export type EscalationActionType =
  | "SMS Reminder"
  | "Soft Call"
  | "Field Visit"
  | "Manager Escalation"
  | "Legal Notice"
  | "Auto Default";

export interface ActionableQueueRow extends QueueRow {
  nextAction: EscalationActionType | null;
}

/* ══════════════════════════════════════════════
   STATUS → ACTION MAP
   ══════════════════════════════════════════════ */

const STATUS_ACTION_MAP: Record<StatusType, EscalationActionType> = {
  Passive: "SMS Reminder",
  "Soft Alert": "Soft Call",
  "Follow-up": "Field Visit",
  Escalated: "Manager Escalation",
  Critical: "Legal Notice",
};

/* ══════════════════════════════════════════════
   ACTION PROCESSOR (pure, no mutation)
   ══════════════════════════════════════════════ */

export const processEscalationActions = (queue: QueueRow[]): ActionableQueueRow[] =>
  queue.map((q) => {
    let action: EscalationActionType | null = null;

    if (q.status === "Critical" && q.days > 59) {
      action = "Auto Default";
    } else {
      action = STATUS_ACTION_MAP[q.status] ?? null;
    }

    return { ...q, nextAction: action };
  });

/* ══════════════════════════════════════════════
   ACTION EXECUTION STUB (future SMS/Email/Task)
   ══════════════════════════════════════════════ */

export const executeAction = async (
  clientId: string,
  action: EscalationActionType
): Promise<void> => {
  // Placeholder — will integrate with SMS gateway, email, or task assignment
  console.log(`[Escalation] Executing "${action}" for client ${clientId}`);
};

/* ══════════════════════════════════════════════
   BATCH RUNNER (idempotent, skips null actions)
   ══════════════════════════════════════════════ */

export const runEscalationBatch = async (queue: QueueRow[]): Promise<number> => {
  const actions = processEscalationActions(queue);
  let executed = 0;

  for (const a of actions) {
    if (!a.nextAction) continue;
    await executeAction(a.id, a.nextAction);
    executed++;
  }

  return executed;
};

/* ══════════════════════════════════════════════
   ACTION STYLE MAP (for UI badges)
   ══════════════════════════════════════════════ */

export const ACTION_STYLE_MAP: Record<EscalationActionType, string> = {
  "SMS Reminder": "bg-primary/15 text-primary",
  "Soft Call": "bg-blue-500/15 text-blue-600",
  "Field Visit": "bg-warning/20 text-warning-foreground",
  "Manager Escalation": "bg-amber-500/20 text-amber-600",
  "Legal Notice": "bg-destructive/20 text-destructive",
  "Auto Default": "bg-destructive text-destructive-foreground",
};
