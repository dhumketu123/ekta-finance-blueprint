import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Edge Function Registry ──
const EDGE_FUNCTIONS = [
  {
    entity_name: "system-health",
    description: "Runs 9 health checks (DB, RLS, cron, notifications, loans, knowledge sync, etc.) with auto-fix capabilities",
    metadata: {
      triggers: ["manual", "cron", "dashboard"],
      tables_used: ["profiles", "tenant_rules", "system_settings", "feature_flags", "audit_logs", "notification_logs", "loans", "clients", "knowledge_sync_log", "system_health_logs", "auto_fix_logs", "in_app_notifications"],
      auto_fix_capable: true,
      criticality_level: "critical",
    },
  },
  {
    entity_name: "send-notification",
    description: "Dispatches notifications via SMS, in-app, and other channels with retry logic",
    metadata: {
      triggers: ["rpc", "edge_function"],
      tables_used: ["notification_logs", "in_app_notifications"],
      auto_fix_capable: false,
      criticality_level: "high",
    },
  },
  {
    entity_name: "knowledge-sync",
    description: "Syncs system knowledge graph by introspecting DB schema, functions, and dependencies",
    metadata: {
      triggers: ["manual", "auto-fix", "cron"],
      tables_used: ["knowledge_sync_log", "system_knowledge_graph"],
      auto_fix_capable: true,
      criticality_level: "high",
    },
  },
  {
    entity_name: "daily-cron",
    description: "Nightly automation: overdue penalties, savings reconciliation, risk scoring",
    metadata: {
      triggers: ["pg_cron"],
      tables_used: ["loans", "loan_schedules", "savings_accounts", "client_risk", "audit_logs"],
      auto_fix_capable: false,
      criticality_level: "critical",
    },
  },
  {
    entity_name: "monthly-investor-profit",
    description: "Calculates and distributes monthly profit to investors based on share percentage",
    metadata: {
      triggers: ["pg_cron", "manual"],
      tables_used: ["investors", "investor_weekly_transactions", "audit_logs"],
      auto_fix_capable: false,
      criticality_level: "critical",
    },
  },
  {
    entity_name: "ledger-audit",
    description: "Verifies SHA256 hash chain integrity of the quantum ledger",
    metadata: {
      triggers: ["manual", "cron"],
      tables_used: ["ledger_entries", "event_sourcing"],
      auto_fix_capable: false,
      criticality_level: "critical",
    },
  },
  {
    entity_name: "commitments-create",
    description: "Creates field officer commitments with audit hash signatures",
    metadata: {
      triggers: ["api"],
      tables_used: ["commitments", "clients"],
      auto_fix_capable: false,
      criticality_level: "medium",
    },
  },
  {
    entity_name: "commitments-reschedule",
    description: "Reschedules commitments with reason tracking and analytics",
    metadata: {
      triggers: ["api"],
      tables_used: ["commitments", "commitment_analytics"],
      auto_fix_capable: false,
      criticality_level: "medium",
    },
  },
  {
    entity_name: "server-time",
    description: "Authoritative Asia/Dhaka server time for financial operations",
    metadata: {
      triggers: ["api"],
      tables_used: [],
      auto_fix_capable: false,
      criticality_level: "low",
    },
  },
  {
    entity_name: "weekly-intelligence",
    description: "Generates weekly executive intelligence reports",
    metadata: {
      triggers: ["pg_cron"],
      tables_used: ["executive_reports", "loans", "clients", "financial_transactions"],
      auto_fix_capable: false,
      criticality_level: "medium",
    },
  },
  {
    entity_name: "monthly-commitment-export",
    description: "Exports monthly commitment data for reporting",
    metadata: {
      triggers: ["pg_cron", "manual"],
      tables_used: ["commitments", "executive_reports"],
      auto_fix_capable: false,
      criticality_level: "low",
    },
  },
  {
    entity_name: "populate-system-dna",
    description: "Self-indexing function that populates the system_dna table with application architecture metadata",
    metadata: {
      triggers: ["manual"],
      tables_used: ["system_dna", "tenant_rules", "feature_flags", "system_settings"],
      auto_fix_capable: false,
      criticality_level: "high",
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const stats = { tables: 0, edge_functions: 0, business_rules: 0, feature_flags: 0, errors: [] as string[] };

    // ═══════════════════════════════════════
    // STEP 2: Index database tables
    // ═══════════════════════════════════════
    const { data: tables, error: tablesErr } = await supabase.rpc("get_public_tables_info");

    if (tablesErr) {
      // Fallback: query information_schema directly via a simpler approach
      const { data: rawTables } = await supabase
        .from("system_knowledge_graph")
        .select("node_name, node_type, metadata")
        .eq("node_type", "table");

      if (rawTables && rawTables.length > 0) {
        const rows = rawTables.map((t: { node_name: string; metadata: Record<string, unknown> }) => ({
          category: "database_table",
          entity_name: t.node_name,
          description: `Database table: ${t.node_name}`,
          metadata: t.metadata || {},
        }));

        for (const row of rows) {
          const { error } = await supabase
            .from("system_dna")
            .upsert(row, { onConflict: "category,entity_name" });
          if (!error) stats.tables++;
          else stats.errors.push(`table:${row.entity_name}: ${error.message}`);
        }
      }
    } else if (tables) {
      for (const t of tables) {
        const row = {
          category: "database_table",
          entity_name: t.table_name,
          description: `Database table: ${t.table_name} (${t.column_count} columns)`,
          metadata: {
            columns: t.columns || [],
            primary_keys: t.primary_keys || [],
            foreign_keys: t.foreign_keys || [],
            rls_enabled: t.rls_enabled ?? false,
            row_estimate: t.row_estimate ?? 0,
          },
        };
        const { error } = await supabase
          .from("system_dna")
          .upsert(row, { onConflict: "category,entity_name" });
        if (!error) stats.tables++;
        else stats.errors.push(`table:${row.entity_name}: ${error.message}`);
      }
    }

    // If we got 0 from RPC, fallback to knowledge graph nodes
    if (stats.tables === 0) {
      // Hard-code known tables as ultimate fallback
      const knownTables = [
        "profiles", "clients", "loans", "loan_schedules", "loan_products",
        "savings_accounts", "savings_products", "savings_transactions",
        "investors", "investor_weekly_transactions",
        "financial_transactions", "double_entry_ledger", "ledger_entries",
        "account_balances", "chart_of_accounts", "journal_rules",
        "commitments", "commitment_analytics",
        "audit_logs", "auto_fix_logs", "event_sourcing",
        "notification_logs", "in_app_notifications", "digest_queue",
        "tenant_rules", "tenants", "branches", "accounts",
        "feature_flags", "system_settings", "system_health_logs",
        "knowledge_sync_log", "client_risk", "credit_scores",
        "communication_logs", "daily_financial_summary", "daily_user_close",
        "executive_reports", "governance_action_logs", "accounting_periods",
        "advance_buffer", "system_dna",
      ];

      for (const tbl of knownTables) {
        const { error } = await supabase
          .from("system_dna")
          .upsert({
            category: "database_table",
            entity_name: tbl,
            description: `Database table: ${tbl}`,
            metadata: { source: "hardcoded_fallback" },
          }, { onConflict: "category,entity_name" });
        if (!error) stats.tables++;
      }
    }

    // ═══════════════════════════════════════
    // STEP 3: Index edge functions
    // ═══════════════════════════════════════
    for (const fn of EDGE_FUNCTIONS) {
      const { error } = await supabase
        .from("system_dna")
        .upsert({
          category: "edge_function",
          entity_name: fn.entity_name,
          description: fn.description,
          metadata: fn.metadata,
        }, { onConflict: "category,entity_name" });
      if (!error) stats.edge_functions++;
      else stats.errors.push(`edge_fn:${fn.entity_name}: ${error.message}`);
    }

    // ═══════════════════════════════════════
    // STEP 4: Index business rules
    // ═══════════════════════════════════════

    // 4a: Tenant rules
    const { data: tenantRules } = await supabase
      .from("tenant_rules")
      .select("rule_key, rule_value, description");

    if (tenantRules) {
      for (const rule of tenantRules) {
        const { error } = await supabase
          .from("system_dna")
          .upsert({
            category: "business_rule",
            entity_name: `tenant_rule:${rule.rule_key}`,
            description: rule.description || `Tenant rule: ${rule.rule_key}`,
            metadata: {
              source: "tenant_rules",
              value: rule.rule_value,
              impact_scope: "tenant",
              auto_fix: false,
            },
          }, { onConflict: "category,entity_name" });
        if (!error) stats.business_rules++;
      }
    }

    // 4b: Feature flags
    const { data: flags } = await supabase
      .from("feature_flags")
      .select("feature_name, is_enabled, description, enabled_for_role");

    if (flags) {
      for (const flag of flags) {
        const { error } = await supabase
          .from("system_dna")
          .upsert({
            category: "feature_flag",
            entity_name: flag.feature_name,
            description: flag.description || `Feature: ${flag.feature_name}`,
            metadata: {
              is_enabled: flag.is_enabled,
              enabled_for_role: flag.enabled_for_role,
              source: "feature_flags",
            },
          }, { onConflict: "category,entity_name" });
        if (!error) stats.feature_flags++;
      }
    }

    // 4c: Quantum ledger config
    const { data: qlConfig } = await supabase
      .from("system_settings")
      .select("setting_key, setting_value")
      .eq("setting_key", "quantum_ledger_config")
      .maybeSingle();

    if (qlConfig) {
      await supabase
        .from("system_dna")
        .upsert({
          category: "business_rule",
          entity_name: "quantum_ledger_config",
          description: "Quantum ledger configuration for double-entry accounting",
          metadata: {
            source: "system_settings",
            config: qlConfig.setting_value,
            impact_scope: "global",
            dependencies: ["double_entry_ledger", "chart_of_accounts", "journal_rules"],
            auto_fix: false,
          },
        }, { onConflict: "category,entity_name" });
      stats.business_rules++;
    }

    // ═══════════════════════════════════════
    // STEP 7: Validation
    // ═══════════════════════════════════════
    const { data: validation } = await supabase
      .from("system_dna")
      .select("category, entity_name, metadata")
      .is("metadata", null);

    const nullMetadataCount = validation?.length ?? 0;

    // ═══════════════════════════════════════
    // STEP 8: AI Reasoning Pass
    // ═══════════════════════════════════════
    let insightsResult = null;
    try {
      const { data: ir, error: irErr } = await supabase.rpc("fn_generate_ai_insights");
      if (irErr) {
        stats.errors.push(`ai_insights: ${irErr.message}`);
      } else {
        insightsResult = ir;
      }
    } catch (e) {
      stats.errors.push(`ai_insights: ${String(e)}`);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "System DNA populated successfully",
        stats,
        validation: {
          null_metadata_count: nullMetadataCount,
          total_indexed: stats.tables + stats.edge_functions + stats.business_rules + stats.feature_flags,
        },
        ai_insights: insightsResult,
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
