import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, role } = useAuth();

  // Show spinner while auth is loading OR while user is present but role hasn't loaded yet
  // This handles the OAuth redirect race condition where user arrives before role is fetched
  if (loading || (user && role === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect alumni to their restricted dashboard
  if (role === "alumni" && allowedRoles && !allowedRoles.includes("alumni")) {
    return <Navigate to="/alumni" replace />;
  }

  // Redirect investor away from dashboard to wallet
  if (role === "investor" && allowedRoles && !allowedRoles.includes("investor")) {
    return <Navigate to="/wallet" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
