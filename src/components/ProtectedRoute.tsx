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
  const { state, role } = useAuth();
  const location = useLocation();

  // Pure renderer. No fetching, no side effects.
  // Any non-terminal state → loader (prevents premature redirect before role
  // resolves from the database).
  if (state !== AUTH_STATES.READY && state !== AUTH_STATES.UNAUTHENTICATED) {
    return <Loader />;
  }

  if (state === AUTH_STATES.UNAUTHENTICATED) {
    return <Navigate to={ROUTES.AUTH} replace state={{ from: location }} />;
  }

  // state === READY → role guaranteed non-null by AuthContext invariant,
  // but we still validate via the central guard (zero trust).
  const allowed = canAccessRoute(role, {
    allowedRoles,
    requiredPermissions,
  });

  if (allowed) return <>{children}</>;

  // Denied. Resolve a safe landing route from the central role-route map.
  // Unknown / invalid roles → /unauthorized (NEVER admin dashboard).
  const home = getRoleHomeRoute(role);

  // Loop guard: if the role's home itself is the path being denied, or if
  // we'd redirect to /unauthorized while already there → render unauthorized
  // directly without another navigation.
  if (home === location.pathname || location.pathname === ROUTES.UNAUTHORIZED) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <Navigate to={home} replace />;
};

export default ProtectedRoute;
