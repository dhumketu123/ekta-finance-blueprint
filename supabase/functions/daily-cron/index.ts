import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════════════════════════
// Phase 7: Smart Notification Message Builder
// ═══════════════════════════════════════════════════════════
interface LoanContext {
  name_en: string;
  name_bn: string | null;
  phone: string | null;
  loan_id: string | null;
  loan_model: string;
  total_principal: number;
  outstanding_principal: number;
  outstanding_interest: number;
  penalty_amount: number;
  emi_amount: number;
  next_due_date: string | null;
  installment_day: number | null;
  paid_count: number;
  remaining_count: number;
  total_count: number;
  installment_number?: number;
  installment_total?: number;
  due_date?: string;
}

function buildSmartMessage(ctx: LoanContext, eventType: string): { bn: string; en: string } {
  const name = ctx.name_bn || ctx.name_en;
  const totalPaid = ctx.total_principal - ctx.outstanding_principal;
  const totalOutstanding = ctx.outstanding_principal + ctx.outstanding_interest + ctx.penalty_amount;
  const loanRef = ctx.loan_id || '';

  // Common status line
  const statusBn = `ঋণ: ${loanRef} | পরিশোধিত: ৳${totalPaid.toLocaleString()} | বকেয়া: ৳${totalOutstanding.toLocaleString()} | কিস্তি: ${ctx.paid_count}/${ctx.total_count}`;
  const statusEn = `Loan: ${loanRef} | Paid: ৳${totalPaid.toLocaleString()} | Due: ৳${totalOutstanding.toLocaleString()} | Inst: ${ctx.paid_count}/${ctx.total_count}`;

  // Model-specific details
  let modelDetailBn = '';
  let modelDetailEn = '';
  if (ctx.loan_model === 'flat') {
    modelDetailBn = `মাসিক কিস্তি: ৳${ctx.emi_amount.toLocaleString()}`;
    modelDetailEn = `Monthly EMI: ৳${ctx.emi_amount.toLocaleString()}`;
  } else if (ctx.loan_model === 'reducing') {
    modelDetailBn = `EMI (হ্রাসমান): ৳${ctx.emi_amount.toLocaleString()} | বকেয়া সুদ: ৳${ctx.outstanding_interest.toLocaleString()}`;
    modelDetailEn = `EMI (Reducing): ৳${ctx.emi_amount.toLocaleString()} | Int Due: ৳${ctx.outstanding_interest.toLocaleString()}`;
  }

  const nextDueBn = ctx.next_due_date ? `পরবর্তী কিস্তি: ${ctx.next_due_date}` : '';
  const nextDueEn = ctx.next_due_date ? `Next Due: ${ctx.next_due_date}` : '';

  switch (eventType) {
    case 'upcoming_reminder': {
      const instAmt = ctx.installment_total ?? ctx.emi_amount;
      return {
        bn: `স্মারক: প্রিয় ${name}, আপনার কিস্তি #${ctx.installment_number} ৳${instAmt.toLocaleString()} ${ctx.due_date} তারিখে পরিশোধযোগ্য। ${modelDetailBn} | ${statusBn}`,
        en: `Reminder: Dear ${ctx.name_en}, installment #${ctx.installment_number} of ৳${instAmt.toLocaleString()} is due on ${ctx.due_date}. ${modelDetailEn} | ${statusEn}`,
      };
    }
    case 'overdue_alert': {
      const instAmt = ctx.installment_total ?? ctx.emi_amount;
      return {
        bn: `সতর্কতা: ${name}, কিস্তি #${ctx.installment_number} ৳${instAmt.toLocaleString()} ${ctx.due_date} থেকে বকেয়া। অবিলম্বে পরিশোধ করুন। ${statusBn}`,
        en: `ALERT: ${ctx.name_en}, installment #${ctx.installment_number} of ৳${instAmt.toLocaleString()} overdue since ${ctx.due_date}. Pay immediately. ${statusEn}`,
      };
    }
    case 'escalation_alert': {
      return {
        bn: `জরুরি: ${name}, আপনার ঋণ ${loanRef} এ বকেয়া ৳${totalOutstanding.toLocaleString()}। জরিমানা এড়াতে অবিলম্বে যোগাযোগ করুন। ${statusBn}`,
        en: `URGENT: ${ctx.name_en}, loan ${loanRef} has ৳${totalOutstanding.toLocaleString()} overdue. Contact us immediately. ${statusEn}`,
      };
    }
    case 'default_alert': {
      return {
        bn: `গুরুতর: ${name}, ঋণ ${loanRef} খেলাপি হিসেবে চিহ্নিত হয়েছে। বকেয়া: ৳${totalOutstanding.toLocaleString()}। অবিলম্বে অফিসে যোগাযোগ করুন।`,
        en: `CRITICAL: ${ctx.name_en}, loan ${loanRef} has been marked as DEFAULT. Outstanding: ৳${totalOutstanding.toLocaleString()}. Contact office immediately.`,
      };
    }
    case 'loan_due_today': {
      return {
        bn: `প্রিয় ${name}, আপনার ঋণ কিস্তি ৳${ctx.emi_amount.toLocaleString()} আজ পরিশোধযোগ্য। ${modelDetailBn} | ${statusBn}`,
        en: `Dear ${ctx.name_en}, your loan payment of ৳${ctx.emi_amount.toLocaleString()} is due today. ${modelDetailEn} | ${statusEn}`,
      };
    }
    default:
      return {
        bn: `প্রিয় ${name}, আপনার ঋণ ${loanRef} সম্পর্কে বিজ্ঞপ্তি। ${statusBn}`,
        en: `Dear ${ctx.name_en}, notification regarding loan ${loanRef}. ${statusEn}`,
      };
  }
}

// ═══════════════════════════════════════════════════════════
// Main Cron Handler
// ═══════════════════════════════════════════════════════════
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

    // ═══ 1. Auto-flag overdue loans on clients ═══
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

    // ═══ 2. Sync loan_schedules overdue status ═══
    const { data: scheduleSync, error: scheduleSyncErr } = await supabase.rpc("sync_overdue_schedules" as any);
    results.schedule_overdue_sync = scheduleSync ?? {};
    if (scheduleSyncErr) results.schedule_sync_error = scheduleSyncErr.message;

    // ═══ 3. Run overdue penalty check (tenant-configurable rate) ═══
    // Read penalty rate from tenant_rules, fallback to 2%
    let penaltyRate = 2;
    try {
      const { data: penaltyRule } = await supabase
        .from("tenant_rules")
        .select("rule_value")
        .eq("rule_key", "penalty_late_fee_rate")
        .limit(1)
        .maybeSingle();
      if (penaltyRule?.rule_value !== undefined && penaltyRule?.rule_value !== null) {
        penaltyRate = Number(penaltyRule.rule_value) || 2;
      }
    } catch { /* fallback to default */ }

    const { data: penaltyResult, error: penaltyErr } = await supabase.rpc("check_and_apply_overdue_penalty", { _penalty_percent: penaltyRate });
    results.overdue_penalties = penaltyResult ?? {};
    results.penalty_rate_used = penaltyRate;
    if (penaltyErr) results.penalty_error = penaltyErr.message;

    // ═══ 4. Auto-default loans (90+ days overdue) & auto-close zero-balance ═══
    const { data: defaultResult, error: defaultErr } = await supabase.rpc("auto_default_loans" as any);
    results.auto_default_loans = defaultResult ?? {};
    if (defaultErr) results.auto_default_error = defaultErr.message;

    // ═══ 5. Savings reconciliation ═══
    const { data: reconResult, error: reconErr } = await supabase.rpc("reconcile_savings_balances" as any);
    results.savings_reconciliation = reconResult ?? {};
    if (reconErr) results.reconciliation_error = reconErr.message;

    // ═══════════════════════════════════════════════════════
    // Phase 7: SMART NOTIFICATION ENGINE
    // ═══════════════════════════════════════════════════════

    // Helper: get schedule stats for a loan
    async function getScheduleStats(loanId: string) {
      const { data } = await supabase
        .from("loan_schedules")
        .select("status")
        .eq("loan_id", loanId);
      const total = data?.length ?? 0;
      const paid = data?.filter((s: any) => s.status === "paid").length ?? 0;
      return { total, paid, remaining: total - paid };
    }

    // Helper: insert notification with dedup (ON CONFLICT DO NOTHING)
    async function insertNotification(params: {
      loan_id: string;
      client_id: string;
      event_type: string;
      installment_number: number | null;
      channel: string;
      message_bn: string;
      message_en: string;
      recipient_phone: string | null;
      recipient_name: string;
    }) {
      // Use upsert with onConflict for deduplication
      const { error } = await supabase
        .from("notification_logs")
        .insert({
          ...params,
          event_date: today,
          delivery_status: 'queued',
        });
      // Ignore unique constraint violations (duplicates)
      if (error && !error.message?.includes('duplicate')) {
        console.error('Notification insert error:', error.message);
      }
      return !error || error.message?.includes('duplicate');
    }

    // ── 7a. Upcoming installment reminders (3 days ahead) ──
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const upcomingDate = threeDaysLater.toISOString().split("T")[0];

    const { data: upcomingSchedules } = await supabase
      .from("loan_schedules")
      .select(`
        id, client_id, due_date, principal_due, interest_due, penalty_due, 
        installment_number, loan_id,
        clients!loan_schedules_client_id_fkey(name_en, name_bn, phone)
      `)
      .eq("due_date", upcomingDate)
      .eq("status", "pending");

    let upcomingCount = 0;
    if (upcomingSchedules && upcomingSchedules.length > 0) {
      for (const s of upcomingSchedules as any[]) {
        if (!s.clients?.phone) continue;
        
        // Get loan details for smart message
        const { data: loan } = await supabase
          .from("loans")
          .select("loan_id, loan_model, total_principal, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, next_due_date, installment_day")
          .eq("id", s.loan_id)
          .single();
        
        if (!loan) continue;
        const stats = await getScheduleStats(s.loan_id);
        const instTotal = Number(s.principal_due) + Number(s.interest_due) + Number(s.penalty_due);

        const ctx: LoanContext = {
          name_en: s.clients.name_en,
          name_bn: s.clients.name_bn,
          phone: s.clients.phone,
          loan_id: loan.loan_id,
          loan_model: loan.loan_model,
          total_principal: Number(loan.total_principal),
          outstanding_principal: Number(loan.outstanding_principal),
          outstanding_interest: Number(loan.outstanding_interest),
          penalty_amount: Number(loan.penalty_amount),
          emi_amount: Number(loan.emi_amount),
          next_due_date: loan.next_due_date,
          installment_day: loan.installment_day,
          paid_count: stats.paid,
          remaining_count: stats.remaining,
          total_count: stats.total,
          installment_number: s.installment_number,
          installment_total: instTotal,
          due_date: s.due_date,
        };

        const msg = buildSmartMessage(ctx, 'upcoming_reminder');
        await insertNotification({
          loan_id: s.loan_id,
          client_id: s.client_id,
          event_type: 'upcoming_reminder',
          installment_number: s.installment_number,
          channel: 'sms',
          message_bn: msg.bn,
          message_en: msg.en,
          recipient_phone: s.clients.phone,
          recipient_name: s.clients.name_en,
        });
        upcomingCount++;
      }
    }
    results.upcoming_reminders = upcomingCount;

    // ── 7b. Due today notifications ──
    const { data: dueToday } = await supabase
      .from("loan_schedules")
      .select(`
        id, client_id, due_date, principal_due, interest_due, penalty_due,
        installment_number, loan_id,
        clients!loan_schedules_client_id_fkey(name_en, name_bn, phone)
      `)
      .eq("due_date", today)
      .in("status", ["pending", "overdue"]);

    let dueTodayCount = 0;
    if (dueToday && dueToday.length > 0) {
      for (const s of dueToday as any[]) {
        if (!s.clients?.phone) continue;
        const { data: loan } = await supabase
          .from("loans")
          .select("loan_id, loan_model, total_principal, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, next_due_date, installment_day")
          .eq("id", s.loan_id)
          .single();
        if (!loan) continue;
        const stats = await getScheduleStats(s.loan_id);
        const instTotal = Number(s.principal_due) + Number(s.interest_due) + Number(s.penalty_due);

        const ctx: LoanContext = {
          name_en: s.clients.name_en, name_bn: s.clients.name_bn, phone: s.clients.phone,
          loan_id: loan.loan_id, loan_model: loan.loan_model,
          total_principal: Number(loan.total_principal), outstanding_principal: Number(loan.outstanding_principal),
          outstanding_interest: Number(loan.outstanding_interest), penalty_amount: Number(loan.penalty_amount),
          emi_amount: Number(loan.emi_amount), next_due_date: loan.next_due_date, installment_day: loan.installment_day,
          paid_count: stats.paid, remaining_count: stats.remaining, total_count: stats.total,
          installment_number: s.installment_number, installment_total: instTotal, due_date: s.due_date,
        };

        const msg = buildSmartMessage(ctx, 'loan_due_today');
        await insertNotification({
          loan_id: s.loan_id, client_id: s.client_id,
          event_type: 'loan_due_today', installment_number: s.installment_number,
          channel: 'sms', message_bn: msg.bn, message_en: msg.en,
          recipient_phone: s.clients.phone, recipient_name: s.clients.name_en,
        });
        dueTodayCount++;
      }
    }
    results.due_today_notifications = dueTodayCount;

    // ── 7c. Overdue alerts (schedules past due) ──
    const { data: overdueSchedules } = await supabase
      .from("loan_schedules")
      .select(`
        id, client_id, due_date, principal_due, interest_due, penalty_due,
        installment_number, loan_id,
        clients!loan_schedules_client_id_fkey(name_en, name_bn, phone)
      `)
      .eq("status", "overdue")
      .gt("due_date", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
      .lt("due_date", today);

    let overdueAlertCount = 0;
    if (overdueSchedules && overdueSchedules.length > 0) {
      for (const s of overdueSchedules as any[]) {
        if (!s.clients?.phone) continue;
        const { data: loan } = await supabase
          .from("loans")
          .select("loan_id, loan_model, total_principal, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, next_due_date, installment_day")
          .eq("id", s.loan_id)
          .single();
        if (!loan) continue;
        const stats = await getScheduleStats(s.loan_id);
        const instTotal = Number(s.principal_due) + Number(s.interest_due) + Number(s.penalty_due);

        const ctx: LoanContext = {
          name_en: s.clients.name_en, name_bn: s.clients.name_bn, phone: s.clients.phone,
          loan_id: loan.loan_id, loan_model: loan.loan_model,
          total_principal: Number(loan.total_principal), outstanding_principal: Number(loan.outstanding_principal),
          outstanding_interest: Number(loan.outstanding_interest), penalty_amount: Number(loan.penalty_amount),
          emi_amount: Number(loan.emi_amount), next_due_date: loan.next_due_date, installment_day: loan.installment_day,
          paid_count: stats.paid, remaining_count: stats.remaining, total_count: stats.total,
          installment_number: s.installment_number, installment_total: instTotal, due_date: s.due_date,
        };

        const msg = buildSmartMessage(ctx, 'overdue_alert');
        await insertNotification({
          loan_id: s.loan_id, client_id: s.client_id,
          event_type: 'overdue_alert', installment_number: s.installment_number,
          channel: 'sms', message_bn: msg.bn, message_en: msg.en,
          recipient_phone: s.clients.phone, recipient_name: s.clients.name_en,
        });
        overdueAlertCount++;
      }
    }
    results.overdue_alerts = overdueAlertCount;

    // ── 7d. Weekly escalation (Sundays, > 7 days overdue) ──
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const { data: escalationSchedules } = await supabase
        .from("loan_schedules")
        .select(`
          id, client_id, due_date, principal_due, interest_due, penalty_due,
          installment_number, loan_id,
          clients!loan_schedules_client_id_fkey(name_en, name_bn, phone)
        `)
        .eq("status", "overdue")
        .lte("due_date", sevenDaysAgo);

      let escalationCount = 0;
      if (escalationSchedules && escalationSchedules.length > 0) {
        for (const s of escalationSchedules as any[]) {
          if (!s.clients?.phone) continue;
          const { data: loan } = await supabase
            .from("loans")
            .select("loan_id, loan_model, total_principal, outstanding_principal, outstanding_interest, penalty_amount, emi_amount, next_due_date, installment_day")
            .eq("id", s.loan_id)
            .single();
          if (!loan) continue;
          const stats = await getScheduleStats(s.loan_id);

          const ctx: LoanContext = {
            name_en: s.clients.name_en, name_bn: s.clients.name_bn, phone: s.clients.phone,
            loan_id: loan.loan_id, loan_model: loan.loan_model,
            total_principal: Number(loan.total_principal), outstanding_principal: Number(loan.outstanding_principal),
            outstanding_interest: Number(loan.outstanding_interest), penalty_amount: Number(loan.penalty_amount),
            emi_amount: Number(loan.emi_amount), next_due_date: loan.next_due_date, installment_day: loan.installment_day,
            paid_count: stats.paid, remaining_count: stats.remaining, total_count: stats.total,
            installment_number: s.installment_number, due_date: s.due_date,
          };

          const msg = buildSmartMessage(ctx, 'escalation_alert');
          await insertNotification({
            loan_id: s.loan_id, client_id: s.client_id,
            event_type: 'escalation_alert', installment_number: s.installment_number,
            channel: 'sms', message_bn: msg.bn, message_en: msg.en,
            recipient_phone: s.clients.phone, recipient_name: s.clients.name_en,
          });
          escalationCount++;
        }
      }
      results.escalation_alerts = escalationCount;
    }

    // ── 7e. Default status notifications ──
    const defaultedLoans = (defaultResult as any)?.defaulted ?? 0;
    if (defaultedLoans > 0) {
      const { data: defaultLoans } = await supabase
        .from("loans")
        .select(`
          id, loan_id, loan_model, total_principal, outstanding_principal, outstanding_interest, 
          penalty_amount, emi_amount, next_due_date, installment_day, client_id,
          clients!loans_client_id_fkey(name_en, name_bn, phone)
        `)
        .eq("status", "default")
        .is("deleted_at", null);

      if (defaultLoans) {
        for (const l of defaultLoans as any[]) {
          if (!l.clients?.phone) continue;
          const stats = await getScheduleStats(l.id);
          const ctx: LoanContext = {
            name_en: l.clients.name_en, name_bn: l.clients.name_bn, phone: l.clients.phone,
            loan_id: l.loan_id, loan_model: l.loan_model,
            total_principal: Number(l.total_principal), outstanding_principal: Number(l.outstanding_principal),
            outstanding_interest: Number(l.outstanding_interest), penalty_amount: Number(l.penalty_amount),
            emi_amount: Number(l.emi_amount), next_due_date: l.next_due_date, installment_day: l.installment_day,
            paid_count: stats.paid, remaining_count: stats.remaining, total_count: stats.total,
          };
          const msg = buildSmartMessage(ctx, 'default_alert');
          await insertNotification({
            loan_id: l.id, client_id: l.client_id,
            event_type: 'default_alert', installment_number: 0,
            channel: 'sms', message_bn: msg.bn, message_en: msg.en,
            recipient_phone: l.clients.phone, recipient_name: l.clients.name_en,
          });
        }
      }
    }

    // ═══ Savings Reminders (weekly frequency clients) ═══
    let savingsReminderCount = 0;
    if (dayOfWeek === 6) { // Saturdays
      const { data: savingsClients } = await supabase
        .from("savings_accounts")
        .select(`
          id, client_id, balance,
          clients!savings_accounts_client_id_fkey(name_en, name_bn, phone),
          savings_products!savings_accounts_savings_product_id_fkey(product_name_en, min_amount, frequency)
        `)
        .eq("status", "active")
        .is("deleted_at", null);

      if (savingsClients) {
        for (const sa of savingsClients as any[]) {
          if (!sa.clients?.phone) continue;
          const name = sa.clients.name_bn || sa.clients.name_en;
          const prodName = sa.savings_products?.product_name_en || "Savings";
          const minAmt = Number(sa.savings_products?.min_amount || 0);

          const msgBn = `স্মারক: ${name}, আপনার ${prodName} সঞ্চয় জমা দিন। ন্যূনতম: ৳${minAmt.toLocaleString()}। বর্তমান ব্যালেন্স: ৳${Number(sa.balance).toLocaleString()}।`;
          const msgEn = `Reminder: ${sa.clients.name_en}, please deposit to your ${prodName} savings. Min: ৳${minAmt.toLocaleString()}. Balance: ৳${Number(sa.balance).toLocaleString()}.`;

          const { error: insertErr } = await supabase.from("notification_logs").insert({
            client_id: sa.client_id,
            loan_id: null,
            event_type: "savings_reminder",
            installment_number: null,
            channel: "sms",
            message_bn: msgBn,
            message_en: msgEn,
            recipient_phone: sa.clients.phone,
            recipient_name: sa.clients.name_en,
            event_date: today,
            delivery_status: "queued",
          });
          if (!insertErr || insertErr.message?.includes("duplicate")) savingsReminderCount++;
        }
      }
    }
    results.savings_reminders = savingsReminderCount;

    // ═══ Phase 9: AI-PREDICTIVE RISK SCORING ═══
    const { data: riskResult, error: riskErr } = await supabase.rpc("predict_loan_risk" as any);
    if (riskErr) {
      results.risk_scoring_error = riskErr.message;
    } else {
      const riskData = riskResult as any;
      results.risk_scoring = {
        total_scored: riskData?.total_scored ?? 0,
        high_risk_count: riskData?.high_risk_count ?? 0,
      };

      // Send notifications for high-risk clients not already notified today
      const predictions = riskData?.predictions ?? [];
      let riskNotifCount = 0;
      for (const pred of predictions) {
        if (pred.risk_score < 70 || !pred.phone) continue;
        const alertType = pred.alert_type === 'default_alert' ? 'default_alert' : 'escalation_alert';
        const msgBn = pred.risk_score >= 80
          ? `গুরুতর ঝুঁকি: ${pred.client_name_bn || pred.client_name_en}, আপনার ঋণের ঝুঁকি স্কোর ${pred.risk_score}/100। বকেয়া: ৳${Number(pred.outstanding_principal + pred.outstanding_interest).toLocaleString()}। অবিলম্বে যোগাযোগ করুন।`
          : `সতর্কতা: ${pred.client_name_bn || pred.client_name_en}, ঋণের ঝুঁকি স্কোর ${pred.risk_score}/100। বকেয়া: ৳${Number(pred.outstanding_principal + pred.outstanding_interest).toLocaleString()}।`;
        const msgEn = pred.risk_score >= 80
          ? `CRITICAL RISK: ${pred.client_name_en}, loan risk score ${pred.risk_score}/100. Outstanding: ৳${Number(pred.outstanding_principal + pred.outstanding_interest).toLocaleString()}. Contact office immediately.`
          : `WARNING: ${pred.client_name_en}, loan risk score ${pred.risk_score}/100. Outstanding: ৳${Number(pred.outstanding_principal + pred.outstanding_interest).toLocaleString()}.`;

        await insertNotification({
          loan_id: pred.loan_id,
          client_id: pred.client_id,
          event_type: alertType,
          installment_number: null,
          channel: 'sms',
          message_bn: msgBn,
          message_en: msgEn,
          recipient_phone: pred.phone,
          recipient_name: pred.client_name_en,
        });
        riskNotifCount++;
      }
      results.risk_notifications = riskNotifCount;
    }

    // ═══ DAILY FINANCIAL SUMMARY AGGREGATION ═══
    const { data: summaryResult, error: summaryErr } = await supabase.rpc("populate_daily_summary", {
      _target_date: today,
    });
    if (summaryErr) {
      results.daily_summary_error = summaryErr.message;
    } else {
      results.daily_summary = summaryResult;
    }

    // ═══ Summary & Audit ═══
    const totalNotifCount = (results.upcoming_reminders as number ?? 0)
      + (results.due_today_notifications as number ?? 0)
      + (results.overdue_alerts as number ?? 0)
      + (results.escalation_alerts as number ?? 0)
      + (results.risk_notifications as number ?? 0)
      + (results.savings_reminders as number ?? 0);

    if (totalNotifCount > 0) {
      await supabase.from("sms_logs").insert({
        recipient_phone: "system",
        recipient_name: "daily-cron",
        message_text: `Smart Cron: ${totalNotifCount} personalized notifications queued`,
        message_type: "cron_summary",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    }

    await supabase.from("audit_logs").insert({
      action_type: "daily_cron",
      entity_type: "system",
      details: results,
    });

    return new Response(JSON.stringify({ success: true, ...results }), {
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
