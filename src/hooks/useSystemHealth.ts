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
  run_id?: string;
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

export interface AutoFixLog {
  id: string;
  action_name: string;
  triggered_by_check: string;
  success: boolean;
  error_message: string | null;
  execution_ms: number | null;
  created_at: string;
}

export interface HealthLogEntry {
  id: string;
  run_id: string;
  check_name: string;
  status: string;
  latency_ms: number | null;
  detail: string | null;
  overall_status: string;
  total_latency_ms: number | null;
  created_at: string;
}

/**
 * Fetches system health with configurable refetch interval.
 */
export const useSystemHealth = (enabled = true, refetchIntervalMs = 15_000) => {
  return useQuery({
    queryKey: ["system_health"],
    queryFn: async (): Promise<SystemHealthData> => {
      const { data, error } = await supabase.functions.invoke("system-health");
      if (error) throw error;
      return data as SystemHealthData;
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: refetchIntervalMs,
  });
};

/**
 * Fetches recent auto-fix logs from the database.
 */
export const useAutoFixLogs = (limit = 20) => {
  return useQuery({
    queryKey: ["auto_fix_logs", limit],
    queryFn: async (): Promise<AutoFixLog[]> => {
      const { data, error } = await supabase
        .from("auto_fix_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AutoFixLog[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
};

/**
 * Fetches recent health log history from the database.
 */
export const useHealthHistory = (limit = 50) => {
  return useQuery({
    queryKey: ["health_history", limit],
    queryFn: async (): Promise<HealthLogEntry[]> => {
      const { data, error } = await supabase
        .from("system_health_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as HealthLogEntry[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
};

const TREND_STORAGE_KEY = "knowledge_health_trend";
const DEFAULT_MAX_POINTS = 48;
const DEFAULT_MIN_INTERVAL_MS = 10 * 60 * 1000;

export const useHealthTrend = (
  health: SystemHealthData | undefined,
  options?: { minIntervalMs?: number; maxPoints?: number }
) => {
  const minInterval = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxPoints = options?.maxPoints ?? DEFAULT_MAX_POINTS;
  const [page, setPage] = useState(0);

  const getTrend = useCallback((): HealthTrendPoint[] => {
    try {
      const stored = localStorage.getItem(TREND_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }, []);

  useEffect(() => {
    if (!health) return;
    try {
      const trend = getTrend();
      const lastPoint = trend[trend.length - 1];
      if (lastPoint && (Date.now() - new Date(lastPoint.timestamp).getTime()) < minInterval) return;
      trend.push({
        timestamp: new Date().toISOString(),
        pass: health.summary.pass,
        warn: health.summary.warn,
        fail: health.summary.fail,
        status: health.status,
      });
      localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify(trend.slice(-maxPoints)));
    } catch { /* localStorage unavailable */ }
  }, [health, minInterval, maxPoints, getTrend]);

  const allTrend = getTrend();
  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(allTrend.length / PAGE_SIZE));
  const safeP = Math.min(page, totalPages - 1);
  const start = Math.max(0, allTrend.length - PAGE_SIZE * (safeP + 1));
  const end = allTrend.length - PAGE_SIZE * safeP;

  return {
    data: allTrend.slice(start, end),
    page: safeP,
    totalPages,
    setPage,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
  };
};

/**
 * Unified realtime subscription — invalidates health + knowledge queries.
 */
export const useHealthRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const existing = supabase.getChannels().find(c => c.topic === "health-realtime");
    if (existing) return;

    const channel = supabase
      .channel("health-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "knowledge_sync_log" }, () => {
        queryClient.invalidateQueries({ queryKey: ["system_health"] });
        queryClient.invalidateQueries({ queryKey: ["knowledge_sync_logs"] });
        queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
        queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_health_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["health_history"] });
        queryClient.invalidateQueries({ queryKey: ["system_health"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "auto_fix_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["auto_fix_logs"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);
};
