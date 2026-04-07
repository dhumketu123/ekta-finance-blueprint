import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to verify auth & get tenant
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    // Get tenant_id
    const { data: profile } = await userClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();
    if (!profile?.tenant_id) throw new Error("No tenant found");
    const tenantId = profile.tenant_id;

    // Service client for schema introspection
    const svc = createClient(supabaseUrl, serviceKey);
    const startTime = Date.now();

    // Create sync log entry
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
    // 1. SCHEMA INGESTION — Tables & Columns
    // ═══════════════════════════════════════
    const { data: tables } = await svc.rpc("get_schema_tables");
    const tableList = tables || [];

    for (const t of tableList) {
      const tableName = t.table_name as string;
      const columns = (t.columns || []) as Array<Record<string, unknown>>;
      const fkeys = (t.foreign_keys || []) as Array<Record<string, unknown>>;

      const rels = fkeys.map((fk: Record<string, unknown>) => ({
        target_key: `table:${fk.referenced_table}`,
        relation_type: "foreign_key",
        weight: 8,
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
          columns: columns.map((c: Record<string, unknown>) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === "YES",
          })),
          has_rls: t.has_rls ?? false,
        },
        relationships: rels,
        criticality: ["clients", "investors", "loans", "transactions", "financial_transactions"].includes(tableName) ? 10 : 5,
      });
    }

    // ═══════════════════════════════════════
    // 2. TRIGGERS
    // ═══════════════════════════════════════
    const { data: triggers } = await svc.rpc("get_schema_triggers");
    for (const tr of triggers || []) {
      nodes.push({
        tenant_id: tenantId,
        node_type: "trigger",
        node_key: `trigger:${tr.trigger_name}`,
        node_label: tr.trigger_name as string,
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
        criticality: 7,
      });
    }

    // ═══════════════════════════════════════
    // 3. DB FUNCTIONS
    // ═══════════════════════════════════════
    const { data: funcs } = await svc.rpc("get_schema_functions");
    for (const fn of funcs || []) {
      nodes.push({
        tenant_id: tenantId,
        node_type: "function",
        node_key: `function:${fn.routine_name}`,
        node_label: fn.routine_name as string,
        category: "schema",
        metadata: {
          return_type: fn.data_type,
          security: fn.security_type,
          language: fn.routine_language || "plpgsql",
        },
        relationships: [],
        criticality: (fn.security_type === "DEFINER") ? 9 : 6,
      });
    }

    // ═══════════════════════════════════════
    // 4. FRONTEND COMPONENTS (Static Registry)
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
    // 5. HOOKS (Static Registry)
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
      "knowledge-sync", "daily-cron", "ledger-audit", "send-notification",
      "system-health", "server-time", "weekly-intelligence",
      "monthly-investor-profit", "monthly-commitment-export",
      "commitments-create", "commitments-reschedule", "commitments-reschedule-swipe",
    ];

    for (const ef of edgeFunctions) {
      nodes.push({
        tenant_id: tenantId,
        node_type: "edge_function",
        node_key: `edge:${ef}`,
        node_label: ef,
        category: "backend",
        metadata: { path: `supabase/functions/${ef}/index.ts` },
        relationships: [],
        criticality: ["daily-cron", "ledger-audit", "monthly-investor-profit"].includes(ef) ? 9 : 6,
      });
    }

    // ═══════════════════════════════════════
    // UPSERT ALL NODES
    // ═══════════════════════════════════════
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const node of nodes) {
      const { error } = await svc
        .from("system_knowledge_graph")
        .upsert(
          { ...node, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: "tenant_id,node_type,node_key" }
        );
      if (error) {
        errors.push(`${node.node_key}: ${error.message}`);
      } else {
        // Simplified: count all as created/updated
        created++;
      }
    }

    const durationMs = Date.now() - startTime;

    // Update sync log
    if (syncLogId) {
      await svc
        .from("knowledge_sync_log")
        .update({
          status: errors.length > 0 ? "completed" : "completed",
          nodes_processed: nodes.length,
          nodes_created: created,
          nodes_updated: updated,
          errors: errors,
          duration_ms: durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLogId);
    }

    const summary = {
      status: "✅ সম্পূর্ণ",
      total_nodes: nodes.length,
      tables: nodes.filter((n) => n.node_type === "table").length,
      triggers: nodes.filter((n) => n.node_type === "trigger").length,
      functions: nodes.filter((n) => n.node_type === "function").length,
      components: nodes.filter((n) => n.node_type === "component").length,
      hooks: nodes.filter((n) => n.node_type === "hook").length,
      business_rules: nodes.filter((n) => n.node_type === "business_rule").length,
      kpis: nodes.filter((n) => n.node_type === "kpi").length,
      edge_functions: nodes.filter((n) => n.node_type === "edge_function").length,
      errors: errors.length,
      duration_ms: durationMs,
      sync_log_id: syncLogId,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("knowledge-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
