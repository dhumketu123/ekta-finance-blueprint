import { useQuery } from "@tanstack/react-query";
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
