import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ROUTES } from "@/config/routes";
import type { AppRole } from "@/hooks/usePermissions";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, role } = useAuth();

  // Loading: auth hydrating or role not yet fetched
  if (loading || (user && role === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Not authenticated → auth page
  if (!user) {
    return <Navigate to={ROUTES.AUTH} replace />;
  }

  // Role-specific redirects for restricted roles
  if (role === "alumni" && allowedRoles && !allowedRoles.includes("alumni")) {
    return <Navigate to={ROUTES.ALUMNI} replace />;
  }

  if (role === "investor" && allowedRoles && !allowedRoles.includes("investor")) {
    return <Navigate to={ROUTES.INVESTOR_WALLET} replace />;
  }

  // Role not in allowed list → unauthorized
  if (allowedRoles && role && !allowedRoles.includes(role as AppRole)) {
    return <Navigate to={ROUTES.UNAUTHORIZED} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
