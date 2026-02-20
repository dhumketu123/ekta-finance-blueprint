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
      .select("id, name_en, name_bn, phone, next_payment_date");

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
        template_bn: `প্রিয় ${c.name_bn || c.name_en}, আপনার ঋণ কিস্তি ৳${c.loan_amount} আজ পরিশোধযোগ্য।`,
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
        template_bn: `সতর্কতা: ${c.name_bn || c.name_en} এর ঋণ কিস্তি ${c.next_payment_date} থেকে বকেয়া।`,
        recipient_phone: c.phone,
        recipient_name: c.name_en,
      }));
      await supabase.from("notifications").insert(overdueNotifs);
      results.overdue_notifications = overdueNotifs.length;
    }

    // 5. ★ NEW: Upcoming installment reminders (3 days ahead)
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const upcomingDate = threeDaysLater.toISOString().split("T")[0];

    const { data: upcomingSchedules } = await supabase
      .from("loan_schedules")
      .select("id, client_id, due_date, principal_due, interest_due, penalty_due, installment_number, clients!loan_schedules_client_id_fkey(name_en, name_bn, phone)")
      .eq("due_date", upcomingDate)
      .eq("status", "pending");

    if (upcomingSchedules && upcomingSchedules.length > 0) {
      const upcomingNotifs = upcomingSchedules
        .filter((s: any) => s.clients?.phone)
        .map((s: any) => {
          const totalDue = Number(s.principal_due) + Number(s.interest_due) + Number(s.penalty_due);
          return {
            event: "deposit_reminder" as const,
            channel: "sms" as const,
            template_en: `Reminder: ${s.clients.name_en}, installment #${s.installment_number} of ৳${totalDue} is due on ${s.due_date}. Principal: ৳${s.principal_due}, Interest: ৳${s.interest_due}.`,
            template_bn: `স্মারক: ${s.clients.name_bn || s.clients.name_en}, কিস্তি #${s.installment_number} ৳${totalDue} ${s.due_date} তারিখে পরিশোধযোগ্য। আসল: ৳${s.principal_due}, সুদ: ৳${s.interest_due}।`,
            recipient_phone: s.clients.phone,
            recipient_name: s.clients.name_en,
          };
        });
      if (upcomingNotifs.length > 0) {
        await supabase.from("notifications").insert(upcomingNotifs);
      }
      results.upcoming_reminders = upcomingNotifs.length;
    }

    // 6. ★ NEW: Overdue escalation (weekly re-alert for schedules overdue > 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const escalationDate = sevenDaysAgo.toISOString().split("T")[0];

    const { data: escalationSchedules } = await supabase
      .from("loan_schedules")
      .select("id, client_id, due_date, principal_due, interest_due, penalty_due, installment_number, clients!loan_schedules_client_id_fkey(name_en, name_bn, phone)")
      .eq("status", "overdue")
      .lte("due_date", escalationDate);

    if (escalationSchedules && escalationSchedules.length > 0) {
      // Only send escalation once per week — check day of week (Sunday = 0)
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0) { // Weekly escalation on Sundays
        const escalationNotifs = escalationSchedules
          .filter((s: any) => s.clients?.phone)
          .map((s: any) => {
            const totalDue = Number(s.principal_due) + Number(s.interest_due) + Number(s.penalty_due);
            return {
              event: "overdue_alert" as const,
              channel: "sms" as const,
              template_en: `URGENT: ${s.clients.name_en}, installment #${s.installment_number} of ৳${totalDue} has been overdue since ${s.due_date}. Please pay immediately to avoid further penalties.`,
              template_bn: `জরুরি: ${s.clients.name_bn || s.clients.name_en}, কিস্তি #${s.installment_number} ৳${totalDue} ${s.due_date} থেকে বকেয়া। জরিমানা এড়াতে অবিলম্বে পরিশোধ করুন।`,
              recipient_phone: s.clients.phone,
              recipient_name: s.clients.name_en,
            };
          });
        if (escalationNotifs.length > 0) {
          await supabase.from("notifications").insert(escalationNotifs);
        }
        results.escalation_alerts = escalationNotifs.length;
      }
    }

    // 7. Run overdue penalty check (2% monthly penalty on overdue loans)
    const { data: penaltyResult, error: penaltyErr } = await supabase.rpc(
      "check_and_apply_overdue_penalty",
      { _penalty_percent: 2 }
    );
    results.overdue_penalties = penaltyResult ?? {};
    if (penaltyErr) results.penalty_error = penaltyErr.message;

    // 8. Sync loan_schedules overdue status
    const { data: scheduleSync, error: scheduleSyncErr } = await supabase.rpc(
      "sync_overdue_schedules" as any
    );
    results.schedule_overdue_sync = scheduleSync ?? {};
    if (scheduleSyncErr) results.schedule_sync_error = scheduleSyncErr.message;

    // 9. Log all notification activity to sms_logs for audit
    const totalNotifCount = (results.loan_due_notifications as number ?? 0)
      + (results.overdue_notifications as number ?? 0)
      + (results.upcoming_reminders as number ?? 0)
      + (results.escalation_alerts as number ?? 0);

    if (totalNotifCount > 0) {
      await supabase.from("sms_logs").insert({
        recipient_phone: "system",
        recipient_name: "daily-cron",
        message_text: `Daily cron: ${totalNotifCount} notifications queued`,
        message_type: "cron_summary",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    }

    // 10. Audit log
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
