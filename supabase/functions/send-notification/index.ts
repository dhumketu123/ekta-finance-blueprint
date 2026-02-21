import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════
// Multi-Channel Notification Delivery Engine
// Supports: SMS, WhatsApp, Email (skeleton ready)
// Features: Auto-retry (3x), failover, delivery logging
// ═══════════════════════════════════════════════════════════

interface DeliveryResult {
  success: boolean;
  channel: string;
  error?: string;
}

// SMS Provider (skeleton — activate when API key is ready)
async function sendSMS(phone: string, message: string): Promise<DeliveryResult> {
  const apiKey = Deno.env.get("SMS_API_KEY");
  const senderId = Deno.env.get("SMS_SENDER_ID") || "EKTA";

  if (!apiKey) {
    console.log(`[SMS SKELETON] Would send to ${phone}: ${message.substring(0, 50)}...`);
    return { success: false, channel: "sms", error: "SMS_API_KEY not configured" };
  }

  try {
    // BulkSMSBD / SSLWireless / Twilio — replace URL as needed
    const resp = await fetch("https://bulksmsbd.net/api/smsapi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        senderid: senderId,
        number: phone,
        message: message,
        type: "text",
      }),
    });

    const result = await resp.json();
    if (result?.response_code === 202 || result?.success) {
      return { success: true, channel: "sms" };
    }
    return { success: false, channel: "sms", error: result?.error_message || "Unknown SMS error" };
  } catch (err: any) {
    return { success: false, channel: "sms", error: err.message };
  }
}

// WhatsApp Provider (skeleton)
async function sendWhatsApp(phone: string, message: string): Promise<DeliveryResult> {
  const waToken = Deno.env.get("WHATSAPP_API_TOKEN");
  if (!waToken) {
    return { success: false, channel: "whatsapp", error: "WHATSAPP_API_TOKEN not configured" };
  }
  // Placeholder for WhatsApp Business API
  return { success: false, channel: "whatsapp", error: "WhatsApp integration pending" };
}

// Email Provider (skeleton)
async function sendEmail(email: string, subject: string, body: string): Promise<DeliveryResult> {
  const emailKey = Deno.env.get("EMAIL_API_KEY");
  if (!emailKey) {
    return { success: false, channel: "email", error: "EMAIL_API_KEY not configured" };
  }
  return { success: false, channel: "email", error: "Email integration pending" };
}

// Multi-channel delivery with auto-retry and failover
async function deliverNotification(
  phone: string,
  message: string,
  primaryChannel: string,
  maxRetries: number = 3,
): Promise<{ result: DeliveryResult; attempts: number }> {
  const channels = primaryChannel === "sms"
    ? [sendSMS, sendWhatsApp]
    : [sendWhatsApp, sendSMS];

  let attempts = 0;
  let lastResult: DeliveryResult = { success: false, channel: primaryChannel, error: "No delivery attempted" };

  for (const channelFn of channels) {
    for (let retry = 0; retry < maxRetries; retry++) {
      attempts++;
      lastResult = await channelFn(phone, message);
      if (lastResult.success) return { result: lastResult, attempts };
      // Exponential backoff: 1s, 2s, 4s
      if (retry < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
      }
    }
  }

  return { result: lastResult, attempts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Process queued notifications (batch of 20)
    const { data: queued, error: queueErr } = await supabase
      .from("notification_logs")
      .select("*")
      .eq("delivery_status", "queued")
      .lt("retry_count", 3)
      .order("created_at", { ascending: true })
      .limit(20);

    if (queueErr) throw queueErr;

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };

    for (const notif of queued ?? []) {
      results.processed++;

      if (!notif.recipient_phone) {
        results.skipped++;
        await supabase
          .from("notification_logs")
          .update({ delivery_status: "failed", error_message: "No phone number" })
          .eq("id", notif.id);
        continue;
      }

      // Use Bangla message for BD numbers, English otherwise
      const message = notif.recipient_phone.startsWith("+880") || notif.recipient_phone.startsWith("01")
        ? notif.message_bn || notif.message_en
        : notif.message_en || notif.message_bn;

      const { result, attempts } = await deliverNotification(
        notif.recipient_phone,
        message,
        notif.channel || "sms",
      );

      if (result.success) {
        results.sent++;
        await supabase
          .from("notification_logs")
          .update({
            delivery_status: "sent",
            sent_at: new Date().toISOString(),
            channel: result.channel,
            retry_count: notif.retry_count + attempts,
          })
          .eq("id", notif.id);

        // Also log to sms_logs
        await supabase.from("sms_logs").insert({
          recipient_phone: notif.recipient_phone,
          recipient_name: notif.recipient_name,
          message_text: message,
          message_type: notif.event_type,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      } else {
        const newRetry = notif.retry_count + attempts;
        const isFinal = newRetry >= 3;
        results.failed++;

        await supabase
          .from("notification_logs")
          .update({
            delivery_status: isFinal ? "failed" : "queued",
            retry_count: newRetry,
            error_message: result.error,
          })
          .eq("id", notif.id);

        if (isFinal) {
          await supabase.from("sms_logs").insert({
            recipient_phone: notif.recipient_phone,
            recipient_name: notif.recipient_name,
            message_text: message,
            message_type: notif.event_type,
            status: "failed",
            error_message: result.error,
          });
        }
      }
    }

    // Audit log
    if (results.processed > 0) {
      await supabase.from("audit_logs").insert({
        action_type: "notification_delivery",
        entity_type: "system",
        details: results,
      });
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
