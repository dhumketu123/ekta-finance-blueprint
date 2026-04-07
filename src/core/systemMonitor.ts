// src/core/systemMonitor.ts
// Enterprise-grade runtime + performance baseline
// Zero dependency | Leak-safe | SSR-guarded | Telemetry-ready

type MetricPayload = {
  name: string;
  value: number;
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
  private observers: PerformanceObserver[] = [];
  private clsValue = 0;
  private errorHandler?: (event: ErrorEvent) => void;
  private rejectionHandler?: (event: PromiseRejectionEvent) => void;
  private telemetryAdapter?: (type: "metric" | "error", payload: any) => void;

  static getInstance() {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  init() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    this.setupPerformanceObservers();
    this.setupGlobalErrorHandler();
    this.setupUnhandledRejectionHandler();
  }

  public destroy() {
    this.observers.forEach((obs) => obs.disconnect());
    this.observers = [];

    if (this.errorHandler) {
      window.removeEventListener("error", this.errorHandler);
    }

    if (this.rejectionHandler) {
      window.removeEventListener("unhandledrejection", this.rejectionHandler);
    }
  }

  public setTelemetryAdapter(
    adapter: (type: "metric" | "error", payload: any) => void
  ) {
    this.telemetryAdapter = adapter;
  }

  // ----------------------------------
  // Performance Monitoring (Hardened)
  // ----------------------------------
  private setupPerformanceObservers() {
    if (!("PerformanceObserver" in window)) return;

    this.observeLCP();
    this.observeCLS();
    this.observeFID();
  }

  private observeLCP() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.reportMetric({
            name: "LCP",
            value: (entry as any).renderTime || entry.startTime,
          });
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      this.observers.push(observer);
    } catch {}
  }

  private observeCLS() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            this.clsValue += entry.value;
          }
        }
        this.reportMetric({
          name: "CLS",
          value: this.clsValue,
        });
      });
      observer.observe({ type: "layout-shift", buffered: true });
      this.observers.push(observer);
    } catch {}
  }

  private observeFID() {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          this.reportMetric({
            name: "FID",
            value: entry.processingStart - entry.startTime,
          });
        }
      });
      observer.observe({ type: "first-input", buffered: true });
      this.observers.push(observer);
    } catch {}
  }

  private reportMetric(metric: MetricPayload) {
    if (import.meta.env.DEV) {
      console.debug("[PerfMetric]", metric);
    }

    if (this.telemetryAdapter) {
      this.telemetryAdapter("metric", metric);
    }
  }

  // ----------------------------------
  // Runtime Errors
  // ----------------------------------
  private setupGlobalErrorHandler() {
    this.errorHandler = (event: ErrorEvent) => {
      this.reportError({
        message: event.message,
        stack: event.error?.stack,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    window.addEventListener("error", this.errorHandler);
  }

  private setupUnhandledRejectionHandler() {
    this.rejectionHandler = (event: PromiseRejectionEvent) => {
      this.reportError({
        message:
          typeof event.reason === "string"
            ? event.reason
            : event.reason?.message || "Unhandled Promise Rejection",
        stack: event.reason?.stack,
      });
    };

    window.addEventListener("unhandledrejection", this.rejectionHandler);
  }

  private reportError(error: ErrorPayload) {
    if (import.meta.env.DEV) {
      console.error("[RuntimeError]", error);
    }

    if (this.telemetryAdapter) {
      this.telemetryAdapter("error", error);
    }
  }
}

export const systemMonitor = SystemMonitor.getInstance();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    systemMonitor.destroy();
  });
}
