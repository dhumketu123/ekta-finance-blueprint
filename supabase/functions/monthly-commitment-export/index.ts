import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Fetch commitment data for the month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const { data: commitments, error } = await supabase
      .from("commitments")
      .select("id, client_id, officer_id, commitment_date, status, reschedule_reason, created_at")
      .gte("created_at", startOfMonth)
      .lte("created_at", endOfMonth)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Build CSV
    const headers = ["id", "client_id", "officer_id", "commitment_date", "status", "reschedule_reason", "created_at"];
    const csvRows = [headers.join(",")];
    for (const row of commitments || []) {
      csvRows.push(headers.map((h) => `"${(row as any)[h] ?? ""}"`).join(","));
    }
    const csvContent = csvRows.join("\n");

    // Upload to storage
    const fileName = `commitment-export-${monthStr}.csv`;
    const { error: uploadError } = await supabase.storage
      .from("commitment-exports")
      .upload(fileName, new Blob([csvContent], { type: "text/csv" }), {
        upsert: true,
        contentType: "text/csv",
      });

    if (uploadError) throw uploadError;

    // Also fetch officer metrics and append as separate file
    const { data: metrics } = await supabase.from("officer_metrics").select("*");
    if (metrics && metrics.length > 0) {
      const mHeaders = Object.keys(metrics[0]);
      const mRows = [mHeaders.join(",")];
      for (const row of metrics) {
        mRows.push(mHeaders.map((h) => `"${(row as any)[h] ?? ""}"`).join(","));
      }
      await supabase.storage
        .from("commitment-exports")
        .upload(`officer-metrics-${monthStr}.csv`, new Blob([mRows.join("\n")], { type: "text/csv" }), {
          upsert: true,
          contentType: "text/csv",
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: fileName,
        rows: commitments?.length || 0,
        month: monthStr,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
