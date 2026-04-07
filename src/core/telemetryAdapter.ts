// src/core/telemetryAdapter.ts
// Unified telemetry adapter — budget enforcement + production analytics hook

import { checkBudget } from "@/config/performanceBudgets";

export function telemetryAdapter(type: "metric" | "error", payload: any) {
  if (type === "metric" && payload?.name && payload?.value != null) {
    checkBudget(payload.name, payload.value);
  }

  if (import.meta.env.DEV) {
    console.debug(`[Telemetry][${type}]`, payload);
  }

  // Production analytics — only active if VITE_ANALYTICS_URL is defined
  const url = import.meta.env.VITE_ANALYTICS_URL;
  if (url) {
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload, timestamp: Date.now() }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }
}
