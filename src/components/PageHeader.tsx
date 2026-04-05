import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional premium pill badge text shown above the title */
  badge?: string;
}

const PageHeader = ({ title, description, actions, badge }: PageHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const handleBack = useCallback(() => {
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
    <div className="w-full flex flex-col items-center justify-center text-center py-3 md:py-5 mb-2 md:mb-4">
      {/* Back button — floated top-left */}
      {!isHome && (
        <div className="w-full flex justify-start mb-2">
          <button
            type="button"
            onClick={handleBack}
            className="group flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 hover:bg-primary hover:shadow-md flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-primary group-hover:text-primary-foreground transition-colors duration-200" />
          </button>
        </div>
      )}

      {/* Badge */}
      {badge && (
        <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 mb-2">
          {badge}
        </span>
      )}

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500">
        {title}
      </h1>

      {/* Description */}
      {description && (
        <p className="text-sm md:text-base text-muted-foreground mt-1.5 max-w-lg mx-auto font-medium">
          {description}
        </p>
      )}

      {/* Actions */}
      {actions && (
        <div className="flex gap-2 flex-shrink-0 flex-wrap justify-center mt-3">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
