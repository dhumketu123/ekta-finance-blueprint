/**
 * Centralized Route Constants — Zero Magic Strings
 *
 * Every route path in the application MUST reference these constants.
 * No hardcoded path strings allowed in router, sidebar, or navigation.
 */
export const ROUTES = {
  // Auth (unprotected)
  AUTH: "/auth",
  RESET_PASSWORD: "/reset-password",
  UNAUTHORIZED: "/unauthorized",

  // Core Operations
  DASHBOARD: "/",
  TRANSACTIONS: "/transactions",
  APPROVALS: "/approvals",
  DAY_CLOSE: "/day-close",
  COMMITMENTS: "/commitments",

  // Customer & Investor
  CLIENTS: "/clients",
  CLIENT_DETAIL: "/clients/:id",
  LOANS: "/loans",
  LOAN_DETAIL: "/loans/:id",
  SAVINGS: "/savings",
  SAVINGS_DETAIL: "/savings/:id",
  INVESTORS: "/investors",
  INVESTOR_DETAIL: "/investors/:id",
  INVESTOR_WALLET: "/wallet",
  OWNERS: "/owners",
  OWNER_DETAIL: "/owners/:id",
  FIELD_OFFICERS: "/field-officers",
  OFFICER_DETAIL: "/field-officers/:id",

  // Risk & Control
  RISK_DASHBOARD: "/risk-dashboard",
  RISK_HEATMAP: "/risk-heatmap",
  GOVERNANCE: "/governance",
  MONITORING: "/monitoring",

  // Intelligence & Reporting
  REPORTS: "/reports",
  PROFIT_LOSS: "/profit-loss",
  BALANCE_SHEET: "/balance-sheet",
  LEDGER_AUDIT: "/ledger-audit",
  TRIAL_BALANCE: "/trial-balance",
  OWNER_PROFIT: "/owner-profit",
  QUANTUM_LEDGER: "/quantum-ledger",
  COMMITMENT_ANALYTICS: "/commitment-analytics",
  ACCOUNTING: "/accounting",
  PAYMENT_STATUS: "/reports/payment-status",
  INVESTOR_SUMMARY: "/reports/investor-summary",

  // System Administration
  SETTINGS: "/settings",
  NOTIFICATIONS: "/notifications",
  SUPER_ADMIN: "/super-admin",

  // Role-specific
  ALUMNI: "/alumni",

  // Onboarding
  BULK_ONBOARDING: "/bulk-onboarding",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
