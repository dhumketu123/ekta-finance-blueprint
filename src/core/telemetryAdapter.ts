// src/core/telemetryAdapter.ts
// Unified telemetry adapter — budget enforcement + production analytics hook
// Hardened: safe fetch guard, no crash propagation, DEV-visible failures.

import { checkBudget } from "@/config/performanceBudgets";

export function telemetryAdapter(type: "metric" | "error", payload: any) {
  // Budget enforcement (metrics only)
  try {
    if (type === "metric" && payload?.name && payload?.value != null) {
      checkBudget(payload.name, payload.value);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[Telemetry] budget check failed:", err);
    }
  }

  if (import.meta.env.DEV) {
    console.debug(`[Telemetry][${type}]`, payload);
  }

  // Production analytics — only active if VITE_ANALYTICS_URL is defined
  const url = import.meta.env.VITE_ANALYTICS_URL;
  if (!url) return;

  // Safe fetch guard — never propagate network/runtime errors to caller.
  // Future-ready: a batch buffer can wrap this without changing the public signature.
  try {
    const body = JSON.stringify({ type, payload, timestamp: Date.now() });
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch((err) => {
      if (import.meta.env.DEV) {
        console.warn("[Telemetry] dispatch failed:", err);
      }
    });
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[Telemetry] serialization failed:", err);
    }
  }
}
