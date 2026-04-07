// src/core/systemMonitor.performance.ts
// Performance Budget Enforcement Layer
// Uses public telemetry adapter — no monkey-patching

import { systemMonitor } from "./systemMonitor";

interface MetricThresholds {
  LCP: number;
  CLS: number;
  FID: number;
}

const THRESHOLDS: MetricThresholds = {
  LCP: 2500,
  CLS: 0.1,
  FID: 100,
};

function normalizeMetric(name: string, value: number): number {
  if (name === "CLS") return parseFloat(value.toFixed(3));
  if (name === "LCP" || name === "FID") return Math.round(value);
  return value;
}

function checkBudget(name: string, value: number) {
  const threshold = THRESHOLDS[name as keyof MetricThresholds];
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

// Wire into the public telemetry adapter
systemMonitor.setTelemetryAdapter((type, payload) => {
  if (type === "metric" && payload?.name) {
    checkBudget(payload.name, payload.value);
  }
});
