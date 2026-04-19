/**
 * Auth Audit — fail-safe logging for invalid / missing role access attempts.
 *
 * Contract:
 *  - Fire-and-forget. NEVER throws, NEVER awaits in render path.
 *  - Persists to `audit_logs` when a session exists; falls back to console.
 *  - Deduplicated per (userId, route, role) within a 60s window so a guard
 *    re-render storm cannot flood the table.
 *
 * Triggered by `ProtectedRoute` whenever:
 *  - role is null while state === READY (DB invariant violated), or
 *  - role string is not registered in ROLE_PERMISSIONS, or
 *  - role is valid but lacks the required permissions for the route.
 */
import { supabase } from "@/integrations/supabase/client";

type InvalidRoleReason =
  | "missing_role"
  | "unknown_role"
  | "permission_denied";

interface InvalidRolePayload {
  role: string | null | undefined;
  userId?: string | null;
  route: string;
  reason: InvalidRoleReason;
  requiredPermissions?: readonly string[];
  allowedRoles?: readonly string[];
}

const DEDUPE_WINDOW_MS = 60_000;
const recentEvents = new Map<string, number>();

const fingerprint = (p: InvalidRolePayload) =>
  `${p.userId ?? "anon"}|${p.route}|${p.role ?? "null"}|${p.reason}`;

const isDuplicate = (key: string): boolean => {
  const now = Date.now();
  const last = recentEvents.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  recentEvents.set(key, now);
  // Bound memory: trim oldest if map grows large.
  if (recentEvents.size > 200) {
    const cutoff = now - DEDUPE_WINDOW_MS;
    for (const [k, t] of recentEvents) {
      if (t < cutoff) recentEvents.delete(k);
    }
  }
  return false;
};

export const logInvalidRoleAccess = (payload: InvalidRolePayload): void => {
  const key = fingerprint(payload);
  if (isDuplicate(key)) return;

  const record = {
    timestamp: new Date().toISOString(),
    ...payload,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  };

  // Always emit to console for dev signal.
  // eslint-disable-next-line no-console
  console.warn("[authAudit] invalid role access", record);

  // Persist asynchronously. Failures are swallowed — auditing must never
  // break the app.
  void (async () => {
    try {
      await supabase.from("audit_logs").insert({
        action_type: "invalid_role_access",
        entity_type: "auth_guard",
        entity_id: payload.userId ?? null,
        user_id: payload.userId ?? null,
        details: record,
      });
    } catch {
      /* swallow — audit best-effort only */
    }
  })();
};
