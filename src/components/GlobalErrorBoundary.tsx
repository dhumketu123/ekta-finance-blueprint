import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorState {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorState
> {
  state: ErrorState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      console.error("[GlobalErrorBoundary]", error, info.componentStack);
    }
  }

  private handleRefresh = () => window.location.reload();

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
        style={{
          background:
            "linear-gradient(135deg, hsl(222 47% 11%), hsl(217 33% 17%), hsl(222 47% 11%))",
        }}
      >
        {/* Glassmorphic card */}
        <div
          className="relative w-full max-w-md rounded-2xl border border-white/10 p-8 text-center"
          style={{
            background: "hsl(220 20% 14% / 0.7)",
            backdropFilter: "blur(24px) saturate(1.4)",
            WebkitBackdropFilter: "blur(24px) saturate(1.4)",
            boxShadow:
              "0 24px 48px -12px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-400/20">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-white/90 mb-2">
            সিস্টেমে সাময়িক সমস্যা হচ্ছে
          </h1>
          <p className="text-sm text-white/50 mb-1">
            System Encountered an Issue
          </p>

          {/* Subtitle */}
          <p className="text-sm text-white/40 mt-4 leading-relaxed">
            অনুগ্রহ করে পেজটি রিফ্রেশ করুন অথবা কিছুক্ষণ পর আবার চেষ্টা করুন।
          </p>
          <p className="text-xs text-white/30 mt-1">
            Please refresh the page or try again in a moment.
          </p>

          {/* Refresh button */}
          <button
            onClick={this.handleRefresh}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white/90 ring-1 ring-white/10 transition-all duration-200 hover:bg-white/15 hover:ring-white/20 active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
            রিফ্রেশ করুন / Refresh
          </button>

          {/* Error detail (dev only) */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-[11px] text-white/25 hover:text-white/40 transition-colors">
                Dev: Error details
              </summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] text-red-300/70 leading-relaxed">
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack?.slice(0, 600)}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

export default GlobalErrorBoundary;
