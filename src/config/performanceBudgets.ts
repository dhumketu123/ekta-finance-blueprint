// src/config/performanceBudgets.ts
// Central Performance Budget Configuration — env-overridable thresholds

export interface MetricPayload {
  name: string;
  value: number;
}

export const PERFORMANCE_BUDGETS = {
  LCP: Number(import.meta.env.VITE_BUDGET_LCP || 2500),
  CLS: Number(import.meta.env.VITE_BUDGET_CLS || 0.1),
  FID: Number(import.meta.env.VITE_BUDGET_FID || 100),
} as const;

export type BudgetMetricName = keyof typeof PERFORMANCE_BUDGETS;

export function normalizeMetric(name: string, value: number): number {
  if (name === "CLS") return parseFloat(Math.max(0, value).toFixed(3));
  if (name === "LCP" || name === "FID") return Math.round(Math.max(0, value));
  return Math.max(0, value);
}

export function checkBudget(name: string, value: number) {
  const threshold = PERFORMANCE_BUDGETS[name as BudgetMetricName];
  if (threshold === undefined) return;

  const normalized = normalizeMetric(name, value);
  if (normalized <= threshold) return;

  if (import.meta.env.DEV) {
    console.warn("[BudgetExceeded]", {
      name,
      value: normalized,
      threshold,
      timestamp: Date.now(),
    });
  }
}
