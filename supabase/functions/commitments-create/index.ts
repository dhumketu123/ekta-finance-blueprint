import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RBAC: only field_officer or admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const userRole = roleData?.role;
    if (!userRole || !["admin", "field_officer", "owner"].includes(userRole)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json();
    const { client_id, commitment_date } = body;

    if (!client_id || !commitment_date) {
      return new Response(
        JSON.stringify({ error: "client_id and commitment_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(commitment_date)) {
      return new Response(
        JSON.stringify({ error: "Invalid date format. Use YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side date validation (Asia/Dhaka)
    const now = new Date();
    const dhakaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    if (commitment_date < dhakaDate) {
      return new Response(
        JSON.stringify({ error: "Commitment date cannot be in the past" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check max_future_days from system_settings
    const { data: configData } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "quantum_ledger_config")
      .maybeSingle();

    const config = configData?.setting_value as Record<string, unknown> | null;
    const maxFutureDays = (config?.max_commitment_future_days as number) ?? 30;

    const commitDate = new Date(commitment_date + "T00:00:00+06:00");
    const todayDhaka = new Date(dhakaDate + "T00:00:00+06:00");
    const diffDays = Math.floor((commitDate.getTime() - todayDhaka.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > maxFutureDays) {
      return new Response(
        JSON.stringify({ error: `Commitment date cannot be more than ${maxFutureDays} days in the future` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate client exists
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (clientErr || !client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert commitment
    const { data: commitment, error: insertErr } = await supabase
      .from("commitments")
      .insert({
        client_id,
        officer_id: user.id,
        commitment_date,
        status: "pending",
      })
      .select("id, status, commitment_date, created_at")
      .single();

    if (insertErr) {
      // Handle unique constraint violation
      if (insertErr.code === "23505") {
        return new Response(
          JSON.stringify({ error: "A commitment already exists for this client on this date" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw insertErr;
    }

    return new Response(JSON.stringify({ success: true, ...commitment }), {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
