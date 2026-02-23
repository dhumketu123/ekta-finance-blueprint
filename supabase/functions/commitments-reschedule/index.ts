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
    // ─── Auth ────────────────────────────────────────────────
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RBAC ────────────────────────────────────────────────
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const userRole = roleData?.role;
    if (!userRole || !["admin", "owner", "field_officer"].includes(userRole)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Parse & Validate ────────────────────────────────────
    const { commitment_id, new_commitment_date, reschedule_reason } = await req.json();

    if (!commitment_id || !new_commitment_date || !reschedule_reason) {
      return new Response(
        JSON.stringify({ error: "commitment_id, new_commitment_date, and reschedule_reason are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof reschedule_reason !== "string" || reschedule_reason.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "reschedule_reason must be at least 3 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(new_commitment_date)) {
      return new Response(
        JSON.stringify({ error: "Invalid date format. Use YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Server-side Dhaka Date ──────────────────────────────
    const now = new Date();
    const dhakaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    if (new_commitment_date < dhakaDate) {
      return new Response(
        JSON.stringify({ error: "Cannot reschedule to a past date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Max Future Days Config ──────────────────────────────
    const { data: configData } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "quantum_ledger_config")
      .maybeSingle();

    const config = configData?.setting_value as Record<string, unknown> | null;
    const maxFutureDays = (config?.max_commitment_future_days as number) ?? 30;

    const commitDate = new Date(new_commitment_date + "T00:00:00+06:00");
    const todayDhaka = new Date(dhakaDate + "T00:00:00+06:00");
    const diffDays = Math.floor(
      (commitDate.getTime() - todayDhaka.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > maxFutureDays) {
      return new Response(
        JSON.stringify({ error: `Cannot reschedule beyond ${maxFutureDays} days` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Fetch existing commitment ───────────────────────────
    const { data: existing, error: fetchErr } = await supabase
      .from("commitments")
      .select("id, client_id, status, commitment_date, officer_id")
      .eq("id", commitment_id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return new Response(
        JSON.stringify({ error: "Commitment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existing.status !== "pending") {
      return new Response(
        JSON.stringify({ error: `Cannot reschedule a commitment with status '${existing.status}'` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Update: reschedule + suspend penalty ────────────────
    // The DB trigger enforces status transitions & requires reschedule_reason
    const { data: updated, error: updErr } = await supabase
      .from("commitments")
      .update({
        commitment_date: new_commitment_date,
        status: "rescheduled",
        reschedule_reason: reschedule_reason.trim(),
        penalty_suspended: true,
      })
      .eq("id", commitment_id)
      .select("id, status, commitment_date, penalty_suspended, client_id")
      .single();

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Schedule day-before reminder via notification_logs ──
    const reminderDate = new Date(commitDate.getTime() - 24 * 60 * 60 * 1000);
    const reminderDateStr = reminderDate.toISOString().split("T")[0];

    // Fetch client info for notification
    const { data: clientInfo } = await supabase
      .from("clients")
      .select("name_bn, name_en, phone")
      .eq("id", updated.client_id)
      .maybeSingle();

    if (clientInfo?.phone) {
      await supabase.from("notification_logs").insert({
        event_type: "commitment_reschedule_reminder",
        client_id: updated.client_id,
        event_date: reminderDateStr,
        recipient_name: clientInfo.name_bn || clientInfo.name_en,
        recipient_phone: clientInfo.phone,
        message_bn: `প্রিয় ${clientInfo.name_bn || clientInfo.name_en}, আপনার পরবর্তী পেমেন্টের তারিখ ${new_commitment_date}। অনুগ্রহ করে সময়মতো পরিশোধ করুন।`,
        message_en: `Dear ${clientInfo.name_en}, your rescheduled payment is due on ${new_commitment_date}. Please pay on time.`,
        channel: "sms",
        delivery_status: "queued",
      });
    }

    // ─── Create new pending commitment for new date ──────────
    // So the client has an active trackable commitment on the new date
    const { data: newCommitment } = await supabase
      .from("commitments")
      .insert({
        client_id: updated.client_id,
        officer_id: existing.officer_id,
        commitment_date: new_commitment_date,
        status: "pending",
      })
      .select("id, status, commitment_date")
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        rescheduled: updated,
        new_commitment: newCommitment ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
