import React from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[RouteErrorBoundary] CRASH:", error?.message, error?.stack?.slice(0, 500), "Component:", info.componentStack?.slice(0, 300));
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center gap-4">
        <div className="p-4 rounded-full bg-destructive/10">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          এই পেজে সমস্যা হয়েছে
        </h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          অনুগ্রহ করে রিফ্রেশ করুন অথবা ড্যাশবোর্ডে ফিরে যান।
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { window.location.href = "/"; }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> ড্যাশবোর্ড
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> রিফ্রেশ
          </button>
        </div>
      </div>
    );
  }
}

export default RouteErrorBoundary;
