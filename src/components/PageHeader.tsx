import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader = ({ title, description, actions }: PageHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0 flex items-start gap-3">
        {!isHome && (
          <button
            onClick={() => navigate(-1)}
            className="group mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary hover:shadow-md flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-primary group-hover:text-primary-foreground transition-colors duration-200" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-primary truncate">{title}</h1>
          {description && <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
};

export default PageHeader;
