/**
 * RULE_ENGINE — SINGLE BRAIN LAYER
 * ──────────────────────────────────────────────────────────────
 * SYSTEM CONSTITUTION v1.0 — DECISION & ROUTING AUTHORITY
 *
 * The ONLY layer permitted to make decisions about:
 *   - Module resolution (which SYSTEM_INDEX module applies to a query/route)
 *   - Role-based module filtering (who can see what)
 *   - LLM context derivation (what the assistant is told)
 *
 * STRICT CONTRACT:
 *   1. SYSTEM_INDEX is the ONLY input source of truth.
 *   2. RULE_ENGINE is PURE & DETERMINISTIC — same input → same output.
 *   3. RULE_ENGINE owns NO data, performs NO side effects, NO I/O.
 *   4. Execution layers (UI, assistant, navigation) consume its output ONLY.
 *   5. NO module may bypass this engine to read SYSTEM_INDEX directly
 *      for decision-making (read for display is allowed).
 *
 * This file replaces ad-hoc scattered logic across:
 *   - assistantQueryRouter (module matching for LLM)
 *   - navigation consumers (route → module hint)
 *   - any future feature-awareness consumer
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

export interface RuleEngineDecision {
  /** Modules ranked by relevance (0–2 entries, dedup-safe). */
  modules: ModuleHint[];
  /** Source of resolution — useful for telemetry / debugging. */
  source: "route" | "query" | "none";
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
 * Resolve module(s) for an assistant query.
 * Order: explicit route match > free-text search > none.
 */
export function resolveModulesForQuery(
  userQuery: string | undefined,
  currentRoute?: string,
): RuleEngineDecision {
  // 1. Route-anchored resolution (highest precedence)
  if (currentRoute) {
    const routeMatch = findSystemModule(currentRoute);
    if (routeMatch) {
      return { modules: [toHint(routeMatch)], source: "route" };
    }
  }

  // 2. Query-based fuzzy resolution
  if (userQuery && userQuery.trim()) {
    const matches = searchSystemModules(userQuery, MAX_MODULES);
    if (matches.length) {
      return { modules: matches.map(toHint), source: "query" };
    }
  }

  // 3. No deterministic match → empty (engine never guesses)
  return { modules: [], source: "none" };
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
