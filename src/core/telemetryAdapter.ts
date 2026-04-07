// src/core/telemetryAdapter.ts
// Unified telemetry adapter — budget enforcement + future analytics hook
// Zero coupling | Production silent | Pipeline-ready

import { checkBudget } from "@/config/performanceBudgets";

export function telemetryAdapter(type: "metric" | "error", payload: any) {
  if (type === "metric" && payload?.name) {
    checkBudget(payload.name, payload.value);
  }

  if (import.meta.env.DEV) {
    console.debug(`[Telemetry][${type}]`, payload);
  }

  // Future hook for server-side telemetry
  // sendToTelemetryServer(type, payload);
}
