/**
 * useBusinessRules — Unified business configuration hook.
 * 
 * Merges tenant_rules (per-tenant, admin-configurable) with
 * quantum_ledger_config (system_settings) for a single source of truth.
 * 
 * Priority: tenant_rules > quantum config > hardcoded defaults
 */

import { useTenantRules } from "@/hooks/useTenantRules";
import { useQuantumConfig } from "@/hooks/useQuantumConfig";

export interface BusinessRules {
  // Loan rules
  min_loan_amount: number;
  max_loan_amount: number;
  approval_workflow: "maker_checker" | "auto_approve" | "admin_only";

  // Interest & penalty
  dps_interest_rate: number;
  penalty_late_fee_rate: number;
  grace_period_days: number;
  defaulter_threshold_days: number;

  // Settlement / rebate (from quantum config)
  loan_rebate_flat: number;
  loan_rebate_reducing: number;
  processing_fee_percent: number;
  minimum_notice_days: number;

  // Feature toggles (from quantum config)
  voice_enabled: boolean;
  bulk_collection_enabled: boolean;
  ai_prediction_enabled: boolean;
  audit_lock_enabled: boolean;
}

const HARDCODED_DEFAULTS: BusinessRules = {
  min_loan_amount: 5000,
  max_loan_amount: 500000,
  approval_workflow: "maker_checker",
  dps_interest_rate: 10,
  penalty_late_fee_rate: 2,
  grace_period_days: 5,
  defaulter_threshold_days: 30,
  loan_rebate_flat: 30,
  loan_rebate_reducing: 50,
  processing_fee_percent: 1,
  minimum_notice_days: 7,
  voice_enabled: true,
  bulk_collection_enabled: true,
  ai_prediction_enabled: true,
  audit_lock_enabled: true,
};

export const useBusinessRules = () => {
  const { rules: tenantRules, isLoading: tenantLoading } = useTenantRules();
  const { config: quantumConfig, isLoading: quantumLoading } = useQuantumConfig();

  const isLoading = tenantLoading || quantumLoading;

  // Tenant rules take precedence, then quantum config, then defaults
  const rules: BusinessRules = {
    // Loan rules — tenant_rules only
    min_loan_amount: Number(tenantRules.min_loan_amount) || HARDCODED_DEFAULTS.min_loan_amount,
    max_loan_amount: Number(tenantRules.max_loan_amount) || HARDCODED_DEFAULTS.max_loan_amount,
    approval_workflow: (tenantRules.approval_workflow as BusinessRules["approval_workflow"]) || HARDCODED_DEFAULTS.approval_workflow,

    // Overlapping: tenant_rules > quantum config > default
    dps_interest_rate: Number(tenantRules.dps_interest_rate) || HARDCODED_DEFAULTS.dps_interest_rate,
    penalty_late_fee_rate:
      tenantRules.penalty_late_fee_rate !== undefined
        ? Number(tenantRules.penalty_late_fee_rate)
        : quantumConfig.late_fee_rate ?? HARDCODED_DEFAULTS.penalty_late_fee_rate,
    grace_period_days:
      tenantRules.grace_period_days !== undefined
        ? Number(tenantRules.grace_period_days)
        : quantumConfig.grace_period_days ?? HARDCODED_DEFAULTS.grace_period_days,
    defaulter_threshold_days:
      tenantRules.defaulter_threshold_days !== undefined
        ? Number(tenantRules.defaulter_threshold_days)
        : quantumConfig.defaulter_threshold ?? HARDCODED_DEFAULTS.defaulter_threshold_days,

    // Settlement — quantum config only
    loan_rebate_flat: quantumConfig.loan_rebate_flat ?? HARDCODED_DEFAULTS.loan_rebate_flat,
    loan_rebate_reducing: quantumConfig.loan_rebate_reducing ?? HARDCODED_DEFAULTS.loan_rebate_reducing,
    processing_fee_percent: quantumConfig.processing_fee_percent ?? HARDCODED_DEFAULTS.processing_fee_percent,
    minimum_notice_days: quantumConfig.minimum_notice_days ?? HARDCODED_DEFAULTS.minimum_notice_days,

    // Feature toggles — quantum config only
    voice_enabled: quantumConfig.voice_enabled ?? HARDCODED_DEFAULTS.voice_enabled,
    bulk_collection_enabled: quantumConfig.bulk_collection_enabled ?? HARDCODED_DEFAULTS.bulk_collection_enabled,
    ai_prediction_enabled: quantumConfig.ai_prediction_enabled ?? HARDCODED_DEFAULTS.ai_prediction_enabled,
    audit_lock_enabled: quantumConfig.audit_lock_enabled ?? HARDCODED_DEFAULTS.audit_lock_enabled,
  };

  return { rules, isLoading };
};

// ── Validation helpers ──

export const validateLoanAmount = (amount: number, rules: BusinessRules, lang: "bn" | "en" = "en"): string | null => {
  if (amount < rules.min_loan_amount) {
    return lang === "bn"
      ? `সর্বনিম্ন ঋণের পরিমাণ ৳${rules.min_loan_amount.toLocaleString()}`
      : `Minimum loan amount is ৳${rules.min_loan_amount.toLocaleString()}`;
  }
  if (amount > rules.max_loan_amount) {
    return lang === "bn"
      ? `সর্বোচ্চ ঋণের পরিমাণ ৳${rules.max_loan_amount.toLocaleString()}`
      : `Maximum loan amount is ৳${rules.max_loan_amount.toLocaleString()}`;
  }
  return null;
};

export const calculatePenalty = (daysLate: number, amount: number, rules: BusinessRules): number => {
  if (daysLate <= rules.grace_period_days) return 0;
  return Math.round(amount * (rules.penalty_late_fee_rate / 100));
};

export const calculateDPSInterest = (principal: number, rules: BusinessRules): number => {
  return Math.round(principal * (rules.dps_interest_rate / 100));
};

export const shouldUseMakerChecker = (rules: BusinessRules): boolean => {
  return rules.approval_workflow === "maker_checker";
};

export const isDefaulterThresholdExceeded = (daysOverdue: number, rules: BusinessRules): boolean => {
  return daysOverdue > rules.defaulter_threshold_days;
};
