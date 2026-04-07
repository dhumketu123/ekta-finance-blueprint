// src/config/performanceBudgets.ts
// Central Performance Budget Configuration
// Single source of truth for Core Web Vitals thresholds

export const performanceBudgets = {
  LCP: 2500,   // ms — Largest Contentful Paint
  CLS: 0.1,    // unitless — Cumulative Layout Shift
  FID: 100,    // ms — First Input Delay
} as const;

export type BudgetMetricName = keyof typeof performanceBudgets;

export function normalizeMetric(name: string, value: number): number {
  if (name === "CLS") return parseFloat(value.toFixed(3));
  if (name === "LCP" || name === "FID") return Math.round(value);
  return value;
}

export function checkBudget(name: string, value: number) {
  const threshold = performanceBudgets[name as BudgetMetricName];
  if (threshold === undefined) return;

  const normalized = normalizeMetric(name, value);
  if (normalized <= threshold) return;

  if (import.meta.env.DEV) {
    console.warn("[PerfBudget]", {
      name,
      value: normalized,
      threshold,
      severity: "warning",
      timestamp: Date.now(),
    });
  }
}
