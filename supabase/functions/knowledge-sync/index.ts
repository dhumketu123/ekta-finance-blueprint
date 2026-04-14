import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CRITICAL_TABLES = new Set([
  "clients", "investors", "loans", "transactions",
  "financial_transactions", "savings_accounts", "loan_schedules",
  "commitments", "double_entry_ledger", "profiles", "user_roles",
]);

const BATCH_SIZE = 100;
const MAX_DLQ_RETRIES = 3;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

/* ══════════════════════════════════════════
   BATCH UPSERT with DLQ
   ══════════════════════════════════════════ */
async function batchUpsertWithDLQ(
  svc: ReturnType<typeof createClient>,
  nodes: any[],
  tenantId: string,
): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];

  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const chunk = nodes.slice(i, i + BATCH_SIZE).map((n) => ({
      ...n,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await svc
      .from("system_knowledge_graph")
      .upsert(chunk, { onConflict: "tenant_id,node_type,node_key" });

    if (error) {
      const batchIdx = Math.floor(i / BATCH_SIZE);
      errors.push(`Batch ${batchIdx}: ${error.message}`);

      // Send failed chunk to DLQ
      const dlqRows = chunk.map((n) => ({
        tenant_id: tenantId,
        node_key: n.node_key,
        node_type: n.node_type,
        error_message: error.message,
        payload: n,
        retry_count: 0,
        max_retries: MAX_DLQ_RETRIES,
      }));

      await svc.from("knowledge_sync_dlq").insert(dlqRows).throwOnError().catch((dlqErr) => {
        console.error("[DLQ] Insert failed:", dlqErr);
      });
    } else {
      created += chunk.length;
    }
  }

  return { created, errors };
}

/* ══════════════════════════════════════════
   DLQ RETRY PROCESSOR
   ══════════════════════════════════════════ */
async function processDLQ(svc: ReturnType<typeof createClient>): Promise<{ retried: number; resolved: number; permanent: number }> {
  const { data: pending } = await svc
    .from("knowledge_sync_dlq")
    .select("*")
    .eq("resolved", false)
    .lt("retry_count", MAX_DLQ_RETRIES)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!pending?.length) return { retried: 0, resolved: 0, permanent: 0 };

  let resolved = 0;
  let permanent = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const payloads = batch.map((d: any) => ({
      ...d.payload,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await svc
      .from("system_knowledge_graph")
      .upsert(payloads, { onConflict: "tenant_id,node_type,node_key" });

    if (!error) {
      // Mark resolved
      const ids = batch.map((d: any) => d.id);
      await svc
        .from("knowledge_sync_dlq")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .in("id", ids);
      resolved += batch.length;
    } else {
      // Increment retry count
      for (const d of batch) {
        const newCount = (d.retry_count || 0) + 1;
        const updateData: any = {
          retry_count: newCount,
          last_retry_at: new Date().toISOString(),
          error_message: error.message,
        };
        if (newCount >= MAX_DLQ_RETRIES) {
          updateData.resolved = true;
          updateData.resolved_at = new Date().toISOString();
          permanent++;
        }
        await svc.from("knowledge_sync_dlq").update(updateData).eq("id", d.id);
      }
    }
  }

  return { retried: pending.length, resolved, permanent };
}

/* ══════════════════════════════════════════
   CLEANUP STALE SYNC LOGS
   ══════════════════════════════════════════ */
async function cleanupStaleLogs(svc: ReturnType<typeof createClient>, currentSyncLogId: string | null) {
  const { data: staleLogs } = await svc
    .from("knowledge_sync_log")
    .select("id")
    .eq("status", "running")
    .neq("id", currentSyncLogId || "")
    .lt("started_at", new Date(Date.now() - STALE_THRESHOLD_MS).toISOString());

  let fixed = 0;
  for (const stale of staleLogs || []) {
    await svc
      .from("knowledge_sync_log")
      .update({
        status: "completed_with_errors",
        completed_at: new Date().toISOString(),
        errors: ["Auto-resolved: stale running state"],
      })
      .eq("id", stale.id);
    fixed++;
  }
  return fixed;
}

/* ══════════════════════════════════════════
   NODE COLLECTORS
   ══════════════════════════════════════════ */
function collectStaticNodes(tenantId: string): any[] {
  const nodes: any[] = [];

  // Components
  const coreComponents = [
    { key: "AppLayout", label: "App Layout Shell", cat: "layout", crit: 10 },
    { key: "AppSidebar", label: "Sidebar Navigation", cat: "navigation", crit: 9 },
    { key: "BottomNav", label: "Mobile Bottom Nav", cat: "navigation", crit: 8 },
    { key: "ProtectedRoute", label: "Auth Guard", cat: "security", crit: 10 },
    { key: "AuthContext", label: "Authentication Context", cat: "security", crit: 10 },
    { key: "ClientForm", label: "Client Onboarding Form", cat: "forms", crit: 9 },
    { key: "InvestorForm", label: "Investor Form", cat: "forms", crit: 9 },
    { key: "BulkOnboarding", label: "Bulk Client Import", cat: "onboarding", crit: 8 },
    { key: "GovernanceCore", label: "Governance Dashboard", cat: "governance", crit: 8 },
    { key: "LoanPaymentModal", label: "Loan Payment Flow", cat: "transactions", crit: 9 },
    { key: "SavingsTransactionModal", label: "Savings Transaction Flow", cat: "transactions", crit: 9 },
    { key: "SmartCollectionAssistant", label: "AI Collection Assistant", cat: "ai", crit: 7 },
    { key: "CashflowOracleWidget", label: "Cashflow Prediction", cat: "ai", crit: 7 },
    { key: "NotificationBell", label: "Notification System", cat: "notifications", crit: 8 },
    { key: "TenantBrandingContext", label: "White-Label Branding", cat: "multi-tenant", crit: 9 },
    { key: "KnowledgeDashboard", label: "AI Knowledge Dashboard", cat: "ai", crit: 8 },
  ];
  for (const c of coreComponents) {
    nodes.push({
      tenant_id: tenantId, node_type: "component",
      node_key: `component:${c.key}`, node_label: c.label,
      category: c.cat, metadata: { source: `src/components/${c.key}` },
      relationships: [], criticality: c.crit,
    });
  }

  // Hooks
  const coreHooks = [
    { key: "useSupabaseData", label: "Core Data Fetcher", deps: ["clients", "investors", "loans"], crit: 10 },
    { key: "useTenantId", label: "Tenant Resolver", deps: ["profiles"], crit: 10 },
    { key: "usePermissions", label: "Role Permission Guard", deps: ["user_roles"], crit: 10 },
    { key: "useFinancialTransactions", label: "Financial TX Manager", deps: ["financial_transactions"], crit: 9 },
    { key: "useCommitments", label: "Commitment Manager", deps: ["commitments"], crit: 8 },
    { key: "useCashflowOracle", label: "Cashflow Predictions", deps: ["transactions", "loans"], crit: 7 },
    { key: "useNotifications", label: "Notification Engine", deps: ["in_app_notifications"], crit: 8 },
    { key: "useDayClose", label: "Day Close Process", deps: ["daily_user_close"], crit: 9 },
    { key: "useInvestorTransactions", label: "Investor TX Manager", deps: ["investor_weekly_transactions"], crit: 8 },
    { key: "useTenantConfig", label: "Tenant Config", deps: ["tenant_settings"], crit: 9 },
    { key: "useKnowledgeGraph", label: "Knowledge Graph Manager", deps: ["system_knowledge_graph", "knowledge_sync_log"], crit: 8 },
  ];
  for (const h of coreHooks) {
    nodes.push({
      tenant_id: tenantId, node_type: "hook",
      node_key: `hook:${h.key}`, node_label: h.label,
      category: "frontend", metadata: { source: `src/hooks/${h.key}.ts` },
      relationships: h.deps.map((d) => ({ target_key: `table:${d}`, relation_type: "queries", weight: 8 })),
      criticality: h.crit,
    });
  }

  // Business Rules
  const businessRules = [
    { key: "cross_role_phone_guard", label: "Cross-Role Phone Duplicate Prevention", crit: 10 },
    { key: "canonical_phone_format", label: "BD Phone Format Validation (01XXXXXXXXX)", crit: 10 },
    { key: "tenant_isolation", label: "Multi-Tenant Data Isolation", crit: 10 },
    { key: "rls_enforcement", label: "Row-Level Security Enforcement", crit: 10 },
    { key: "append_only_ledger", label: "Immutable Ledger Entries", crit: 10 },
    { key: "maker_checker", label: "Dual Approval for Transactions", crit: 9 },
    { key: "overdue_penalty_calc", label: "Automated Penalty Calculation", crit: 8 },
    { key: "investor_profit_dist", label: "Monthly Investor Profit Distribution", crit: 9 },
    { key: "trust_scoring", label: "Client Trust Score Engine", crit: 7 },
    { key: "day_close_reconciliation", label: "Daily Cash Reconciliation", crit: 9 },
  ];
  for (const br of businessRules) {
    nodes.push({
      tenant_id: tenantId, node_type: "business_rule",
      node_key: `rule:${br.key}`, node_label: br.label,
      category: "business_logic", metadata: {}, relationships: [], criticality: br.crit,
    });
  }

  // KPIs
  const kpis = [
    { key: "total_loan_portfolio", label: "Total Loan Portfolio", crit: 10 },
    { key: "npl_ratio", label: "Non-Performing Loan Ratio", crit: 10 },
    { key: "collection_rate", label: "Daily Collection Rate", crit: 9 },
    { key: "onboarding_success", label: "Onboarding Success Rate", crit: 8 },
    { key: "investor_roi", label: "Investor ROI", crit: 9 },
    { key: "savings_growth", label: "Savings Growth Rate", crit: 8 },
    { key: "overdue_count", label: "Active Overdue Count", crit: 9 },
    { key: "day_close_variance", label: "Day Close Cash Variance", crit: 8 },
  ];
  for (const kpi of kpis) {
    nodes.push({
      tenant_id: tenantId, node_type: "kpi",
      node_key: `kpi:${kpi.key}`, node_label: kpi.label,
      category: "metrics", metadata: {}, relationships: [], criticality: kpi.crit,
    });
  }

  // Edge Functions
  const edgeFunctions = [
    { name: "knowledge-sync", crit: 8 }, { name: "daily-cron", crit: 9 },
    { name: "ledger-audit", crit: 9 }, { name: "send-notification", crit: 7 },
    { name: "system-health", crit: 8 }, { name: "server-time", crit: 7 },
    { name: "weekly-intelligence", crit: 8 }, { name: "monthly-investor-profit", crit: 9 },
    { name: "monthly-commitment-export", crit: 7 }, { name: "commitments-create", crit: 8 },
    { name: "commitments-reschedule", crit: 7 }, { name: "commitments-reschedule-swipe", crit: 7 },
  ];
  for (const ef of edgeFunctions) {
    nodes.push({
      tenant_id: tenantId, node_type: "edge_function",
      node_key: `edge:${ef.name}`, node_label: ef.name,
      category: "backend", metadata: { path: `supabase/functions/${ef.name}/index.ts` },
      relationships: [], criticality: Math.max(6, ef.crit),
    });
  }

  return nodes;
}

async function collectDynamicNodes(
  svc: ReturnType<typeof createClient>,
  tenantId: string,
): Promise<{ nodes: any[]; errors: string[] }> {
  const nodes: any[] = [];
  const errors: string[] = [];

  // 1. Tables
  try {
    const { data: tables, error } = await svc.rpc("get_schema_tables");
    if (error) throw error;
    for (const t of (tables || []) as any[]) {
      const tableName = t.table_name as string;
      const columns = (t.columns || []) as any[];
      const fkeys = (t.foreign_keys || []) as any[];
      const isCritical = CRITICAL_TABLES.has(tableName);

      nodes.push({
        tenant_id: tenantId, node_type: "table",
        node_key: `table:${tableName}`, node_label: tableName,
        category: "schema",
        metadata: {
          column_count: columns.length,
          columns: columns.map((c: any) => ({
            name: c.column_name, type: c.data_type, nullable: c.is_nullable === "YES",
          })),
          has_rls: t.has_rls ?? false, fk_count: fkeys.length,
        },
        relationships: fkeys.map((fk: any) => ({
          target_key: `table:${fk.referenced_table}`,
          relation_type: "foreign_key",
          weight: CRITICAL_TABLES.has(fk.referenced_table as string) ? 10 : 8,
          column: fk.column_name, referenced_column: fk.referenced_column,
        })),
        criticality: isCritical ? 10 : 5,
      });
    }
  } catch (e: any) {
    errors.push(`Tables: ${e.message}`);
  }

  // 2. Triggers
  try {
    const { data: triggers, error } = await svc.rpc("get_schema_triggers");
    if (error) throw error;
    for (const tr of (triggers || []) as any[]) {
      nodes.push({
        tenant_id: tenantId, node_type: "trigger",
        node_key: `trigger:${tr.trigger_name}`, node_label: tr.trigger_name,
        category: "schema",
        metadata: {
          event: tr.event_manipulation, timing: tr.action_timing,
          table: tr.event_object_table, function: tr.action_statement,
        },
        relationships: [
          { target_key: `table:${tr.event_object_table}`, relation_type: "attached_to", weight: 9 },
        ],
        criticality: CRITICAL_TABLES.has(tr.event_object_table) ? 9 : 7,
      });
    }
  } catch (e: any) {
    errors.push(`Triggers: ${e.message}`);
  }

  // 3. Functions (with parallel dependency fetch)
  try {
    const { data: funcs, error } = await svc.rpc("get_schema_functions");
    if (error) throw error;

    // Batch dependency lookups in parallel (groups of 10)
    const funcList = (funcs || []) as any[];
    for (let i = 0; i < funcList.length; i += 10) {
      const batch = funcList.slice(i, i + 10);
      const depResults = await Promise.allSettled(
        batch.map((fn: any) =>
          svc.rpc("get_function_dependencies", { _function_name: fn.routine_name })
        ),
      );

      for (let j = 0; j < batch.length; j++) {
        const fn = batch[j];
        const depResult = depResults[j];
        let deps: string[] = [];
        if (depResult.status === "fulfilled" && !depResult.value.error) {
          deps = (depResult.value.data || []) as string[];
        }

        const isSecurityDefiner = fn.security_type === "DEFINER";
        nodes.push({
          tenant_id: tenantId, node_type: "function",
          node_key: `function:${fn.routine_name}`, node_label: fn.routine_name,
          category: "schema",
          metadata: {
            return_type: fn.data_type, security: fn.security_type,
            language: fn.routine_language || "plpgsql", dependency_count: deps.length,
          },
          relationships: deps.map((tableName: string) => ({
            target_key: `table:${tableName}`,
            relation_type: "depends_on",
            weight: CRITICAL_TABLES.has(tableName) ? 10 : 9,
          })),
          criticality: isSecurityDefiner ? 9 : Math.max(6, Math.min(deps.length + 5, 10)),
        });
      }
    }
  } catch (e: any) {
    errors.push(`Functions: ${e.message}`);
  }

  return { nodes, errors };
}

/* ══════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════ */
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Resolve tenant ──
    let tenantId: string;
    const authHeader = req.headers.get("Authorization");
    let authenticatedUser = false;

    if (authHeader) {
      try {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: authErr } = await userClient.auth.getUser();
        if (!authErr && user) {
          const { data: profile } = await userClient
            .from("profiles").select("tenant_id").eq("id", user.id).single();
          if (profile?.tenant_id) {
            tenantId = profile.tenant_id;
            authenticatedUser = true;
          }
        }
      } catch (_) { /* fall through to cron mode */ }
    }

    if (!authenticatedUser) {
      const svcTmp = createClient(supabaseUrl, serviceKey);
      const { data: firstTenant } = await svcTmp
        .from("tenants").select("id").limit(1).single();
      if (!firstTenant?.id) throw new Error("No tenant found for cron sync");
      tenantId = firstTenant.id;
    }

    const svc = createClient(supabaseUrl, serviceKey);
    const startTime = Date.now();

    // ── Create sync log ──
    const { data: syncLog } = await svc
      .from("knowledge_sync_log")
      .insert({ tenant_id: tenantId, sync_type: "full", status: "running" })
      .select("id").single();
    const syncLogId = syncLog?.id;

    // ── Collect nodes (parallel: static + dynamic) ──
    const [staticNodes, dynamicResult] = await Promise.all([
      Promise.resolve(collectStaticNodes(tenantId!)),
      collectDynamicNodes(svc, tenantId!),
    ]);

    const allNodes = [...staticNodes, ...dynamicResult.nodes];
    const collectionErrors = [...dynamicResult.errors];

    // ── Deduplicate ──
    const uniqueNodes = Array.from(
      new Map(allNodes.map((n) => [n.node_key, n])).values(),
    );

    // ── Batch upsert with DLQ ──
    const { created, errors: upsertErrors } = await batchUpsertWithDLQ(svc, uniqueNodes, tenantId!);
    const allErrors = [...collectionErrors, ...upsertErrors];

    // ── Process DLQ (retry previous failures) ──
    const dlqResult = await processDLQ(svc);

    // ── Cleanup stale logs ──
    const staleFixed = await cleanupStaleLogs(svc, syncLogId);

    const durationMs = Date.now() - startTime;

    // ── Finalize sync log ──
    if (syncLogId) {
      await svc.from("knowledge_sync_log").update({
        status: allErrors.length > 0 ? "completed_with_errors" : "completed",
        nodes_processed: uniqueNodes.length,
        nodes_created: created,
        nodes_updated: 0,
        errors: allErrors,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      }).eq("id", syncLogId);
    }

    return new Response(
      JSON.stringify({
        status: "✅ সম্পূর্ণ",
        fixes_applied: [
          "Batch processing (chunk 100)",
          "Dead Letter Queue for failures",
          "DLQ retry processor",
          "Parallel dependency fetching",
          "Stale log cleanup",
        ],
        total_nodes: uniqueNodes.length,
        deduplicated_from: allNodes.length,
        tables: uniqueNodes.filter((n) => n.node_type === "table").length,
        triggers: uniqueNodes.filter((n) => n.node_type === "trigger").length,
        functions: uniqueNodes.filter((n) => n.node_type === "function").length,
        components: uniqueNodes.filter((n) => n.node_type === "component").length,
        hooks: uniqueNodes.filter((n) => n.node_type === "hook").length,
        business_rules: uniqueNodes.filter((n) => n.node_type === "business_rule").length,
        kpis: uniqueNodes.filter((n) => n.node_type === "kpi").length,
        edge_functions: uniqueNodes.filter((n) => n.node_type === "edge_function").length,
        stale_logs_fixed: staleFixed,
        dlq: dlqResult,
        errors: allErrors.length,
        duration_ms: durationMs,
        sync_log_id: syncLogId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("knowledge-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
