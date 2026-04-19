/**
 * Route Guard System — fail-secure permission checks.
 *
 * Consumed by `ProtectedRoute` and any UI that gates rendering on capability.
 *
 * Contract:
 *  - role null/undefined → ALWAYS deny.
 *  - role not registered in ROLE_PERMISSIONS → ALWAYS deny.
 *  - role has "ALL" → allow every check.
 *  - Otherwise: every required permission must be present (AND semantics).
 *  - Empty `required` array → allow (route is auth-only, not capability-gated).
 */
import {
  type AppPermission,
  type AppRole,
  ROLE_PERMISSIONS,
} from "@/config/rolePermissions";

const resolveRole = (role: string | null | undefined): AppRole | null => {
  const n = role?.toLowerCase()?.trim();
  if (!n) return null;
  return (n in ROLE_PERMISSIONS) ? (n as AppRole) : null;
};

/**
 * Check whether a role holds one or more permissions.
 * Single permission → boolean. Array → all-of (AND).
 */
export const hasPermission = (
  role: string | null | undefined,
  permission: AppPermission | readonly AppPermission[],
): boolean => {
  const r = resolveRole(role);
  if (!r) return false;

  const granted = ROLE_PERMISSIONS[r];
  if (granted.includes("ALL")) return true;

  const required = Array.isArray(permission) ? permission : [permission];
  if (required.length === 0) return true;

  return required.every((p) => granted.includes(p));
};

/**
 * Route-level access check.
 *  - `requiredPermissions` empty → role-only gate (any valid role passes).
 *  - `allowedRoles` provided → role membership AND permission check (if any).
 */
export const canAccessRoute = (
  role: string | null | undefined,
  options: {
    allowedRoles?: readonly AppRole[];
    requiredPermissions?: readonly AppPermission[];
  } = {},
): boolean => {
  const r = resolveRole(role);
  if (!r) return false;

  const { allowedRoles, requiredPermissions } = options;

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(r)) {
    return false;
  }

  if (requiredPermissions && requiredPermissions.length > 0) {
    return hasPermission(r, requiredPermissions);
  }

  return true;
};
