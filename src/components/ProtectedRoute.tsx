import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTES } from "@/config/routes";
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

  // Any non-terminal state → show loader. ProtectedRoute does NOT fetch roles.
  if (
    state === "IDLE" ||
    state === "AUTH_LOADING" ||
    state === "AUTHENTICATED" ||
    state === "ROLE_LOADING"
  ) {
    return <Loader />;
  }

  if (state === "UNAUTHENTICATED") {
    return <Navigate to={ROUTES.AUTH} replace state={{ from: location }} />;
  }

  // state === "AUTH_READY" — role hydrated, enforce role gates.
  if (role === "alumni" && allowedRoles && !allowedRoles.includes("alumni")) {
    return <Navigate to={ROUTES.ALUMNI} replace />;
  }

  if (role === "investor" && allowedRoles && !allowedRoles.includes("investor")) {
    return <Navigate to={ROUTES.INVESTOR_WALLET} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role as AppRole)) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
