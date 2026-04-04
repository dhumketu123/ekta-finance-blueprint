/**
 * Receipt Audit Logger — Ekta Finance
 * Logs every SMS/WhatsApp receipt send to communication_logs for audit trail.
 * Non-blocking: errors are caught and logged, never crash the UI.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReceiptChannel = "sms" | "whatsapp";

interface ReceiptAuditEntry {
  clientId?: string;
  investorId?: string;
  loanId?: string;
  channel: ReceiptChannel;
  messageBody: string;
  receiptNumber: string;
  userId: string;
}

/**
 * Log a receipt send event to communication_logs.
 * Fire-and-forget — never blocks UI.
 */
export async function logReceiptSend(entry: ReceiptAuditEntry): Promise<void> {
  try {
    const entityId = entry.clientId || entry.investorId || "";
    await supabase.from("communication_logs").insert({
      client_id: entityId,
      loan_id: entry.loanId || null,
      user_id: entry.userId,
      comm_type: entry.channel,
      message_text: entry.messageBody,
      template_used: `receipt_${entry.receiptNumber}`,
    });
  } catch (err) {
    // Non-blocking — log to console only
    console.error("[ReceiptAudit] Failed to log receipt send:", err);
  }
}
