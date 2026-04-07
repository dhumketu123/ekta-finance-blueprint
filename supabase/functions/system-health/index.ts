import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  latency_ms?: number;
}

interface SyncThresholds {
  stuck_running_minutes: number;
  stale_hours: number;
}

const DEFAULT_THRESHOLDS: SyncThresholds = {
  stuck_running_minutes: 10,
  stale_hours: 24,
};

function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now();
  return fn().then((result) => ({ result, ms: Date.now() - start }));
}

async function loadSyncThresholds(supabase: ReturnType<typeof createClient>): Promise<SyncThresholds> {
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
  } catch { /* use defaults */ }
  return DEFAULT_THRESHOLDS;
}

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
    const thresholds = await loadSyncThresholds(supabase);

    // ── Run ALL checks in parallel ──
    const [db, tr, qc, ff, cron, notif, loans, rls, ksync] = await Promise.all([
      // 1. Database Connectivity
      measure(async () => {
        const { error } = await supabase.from("profiles").select("id").limit(1);
        return error;
      }),
      // 2. Tenant Rules
      measure(async () => {
        const { data, error } = await supabase.from("tenant_rules").select("id, rule_key").limit(10);
        return { data, error };
      }),
      // 3. Quantum Ledger Config
      measure(async () => {
        const { data, error } = await supabase
          .from("system_settings")
          .select("setting_value")
          .eq("setting_key", "quantum_ledger_config")
          .maybeSingle();
        return { data, error };
      }),
      // 4. Feature Flags
      measure(async () => {
        const { data, error } = await supabase.from("feature_flags").select("feature_name, is_enabled");
        return { data, error };
      }),
      // 5. Cron Activity (24h)
      measure(async () => {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("audit_logs")
          .select("id, action_type")
          .gte("created_at", yesterday)
          .in("action_type", [
            "predict_loan_risk",
            "savings_reconciliation_alert",
            "overdue_penalty_applied",
            "monthly_investor_profit",
          ])
          .limit(50);
        return { data, error };
      }),
      // 6. Notification Delivery (7d)
      measure(async () => {
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from("notification_logs")
          .select("delivery_status")
          .gte("created_at", lastWeek);
        return { data, error };
      }),
      // 7. Loans Health
      measure(async () => {
        const { data, error } = await supabase
          .from("loans")
          .select("status")
          .is("deleted_at", null);
        return { data, error };
      }),
      // 8. RLS Enforcement
      measure(async () => {
        if (!anonKey) return { verified: false, reason: "SUPABASE_ANON_KEY not available" };
        try {
          const anonClient = createClient(supabaseUrl, anonKey);
          const { data, error } = await anonClient.from("clients").select("id").limit(1);
          if (error) return { verified: true, reason: "RLS blocked anon: " + error.code };
          if (!data || data.length === 0) return { verified: true, reason: "RLS active — anon gets 0 rows" };
          return { verified: false, reason: `CRITICAL: anon read ${data.length} rows from clients` };
        } catch {
          return { verified: true, reason: "RLS blocked request" };
        }
      }),
      // 9. Knowledge Sync
      measure(async () => {
        const { data, error } = await supabase
          .from("knowledge_sync_log")
          .select("id, status, started_at, completed_at, nodes_processed, errors, duration_ms")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return { data, error };
      }),
    ]);

    // ── Process results into checks ──
    const checks: HealthCheck[] = [];

    // 1. Database
    checks.push({
      name: "database",
      status: db.result ? "fail" : "pass",
      detail: db.result?.message ?? "Connected",
      latency_ms: db.ms,
    });

    // 2. Tenant Rules
    {
      const { data, error } = tr.result;
      const ruleCount = data?.length ?? 0;
      checks.push({
        name: "tenant_rules",
        status: error ? "fail" : ruleCount > 0 ? "pass" : "warn",
        detail: error
          ? error.message
          : ruleCount > 0
            ? `${ruleCount} rules configured`
            : "No tenant rules found — using defaults",
        latency_ms: tr.ms,
      });
    }

    // 3. Quantum Config
    {
      const { data, error } = qc.result;
      checks.push({
        name: "quantum_config",
        status: error ? "fail" : data ? "pass" : "warn",
        detail: error ? error.message : data ? "Config loaded" : "Using defaults",
        latency_ms: qc.ms,
      });
    }

    // 4. Feature Flags
    {
      const { data, error } = ff.result;
      const enabledCount = data?.filter((f: any) => f.is_enabled).length ?? 0;
      const totalCount = data?.length ?? 0;
      checks.push({
        name: "feature_flags",
        status: error ? "fail" : totalCount === 0 ? "warn" : "pass",
        detail: error
          ? error.message
          : totalCount === 0
            ? "No feature flags configured"
            : `${enabledCount}/${totalCount} enabled`,
        latency_ms: ff.ms,
      });
    }

    // 5. Cron Activity
    {
      const { data, error } = cron.result;
      const jobCount = data?.length ?? 0;
      checks.push({
        name: "cron_activity",
        status: error ? "fail" : jobCount > 0 ? "pass" : "warn",
        detail: error
          ? error.message
          : jobCount > 0
            ? `${jobCount} jobs in 24h`
            : "No cron activity in 24h",
        latency_ms: cron.ms,
      });
    }

    // 6. Notifications
    {
      const { data, error } = notif.result;
      if (error) {
        checks.push({ name: "notifications", status: "warn", detail: error.message, latency_ms: notif.ms });
      } else {
        const total = data?.length ?? 0;
        const failed = data?.filter((n: any) => n.delivery_status === "failed").length ?? 0;
        const failRate = total > 0 ? (failed / total) * 100 : 0;
        checks.push({
          name: "notifications",
          status: total === 0 ? "pass" : failRate > 20 ? "fail" : failRate > 5 ? "warn" : "pass",
          detail:
            total === 0
              ? "No notifications sent (7d)"
              : `${total} sent, ${failed} failed (${failRate.toFixed(1)}%)`,
          latency_ms: notif.ms,
        });
      }
    }

    // 7. Loans
    {
      const { data, error } = loans.result;
      if (error) {
        checks.push({ name: "loan_portfolio", status: "fail", detail: error.message, latency_ms: loans.ms });
      } else {
        const total = data?.length ?? 0;
        const defaulted = data?.filter((l: any) => l.status === "default").length ?? 0;
        const active = data?.filter((l: any) => l.status === "active").length ?? 0;
        const defaultRate = total > 0 ? (defaulted / total) * 100 : 0;
        checks.push({
          name: "loan_portfolio",
          status: total === 0 ? "pass" : defaultRate > 15 ? "fail" : defaultRate > 5 ? "warn" : "pass",
          detail:
            total === 0
              ? "No loans in portfolio"
              : `${total} total, ${active} active, ${defaulted} defaulted (${defaultRate.toFixed(1)}%)`,
          latency_ms: loans.ms,
        });
      }
    }

    // 8. RLS
    {
      const { verified, reason } = rls.result;
      checks.push({
        name: "rls_enforcement",
        status: verified ? "pass" : "fail",
        detail: reason,
        latency_ms: rls.ms,
      });
    }

    // 9. Knowledge Sync (configurable thresholds)
    {
      const { data, error } = ksync.result;
      if (error) {
        checks.push({ name: "knowledge_sync", status: "warn", detail: error.message, latency_ms: ksync.ms });
      } else if (!data) {
        checks.push({ name: "knowledge_sync", status: "warn", detail: "No sync logs found — run initial sync", latency_ms: ksync.ms });
      } else {
        const isFailed = data.status === "failed" || data.status === "completed_with_errors";
        const staleMs = thresholds.stale_hours * 60 * 60 * 1000;
        const stuckMs = thresholds.stuck_running_minutes * 60 * 1000;
        const isStale = data.completed_at
          ? (Date.now() - new Date(data.completed_at).getTime()) > staleMs
          : true;
        const isRunningTooLong = data.status === "running"
          && (Date.now() - new Date(data.started_at).getTime()) > stuckMs;
        const errCount = Array.isArray(data.errors) ? data.errors.length : 0;

        let status: "pass" | "warn" | "fail" = "pass";
        if (isFailed || isRunningTooLong) status = "fail";
        else if (isStale || errCount > 0) status = "warn";

        checks.push({
          name: "knowledge_sync",
          status,
          detail: isRunningTooLong
            ? `Sync stuck in running state > ${thresholds.stuck_running_minutes}min`
            : `${data.status} — ${data.nodes_processed ?? 0} nodes, ${errCount} errors${isStale ? ` (stale > ${thresholds.stale_hours}h)` : ""}`,
          latency_ms: ksync.ms,
        });
      }
    }

    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;
    const passCount = checks.filter((c) => c.status === "pass").length;

    const overallStatus = failCount > 0
      ? "unhealthy"
      : warnCount > 0
        ? "degraded"
        : "healthy";

    return new Response(
      JSON.stringify({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        total_latency_ms: Date.now() - startTotal,
        summary: { pass: passCount, warn: warnCount, fail: failCount },
        checks,
        thresholds,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: overallStatus === "unhealthy" ? 503 : 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ status: "error", message: String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
