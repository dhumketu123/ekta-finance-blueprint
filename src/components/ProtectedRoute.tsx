import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AUTH_STATES } from "@/contexts/AuthContext";
import { ROUTES } from "@/config/routes";
import { getRoleHomeRoute } from "@/config/roleRoutes";
import { canAccessRoute } from "@/config/routeGuard";
import { ROLE_PERMISSIONS, type AppRole, type AppPermission } from "@/config/rolePermissions";
import { logInvalidRoleAccess } from "@/security/authAudit";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Role membership gate. Empty/undefined → any valid role passes. */
  allowedRoles?: AppRole[];
  /** Capability gate (AND semantics). Optional. */
  requiredPermissions?: AppPermission[];
}

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const ProtectedRoute = ({
  children,
  allowedRoles,
  requiredPermissions,
}: ProtectedRouteProps) => {
  const { state, role, user } = useAuth();
  const location = useLocation();

  const isTerminal =
    state === AUTH_STATES.READY || state === AUTH_STATES.UNAUTHENTICATED;

  // Zero-trust capability check (only meaningful in READY state).
  const allowed =
    state === AUTH_STATES.READY
      ? canAccessRoute(role, { allowedRoles, requiredPermissions })
      : false;

  // Fail-safe audit: log invalid/missing/denied role events without blocking
  // the render path. Skipped during ROLE_LOADING to avoid noise.
  useEffect(() => {
    if (state !== AUTH_STATES.READY || allowed) return;

    const normalized = role?.toLowerCase().trim();
    const reason: "missing_role" | "unknown_role" | "permission_denied" =
      !normalized
        ? "missing_role"
        : !(normalized in ROLE_PERMISSIONS)
          ? "unknown_role"
          : "permission_denied";

    logInvalidRoleAccess({
      role,
      userId: user?.id ?? null,
      route: location.pathname,
      reason,
      requiredPermissions,
      allowedRoles,
    });
  }, [state, allowed, role, user?.id, location.pathname, requiredPermissions, allowedRoles]);

  // Pure renderer below the audit effect.
  if (!isTerminal) return <Loader />;

  if (state === AUTH_STATES.UNAUTHENTICATED) {
    return <Navigate to={ROUTES.AUTH} replace state={{ from: location }} />;
  }

  if (allowed) return <>{children}</>;

  // Denied. Resolve a safe landing route from the central role-route map.
  // Unknown / invalid roles → /unauthorized (NEVER admin dashboard).
  const home = getRoleHomeRoute(role);

  // Loop guard.
  if (home === location.pathname || location.pathname === ROUTES.UNAUTHORIZED) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <Navigate to={home} replace />;
};

export default ProtectedRoute;
