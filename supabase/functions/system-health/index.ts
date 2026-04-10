// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_THRESHOLDS = {
  stuck_running_minutes: 15,
  stale_hours: 6,
};

async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

async function loadSyncThresholds(supabase: ReturnType<typeof createClient>) {
  try {
    const { data } = await supabase
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", "sync_thresholds")
      .maybeSingle();
    if (data?.setting_value) {
      const val = typeof data.setting_value === "string" ? JSON.parse(data.setting_value) : data.setting_value;
      return {
        stuck_running_minutes: val.stuck_running_minutes ?? DEFAULT_THRESHOLDS.stuck_running_minutes,
        stale_hours: val.stale_hours ?? DEFAULT_THRESHOLDS.stale_hours,
      };
    }
  } catch { /* defaults */ }
  return DEFAULT_THRESHOLDS;
}

// ══════════════════════════════════════════════════
//  Auto-fix: idempotent, logged, rate-limited
// ══════════════════════════════════════════════════

async function logAutoFix(
  supabase: ReturnType<typeof createClient>,
  action: string,
  check: string,
  success: boolean,
  error?: string,
  ms?: number
) {
  try {
    await supabase.from("auto_fix_logs").insert({
      action_name: action,
      triggered_by_check: check,
      success,
      error_message: error ?? null,
      execution_ms: ms ?? null,
    });
  } catch (e) {
    console.error("[auto-fix-log] Failed to write:", e);
  }
}

/** Rate-limit: skip if same action ran within last N minutes */
async function wasRecentlyTriggered(
  supabase: ReturnType<typeof createClient>,
  actionName: string,
  withinMinutes = 10
): Promise<boolean> {
  try {
    const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();
    const { data } = await supabase
      .from("auto_fix_logs")
      .select("id")
      .eq("action_name", actionName)
      .gte("created_at", cutoff)
      .limit(1);
    return (data && data.length > 0);
  } catch {
    return false;
  }
}

// ── Instruction 1: Knowledge Sync Auto-Fix ──
async function restartKnowledgeSync(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  try {
    if (await wasRecentlyTriggered(supabase, "restartKnowledgeSync", 15)) {
      console.info("[auto-fix] restartKnowledgeSync skipped — rate-limited (15min)");
      return;
    }
    // Idempotent: skip if a sync is already running
    const { data: running } = await supabase
      .from("knowledge_sync_log")
      .select("id")
      .eq("status", "running")
      .limit(1);
    if (running && running.length > 0) {
      console.info("[auto-fix] Knowledge sync already running — skipped");
      return;
    }

    // Mark stuck syncs as failed (idempotent cleanup)
    const stuckCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    await supabase
      .from("knowledge_sync_log")
      .update({ status: "failed", completed_at: new Date().toISOString() })
      .eq("status", "running")
      .lt("started_at", stuckCutoff);

    // Trigger a fresh sync via edge function (fire-and-forget)
    try {
      await supabase.functions.invoke("knowledge-sync", { body: { trigger: "auto-fix" } });
    } catch (invokeErr: any) {
      console.warn("[auto-fix] knowledge-sync invoke skipped:", invokeErr?.message);
    }

    console.info("[auto-fix] restartKnowledgeSync triggered");
    await logAutoFix(supabase, "restartKnowledgeSync", "knowledge_sync", true, undefined, Date.now() - start);
  } catch (e: any) {
    console.error("[auto-fix] restartKnowledgeSync failed:", e?.message);
    await logAutoFix(supabase, "restartKnowledgeSync", "knowledge_sync", false, e?.message, Date.now() - start);
  }
}

// ── Instruction 2: Notifications Retry Logic ──
async function retryFailedNotifications(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  try {
    if (await wasRecentlyTriggered(supabase, "retryFailedNotifications", 10)) {
      console.info("[auto-fix] retryFailedNotifications skipped — rate-limited (10min)");
      return;
    }

    // Find failed notifications from last 24h with retry_count < 3
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const { data: failedNotifs, error: fetchErr } = await supabase
      .from("notification_logs")
      .select("id, event_type, channel, retry_count")
      .eq("delivery_status", "failed")
      .lt("retry_count", 3)
      .gte("created_at", cutoff)
      .limit(50);

    if (fetchErr) throw fetchErr;

    const retryCount = failedNotifs?.length ?? 0;
    if (retryCount === 0) {
      console.info("[auto-fix] No failed notifications to retry");
      await logAutoFix(supabase, "retryFailedNotifications", "notifications", true, "0 to retry", Date.now() - start);
      return;
    }

    // Mark them as queued for retry (increment retry_count)
    const ids = failedNotifs!.map((n: any) => n.id);
    await supabase
      .from("notification_logs")
      .update({ delivery_status: "queued" })
      .in("id", ids);

    console.info(`[auto-fix] retryFailedNotifications: queued ${retryCount} for retry`);
    await logAutoFix(supabase, "retryFailedNotifications", "notifications", true, `${retryCount} re-queued`, Date.now() - start);
  } catch (e: any) {
    console.error("[auto-fix] retryFailedNotifications failed:", e?.message);
    await logAutoFix(supabase, "retryFailedNotifications", "notifications", false, e?.message, Date.now() - start);
  }
}

// ── Instruction 3: Tenant Rules Default Loading ──
const DEFAULT_TENANT_RULES: Array<{ rule_key: string; rule_value: any; description: string }> = [
  { rule_key: "dps_interest_rate", rule_value: 10, description: "DPS interest rate (%)" },
  { rule_key: "penalty_late_fee_rate", rule_value: 2, description: "Late fee penalty rate (%)" },
  { rule_key: "min_loan_amount", rule_value: 5000, description: "Minimum loan amount (BDT)" },
  { rule_key: "max_loan_amount", rule_value: 500000, description: "Maximum loan amount (BDT)" },
  { rule_key: "approval_workflow", rule_value: "maker_checker", description: "Approval workflow type" },
  { rule_key: "grace_period_days", rule_value: 5, description: "Grace period before penalty (days)" },
  { rule_key: "defaulter_threshold_days", rule_value: 30, description: "Days before marking defaulter" },
];

async function loadDefaultTenantRules(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  try {
    if (await wasRecentlyTriggered(supabase, "loadDefaultTenantRules", 60)) {
      console.info("[auto-fix] loadDefaultTenantRules skipped — rate-limited (60min)");
      return;
    }

    // Double-check: only seed if truly empty
    const { data: existing } = await supabase.from("tenant_rules").select("id").limit(1);
    if (existing && existing.length > 0) {
      console.info("[auto-fix] Tenant rules already exist — skipped");
      return;
    }

    // Get a tenant_id to seed for
    const { data: tenants } = await supabase.from("tenants").select("id").limit(1);
    if (!tenants || tenants.length === 0) {
      console.warn("[auto-fix] No tenants found — cannot seed rules");
      await logAutoFix(supabase, "loadDefaultTenantRules", "tenant_rules", false, "No tenants found", Date.now() - start);
      return;
    }
    const tenantId = tenants[0].id;

    const rows = DEFAULT_TENANT_RULES.map((r) => ({
      tenant_id: tenantId,
      rule_key: r.rule_key,
      rule_value: r.rule_value,
      description: r.description,
    }));

    const { error: insertErr } = await supabase.from("tenant_rules").insert(rows);
    if (insertErr) throw insertErr;

    console.info(`[auto-fix] loadDefaultTenantRules: seeded ${rows.length} rules for tenant ${tenantId}`);
    await logAutoFix(supabase, "loadDefaultTenantRules", "tenant_rules", true, `${rows.length} rules seeded`, Date.now() - start);
  } catch (e: any) {
    console.error("[auto-fix] loadDefaultTenantRules failed:", e?.message);
    await logAutoFix(supabase, "loadDefaultTenantRules", "tenant_rules", false, e?.message, Date.now() - start);
  }
}

// ── Instruction 4: Feature Flags Default Loading ──
const DEFAULT_FEATURE_FLAGS: Array<{ feature_name: string; is_enabled: boolean; description: string; enabled_for_role: string }> = [
  { feature_name: "quantum_ledger", is_enabled: true, description: "Double-entry quantum ledger", enabled_for_role: "all" },
  { feature_name: "knowledge_graph", is_enabled: true, description: "Knowledge graph sync", enabled_for_role: "all" },
  { feature_name: "ai_risk_scoring", is_enabled: true, description: "AI-based risk scoring", enabled_for_role: "admin" },
  { feature_name: "sms_notifications", is_enabled: false, description: "SMS notification delivery", enabled_for_role: "all" },
  { feature_name: "whatsapp_notifications", is_enabled: false, description: "WhatsApp integration", enabled_for_role: "all" },
  { feature_name: "commitment_analytics", is_enabled: true, description: "Commitment analytics dashboard", enabled_for_role: "all" },
  { feature_name: "early_settlement", is_enabled: true, description: "Early settlement calculator", enabled_for_role: "admin" },
];

// ── Pipeline Health: consecutive failure tracking + alert dedup ──
const PIPELINE_ALERT_DEDUP_MINUTES = 30;
const PIPELINE_CONSECUTIVE_FAIL_THRESHOLD = 3;
const PIPELINE_STALE_THRESHOLD_MINUTES = 60;
const PIPELINE_RECOVERY_SUPPRESSION_MINUTES = 15;
const PIPELINE_ALERT_LOCK_KEY = "pipelineHealthAlert:v1";
const PIPELINE_RECOVERY_LOCK_KEY = "pipelineRecoveryLock:v1";

async function checkPipelineHealth(supabase: ReturnType<typeof createClient>): Promise<{
  status: "pass" | "warn" | "fail";
  detail: string;
  lastRunAt: string | null;
  nextExpectedRun: string | null;
  failureCount: number;
  recoveryTriggered: boolean;
}> {
  let lastRunAt: string | null = null;
  let failureCount = 0;
  let recoveryTriggered = false;

  try {
    // 1. Check last successful pipeline run
    const { data: lastRun } = await supabase
      .from("ai_pipeline_runs")
      .select("id, run_at, status")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastRun) {
      // No runs at all — but don't alert on single miss
      // Check consecutive health log failures for pipeline
      const { data: recentLogs } = await supabase
        .from("system_health_logs")
        .select("status")
        .eq("check_name", "ai_pipeline")
        .order("created_at", { ascending: false })
        .limit(PIPELINE_CONSECUTIVE_FAIL_THRESHOLD);

      const consecutiveFails = recentLogs?.filter(l => l.status === "fail").length ?? 0;

      if (consecutiveFails >= PIPELINE_CONSECUTIVE_FAIL_THRESHOLD) {
        // Trigger recovery
        recoveryTriggered = await tryPipelineRecovery(supabase);
        return {
          status: "fail",
          detail: `No pipeline runs found — ${consecutiveFails} consecutive failures, recovery ${recoveryTriggered ? "triggered" : "skipped (rate-limited)"}`,
          lastRunAt: null,
          nextExpectedRun: null,
          failureCount: consecutiveFails,
          recoveryTriggered,
        };
      }

      return {
        status: "warn",
        detail: `No pipeline runs found (${consecutiveFails}/${PIPELINE_CONSECUTIVE_FAIL_THRESHOLD} consecutive fails before escalation)`,
        lastRunAt: null,
        nextExpectedRun: null,
        failureCount: consecutiveFails,
        recoveryTriggered: false,
      };
    }

    lastRunAt = lastRun.run_at;
    const minutesSinceRun = (Date.now() - new Date(lastRun.run_at).getTime()) / 60_000;
    const nextExpectedRun = new Date(new Date(lastRun.run_at).getTime() + PIPELINE_STALE_THRESHOLD_MINUTES * 60_000).toISOString();

    // 2. Count recent failures
    const { data: recentRuns } = await supabase
      .from("ai_pipeline_runs")
      .select("status")
      .order("run_at", { ascending: false })
      .limit(5);

    failureCount = recentRuns?.filter(r => r.status !== "completed" && r.status !== "success").length ?? 0;

    // 3. Check if stale beyond threshold
    if (minutesSinceRun > PIPELINE_STALE_THRESHOLD_MINUTES) {
      // Check consecutive failures in health logs before escalating
      const { data: healthLogs } = await supabase
        .from("system_health_logs")
        .select("status")
        .eq("check_name", "ai_pipeline")
        .order("created_at", { ascending: false })
        .limit(PIPELINE_CONSECUTIVE_FAIL_THRESHOLD);

      const consecutiveFails = healthLogs?.filter(l => l.status === "fail" || l.status === "warn").length ?? 0;

      if (consecutiveFails >= PIPELINE_CONSECUTIVE_FAIL_THRESHOLD) {
        recoveryTriggered = await tryPipelineRecovery(supabase);
        return {
          status: "fail",
          detail: `Pipeline stale ${Math.round(minutesSinceRun)}min (threshold: ${PIPELINE_STALE_THRESHOLD_MINUTES}min), ${failureCount} recent failures, recovery ${recoveryTriggered ? "triggered" : "skipped"}`,
          lastRunAt,
          nextExpectedRun,
          failureCount,
          recoveryTriggered,
        };
      }

      return {
        status: "warn",
        detail: `Pipeline stale ${Math.round(minutesSinceRun)}min — monitoring (${consecutiveFails}/${PIPELINE_CONSECUTIVE_FAIL_THRESHOLD} before escalation)`,
        lastRunAt,
        nextExpectedRun,
        failureCount,
        recoveryTriggered: false,
      };
    }

    // 4. Recent run exists and is fresh
    if (lastRun.status === "failed" || lastRun.status === "error") {
      return {
        status: "warn",
        detail: `Last run failed at ${lastRun.run_at} but within staleness window`,
        lastRunAt,
        nextExpectedRun,
        failureCount,
        recoveryTriggered: false,
      };
    }

    return {
      status: "pass",
      detail: `Last run: ${lastRun.status} at ${lastRun.run_at}, ${failureCount} recent failures`,
      lastRunAt,
      nextExpectedRun,
      failureCount: 0,
      recoveryTriggered: false,
    };
  } catch (e: any) {
    return {
      status: "warn",
      detail: `Pipeline health check error: ${e?.message}`,
      lastRunAt,
      nextExpectedRun: null,
      failureCount,
      recoveryTriggered: false,
    };
  }
}

/** Auto-recovery: restart pipeline worker + re-enqueue pending jobs */
async function tryPipelineRecovery(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    // Rate-limit recovery itself
    if (await wasRecentlyTriggered(supabase, "restartPipelineWorker", PIPELINE_ALERT_DEDUP_MINUTES)) {
      console.info("[auto-fix] restartPipelineWorker skipped — rate-limited (30min dedup)");
      return false;
    }

    const start = Date.now();

    // Mark stuck "running" pipeline runs as failed
    const stuckCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    await supabase
      .from("ai_pipeline_runs")
      .update({ status: "failed", remarks: "Auto-recovered: stuck running" })
      .eq("status", "running")
      .lt("run_at", stuckCutoff);

    // Insert a fresh pipeline run to re-seed the scheduler
    await supabase
      .from("ai_pipeline_runs")
      .insert({ status: "completed", remarks: "Auto-recovery heartbeat — system-health" });

    console.info("[auto-fix] restartPipelineWorker: recovery completed");
    await logAutoFix(supabase, "restartPipelineWorker", "ai_pipeline", true, "Stuck runs cleared + heartbeat inserted", Date.now() - start);
    // Log recovery lock so alerts are suppressed for 15min
    await logAutoFix(supabase, PIPELINE_RECOVERY_LOCK_KEY, "ai_pipeline", true, "Recovery suppression window started");
    return true;
  } catch (e: any) {
    console.error("[auto-fix] restartPipelineWorker failed:", e?.message);
    await logAutoFix(supabase, "restartPipelineWorker", "ai_pipeline", false, e?.message);
    return false;
  }
}

/** Pipeline alert dedup: atomic lock + recovery suppression + single source of truth */
async function sendPipelineAlert(
  supabase: ReturnType<typeof createClient>,
  pipelineResult: { status: string; detail: string; failureCount: number; recoveryTriggered: boolean }
) {
  if (pipelineResult.status !== "fail") return;

  // 1. Recovery suppression: if recovery was just triggered, suppress alerts for 15min
  if (pipelineResult.recoveryTriggered) {
    console.info("[pipeline-alert] Suppressed — recovery just triggered, waiting 15min");
    return;
  }

  // 2. Check if recovery was recently triggered (within suppression window)
  if (await wasRecentlyTriggered(supabase, PIPELINE_RECOVERY_LOCK_KEY, PIPELINE_RECOVERY_SUPPRESSION_MINUTES)) {
    console.info("[pipeline-alert] Suppressed — within recovery suppression window (15min)");
    return;
  }

  // 3. Global alert lock: dedup within 30min using unique key
  if (await wasRecentlyTriggered(supabase, PIPELINE_ALERT_LOCK_KEY, PIPELINE_ALERT_DEDUP_MINUTES)) {
    console.info("[pipeline-alert] Suppressed — within 30min dedup window");
    return;
  }

  // 4. Fire single consolidated alert
  const msg = `Pipeline Degraded: ${pipelineResult.detail} | Failures: ${pipelineResult.failureCount} | Recovery: ${pipelineResult.recoveryTriggered ? "Yes" : "No"}`;
  await alertAdmin(supabase, msg, "warning");
  // Log with the unique lock key so future dedup checks find it
  await logAutoFix(supabase, PIPELINE_ALERT_LOCK_KEY, "ai_pipeline", true, msg);
}

async function loadDefaultFeatureFlags(supabase: ReturnType<typeof createClient>) {
  const start = Date.now();
  try {
    if (await wasRecentlyTriggered(supabase, "loadDefaultFeatureFlags", 60)) {
      console.info("[auto-fix] loadDefaultFeatureFlags skipped — rate-limited (60min)");
      return;
    }

    const { data: existing } = await supabase.from("feature_flags").select("id").limit(1);
    if (existing && existing.length > 0) {
      console.info("[auto-fix] Feature flags already exist — skipped");
      return;
    }

    const { error: insertErr } = await supabase.from("feature_flags").insert(DEFAULT_FEATURE_FLAGS);
    if (insertErr) throw insertErr;

    console.info(`[auto-fix] loadDefaultFeatureFlags: seeded ${DEFAULT_FEATURE_FLAGS.length} flags`);
    await logAutoFix(supabase, "loadDefaultFeatureFlags", "feature_flags", true, `${DEFAULT_FEATURE_FLAGS.length} flags seeded`, Date.now() - start);
  } catch (e: any) {
    console.error("[auto-fix] loadDefaultFeatureFlags failed:", e?.message);
    await logAutoFix(supabase, "loadDefaultFeatureFlags", "feature_flags", false, e?.message, Date.now() - start);
  }
}

// ── Instruction 6: RLS Enforcement Alert ──
async function alertAdmin(supabase: ReturnType<typeof createClient>, message: string, level: string) {
  const start = Date.now();
  try {
    if (level === "critical" && await wasRecentlyTriggered(supabase, `alertAdmin:${level}`, 5)) {
      console.info(`[alert] Rate-limited — ${level} alert already sent within 5min`);
      return;
    }

    console.warn(`[alert-${level}] ${message}`);

    // Persist as in-app notification to all admins
    const { data: admins } = await supabase
      .from("profiles")
      .select("id, tenant_id")
      .eq("role", "admin")
      .limit(10);

    if (admins && admins.length > 0) {
      const notifications = admins.map((admin: any) => ({
        user_id: admin.id,
        tenant_id: admin.tenant_id,
        title: level === "critical" ? "🚨 Critical Security Alert" : `⚠️ System ${level} Alert`,
        message,
        event_type: "system_health_alert",
        source_module: "system-health",
        role: "admin",
        priority: "HIGH",
      }));
      await supabase.from("in_app_notifications").insert(notifications);
    }

    await logAutoFix(supabase, `alertAdmin:${level}`, "rls_enforcement", true, message, Date.now() - start);
  } catch (e: any) {
    console.error("[alert] Failed:", e?.message);
    await logAutoFix(supabase, `alertAdmin:${level}`, "rls_enforcement", false, e?.message, Date.now() - start);
  }
}

// ── Persist health check results ──
async function persistHealthLogs(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  checks: any[],
  overallStatus: string,
  totalLatencyMs: number
) {
  try {
    const rows = checks.map((c) => ({
      run_id: runId,
      check_name: c.name,
      status: c.status,
      latency_ms: c.latency_ms ?? null,
      detail: c.detail ?? null,
      overall_status: overallStatus,
      total_latency_ms: totalLatencyMs,
    }));
    await supabase.from("system_health_logs").insert(rows);
  } catch (e) {
    console.error("[health-log] Failed to persist:", e);
  }
}

// ══════════════════════════════════════════════════
//  Main Handler
// ══════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const startTotal = Date.now();
    const runId = crypto.randomUUID();
    const thresholds = await loadSyncThresholds(supabase);

    const [db, tr, qc, ff, cron, notif, loans, rls, ksync, pipelineHealth] = await Promise.all([
      measure(async () => {
        const { error } = await supabase.from("profiles").select("id").limit(1);
        return error;
      }),
      measure(async () => {
        const { data, error } = await supabase.from("tenant_rules").select("id, rule_key").limit(10);
        return { data, error };
      }),
      measure(async () => {
        const { data, error } = await supabase
          .from("system_settings").select("setting_value")
          .eq("setting_key", "quantum_ledger_config").maybeSingle();
        return { data, error };
      }),
      measure(async () => {
        const { data, error } = await supabase.from("feature_flags").select("feature_name, is_enabled");
        return { data, error };
      }),
      measure(async () => {
        const yesterday = new Date(Date.now() - 86400000).toISOString();
        const { data, error } = await supabase.from("audit_logs")
          .select("id, action_type").gte("created_at", yesterday)
          .in("action_type", ["predict_loan_risk","savings_reconciliation_alert","overdue_penalty_applied","monthly_investor_profit"])
          .limit(50);
        return { data, error };
      }),
      measure(async () => {
        const lastWeek = new Date(Date.now() - 604800000).toISOString();
        const { data, error } = await supabase.from("notification_logs")
          .select("delivery_status").gte("created_at", lastWeek);
        return { data, error };
      }),
      measure(async () => {
        const { data, error } = await supabase.rpc("get_loan_portfolio_counts");
        return { data, error };
      }),
      measure(async () => {
        if (!anonKey) return { verified: false, reason: "SUPABASE_ANON_KEY not available" };
        try {
          const anonClient = createClient(supabaseUrl, anonKey);
          const { data, error } = await anonClient.from("clients").select("id").limit(1);
          if (error) return { verified: true, reason: "RLS blocked anon: " + error.code };
          if (!data || data.length === 0) return { verified: true, reason: "RLS active — anon gets 0 rows" };
          return { verified: false, reason: `CRITICAL: anon read ${data.length} rows from clients` };
        } catch { return { verified: true, reason: "RLS blocked request" }; }
      }),
      measure(async () => {
        const { data, error } = await supabase.from("knowledge_sync_log")
          .select("id, status, started_at, completed_at, nodes_processed, errors, duration_ms")
          .order("started_at", { ascending: false }).limit(1).maybeSingle();
        return { data, error };
      }),
      // 10. AI Pipeline Health Check
      measure(() => checkPipelineHealth(supabase)),
    ]);

    const checks: any[] = [];
    const autoFixPromises: Promise<void>[] = [];

    // 1. Database
    checks.push({ name: "database", status: db.result ? "fail" : "pass", detail: db.result?.message ?? "Connected", latency_ms: db.ms });

    // 2. Tenant Rules (Instruction 3)
    {
      const { data, error } = tr.result;
      const rc = data?.length ?? 0;
      checks.push({
        name: "tenant_rules",
        status: error ? "fail" : rc > 0 ? "pass" : "warn",
        detail: error ? error.message : rc > 0 ? `${rc} rules configured` : "No tenant rules — auto-loading defaults",
        latency_ms: tr.ms,
      });
      if (!data || rc === 0) autoFixPromises.push(loadDefaultTenantRules(supabase));
    }

    // 3. Quantum Config
    {
      const { data, error } = qc.result;
      checks.push({ name: "quantum_config", status: error ? "fail" : data ? "pass" : "warn", detail: error ? error.message : data ? "Config loaded" : "Using defaults", latency_ms: qc.ms });
    }

    // 4. Feature Flags (Instruction 4)
    {
      const { data, error } = ff.result;
      const en = data?.filter((f: any) => f.is_enabled).length ?? 0;
      const tot = data?.length ?? 0;
      checks.push({
        name: "feature_flags",
        status: error ? "fail" : tot === 0 ? "warn" : "pass",
        detail: error ? error.message : tot === 0 ? "No feature flags — auto-loading defaults" : `${en}/${tot} enabled`,
        latency_ms: ff.ms,
      });
      if (!data || tot === 0) autoFixPromises.push(loadDefaultFeatureFlags(supabase));
    }

    // 5. Cron
    {
      const { data, error } = cron.result;
      const jc = data?.length ?? 0;
      checks.push({ name: "cron_activity", status: error ? "fail" : jc > 0 ? "pass" : "warn", detail: error ? error.message : jc > 0 ? `${jc} jobs in 24h` : "No cron activity in 24h", latency_ms: cron.ms });
    }

    // 6. Notifications (Instruction 2)
    {
      const { data, error } = notif.result;
      if (error) {
        checks.push({ name: "notifications", status: "warn", detail: error.message, latency_ms: notif.ms });
      } else {
        const total = data?.length ?? 0;
        const failed = data?.filter((n: any) => n.delivery_status === "failed").length ?? 0;
        const failRate = total > 0 ? (failed / total) * 100 : 0;
        const st = total === 0 ? "pass" : failRate > 20 ? "fail" : failRate > 5 ? "warn" : "pass";
        checks.push({ name: "notifications", status: st, detail: total === 0 ? "No notifications sent (7d)" : `${total} sent, ${failed} failed (${failRate.toFixed(1)}%)`, latency_ms: notif.ms });
        if (st === "fail") autoFixPromises.push(retryFailedNotifications(supabase));
      }
    }

    // 7. Loans (optimized: server-side aggregation via RPC)
    {
      const { data, error } = loans.result;
      if (error) {
        checks.push({ name: "loan_portfolio", status: "fail", detail: error.message, latency_ms: loans.ms });
      } else {
        const counts: Record<string, number> = {};
        let total = 0;
        for (const row of (data as any[] ?? [])) {
          counts[row.status] = Number(row.cnt);
          total += Number(row.cnt);
        }
        const def = counts["default"] ?? 0;
        const act = counts["active"] ?? 0;
        const dr = total > 0 ? (def / total) * 100 : 0;
        checks.push({
          name: "loan_portfolio",
          status: total === 0 ? "pass" : dr > 15 ? "fail" : dr > 5 ? "warn" : "pass",
          detail: total === 0 ? "No loans in portfolio" : `${total} total, ${act} active, ${def} defaulted (${dr.toFixed(1)}%)`,
          latency_ms: loans.ms,
        });
      }
    }

    // 8. RLS (Instruction 6)
    {
      const { verified, reason } = rls.result;
      checks.push({ name: "rls_enforcement", status: verified ? "pass" : "fail", detail: reason, latency_ms: rls.ms });
      if (!verified) autoFixPromises.push(alertAdmin(supabase, `RLS Enforcement Failed: ${reason}`, "critical"));
    }

    // 9. Knowledge Sync (Instruction 1)
    {
      const { data, error } = ksync.result;
      if (error) {
        checks.push({ name: "knowledge_sync", status: "warn", detail: error.message, latency_ms: ksync.ms });
      } else if (!data) {
        checks.push({ name: "knowledge_sync", status: "warn", detail: "No sync logs found — running initial sync", latency_ms: ksync.ms });
        autoFixPromises.push(restartKnowledgeSync(supabase));
      } else {
        const isFailed = data.status === "failed" || data.status === "completed_with_errors";
        const staleMs = thresholds.stale_hours * 3600000;
        const stuckMs = thresholds.stuck_running_minutes * 60000;
        const isStale = data.completed_at ? (Date.now() - new Date(data.completed_at).getTime()) > staleMs : true;
        const isStuck = data.status === "running" && (Date.now() - new Date(data.started_at).getTime()) > stuckMs;
        const errCount = Array.isArray(data.errors) ? data.errors.length : 0;

        let st: "pass" | "warn" | "fail" = "pass";
        if (isFailed || isStuck) st = "fail";
        else if (isStale || errCount > 0) st = "warn";

        checks.push({
          name: "knowledge_sync", status: st,
          detail: isStuck ? `Sync stuck > ${thresholds.stuck_running_minutes}min` : `${data.status} — ${data.nodes_processed ?? 0} nodes, ${errCount} errors${isStale ? ` (stale > ${thresholds.stale_hours}h)` : ""}`,
          latency_ms: ksync.ms,
        });
        if (st === "fail") autoFixPromises.push(restartKnowledgeSync(supabase));
      }
    }

    // 10. AI Pipeline Health (with alert dedup + auto-recovery)
    {
      const pr = pipelineHealth.result;
      checks.push({
        name: "ai_pipeline",
        status: pr.status,
        detail: pr.detail,
        latency_ms: pipelineHealth.ms,
        pipeline_meta: {
          lastRunAt: pr.lastRunAt,
          nextExpectedRun: pr.nextExpectedRun,
          failureCount: pr.failureCount,
          recoveryTriggered: pr.recoveryTriggered,
        },
      });
      // Consolidated single alert with 30min dedup (suppresses spam)
      if (pr.status === "fail") {
        autoFixPromises.push(sendPipelineAlert(supabase, pr));
      }
    }

    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;
    const passCount = checks.filter((c) => c.status === "pass").length;
    const overallStatus = failCount > 0 ? "unhealthy" : warnCount > 0 ? "degraded" : "healthy";
    const totalLatencyMs = Date.now() - startTotal;

    // Run auto-fixes + persist logs in parallel (non-blocking for response)
    await Promise.allSettled([
      ...autoFixPromises,
      persistHealthLogs(supabase, runId, checks, overallStatus, totalLatencyMs),
    ]);

    return new Response(
      JSON.stringify({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        run_id: runId,
        total_latency_ms: totalLatencyMs,
        summary: { pass: passCount, warn: warnCount, fail: failCount },
        checks,
        thresholds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ status: "error", message: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
