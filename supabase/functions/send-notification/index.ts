import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════
// Smart Multi-Gateway Notification Delivery Engine
// Modes: API (BulkSMSBD/Twilio), Webhook, Mobile Native (skip)
// Features: Auto-retry (3x), failover, delivery logging
// ═══════════════════════════════════════════════════════════

interface DeliveryResult {
  success: boolean;
  channel: string;
  error?: string;
}

interface GatewayConfig {
  mode: "api" | "mobile_native" | "webhook";
  webhook_url: string;
  active: boolean;
}

// ── SMS via API Provider ──────────────────────────────────
async function sendSmsApi(phone: string, message: string): Promise<DeliveryResult> {
  const apiKey = Deno.env.get("SMS_API_KEY");
  const senderId = Deno.env.get("SMS_SENDER_ID") || "EKTA";

  if (!apiKey) {
    console.log(`[SMS API] No API key — skipping ${phone}`);
    return { success: false, channel: "sms", error: "SMS_API_KEY not configured" };
  }

  try {
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

// ── SMS via Webhook Gateway ───────────────────────────────
async function sendViaWebhook(phone: string, message: string, eventType: string, webhookUrl: string): Promise<DeliveryResult> {
  if (!webhookUrl) {
    return { success: false, channel: "webhook", error: "Webhook URL not configured" };
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, event_type: eventType, timestamp: new Date().toISOString() }),
    });
    if (resp.ok) {
      return { success: true, channel: "webhook" };
    }
    const body = await resp.text().catch(() => "");
    return { success: false, channel: "webhook", error: `HTTP ${resp.status}: ${body.substring(0, 100)}` };
  } catch (err: any) {
    return { success: false, channel: "webhook", error: err.message };
  }
}

// ── WhatsApp Provider (skeleton) ──────────────────────────
async function sendWhatsApp(phone: string, message: string): Promise<DeliveryResult> {
  const waToken = Deno.env.get("WHATSAPP_API_TOKEN");
  if (!waToken) {
    return { success: false, channel: "whatsapp", error: "WHATSAPP_API_TOKEN not configured" };
  }
  return { success: false, channel: "whatsapp", error: "WhatsApp integration pending" };
}

// ── Multi-channel delivery with retry & failover ──────────
async function deliverNotification(
  phone: string,
  message: string,
  eventType: string,
  gatewayConfig: GatewayConfig,
  maxRetries: number = 3,
): Promise<{ result: DeliveryResult; attempts: number }> {
  // Mobile native mode: mark as "native_pending" — user sends manually
  if (gatewayConfig.mode === "mobile_native") {
    return {
      result: { success: true, channel: "native_pending" },
      attempts: 0,
    };
  }

  // Build channel function list based on mode
  const channels: ((p: string, m: string) => Promise<DeliveryResult>)[] = [];

  if (gatewayConfig.mode === "webhook" && gatewayConfig.webhook_url) {
    channels.push((p, m) => sendViaWebhook(p, m, eventType, gatewayConfig.webhook_url));
  }

  // Always include API and WhatsApp as fallback
  channels.push(sendSmsApi);
  channels.push(sendWhatsApp);

  let attempts = 0;
  let lastResult: DeliveryResult = { success: false, channel: "none", error: "No delivery attempted" };

  for (const channelFn of channels) {
    for (let retry = 0; retry < maxRetries; retry++) {
      attempts++;
      lastResult = await channelFn(phone, message);
      if (lastResult.success) return { result: lastResult, attempts };
      if (retry < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, retry)));
      }
    }
  }

  return { result: lastResult, attempts };
}

// ═══════════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Load gateway config from system_settings ──
    const { data: settingRow } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "sms_gateway")
      .maybeSingle();

    const gatewayConfig: GatewayConfig = settingRow?.setting_value ?? {
      mode: "api",
      webhook_url: "",
      active: true,
    };

    // If gateway is inactive, skip processing
    if (!gatewayConfig.active) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "Gateway inactive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process queued notifications (batch of 20)
    const { data: queued, error: queueErr } = await supabase
      .from("notification_logs")
      .select("*")
      .eq("delivery_status", "queued")
      .lt("retry_count", 3)
      .order("created_at", { ascending: true })
      .limit(20);

    if (queueErr) throw queueErr;

    const results = { processed: 0, sent: 0, failed: 0, skipped: 0, gateway_mode: gatewayConfig.mode };

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

      // Smart language selection: BD numbers → Bangla, else English
      const isBD = notif.recipient_phone.startsWith("+880") || notif.recipient_phone.startsWith("01");
      const message = isBD ? (notif.message_bn || notif.message_en) : (notif.message_en || notif.message_bn);

      const { result, attempts } = await deliverNotification(
        notif.recipient_phone,
        message,
        notif.event_type,
        gatewayConfig,
      );

      if (result.success) {
        results.sent++;
        const deliveryStatus = result.channel === "native_pending" ? "native_pending" : "sent";
        await supabase
          .from("notification_logs")
          .update({
            delivery_status: deliveryStatus,
            sent_at: new Date().toISOString(),
            channel: result.channel,
            retry_count: notif.retry_count + attempts,
          })
          .eq("id", notif.id);

        // Log to sms_logs (skip for native_pending)
        if (result.channel !== "native_pending") {
          await supabase.from("sms_logs").insert({
            recipient_phone: notif.recipient_phone,
            recipient_name: notif.recipient_name,
            message_text: message,
            message_type: notif.event_type,
            status: "sent",
            sent_at: new Date().toISOString(),
          });
        }
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
