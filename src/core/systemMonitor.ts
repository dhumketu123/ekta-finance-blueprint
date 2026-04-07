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

  destroy() {
    this.observers.forEach((obs) => obs.disconnect());
    this.observers = [];
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
    // Future telemetry hook
    // sendToAnalytics(metric)
  }

  // ----------------------------------
  // Runtime Errors
  // ----------------------------------
  private setupGlobalErrorHandler() {
    window.addEventListener("error", (event) => {
      this.reportError({
        message: event.message,
        stack: event.error?.stack,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
  }

  private setupUnhandledRejectionHandler() {
    window.addEventListener("unhandledrejection", (event) => {
      this.reportError({
        message:
          typeof event.reason === "string"
            ? event.reason
            : event.reason?.message || "Unhandled Promise Rejection",
        stack: event.reason?.stack,
      });
    });
  }

  private reportError(error: ErrorPayload) {
    if (import.meta.env.DEV) {
      console.error("[RuntimeError]", error);
    }
    // Future telemetry hook
    // sendErrorToMonitoring(error)
  }
}

export const systemMonitor = SystemMonitor.getInstance();
