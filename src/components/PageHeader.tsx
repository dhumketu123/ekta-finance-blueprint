import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader = ({ title, description, actions }: PageHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const handleBack = useCallback(() => {
    // For nested routes like /reports/trial-balance, go to parent /reports
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length > 1) {
      navigate("/" + segments.slice(0, -1).join("/"));
    } else if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate, location.pathname]);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0 flex items-start gap-3">
        {!isHome && (
          <button
            type="button"
            onClick={handleBack}
            className="group mt-0.5 flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 hover:bg-primary hover:shadow-md flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer relative z-10"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-primary group-hover:text-primary-foreground transition-colors duration-200" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-card-foreground tracking-tight truncate">{title}</h1>
          {description && <p className="mt-1 text-xs sm:text-sm text-muted-foreground font-medium">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
};

export default PageHeader;
