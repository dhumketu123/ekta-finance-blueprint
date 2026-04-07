import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Optional callback for future error reporting (e.g. Sentry) */
  onError?: (error: Error, componentStack: string | null) => void;
}

interface State {
  hasError: boolean;
  /** Tracks the pathname that triggered the error for auto-reset */
  errorPathname: string | null;
}

class SidebarErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorPathname: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true, errorPathname: window.location.pathname };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[SidebarErrorBoundary]", error, info.componentStack);
    }
    this.props.onError?.(error, info.componentStack ?? null);
  }

  componentDidUpdate() {
    // Auto-reset when user navigates to a different route
    if (
      this.state.hasError &&
      this.state.errorPathname &&
      window.location.pathname !== this.state.errorPathname
    ) {
      this.setState({ hasError: false, errorPathname: null });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full"
        role="alert"
        style={{ color: "hsl(var(--sidebar-muted))" }}
      >
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        <p className="text-xs">Menu unavailable</p>
        <button
          onClick={() => this.setState({ hasError: false, errorPathname: null })}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors"
          style={{
            backgroundColor: "hsl(var(--sidebar-accent) / 0.3)",
            color: "hsl(var(--sidebar-primary-foreground))",
          }}
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }
}

export default SidebarErrorBoundary;
