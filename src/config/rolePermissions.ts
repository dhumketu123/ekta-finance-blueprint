/**
 * Role Permission Engine — SINGLE SOURCE OF TRUTH for capability checks.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FRONTEND ↔ BACKEND SECURITY CONTRACT                                ║
 * ║                                                                      ║
 * ║  This file IS the security contract. The DB enforces the same rules  ║
 * ║  via RLS policies + `public.has_role(auth.uid(), <role>)`.           ║
 * ║                                                                      ║
 * ║  Any change to `ROLE_PERMISSIONS` or `AppRole` MUST be paired with:  ║
 * ║    1. The DB `app_role` enum (migration).                            ║
 * ║    2. RLS policies that reference the role via `has_role()`.         ║
 * ║    3. A Supabase linter + RLS audit run.                             ║
 * ║                                                                      ║
 * ║  No parallel "contract" file is permitted — duplication causes drift.║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Architecture rules:
 *  - Roles MUST come from the database (user_roles table) only.
 *  - Unknown / null role → ALL permission checks return false.
 *  - "ALL" wildcard belongs to admin & owner ONLY (no privilege escalation
 *    via fallback).
 *  - Consumed by `routeGuard.ts`, `ProtectedRoute`, sidebar, and any UI
 *    surface that needs capability checks.
 *
 * To add a new role:
 *  1. Add it to `AppRole` (and the DB `app_role` enum).
 *  2. Add an entry to `ROLE_PERMISSIONS`.
 *  3. Add a home route in `roleRoutes.ts`.
 *  4. Add/adjust RLS policies referencing `has_role(auth.uid(), '<role>')`.
 */

export type AppRole =
  | "admin"
  | "owner"
  | "manager"
  | "treasurer"
  | "field_officer"
  | "investor"
  | "alumni";

export type AppPermission =
  | "ALL"
  | "VIEW_DASHBOARD"
  | "VIEW_CLIENTS"
  | "VIEW_REPORTS"
  | "VIEW_FINANCE"
  | "MANAGE_PAYMENTS"
  | "VIEW_WALLET"
  | "VIEW_PROFILE";

export const ROLE_PERMISSIONS: Record<AppRole, readonly AppPermission[]> = {
  admin: ["ALL"],
  owner: ["ALL"],
  manager: ["VIEW_DASHBOARD", "VIEW_CLIENTS", "VIEW_REPORTS"],
  treasurer: ["VIEW_DASHBOARD", "VIEW_FINANCE", "MANAGE_PAYMENTS"],
  field_officer: ["VIEW_CLIENTS"],
  investor: ["VIEW_WALLET"],
  alumni: ["VIEW_PROFILE", "VIEW_DASHBOARD"],
};

const normalize = (role: string | null | undefined): AppRole | null => {
  const n = role?.toLowerCase()?.trim();
  if (!n) return null;
  return (n in ROLE_PERMISSIONS) ? (n as AppRole) : null;
};

/**
 * Returns the canonical permission list for a role, or `[]` for null/unknown.
 * Never throws — fail-secure.
 */
export const getPermissionsForRole = (
  role: string | null | undefined,
): readonly AppPermission[] => {
  const r = normalize(role);
  return r ? ROLE_PERMISSIONS[r] : [];
};
