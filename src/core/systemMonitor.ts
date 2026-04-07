// src/core/systemMonitor.ts
// Production-grade performance + runtime stability monitor
// Zero dependency | Tree-shake safe | No memory leaks

type MetricPayload = {
  name: string;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
};

type ErrorPayload = {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
};

class SystemMonitor {
  private static instance: SystemMonitor;
  private initialized = false;

  static getInstance() {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.setupPerformanceObserver();
    this.setupGlobalErrorHandler();
    this.setupUnhandledRejectionHandler();
  }

  // -----------------------------
  // Performance Monitoring
  // -----------------------------
  private setupPerformanceObserver() {
    if (!("PerformanceObserver" in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry: any) => {
          const metric: MetricPayload = {
            name: entry.name,
            value: entry.value || entry.duration || 0,
          };

          if (import.meta.env.DEV) {
            console.debug("[PerfMetric]", metric);
          }
        });
      });

      observer.observe({ type: "largest-contentful-paint", buffered: true });
      observer.observe({ type: "layout-shift", buffered: true });
      observer.observe({ type: "first-input", buffered: true });
    } catch {
      // silent fail — never crash app
    }
  }

  // -----------------------------
  // Global Runtime Errors
  // -----------------------------
  private setupGlobalErrorHandler() {
    window.addEventListener("error", (event) => {
      const payload: ErrorPayload = {
        message: event.message,
        stack: event.error?.stack,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      };

      if (import.meta.env.DEV) {
        console.error("[GlobalError]", payload);
      }
    });
  }

  // -----------------------------
  // Unhandled Promise Rejections
  // -----------------------------
  private setupUnhandledRejectionHandler() {
    window.addEventListener("unhandledrejection", (event) => {
      const payload: ErrorPayload = {
        message:
          typeof event.reason === "string"
            ? event.reason
            : event.reason?.message || "Unhandled Promise Rejection",
        stack: event.reason?.stack,
      };

      if (import.meta.env.DEV) {
        console.error("[UnhandledRejection]", payload);
      }
    });
  }
}

export const systemMonitor = SystemMonitor.getInstance();
