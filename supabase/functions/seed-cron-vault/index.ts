// One-shot helper: copies CRON_SECRET (Edge Function env) into vault.secrets so pg_cron can read it.
// Self-destructs by requiring CRON_SECRET to authenticate (only callable when you already know it).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aB = enc.encode(a), bB = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expected = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!expected || !provided || !timingSafeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Upsert into vault.secrets (Supabase Vault) — uses vault.create_secret / vault.update_secret RPCs
  const { data: existing } = await supabase.rpc("vault_get_secret_id", { p_name: "CRON_SECRET" });
  let action = "created";
  if (existing) {
    await supabase.rpc("vault_update_secret", { p_id: existing, p_secret: expected });
    action = "updated";
  } else {
    await supabase.rpc("vault_create_secret", { p_secret: expected, p_name: "CRON_SECRET" });
  }

  return new Response(JSON.stringify({ ok: true, action }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
