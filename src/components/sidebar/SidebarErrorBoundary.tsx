import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  hasError: boolean;
}

class SidebarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[SidebarErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="flex flex-col items-center justify-center gap-3 p-6 text-center h-full"
        style={{ color: "hsl(var(--sidebar-muted))" }}
      >
        <AlertTriangle className="h-6 w-6" />
        <p className="text-xs">Menu unavailable</p>
        <button
          onClick={() => this.setState({ hasError: false })}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors"
          style={{
            backgroundColor: "hsl(var(--sidebar-accent) / 0.3)",
            color: "hsl(var(--sidebar-primary-foreground))",
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }
}

export default SidebarErrorBoundary;
