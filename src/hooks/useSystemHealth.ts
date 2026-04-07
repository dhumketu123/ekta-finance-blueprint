import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
  latency_ms?: number;
}

export interface SystemHealthData {
  status: "healthy" | "degraded" | "unhealthy" | "error";
  timestamp: string;
  total_latency_ms: number;
  summary: { pass: number; warn: number; fail: number };
  checks: HealthCheck[];
  thresholds?: { stuck_running_minutes: number; stale_hours: number };
}

export interface HealthTrendPoint {
  timestamp: string;
  pass: number;
  warn: number;
  fail: number;
  status: string;
}

/**
 * Fetches system health with auto-refetch every 60s.
 */
export const useSystemHealth = (enabled = true) => {
  return useQuery({
    queryKey: ["system_health"],
    queryFn: async (): Promise<SystemHealthData> => {
      const { data, error } = await supabase.functions.invoke("system-health");
      if (error) throw error;
      return data as SystemHealthData;
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
};

const TREND_STORAGE_KEY = "knowledge_health_trend";
const DEFAULT_MAX_POINTS = 48;
const DEFAULT_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 min

/**
 * Maintains a rolling health trend stored in localStorage.
 * Supports configurable interval and pagination for multi-tab reliability.
 */
export const useHealthTrend = (
  health: SystemHealthData | undefined,
  options?: { minIntervalMs?: number; maxPoints?: number }
) => {
  const minInterval = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxPoints = options?.maxPoints ?? DEFAULT_MAX_POINTS;

  // Page state for trend pagination
  const [page, setPage] = useState(0);

  const getTrend = useCallback((): HealthTrendPoint[] => {
    try {
      const stored = localStorage.getItem(TREND_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (!health) return;

    try {
      const trend = getTrend();
      const lastPoint = trend[trend.length - 1];
      const now = Date.now();
      if (lastPoint && (now - new Date(lastPoint.timestamp).getTime()) < minInterval) {
        return;
      }

      trend.push({
        timestamp: new Date().toISOString(),
        pass: health.summary.pass,
        warn: health.summary.warn,
        fail: health.summary.fail,
        status: health.status,
      });

      const trimmed = trend.slice(-maxPoints);
      localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // localStorage unavailable
    }
  }, [health, minInterval, maxPoints, getTrend]);

  const allTrend = getTrend();
  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(allTrend.length / PAGE_SIZE));
  const safeP = Math.min(page, totalPages - 1);
  const start = Math.max(0, allTrend.length - PAGE_SIZE * (safeP + 1));
  const end = allTrend.length - PAGE_SIZE * safeP;
  const visibleTrend = allTrend.slice(start, end);

  return {
    data: visibleTrend,
    page: safeP,
    totalPages,
    setPage,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
  };
};

/**
 * Unified realtime subscription for knowledge_sync_log changes.
 * Invalidates both system_health and knowledge queries.
 */
export const useHealthRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const existing = supabase.getChannels().find(c => c.topic === "health-realtime");
    if (existing) return;

    const channel = supabase
      .channel("health-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "knowledge_sync_log" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["system_health"] });
          queryClient.invalidateQueries({ queryKey: ["knowledge_sync_logs"] });
          queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
          queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
