/**
 * RULE_ENGINE — SINGLE BRAIN LAYER
 * ──────────────────────────────────────────────────────────────
 * UNIFIED DECISION ARCHITECTURE v3.0 — DECISION & ROUTING AUTHORITY
 *
 * The ONLY layer permitted to make decisions about:
 *   - Module resolution (which SYSTEM_INDEX module applies to a query/route)
 *   - Role-based module filtering (who can see what)
 *   - LLM context derivation (what the assistant is told)
 *
 * STRICT CONTRACT v3.0:
 *   1. SYSTEM_INDEX is the ONLY input source of truth (READ ONLY).
 *   2. RULE_ENGINE is PURE & DETERMINISTIC — same input → same output.
 *   3. RULE_ENGINE owns NO data, performs NO side effects, NO I/O.
 *   4. Execution layers (UI, assistant, navigation) consume its output ONLY.
 *   5. NO module may bypass this engine to read SYSTEM_INDEX directly
 *      for decision-making (read for display is allowed).
 *   6. NO IMPLICIT FALLBACK — every decision returns an explicit
 *      `decision` discriminator: "ROUTE" | "QUERY" | "NO_ROUTE".
 *   7. EVERY decision carries a `traceId` for observability.
 */

import {
  SYSTEM_INDEX,
  searchSystemModules,
  findSystemModule,
  type SystemModule,
} from "@/core/system-index";

// ─────────────────────────────────────────────────────────────
// PUBLIC OUTPUT TYPES (consumed by execution layers)
// ─────────────────────────────────────────────────────────────

/** Lightweight module hint sent to LLM context. NEVER includes tables/permissions. */
export interface ModuleHint {
  id: SystemModule["id"];
  title: string;
  route: string;
  description: string;
}

/**
 * Decision discriminator — explicit, no implicit fallback (v3.0).
 *  - "ROUTE"    → resolved via current route
 *  - "QUERY"    → resolved via fuzzy query match
 *  - "NO_ROUTE" → no deterministic match (modules = [])
 */
export type DecisionKind = "ROUTE" | "QUERY" | "NO_ROUTE";

export interface RuleEngineDecision {
  /** Stable trace identifier for observability / dedup / audit. */
  traceId: string;
  /** Modules ranked by relevance (0–2 entries, dedup-safe). */
  modules: ModuleHint[];
  /** Source of resolution — mirrors decision for back-compat. */
  source: "route" | "query" | "none";
  /** Explicit decision contract — NEVER ambiguous. */
  decision: DecisionKind;
}

// ─────────────────────────────────────────────────────────────
// CORE RULES (deterministic, pure)
// ─────────────────────────────────────────────────────────────

const MAX_MODULES = 2;
const DESCRIPTION_BUDGET = 250;

function toHint(m: SystemModule): ModuleHint {
  return {
    id: m.id,
    title: m.title,
    route: m.route,
    description: m.description.slice(0, DESCRIPTION_BUDGET),
  };
}

/**
 * Generate a lightweight, dependency-free trace id.
 * Format: `re_<base36-time>_<base36-rand>` — short, sortable, unique enough
 * for in-process correlation. Not a security token.
 */
function generateTraceId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `re_${t}_${r}`;
}

/**
 * Resolve module(s) for an assistant query.
 * Order: explicit route match > free-text search > NO_ROUTE.
 *
 * v3.0 CONTRACT: every return path includes `traceId` and an
 * explicit `decision` — NO implicit fallback, NO ambiguous empty.
 */
export function resolveModulesForQuery(
  userQuery: string | undefined,
  currentRoute?: string,
): RuleEngineDecision {
  const traceId = generateTraceId();

  // 1. Route-anchored resolution (highest precedence)
  if (currentRoute) {
    const routeMatch = findSystemModule(currentRoute);
    if (routeMatch) {
      return {
        traceId,
        modules: [toHint(routeMatch)],
        source: "route",
        decision: "ROUTE",
      };
    }
  }

  // 2. Query-based fuzzy resolution
  if (userQuery && userQuery.trim()) {
    const matches = searchSystemModules(userQuery, MAX_MODULES);
    if (matches.length) {
      return {
        traceId,
        modules: matches.map(toHint),
        source: "query",
        decision: "QUERY",
      };
    }
  }

  // 3. No deterministic match → explicit NO_ROUTE (engine never guesses)
  return { traceId, modules: [], source: "none", decision: "NO_ROUTE" };
}

/**
 * Filter modules by user role.
 * Pure function — caller passes role; engine applies permissions_hint rule.
 *
 * RULE: a module with NO permissions_hint is considered universally visible.
 */
export function filterModulesByRole(
  modules: SystemModule[],
  role: string | null | undefined,
): SystemModule[] {
  if (!role) return modules;
  return modules.filter(
    (m) =>
      !m.permissions_hint ||
      m.permissions_hint.length === 0 ||
      m.permissions_hint.includes(role),
  );
}

/**
 * Resolve a single module by route or id (delegates to SYSTEM_INDEX).
 * Provided here so consumers never read SYSTEM_INDEX directly for decisions.
 */
export function resolveModule(routeOrId: string): ModuleHint | null {
  const m = findSystemModule(routeOrId);
  return m ? toHint(m) : null;
}

/**
 * Total module count — exposed for dashboards/diagnostics.
 * Read-only view, never mutates SYSTEM_INDEX.
 */
export function getModuleCount(): number {
  return SYSTEM_INDEX.length;
}
