import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-dry-run",
};

// ═══════════════════════════════════════════════════════════
// CRON Security Hardening — constant-time secret comparison
// ═══════════════════════════════════════════════════════════
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function extractProvidedSecret(req: Request): string | null {
  // CRON authentication uses ONLY x-cron-secret header.
  // Authorization: Bearer is intentionally NOT accepted for cron auth.
  return req.headers.get("x-cron-secret");
}

// Loose client type to bypass strict generated-type narrowing in Deno edge runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbClient = any;

async function logCronAudit(
  supabase: SbClient,
  fnName: string,
  success: boolean,
  ip: string | null,
  errorMessage?: string,
  extraDetails?: Record<string, unknown>,
) {
  try {
    await supabase.from("audit_logs").insert({
      action_type: "cron_execution",
      entity_type: "edge_function",
      ip_address: ip,
      details: {
        function_name: fnName,
        success,
        executed_at: new Date().toISOString(),
        ...(errorMessage ? { error: errorMessage } : {}),
        ...(extraDetails ?? {}),
      },
    });
  } catch { /* never let audit failure break execution */ }
}

// Vault-first secret resolution; environment fallback is permitted but vault wins.
async function resolveCronSecret(
  supabase: SbClient,
): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("get_cron_secret_from_vault");
    if (typeof data === "string" && data.length > 0) return data;
  } catch { /* fall through to env */ }
  const envSecret = Deno.env.get("CRON_SECRET");
  return envSecret && envSecret.length > 0 ? envSecret : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");

  // ─── Phase 3: POST-only ───
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ─── Phase 2 + 3: Vault-resolved secret + timing-safe compare ───
  const expectedSecret = await resolveCronSecret(supabase);
  if (!expectedSecret) {
    await logCronAudit(supabase, "monthly-investor-profit", false, ip, "secret_unavailable");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedSecret = extractProvidedSecret(req);
  if (!providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    await logCronAudit(supabase, "monthly-investor-profit", false, ip, "unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ─── Phase 7: Parse DRY_RUN flag (header or body) ───
  let dryRun = req.headers.get("x-dry-run") === "true";
  let bodyPayload: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) {
      bodyPayload = JSON.parse(text);
      if (bodyPayload.dry_run === true) dryRun = true;
    }
  } catch { /* body optional */ }

  // ─── Phase 4: Idempotency claim ───
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const executionKey = `monthly-investor-profit:${yyyy}-${mm}`;
  const jobName = "monthly-investor-profit";

  const { data: claimData, error: claimErr } = await supabase.rpc("claim_cron_execution", {
    p_job_name: jobName,
    p_execution_key: executionKey,
    p_dry_run: dryRun,
    p_metadata: { ip, triggered_at: now.toISOString() },
  });

  if (claimErr) {
    await logCronAudit(supabase, jobName, false, ip, `claim_error: ${claimErr.message}`, { execution_key: executionKey });
    return new Response(JSON.stringify({ error: "Idempotency claim failed", detail: claimErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const claim = (claimData ?? {}) as Record<string, unknown>;
  if (!claim.claimed) {
    await logCronAudit(supabase, jobName, true, ip, undefined, {
      execution_key: executionKey,
      skipped_reason: "already_executed_for_period",
      previous_executed_at: claim.previous_executed_at,
    });
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: "already_executed_for_period",
      execution_key: executionKey,
      previous_executed_at: claim.previous_executed_at,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  await logCronAudit(supabase, jobName, true, ip, undefined, { execution_key: executionKey, dry_run: dryRun });

  try {
    // Get only active investors (exclude matured/closed)
    const { data: investors, error } = await supabase
      .from("investors")
      .select("*")
      .eq("status", "active")
      .is("deleted_at", null);

    if (error) throw error;

    const results: Array<{
      investor_id: string;
      name: string;
      profit: number;
      reinvested: boolean;
      new_capital: number;
    }> = [];

    for (const inv of investors ?? []) {
      const profit = Math.round((inv.capital * inv.monthly_profit_percent) / 100 * 100) / 100;

      if (!dryRun) {
        // Create profit transaction with execution_key embedded for traceability
        await supabase.from("transactions").insert({
          investor_id: inv.id,
          type: "investor_profit",
          amount: profit,
          transaction_date: new Date().toISOString().split("T")[0],
          status: "paid",
          notes: `${inv.reinvest ? "Auto-reinvested" : "Available for withdrawal"} [${executionKey}]`,
        });

        if (inv.reinvest) {
          const newCapital = inv.capital + profit;
          const newAccumulatedProfit = (inv.accumulated_profit ?? 0) + profit;
          await supabase
            .from("investors")
            .update({
              capital: newCapital,
              accumulated_profit: newAccumulatedProfit,
              last_profit_date: new Date().toISOString().split("T")[0],
            })
            .eq("id", inv.id);

          results.push({
            investor_id: inv.id,
            name: inv.name_en,
            profit,
            reinvested: true,
            new_capital: newCapital,
          });
        } else {
          const newAccumulatedProfit = (inv.accumulated_profit ?? 0) + profit;
          await supabase
            .from("investors")
            .update({
              accumulated_profit: newAccumulatedProfit,
              last_profit_date: new Date().toISOString().split("T")[0],
            })
            .eq("id", inv.id);

          results.push({
            investor_id: inv.id,
            name: inv.name_en,
            profit,
            reinvested: false,
            new_capital: inv.capital,
          });
        }

        // Send notification
        await supabase.from("notifications").insert({
          event: "profit_distributed",
          channel: "sms",
          template_en: `Dear ${inv.name_en}, your monthly profit of ৳${profit.toLocaleString()} has been ${inv.reinvest ? "reinvested" : "credited"}.`,
          template_bn: `প্রিয় ${inv.name_bn}, আপনার মাসিক মুনাফা ৳${profit.toLocaleString()} ${inv.reinvest ? "পুনঃবিনিয়োগ করা হয়েছে" : "জমা হয়েছে"}।`,
          recipient_phone: inv.phone,
          recipient_name: inv.name_en,
        });
      } else {
        // DRY_RUN: simulate only
        results.push({
          investor_id: inv.id,
          name: inv.name_en,
          profit,
          reinvested: !!inv.reinvest,
          new_capital: inv.reinvest ? inv.capital + profit : inv.capital,
        });
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action_type: "monthly_investor_profit",
      entity_type: "system",
      details: { processed: results.length, dry_run: dryRun, execution_key: executionKey, results },
    });

    // Phase 9: finalize idempotency record (skip in dry-run since no claim was written)
    if (!dryRun) {
      await supabase.rpc("complete_cron_execution", {
        p_execution_key: executionKey,
        p_success: true,
        p_error: null,
        p_metadata: { processed: results.length, total_amount: results.reduce((s, r) => s + r.profit, 0) },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      execution_key: executionKey,
      processed: results.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    // Phase 10: mark failure but DO NOT release the lock (prevents auto re-run).
    if (!dryRun) {
      try {
        await supabase.rpc("complete_cron_execution", {
          p_execution_key: executionKey,
          p_success: false,
          p_error: msg,
          p_metadata: null,
        });
      } catch { /* ignore */ }
    }
    await logCronAudit(supabase, jobName, false, ip, msg, { execution_key: executionKey });
    return new Response(JSON.stringify({ error: msg, execution_key: executionKey }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
