// src/core/systemMonitor.ts
// Enterprise-grade runtime + performance baseline
// Zero dependency | Leak-safe | SSR-guarded | Telemetry-ready
// Hardened: event deduplication + CLS rolling reset + DEV-visible observer failures

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

const DEDUPE_WINDOW_MS = 2000;
const CLS_RESET_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EVENT_CACHE_MAX = 200;

class SystemMonitor {
  private static instance: SystemMonitor;
  private initialized = false;
  private observers: PerformanceObserver[] = [];
  private clsValue = 0;
  private clsResetTimer?: number;
  private errorHandler?: (event: ErrorEvent) => void;
  private rejectionHandler?: (event: PromiseRejectionEvent) => void;
  private telemetryAdapter?: (type: "metric" | "error", payload: any) => void;
  private eventCache: Map<string, number> = new Map();

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
    this.setupClsRollingReset();
  }

  public destroy() {
    this.observers.forEach((obs) => obs.disconnect());
    this.observers = [];

    if (this.errorHandler) {
      window.removeEventListener("error", this.errorHandler);
      this.errorHandler = undefined;
    }

    if (this.rejectionHandler) {
      window.removeEventListener("unhandledrejection", this.rejectionHandler);
      this.rejectionHandler = undefined;
    }

    if (this.clsResetTimer) {
      window.clearInterval(this.clsResetTimer);
      this.clsResetTimer = undefined;
    }

    this.eventCache.clear();
    this.telemetryAdapter = undefined;
    this.initialized = false;
  }

  // ----------------------------------
  // Event Deduplication (Phase 4.1)
  // ----------------------------------
  private isDuplicate(key: string): boolean {
    const now = Date.now();
    const last = this.eventCache.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) {
      return true;
    }
    this.eventCache.set(key, now);

    // Bounded cache — evict oldest when over capacity
    if (this.eventCache.size > EVENT_CACHE_MAX) {
      const firstKey = this.eventCache.keys().next().value;
      if (firstKey !== undefined) this.eventCache.delete(firstKey);
    }
    return false;
  }

  public trackEvent(eventName: string, payload?: Record<string, any>) {
    if (!this.initialized) return;

    // Dedup key includes payload signature for granularity
    const sig = payload ? JSON.stringify(payload) : "";
    const key = `evt:${eventName}:${sig}`;
    if (this.isDuplicate(key)) return;

    const eventPayload = {
      name: eventName,
      timestamp: Date.now(),
      details: payload ?? {},
    };

    if (import.meta.env.DEV) {
      console.debug("[TrackEvent]", eventPayload);
    }

    if (this.telemetryAdapter) {
      this.telemetryAdapter("metric", eventPayload);
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
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[SystemMonitor] LCP observer failed:", err);
      }
    }
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
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[SystemMonitor] CLS observer failed:", err);
      }
    }
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
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[SystemMonitor] FID observer failed:", err);
      }
    }
  }

  // Phase 4.2 — CLS rolling reset (avoid unbounded growth on long sessions)
  private setupClsRollingReset() {
    this.clsResetTimer = window.setInterval(() => {
      this.clsValue = 0;
      if (import.meta.env.DEV) {
        console.debug("[SystemMonitor] CLS rolling reset");
      }
    }, CLS_RESET_INTERVAL_MS);
  }

  private reportMetric(metric: MetricPayload) {
    // Dedupe identical metric within window (e.g. CLS bursts)
    const key = `metric:${metric.name}:${metric.value.toFixed(4)}`;
    if (this.isDuplicate(key)) return;

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
    // Dedupe identical errors within window (prevents flood loops)
    const key = `err:${error.message}:${error.source ?? ""}:${error.lineno ?? ""}`;
    if (this.isDuplicate(key)) return;

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
