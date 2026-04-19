/**
 * EKTA FINANCE GROUP — SYSTEM INDEX (CORE BRAIN MAP)
 * Purpose: Single source of truth for AI Assistant understanding entire system
 */

export const SYSTEM_INDEX = {
  appName: "Ekta Finance Group",
  type: "Financial Operating System",

  modules: {
    auth: {
      pages: ["/auth", "/reset-password", "/unauthorized"],
      description: "Authentication and access control system",
    },

    dashboard: {
      pages: ["/"],
      description: "Main operational dashboard",
    },

    clients: {
      pages: ["/clients", "/clients/:id"],
      description: "Client management system",
    },

    loans: {
      pages: ["/loans", "/loans/:id"],
      description: "Loan product and loan lifecycle system",
    },

    savings: {
      pages: ["/savings", "/savings/:id"],
      description: "Savings account management",
    },

    investors: {
      pages: ["/investors", "/investors/:id", "/investor-wallet"],
      description: "Investor capital and wallet system",
    },

    owners: {
      pages: ["/owners", "/owners/:id", "/owner-profit"],
      description: "Owner management and profit distribution",
    },

    fieldOperations: {
      pages: ["/field-officers", "/field-officers/:id"],
      description: "Field officer operations and monitoring",
    },

    financeCore: {
      pages: [
        "/transactions",
        "/approvals",
        "/day-close",
        "/financial-reports",
      ],
      description: "Core financial transaction system",
    },

    reporting: {
      pages: [
        "/reports",
        "/profit-loss",
        "/balance-sheet",
        "/trial-balance",
      ],
      description: "Financial reporting and analytics",
    },

    risk: {
      pages: ["/risk-dashboard", "/risk-heatmap"],
      description: "Risk analysis and monitoring system",
    },

    ledger: {
      pages: ["/ledger", "/quantum-ledger", "/ledger-audit"],
      description: "Accounting and ledger system",
    },

    governance: {
      pages: ["/governance", "/super-admin"],
      description: "System governance and admin control",
    },

    system: {
      pages: ["/settings", "/notifications", "/monitoring"],
      description: "System configuration and monitoring",
    },
  },

  roles: [
    "admin",
    "owner",
    "field_officer",
    "treasurer",
    "investor",
    "alumni",
  ],

  aiContextRules: {
    rule1: "Always resolve page → module before answering",
    rule2: "Always check role access before feature explanation",
    rule3: "Never assume missing services exist unless defined in index",
  },
};
