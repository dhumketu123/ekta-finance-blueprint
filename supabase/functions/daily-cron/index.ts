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

    const today = new Date().toISOString().split("T")[0];
    const results: Record<string, unknown> = {};

    // 1. Auto-flag overdue loans
    const { data: overdueClients, error: overdueErr } = await supabase
      .from("clients")
      .update({ status: "overdue" })
      .lt("next_payment_date", today)
      .eq("status", "active")
      .is("deleted_at", null)
      .gt("loan_amount", 0)
      .select("id, name_en, phone, next_payment_date");

    results.overdue_flagged = overdueClients?.length ?? 0;
    if (overdueErr) results.overdue_error = overdueErr.message;

    // 2. Find due loans (today)
    const { data: dueLoans } = await supabase
      .from("clients")
      .select("id, name_en, name_bn, phone, loan_amount, next_payment_date")
      .eq("next_payment_date", today)
      .in("status", ["active", "pending"])
      .is("deleted_at", null)
      .gt("loan_amount", 0);

    // 3. Create notifications for due loans
    if (dueLoans && dueLoans.length > 0) {
      const loanNotifs = dueLoans.map((c) => ({
        event: "loan_due" as const,
        channel: "sms" as const,
        template_en: `Dear ${c.name_en}, your loan payment of ৳${c.loan_amount} is due today.`,
        template_bn: `প্রিয় ${c.name_bn}, আপনার ঋণ কিস্তি ৳${c.loan_amount} আজ পরিশোধযোগ্য।`,
        recipient_phone: c.phone,
        recipient_name: c.name_en,
      }));
      await supabase.from("notifications").insert(loanNotifs);
      results.loan_due_notifications = loanNotifs.length;
    }

    // 4. Create notifications for overdue
    if (overdueClients && overdueClients.length > 0) {
      const overdueNotifs = overdueClients.map((c) => ({
        event: "overdue_alert" as const,
        channel: "sms" as const,
        template_en: `ALERT: ${c.name_en}'s loan payment is overdue since ${c.next_payment_date}.`,
        template_bn: `সতর্কতা: ${c.name_en} এর ঋণ কিস্তি ${c.next_payment_date} থেকে বকেয়া।`,
        recipient_phone: c.phone,
        recipient_name: c.name_en,
      }));
      await supabase.from("notifications").insert(overdueNotifs);
      results.overdue_notifications = overdueNotifs.length;
    }

    // 5. Run overdue penalty check (2% monthly penalty on overdue loans)
    const { data: penaltyResult, error: penaltyErr } = await supabase.rpc(
      "check_and_apply_overdue_penalty",
      { _penalty_percent: 2 }
    );
    results.overdue_penalties = penaltyResult ?? {};
    if (penaltyErr) results.penalty_error = penaltyErr.message;

    // 6. Sync loan_schedules overdue status
    const { data: scheduleSync, error: scheduleSyncErr } = await supabase.rpc(
      "sync_overdue_schedules" as any
    );
    results.schedule_overdue_sync = scheduleSync ?? {};
    if (scheduleSyncErr) results.schedule_sync_error = scheduleSyncErr.message;

    // 7. Audit log
    await supabase.from("audit_logs").insert({
      action_type: "daily_cron",
      entity_type: "system",
      details: results,
    });

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
