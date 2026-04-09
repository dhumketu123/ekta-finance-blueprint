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

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    let tenantId: string;

    const authHeader = req.headers.get("Authorization");
    const isCronCall = !authHeader || authHeader === `Bearer ${anonKey}`;

    if (isCronCall) {
      // Cron/service call — use the first tenant
      const svcTmp = createClient(supabaseUrl, serviceKey);
      const { data: firstTenant } = await svcTmp
        .from("tenants")
        .select("id")
        .limit(1)
        .single();
      if (!firstTenant?.id) throw new Error("No tenant found for cron sync");
      tenantId = firstTenant.id;
    } else {
      // User-initiated call — validate auth
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) throw new Error("Unauthorized");

      const { data: profile } = await userClient
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();
      if (!profile?.tenant_id) throw new Error("No tenant found");
      tenantId = profile.tenant_id;
    }

    const svc = createClient(supabaseUrl, serviceKey);
    const startTime = Date.now();

    // Create sync log
    const { data: syncLog } = await svc
      .from("knowledge_sync_log")
      .insert({ tenant_id: tenantId, sync_type: "full", status: "running" })
      .select("id")
      .single();
    const syncLogId = syncLog?.id;

    const nodes: Array<{
      tenant_id: string;
      node_type: string;
      node_key: string;
      node_label: string;
      category: string;
      metadata: Record<string, unknown>;
      relationships: Array<Record<string, unknown>>;
      criticality: number;
    }> = [];

    // ═══════════════════════════════════════
    // 1. TABLES — Dynamic FK Weight
    // ═══════════════════════════════════════
    const { data: tables } = await svc.rpc("get_schema_tables");
    for (const t of (tables || []) as any[]) {
      const tableName = t.table_name as string;
      const columns = (t.columns || []) as any[];
      const fkeys = (t.foreign_keys || []) as any[];
      const isCritical = CRITICAL_TABLES.has(tableName);

      const rels = fkeys.map((fk: any) => ({
        target_key: `table:${fk.referenced_table}`,
        relation_type: "foreign_key",
        weight: CRITICAL_TABLES.has(fk.referenced_table as string) ? 10 : 8,
        column: fk.column_name,
        referenced_column: fk.referenced_column,
      }));

      nodes.push({
        tenant_id: tenantId,
        node_type: "table",
        node_key: `table:${tableName}`,
        node_label: tableName,
        category: "schema",
        metadata: {
          column_count: columns.length,
          columns: columns.map((c: any) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === "YES",
          })),
          has_rls: t.has_rls ?? false,
          fk_count: fkeys.length,
        },
        relationships: rels,
        criticality: isCritical ? 10 : 5,
      });
    }

    // ═══════════════════════════════════════
    // 2. TRIGGERS
    // ═══════════════════════════════════════
    const { data: triggers } = await svc.rpc("get_schema_triggers");
    for (const tr of (triggers || []) as any[]) {
      nodes.push({
        tenant_id: tenantId,
        node_type: "trigger",
        node_key: `trigger:${tr.trigger_name}`,
        node_label: tr.trigger_name,
        category: "schema",
        metadata: {
          event: tr.event_manipulation,
          timing: tr.action_timing,
          table: tr.event_object_table,
          function: tr.action_statement,
        },
        relationships: [
          { target_key: `table:${tr.event_object_table}`, relation_type: "attached_to", weight: 9 },
        ],
        criticality: CRITICAL_TABLES.has(tr.event_object_table) ? 9 : 7,
      });
    }

    // ═══════════════════════════════════════
    // 3. FUNCTIONS — with Dependency Mapping
    // ═══════════════════════════════════════
    const { data: funcs } = await svc.rpc("get_schema_functions");
    for (const fn of (funcs || []) as any[]) {
      // Get function dependencies
      let deps: string[] = [];
      try {
        const { data: depData, error: depErr } = await svc.rpc("get_function_dependencies", {
          _function_name: fn.routine_name,
        });
        if (depErr) console.warn(`Dependency fetch failed for ${fn.routine_name}: ${depErr.message}`);
        deps = (depData || []) as string[];
      } catch (err) {
        console.error(`Unexpected dependency error for ${fn.routine_name}:`, err);
      }

      const rels = deps.map((tableName: string) => ({
        target_key: `table:${tableName}`,
        relation_type: "depends_on",
        weight: CRITICAL_TABLES.has(tableName) ? 10 : 9,
      }));

      const isSecurityDefiner = fn.security_type === "DEFINER";
      nodes.push({
        tenant_id: tenantId,
        node_type: "function",
        node_key: `function:${fn.routine_name}`,
        node_label: fn.routine_name,
        category: "schema",
        metadata: {
          return_type: fn.data_type,
          security: fn.security_type,
          language: fn.routine_language || "plpgsql",
          dependency_count: deps.length,
        },
        relationships: rels,
        criticality: isSecurityDefiner ? 9 : Math.max(6, Math.min(deps.length + 5, 10)),
      });
    }

    // ═══════════════════════════════════════
    // 4. COMPONENTS (Static Registry)
    // ═══════════════════════════════════════
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
        tenant_id: tenantId,
        node_type: "component",
        node_key: `component:${c.key}`,
        node_label: c.label,
        category: c.cat,
        metadata: { source: `src/components/${c.key}` },
        relationships: [],
        criticality: c.crit,
      });
    }

    // ═══════════════════════════════════════
    // 5. HOOKS
    // ═══════════════════════════════════════
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
        tenant_id: tenantId,
        node_type: "hook",
        node_key: `hook:${h.key}`,
        node_label: h.label,
        category: "frontend",
        metadata: { source: `src/hooks/${h.key}.ts` },
        relationships: h.deps.map((d) => ({
          target_key: `table:${d}`,
          relation_type: "queries",
          weight: 8,
        })),
        criticality: h.crit,
      });
    }

    // ═══════════════════════════════════════
    // 6. BUSINESS RULES & KPIs
    // ═══════════════════════════════════════
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
        tenant_id: tenantId,
        node_type: "business_rule",
        node_key: `rule:${br.key}`,
        node_label: br.label,
        category: "business_logic",
        metadata: {},
        relationships: [],
        criticality: br.crit,
      });
    }

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
        tenant_id: tenantId,
        node_type: "kpi",
        node_key: `kpi:${kpi.key}`,
        node_label: kpi.label,
        category: "metrics",
        metadata: {},
        relationships: [],
        criticality: kpi.crit,
      });
    }

    // ═══════════════════════════════════════
    // 7. EDGE FUNCTIONS
    // ═══════════════════════════════════════
    const edgeFunctions = [
      { name: "knowledge-sync", crit: 8 },
      { name: "daily-cron", crit: 9 },
      { name: "ledger-audit", crit: 9 },
      { name: "send-notification", crit: 7 },
      { name: "system-health", crit: 8 },
      { name: "server-time", crit: 7 },
      { name: "weekly-intelligence", crit: 8 },
      { name: "monthly-investor-profit", crit: 9 },
      { name: "monthly-commitment-export", crit: 7 },
      { name: "commitments-create", crit: 8 },
      { name: "commitments-reschedule", crit: 7 },
      { name: "commitments-reschedule-swipe", crit: 7 },
    ];

    for (const ef of edgeFunctions) {
      nodes.push({
        tenant_id: tenantId,
        node_type: "edge_function",
        node_key: `edge:${ef.name}`,
        node_label: ef.name,
        category: "backend",
        metadata: { path: `supabase/functions/${ef.name}/index.ts` },
        relationships: [],
        criticality: Math.max(6, ef.crit), // Fix 5: Minimum criticality 6 for edge functions
      });
    }

    // ═══════════════════════════════════════
    // UPSERT ALL NODES
    // ═══════════════════════════════════════
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    // Batch upsert in chunks of 25
    const chunkSize = 25;
    for (let i = 0; i < nodes.length; i += chunkSize) {
      const chunk = nodes.slice(i, i + chunkSize).map((n) => ({
        ...n,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await svc
        .from("system_knowledge_graph")
        .upsert(chunk, { onConflict: "tenant_id,node_type,node_key" });

      if (error) {
        errors.push(`Batch ${Math.floor(i / chunkSize)}: ${error.message}`);
      } else {
        created += chunk.length;
      }
    }

    // ═══════════════════════════════════════
    // FIX 3: Stale "running" sync logs cleanup
    // ═══════════════════════════════════════
    const { data: staleLogs } = await svc
      .from("knowledge_sync_log")
      .select("id")
      .eq("status", "running")
      .neq("id", syncLogId || "")
      .lt("started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

    for (const stale of staleLogs || []) {
      await svc
        .from("knowledge_sync_log")
        .update({
          status: "completed_with_errors",
          completed_at: new Date().toISOString(),
          errors: ["Auto-resolved: stale running state"],
        })
        .eq("id", stale.id);
    }

    const durationMs = Date.now() - startTime;

    // Finalize sync log
    if (syncLogId) {
      await svc
        .from("knowledge_sync_log")
        .update({
          status: errors.length > 0 ? "completed_with_errors" : "completed",
          nodes_processed: nodes.length,
          nodes_created: created,
          nodes_updated: updated,
          errors,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLogId);
    }

    return new Response(
      JSON.stringify({
        status: "✅ সম্পূর্ণ",
        fixes_applied: [
          "Dynamic FK weight adjustment",
          "Function dependency mapping",
          "Stale sync log cleanup",
          "Criticality normalization (min 6 for edge functions)",
          "Batch upsert optimization",
        ],
        total_nodes: nodes.length,
        tables: nodes.filter((n) => n.node_type === "table").length,
        triggers: nodes.filter((n) => n.node_type === "trigger").length,
        functions: nodes.filter((n) => n.node_type === "function").length,
        components: nodes.filter((n) => n.node_type === "component").length,
        hooks: nodes.filter((n) => n.node_type === "hook").length,
        business_rules: nodes.filter((n) => n.node_type === "business_rule").length,
        kpis: nodes.filter((n) => n.node_type === "kpi").length,
        edge_functions: nodes.filter((n) => n.node_type === "edge_function").length,
        stale_logs_fixed: (staleLogs || []).length,
        errors: errors.length,
        duration_ms: durationMs,
        sync_log_id: syncLogId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("knowledge-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
