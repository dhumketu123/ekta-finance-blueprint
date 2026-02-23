import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── Auth ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Invalid auth token" }, 401);

    // ─── RBAC ────────────────────────────────────────────────
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const userRole = roleData?.role;
    if (!userRole || !["admin", "owner", "field_officer"].includes(userRole)) {
      return json({ error: "Insufficient permissions" }, 403);
    }

    // ─── Feature Flag Check ─────────────────────────────────
    const { data: flagData } = await supabase
      .from("feature_flags")
      .select("is_enabled")
      .eq("feature_name", "mobile_ai_reschedule")
      .maybeSingle();

    if (!flagData?.is_enabled) {
      return json({ error: "Feature 'mobile_ai_reschedule' is disabled" }, 403);
    }

    // ─── Parse & Validate ────────────────────────────────────
    const body = await req.json();
    const { commitment_id, reschedule_date, reschedule_reason } = body;

    if (!commitment_id || !reschedule_date || !reschedule_reason) {
      return json({ error: "commitment_id, reschedule_date, and reschedule_reason are required" }, 400);
    }

    if (typeof reschedule_reason !== "string" || reschedule_reason.trim().length < 3) {
      return json({ error: "reschedule_reason must be at least 3 characters" }, 400);
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(reschedule_date)) {
      return json({ error: "Invalid date format. Use YYYY-MM-DD" }, 400);
    }

    // ─── Server-side Dhaka Date ──────────────────────────────
    const now = new Date();
    const dhakaDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    if (reschedule_date < dhakaDate) {
      return json({ error: "Cannot reschedule to a past date" }, 400);
    }

    // ─── Config: max future days ─────────────────────────────
    const { data: configData } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "quantum_ledger_config")
      .maybeSingle();

    const config = configData?.setting_value as Record<string, unknown> | null;
    const maxFutureDays = (config?.max_commitment_future_days as number) ?? 30;

    const commitDate = new Date(reschedule_date + "T00:00:00+06:00");
    const todayDhaka = new Date(dhakaDate + "T00:00:00+06:00");
    const diffDays = Math.floor(
      (commitDate.getTime() - todayDhaka.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays > maxFutureDays) {
      return json({ error: `Cannot reschedule beyond ${maxFutureDays} days` }, 400);
    }

    // ─── Verify commitment exists & is pending ───────────────
    const { data: existing, error: fetchErr } = await supabase
      .from("commitments")
      .select("id, client_id, status, commitment_date, officer_id")
      .eq("id", commitment_id)
      .maybeSingle();

    if (fetchErr || !existing) return json({ error: "Commitment not found" }, 404);

    if (existing.status !== "pending") {
      return json({ error: `Cannot reschedule a commitment with status '${existing.status}'` }, 400);
    }

    // ─── Update: reschedule + suspend penalty ────────────────
    const { data: updated, error: updErr } = await supabase
      .from("commitments")
      .update({
        status: "rescheduled",
        reschedule_reason: reschedule_reason.trim(),
        penalty_suspended: true,
      })
      .eq("id", commitment_id)
      .select("id, status, commitment_date, penalty_suspended, client_id, officer_id")
      .single();

    if (updErr) return json({ error: updErr.message }, 500);

    // ─── Create new pending commitment for new date ──────────
    const { data: newCommitment, error: newErr } = await supabase
      .from("commitments")
      .insert({
        client_id: existing.client_id,
        officer_id: existing.officer_id,
        commitment_date: reschedule_date,
        status: "pending",
      })
      .select("id, status, commitment_date")
      .single();

    // Handle unique constraint (commitment already exists for that date)
    if (newErr && newErr.code === "23505") {
      return json({
        success: true,
        rescheduled: updated,
        new_commitment: null,
        note: "A commitment already exists for the new date",
      });
    }

    if (newErr) return json({ error: newErr.message }, 500);

    // ─── Schedule day-before reminder ────────────────────────
    const reminderDateStr = new Date(commitDate.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: clientInfo } = await supabase
      .from("clients")
      .select("name_bn, name_en, phone")
      .eq("id", existing.client_id)
      .maybeSingle();

    if (clientInfo?.phone) {
      await supabase.from("notification_logs").insert({
        event_type: "commitment_reschedule_reminder",
        client_id: existing.client_id,
        event_date: reminderDateStr,
        recipient_name: clientInfo.name_bn || clientInfo.name_en,
        recipient_phone: clientInfo.phone,
        message_bn: `প্রিয় ${clientInfo.name_bn || clientInfo.name_en}, আপনার পরবর্তী পেমেন্টের তারিখ ${reschedule_date}। অনুগ্রহ করে সময়মতো পরিশোধ করুন।`,
        message_en: `Dear ${clientInfo.name_en}, your rescheduled payment is due on ${reschedule_date}. Please pay on time.`,
        channel: "sms",
        delivery_status: "queued",
      });
    }

    return json({
      success: true,
      rescheduled: updated,
      new_commitment: newCommitment,
    }, 200);
  } catch (error) {
    return json({ error: error.message }, 500);
  }
});
