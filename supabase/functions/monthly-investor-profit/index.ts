import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

async function logCronAudit(
  supabase: ReturnType<typeof createClient>,
  fnName: string,
  success: boolean,
  ip: string | null,
  errorMessage?: string,
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
      },
    });
  } catch { /* never let audit failure break execution */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ─── Security gate: POST-only + constant-time secret check ───
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST" },
    });
  }
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedSecret = extractProvidedSecret(req);
  if (!providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    const sbEarly = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await logCronAudit(sbEarly, "monthly-investor-profit", false, ip, "unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    await logCronAudit(supabase, "monthly-investor-profit", true, ip);

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

      // Create profit transaction
      await supabase.from("transactions").insert({
        investor_id: inv.id,
        type: "investor_profit",
        amount: profit,
        transaction_date: new Date().toISOString().split("T")[0],
        status: "paid",
        notes: inv.reinvest ? "Auto-reinvested" : "Available for withdrawal",
      });

      if (inv.reinvest) {
        // Add profit to capital + update accumulated_profit
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
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action_type: "monthly_investor_profit",
      entity_type: "system",
      details: { processed: results.length, results },
    });

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
