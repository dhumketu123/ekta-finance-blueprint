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

    // Step 1: Recalculate all officer risk scores
    const { data: riskResult, error: riskError } = await supabase.rpc("calculate_officer_risk_score");
    if (riskError) throw riskError;

    // Step 2: Generate weekly intelligence summary
    const { data: summaryResult, error: summaryError } = await supabase.rpc("generate_weekly_intelligence_summary");
    if (summaryError) throw summaryError;

    // Step 3: Check alert thresholds
    const { data: alertResult, error: alertError } = await supabase.rpc("check_commitment_alert_thresholds");
    if (alertError) console.error("Alert check error:", alertError);

    return new Response(
      JSON.stringify({
        success: true,
        risk_scoring: riskResult,
        weekly_summary: summaryResult,
        alert_check: alertResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
