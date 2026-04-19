/**
 * EKTA FINANCE GROUP — SYSTEM INDEX (CORE BRAIN MAP)
 *
 * Single source of truth for AI Assistant, navigation, and feature awareness.
 * Pure static, structured knowledge — no runtime logic.
 *
 * RULES:
 *   1. Every module MUST reflect a REAL route + REAL table(s).
 *   2. NEVER add modules that don't exist in the system.
 *   3. Tables listed here MUST exist in the Supabase schema.
 *   4. Do NOT mutate at runtime. Treat as `as const` data.
 */

export interface SystemModule {
  /** Stable machine-readable identifier */
  id: string;
  /** Human-readable title (English) */
  title: string;
  /** Bengali title — UI-localized label */
  titleBn?: string;
  /** Primary route path (matches src/config/routes.ts) */
  route: string;
  /** One-line module purpose */
  description: string;
  /** Tables that this module owns / writes to */
  primary_tables: string[];
  /** Tables this module reads from for joins / context */
  related_tables: string[];
  /** Roles that typically access this module (informational hint, NOT enforcement) */
  permissions_hint: string[];
}

export const SYSTEM_INDEX: SystemModule[] = [
  // ── Core Operations ──
  {
    id: "dashboard",
    title: "Dashboard",
    titleBn: "ড্যাশবোর্ড",
    route: "/",
    description: "Operational overview, KPIs, and real-time business pulse.",
    primary_tables: [],
    related_tables: [
      "loans",
      "financial_transactions",
      "clients",
      "daily_financial_summary",
    ],
    permissions_hint: ["admin", "owner", "field_officer", "treasurer"],
  },
  {
    id: "transactions",
    title: "Financial Transactions",
    titleBn: "লেনদেন",
    route: "/transactions",
    description: "Disbursement, collection, savings, and adjustment ledger entries.",
    primary_tables: ["financial_transactions"],
    related_tables: ["double_entry_ledger", "advance_buffer", "audit_logs"],
    permissions_hint: ["admin", "owner", "treasurer", "field_officer"],
  },
  {
    id: "approvals",
    title: "Approvals",
    titleBn: "অনুমোদন",
    route: "/approvals",
    description: "Maker–checker queue for high-value or sensitive actions.",
    primary_tables: ["approval_requests", "approval_execution_logs"],
    related_tables: ["audit_logs", "execution_audit_log"],
    permissions_hint: ["admin", "owner", "treasurer"],
  },
  {
    id: "day_close",
    title: "Day Close",
    titleBn: "দিন বন্ধ",
    route: "/day-close",
    description: "User-based daily cash reconciliation and variance check.",
    primary_tables: ["daily_user_close"],
    related_tables: ["financial_transactions", "daily_financial_summary"],
    permissions_hint: ["admin", "owner", "field_officer", "treasurer"],
  },
  {
    id: "commitments",
    title: "Commitments (PTP)",
    titleBn: "প্রতিশ্রুতি",
    route: "/commitments",
    description: "Promise-to-pay capture, reschedule, and audit hash chain.",
    primary_tables: ["commitments", "commitment_analytics"],
    related_tables: ["clients", "loans"],
    permissions_hint: ["admin", "owner", "field_officer"],
  },

  // ── Customer & Investor ──
  {
    id: "clients",
    title: "Clients",
    titleBn: "গ্রাহক",
    route: "/clients",
    description: "Client (member) registry, KYC, trust score, and relationships.",
    primary_tables: ["clients", "client_risk", "credit_scores"],
    related_tables: ["loans", "savings_accounts", "communication_logs"],
    permissions_hint: ["admin", "owner", "field_officer"],
  },
  {
    id: "loans",
    title: "Loans",
    titleBn: "ঋণ",
    route: "/loans",
    description: "Loan products, lifecycle, schedules, payments, and waterfall.",
    primary_tables: ["loans", "loan_products", "loan_schedules"],
    related_tables: ["clients", "financial_transactions", "advance_buffer"],
    permissions_hint: ["admin", "owner", "field_officer"],
  },
  {
    id: "savings",
    title: "Savings",
    titleBn: "সঞ্চয়",
    route: "/savings",
    description: "General, locked, DPS, and fixed savings accounts.",
    primary_tables: [
      "savings_accounts",
      "savings_products",
      "savings_transactions",
    ],
    related_tables: ["clients", "financial_transactions"],
    permissions_hint: ["admin", "owner", "field_officer", "treasurer"],
  },
  {
    id: "investors",
    title: "Investors",
    titleBn: "বিনিয়োগকারী",
    route: "/investors",
    description: "Investor capital, dividends, and weekly transaction ledger.",
    primary_tables: ["investors", "investor_weekly_transactions"],
    related_tables: ["audit_logs", "double_entry_ledger"],
    permissions_hint: ["admin", "owner", "treasurer"],
  },
  {
    id: "investor_wallet",
    title: "Investor Wallet",
    titleBn: "ওয়ালেট",
    route: "/wallet",
    description: "Investor self-service wallet view (capital, returns, history).",
    primary_tables: ["investor_weekly_transactions"],
    related_tables: ["investors"],
    permissions_hint: ["investor"],
  },
  {
    id: "owners",
    title: "Owners",
    titleBn: "মালিক",
    route: "/owners",
    description: "Founder equity, exit MoU, and partnership ledger.",
    primary_tables: ["investors"],
    related_tables: ["audit_logs", "double_entry_ledger"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "field_officers",
    title: "Field Officers",
    titleBn: "মাঠকর্মী",
    route: "/field-officers",
    description: "Field staff, area assignments, and collection performance.",
    primary_tables: ["profiles"],
    related_tables: ["clients", "commitments", "communication_logs"],
    permissions_hint: ["admin", "owner"],
  },

  // ── Risk & Control ──
  {
    id: "risk_dashboard",
    title: "Risk Dashboard",
    titleBn: "ঝুঁকি ড্যাশবোর্ড",
    route: "/risk-dashboard",
    description: "Aggregate risk distribution, scoring, and trend analysis.",
    primary_tables: ["client_risk", "credit_scores"],
    related_tables: ["loans", "clients"],
    permissions_hint: ["admin", "owner", "treasurer"],
  },
  {
    id: "risk_heatmap",
    title: "Risk Heatmap",
    titleBn: "ঝুঁকি হিটম্যাপ",
    route: "/risk-heatmap",
    description: "Geographic / segment-based concentration of risk exposure.",
    primary_tables: ["client_risk"],
    related_tables: ["clients", "loans"],
    permissions_hint: ["admin", "owner", "field_officer", "treasurer"],
  },
  {
    id: "governance",
    title: "Governance Core",
    titleBn: "গভর্ন্যান্স",
    route: "/governance",
    description: "Aging buckets, escalations, automated recovery actions.",
    primary_tables: ["governance_action_logs"],
    related_tables: ["loans", "loan_schedules", "in_app_notifications"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "monitoring",
    title: "Monitoring",
    titleBn: "মনিটরিং",
    route: "/monitoring",
    description: "System health, AI pipeline status, anomaly intelligence.",
    primary_tables: [
      "system_health_logs",
      "ai_pipeline_runs",
      "ai_pipeline_alerts",
      "ai_pipeline_metrics",
    ],
    related_tables: ["ai_insights", "ai_decision_scores", "audit_logs"],
    permissions_hint: ["admin", "owner"],
  },

  // ── Intelligence & Reporting ──
  {
    id: "reports",
    title: "Executive Reports",
    titleBn: "রিপোর্ট",
    route: "/reports",
    description: "Executive intelligence hub with cross-module KPIs.",
    primary_tables: ["executive_reports"],
    related_tables: [
      "loans",
      "clients",
      "financial_transactions",
      "daily_financial_summary",
    ],
    permissions_hint: ["admin", "owner", "treasurer"],
  },
  {
    id: "profit_loss",
    title: "Profit & Loss",
    titleBn: "লাভ-ক্ষতি",
    route: "/profit-loss",
    description: "Income statement derived from double-entry ledger.",
    primary_tables: ["double_entry_ledger"],
    related_tables: ["chart_of_accounts", "accounting_periods"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "balance_sheet",
    title: "Balance Sheet",
    titleBn: "ব্যালেন্স শিট",
    route: "/balance-sheet",
    description: "Snapshot of assets, liabilities, and equity.",
    primary_tables: ["double_entry_ledger", "account_balances"],
    related_tables: ["chart_of_accounts"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "trial_balance",
    title: "Trial Balance",
    titleBn: "ট্রায়াল ব্যালেন্স",
    route: "/trial-balance",
    description: "Account-level debit/credit balances for verification.",
    primary_tables: ["account_balances", "double_entry_ledger"],
    related_tables: ["chart_of_accounts"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "ledger_audit",
    title: "Ledger Audit",
    titleBn: "লেজার অডিট",
    route: "/ledger-audit",
    description: "SHA256 hash-chain integrity verification of the ledger.",
    primary_tables: ["double_entry_ledger", "event_sourcing"],
    related_tables: ["audit_logs", "audit_verification_state"],
    permissions_hint: ["admin", "owner", "treasurer"],
  },
  {
    id: "quantum_ledger",
    title: "Quantum Ledger",
    titleBn: "কোয়ান্টাম লেজার",
    route: "/quantum-ledger",
    description: "Append-only cryptographically chained accounting ledger.",
    primary_tables: ["double_entry_ledger", "event_sourcing"],
    related_tables: ["chart_of_accounts", "journal_rules"],
    permissions_hint: ["admin", "owner", "treasurer"],
  },
  {
    id: "owner_profit",
    title: "Owner Profit Distribution",
    titleBn: "মালিক লাভ",
    route: "/owner-profit",
    description: "Periodic profit allocation across owners by share %.",
    primary_tables: ["investor_weekly_transactions"],
    related_tables: ["investors", "audit_logs"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "commitment_analytics",
    title: "Commitment Analytics",
    titleBn: "প্রতিশ্রুতি বিশ্লেষণ",
    route: "/commitment-analytics",
    description: "Reschedule rates, fulfilment, and officer performance.",
    primary_tables: ["commitment_analytics"],
    related_tables: ["commitments"],
    permissions_hint: ["admin", "owner", "treasurer"],
  },

  // ── System Administration ──
  {
    id: "settings",
    title: "Settings",
    titleBn: "সেটিংস",
    route: "/settings",
    description: "Tenant rules, feature flags, branding, and SMS gateway.",
    primary_tables: ["tenant_rules", "feature_flags", "system_settings"],
    related_tables: ["tenants"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "notifications",
    title: "Notifications",
    titleBn: "বিজ্ঞপ্তি",
    route: "/notifications",
    description: "In-app, SMS, and digest notification management.",
    primary_tables: [
      "in_app_notifications",
      "notification_logs",
      "digest_queue",
    ],
    related_tables: ["communication_logs"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "super_admin",
    title: "Super Admin",
    titleBn: "সুপার অ্যাডমিন",
    route: "/super-admin",
    description: "Cross-tenant SaaS oversight and platform controls.",
    primary_tables: ["tenants", "profiles"],
    related_tables: ["audit_logs", "system_health_logs"],
    permissions_hint: ["admin"],
  },
  {
    id: "bulk_onboarding",
    title: "Bulk Onboarding",
    titleBn: "বাল্ক অনবোর্ডিং",
    route: "/bulk-onboarding",
    description: "CSV-based bulk client/loan onboarding with dedup.",
    primary_tables: ["clients"],
    related_tables: ["loans", "savings_accounts", "audit_logs"],
    permissions_hint: ["admin", "owner"],
  },
  {
    id: "knowledge_dashboard",
    title: "Knowledge Graph",
    titleBn: "নলেজ গ্রাফ",
    route: "/knowledge",
    description: "Self-indexing system knowledge graph and AI brain map.",
    primary_tables: ["system_dna", "entity_relations", "ai_assistant_knowledge"],
    related_tables: ["ai_insights", "ai_decision_scores"],
    permissions_hint: ["admin", "owner"],
  },
];

/**
 * Lookup helper: resolve a module by route or id.
 * Used by AI Assistant to inject context.
 */
export function findSystemModule(
  routeOrId: string,
): SystemModule | undefined {
  const needle = routeOrId.toLowerCase();
  return SYSTEM_INDEX.find(
    (m) => m.id === needle || m.route.toLowerCase() === needle,
  );
}

/**
 * Match a free-text query against module ids/titles for assistant context.
 * Returns up to `limit` matches, ranked by simple keyword presence.
 */
export function searchSystemModules(
  query: string,
  limit = 3,
): SystemModule[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const scored = SYSTEM_INDEX.map((m) => {
    let score = 0;
    if (m.id.includes(q) || q.includes(m.id)) score += 5;
    if (m.title.toLowerCase().includes(q)) score += 4;
    if (m.titleBn && q.includes(m.titleBn)) score += 4;
    if (m.route.toLowerCase().includes(q)) score += 3;
    if (m.description.toLowerCase().includes(q)) score += 2;
    if ([...m.primary_tables, ...m.related_tables].some((t) => q.includes(t)))
      score += 3;
    return { m, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map((s) => s.m);
}
