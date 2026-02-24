/**
 * Phase 5 — Ledger Audit Cron Worker
 * Verifies chain integrity of all PDF ledger entries.
 * Schedule: every 12-24 hours via pg_cron.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: entries, error } = await supabase
      .from("event_sourcing")
      .select("id, entity_id, entity_type, created_at, hash_self, hash_prev, payload")
      .eq("action", "pdf_generated")
      .order("created_at", { ascending: true });

    if (error) throw error;
    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ status: "ok", message: "No entries to verify", total: 0, broken: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let brokenLinks = 0;
    const brokenEntries: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const payload = entry.payload as Record<string, any>;
      let intact = true;

      // Check prev hash linkage
      if (i > 0) {
        const prev = entries[i - 1];
        if (entry.hash_prev !== prev.hash_self) {
          intact = false;
        }
      }

      // Verify self hash
      if (intact && entry.hash_self && payload?.hash && payload?.generated_at) {
        const chainPayload = `${payload.hash}|${payload.prev_hash || "GENESIS"}|${payload.generated_at}`;
        const recalculated = await sha256(chainPayload);
        if (recalculated !== entry.hash_self) {
          intact = false;
        }
      }

      if (!intact) {
        brokenLinks++;
        brokenEntries.push(entry.id);
      }
    }

    const result = {
      status: brokenLinks > 0 ? "warning" : "ok",
      total: entries.length,
      broken: brokenLinks,
      brokenEntryIds: brokenEntries,
      verifiedAt: new Date().toISOString(),
    };

    console.log(`[Ledger Audit] Total: ${result.total}, Broken: ${result.broken}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Ledger Audit] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
