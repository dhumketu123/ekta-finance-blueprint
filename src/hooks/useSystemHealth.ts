import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
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
 * Also maintains a 24h trend history in memory.
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
const MAX_TREND_POINTS = 48; // 24h at 30min intervals

/**
 * Maintains a rolling 24h health trend stored in localStorage.
 * Each new health fetch appends a data point (max every 10min).
 */
export const useHealthTrend = (health: SystemHealthData | undefined) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!health) return;

    try {
      const stored = localStorage.getItem(TREND_STORAGE_KEY);
      const trend: HealthTrendPoint[] = stored ? JSON.parse(stored) : [];

      // Only add a point if last one is >10min old
      const lastPoint = trend[trend.length - 1];
      const now = Date.now();
      if (lastPoint && (now - new Date(lastPoint.timestamp).getTime()) < 10 * 60 * 1000) {
        return;
      }

      trend.push({
        timestamp: new Date().toISOString(),
        pass: health.summary.pass,
        warn: health.summary.warn,
        fail: health.summary.fail,
        status: health.status,
      });

      // Keep only last MAX_TREND_POINTS
      const trimmed = trend.slice(-MAX_TREND_POINTS);
      localStorage.setItem(TREND_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // localStorage unavailable — silently skip
    }
  }, [health]);

  // Return current trend data
  try {
    const stored = localStorage.getItem(TREND_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as HealthTrendPoint[]) : [];
  } catch {
    return [];
  }
};

/**
 * Realtime subscription for system health updates via sync log changes.
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};
