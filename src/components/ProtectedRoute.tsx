import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AUTH_STATES } from "@/contexts/AuthContext";
import { ROUTES } from "@/config/routes";
import { getRoleHomeRoute } from "@/config/roleRoutes";
import type { AppRole } from "@/hooks/usePermissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

const Loader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { state, role } = useAuth();
  const location = useLocation();

  // Pure renderer: ProtectedRoute does NOT fetch roles, mutate state, or trigger side effects.
  // Any non-terminal state → loader (prevents premature redirect before role is loaded).
  if (state !== AUTH_STATES.READY && state !== AUTH_STATES.UNAUTHENTICATED) {
    return <Loader />;
  }

  if (state === AUTH_STATES.UNAUTHENTICATED) {
    return <Navigate to={ROUTES.AUTH} replace state={{ from: location }} />;
  }

  // state === READY — role guaranteed non-null by AuthContext invariant.

  // No role gate on this route → allow.
  if (!allowedRoles || allowedRoles.length === 0) {
    return <>{children}</>;
  }

  // Role allowed → render.
  if (role && allowedRoles.includes(role as AppRole)) {
    return <>{children}</>;
  }

  // Role denied → redirect to that role's safe home route.
  // Unknown / invalid roles → /unauthorized (no privilege fallback).
  const home = role ? getRoleHomeRoute(role) : ROUTES.UNAUTHORIZED;

  // Avoid infinite redirect if the role's home itself is denied.
  if (home === location.pathname) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <Navigate to={home} replace />;
};

export default ProtectedRoute;
