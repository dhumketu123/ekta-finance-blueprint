/**
 * Centralized Role → Home Route Map
 *
 * SINGLE SOURCE OF TRUTH for "where does this role belong?"
 *
 * Used by:
 *  - Auth.tsx (post-login redirect)
 *  - ProtectedRoute.tsx (role-mismatch redirect)
 *  - Unauthorized.tsx ("back to my dashboard" link)
 *
 * Rules:
 *  - Every known role MUST map to a route the role is allowed to access.
 *  - Unknown / null / invalid role → ROUTES.UNAUTHORIZED (NEVER admin dashboard).
 *  - No privilege escalation through fallback.
 */
import { ROUTES } from "@/config/routes";
import type { AppRole } from "@/hooks/usePermissions";

export const ROLE_HOME_ROUTE: Record<AppRole, string> = {
  admin: ROUTES.DASHBOARD,
  owner: ROUTES.DASHBOARD,
  manager: ROUTES.DASHBOARD,
  treasurer: ROUTES.DASHBOARD,
  field_officer: ROUTES.CLIENTS,
  investor: ROUTES.INVESTOR_WALLET,
  alumni: ROUTES.ALUMNI,
};

/**
 * Resolve the safe landing route for a given role.
 *
 * @param role - role string from AuthContext (DB-sourced only)
 * @returns route path the role is permitted to access, or /unauthorized
 *          for null / unknown / invalid roles. NEVER falls back to admin.
 */
export const getRoleHomeRoute = (role: string | null | undefined): string => {
  const normalized = role?.toLowerCase()?.trim();
  if (!normalized) return ROUTES.UNAUTHORIZED;
  if (normalized in ROLE_HOME_ROUTE) {
    return ROLE_HOME_ROUTE[normalized as AppRole];
  }
  return ROUTES.UNAUTHORIZED;
};
