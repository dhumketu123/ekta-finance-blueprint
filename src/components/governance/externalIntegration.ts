import type { EscalationActionType } from "./escalationActions";
import type { QueueRow } from "./types";
import { processEscalationActions } from "./escalationActions";
import { supabase } from "@/integrations/supabase/client";

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
   MESSAGE TEMPLATES (Bengali + English)
   ══════════════════════════════════════════════ */

const MESSAGE_TEMPLATES: Record<string, { bn: string; en: string }> = {
  sms_reminder_001: {
    bn: "প্রিয় গ্রাহক, আপনার পেমেন্ট বকেয়া আছে। অনুগ্রহ করে দ্রুত পরিশোধ করুন। — একতা ফাইন্যান্স",
    en: "Dear customer, your payment is overdue. Please pay at your earliest convenience. — Ekta Finance",
  },
  soft_call_001: {
    bn: "প্রিয় গ্রাহক, আপনার সাথে যোগাযোগ করার চেষ্টা করা হচ্ছে বকেয়া পেমেন্ট সম্পর্কে। — একতা ফাইন্যান্স",
    en: "Dear customer, we are reaching out regarding your overdue payment. — Ekta Finance",
  },
  field_visit_001: {
    bn: "বিজ্ঞপ্তি: গ্রাহকের বাড়িতে ফিল্ড ভিজিটের সময়সূচী করা হয়েছে। — একতা ফাইন্যান্স",
    en: "Notice: A field visit has been scheduled for the client. — Ekta Finance",
  },
  manager_esc_001: {
    bn: "⚠️ ম্যানেজার এস্কেলেশন: গুরুতর বকেয়া — অবিলম্বে পদক্ষেপ প্রয়োজন।",
    en: "⚠️ Manager Escalation: Critical overdue — immediate action required.",
  },
  legal_notice_001: {
    bn: "আইনি বিজ্ঞপ্তি: আপনার অ্যাকাউন্ট আইনি পদক্ষেপের জন্য চিহ্নিত করা হয়েছে। — একতা ফাইন্যান্স",
    en: "Legal Notice: Your account has been flagged for legal action. — Ekta Finance",
  },
  auto_default_001: {
    bn: "⛔ অটো ডিফল্ট: গ্রাহকের অ্যাকাউন্ট ডিফল্ট হিসেবে চিহ্নিত হয়েছে। সকল বিভাগকে অবহিত করা হচ্ছে।",
    en: "⛔ Auto Default: Client account has been marked as defaulted. Notifying all departments.",
  },
};

/* ══════════════════════════════════════════════
   REAL CHANNEL IMPLEMENTATIONS
   Uses the existing send-notification edge function
   and notification_logs queue system
   ══════════════════════════════════════════════ */

const queueNotification = async (
  clientId: string,
  phone: string | null,
  templateId: string,
  eventType: string,
): Promise<void> => {
  const template = MESSAGE_TEMPLATES[templateId];
  if (!template) {
    console.warn(`[Governance] No message template found for ${templateId}`);
    return;
  }

  // Insert into notification_logs as queued — the send-notification edge function picks it up
  const { error } = await supabase.from("notification_logs" as any).insert({
    recipient_phone: phone || "",
    recipient_name: `Client ${clientId}`,
    message_en: template.en,
    message_bn: template.bn,
    event_type: eventType,
    delivery_status: "queued",
    retry_count: 0,
  });

  if (error) {
    console.error(`[Governance] Failed to queue notification for ${clientId}:`, error.message);
    throw error;
  }
};

const sendSMS = async (clientId: string, templateId: string, phone?: string | null): Promise<void> => {
  await queueNotification(clientId, phone || null, templateId, `governance_${templateId}`);
};

const sendEmail = async (clientId: string, templateId: string): Promise<void> => {
  // Queue as notification — the send-notification edge function handles channel routing
  await queueNotification(clientId, null, templateId, `governance_email_${templateId}`);
};

const sendSlackNotification = async (clientId: string, templateId: string): Promise<void> => {
  // Queue as notification — for Slack, the message is logged and can be picked up by webhook mode
  await queueNotification(clientId, null, templateId, `governance_slack_${templateId}`);
};

/* ══════════════════════════════════════════════
   CLIENT PHONE RESOLVER
   ══════════════════════════════════════════════ */

const getClientPhone = async (clientId: string): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from("clients")
      .select("phone")
      .eq("id", clientId)
      .maybeSingle();
    return data?.phone || null;
  } catch {
    return null;
  }
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
  const phone = await getClientPhone(clientId);

  for (const channel of config.channels) {
    try {
      switch (channel) {
        case "SMS":
          await sendSMS(clientId, config.templateId, phone);
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
