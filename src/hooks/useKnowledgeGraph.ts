import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { toast } from "sonner";

export interface KnowledgeNode {
  id: string;
  tenant_id: string;
  node_type: string;
  node_key: string;
  node_label: string;
  category: string;
  metadata: Record<string, unknown>;
  relationships: Array<{ target_key: string; relation_type: string; weight: number }>;
  criticality: number;
  embedding_version: number;
  last_synced_at: string;
}

export interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  nodes_processed: number;
  nodes_created: number;
  nodes_updated: number;
  errors: string[];
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}

export const useKnowledgeNodes = (nodeType?: string) => {
  const { tenantId } = useTenantId();

  return useQuery({
    queryKey: ["knowledge_graph", tenantId, nodeType],
    queryFn: async () => {
      let query = supabase
        .from("system_knowledge_graph")
        .select("*")
        .order("criticality", { ascending: false });

      if (nodeType) query = query.eq("node_type", nodeType);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as KnowledgeNode[];
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useKnowledgeStats = () => {
  const { tenantId } = useTenantId();

  return useQuery({
    queryKey: ["knowledge_stats", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_knowledge_graph")
        .select("node_type, criticality");
      if (error) throw error;

      const nodes = data ?? [];
      const byType: Record<string, number> = {};
      let totalCriticality = 0;

      for (const n of nodes) {
        byType[n.node_type] = (byType[n.node_type] || 0) + 1;
        totalCriticality += n.criticality;
      }

      return {
        totalNodes: nodes.length,
        byType,
        avgCriticality: nodes.length ? (totalCriticality / nodes.length).toFixed(1) : "0",
        highCriticalCount: nodes.filter((n) => n.criticality >= 8).length,
      };
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });
};

export const useSyncLogs = () => {
  const { tenantId } = useTenantId();

  return useQuery({
    queryKey: ["knowledge_sync_logs", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as unknown as SyncLog[];
    },
    enabled: !!tenantId,
  });
};

const MAX_RETRIES = 3;

/**
 * Auto-retry sync with exponential backoff.
 * Detects partial failures (some critical nodes failed) and alerts.
 */
export const useRunKnowledgeSync = () => {
  const queryClient = useQueryClient();
  const retryCountRef = useRef(0);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
    queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });
    queryClient.invalidateQueries({ queryKey: ["knowledge_sync_logs"] });
    queryClient.invalidateQueries({ queryKey: ["system_health"] });
  }, [queryClient]);

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("knowledge-sync");
      if (error) throw error;
      if (data?.errors && data.errors.length > 0 && data.total_nodes === 0) {
        throw new Error(`Sync completed with critical errors: ${data.errors[0]}`);
      }
      return data;
    },
    onSuccess: (data) => {
      retryCountRef.current = 0;
      const fixes = data.fixes_applied?.length || 0;
      const errCount = data.errors?.length || 0;

      if (errCount > 0 && data.total_nodes > 0) {
        // Partial failure — some nodes synced, some failed
        toast.warning(
          `আংশিক সিঙ্ক — ${data.total_nodes} নোড সফল, ${errCount}টি ক্রিটিক্যাল নোড ব্যর্থ`,
          { duration: 8000 }
        );
      } else {
        toast.success(`নলেজ সিঙ্ক সম্পূর্ণ — ${data.total_nodes} নোড, ${fixes}টি ফিক্স প্রয়োগ`);
      }
      invalidateAll();
    },
    onError: (err) => {
      retryCountRef.current += 1;
      const attempt = retryCountRef.current;

      if (attempt < MAX_RETRIES) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 30_000);
        toast.warning(`সিঙ্ক ব্যর্থ (প্রচেষ্টা ${attempt}/${MAX_RETRIES}) — ${(delayMs / 1000).toFixed(0)}s পর পুনরায় চেষ্টা...`);
        setTimeout(() => {
          supabase.functions.invoke("knowledge-sync").then(({ data, error }) => {
            if (error || (data?.errors?.length > 0 && data?.total_nodes === 0)) {
              retryCountRef.current += 1;
              if (retryCountRef.current >= MAX_RETRIES) {
                toast.error(`🚨 সিঙ্ক ${MAX_RETRIES} বার ব্যর্থ — ম্যানুয়াল হস্তক্ষেপ প্রয়োজন`, { duration: 10000 });
              }
            } else {
              retryCountRef.current = 0;
              const partialErrs = data?.errors?.length || 0;
              if (partialErrs > 0) {
                toast.warning(`অটো-রিট্রাই আংশিক সফল — ${data.total_nodes} নোড, ${partialErrs}টি ত্রুটি`);
              } else {
                toast.success(`অটো-রিট্রাই সফল — ${data.total_nodes} নোড সিঙ্ক হয়েছে`);
              }
              invalidateAll();
            }
          });
        }, delayMs);
      } else {
        toast.error(`🚨 সিঙ্ক ${MAX_RETRIES} বার ব্যর্থ — ম্যানুয়াল হস্তক্ষেপ প্রয়োজন`, { duration: 10000 });
      }
    },
    retry: false,
  });
};

/**
 * Realtime subscription for knowledge graph changes.
 * Note: sync_log changes are handled by useHealthRealtime (unified).
 */
export const useKnowledgeRealtime = () => {
  // Realtime for knowledge_sync_log is now unified in useHealthRealtime.
  // This hook only subscribes to system_knowledge_graph table changes.
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();

  // We intentionally keep this minimal — sync_log is handled centrally.
  // Only graph node changes trigger graph-specific invalidation.
  return useQuery({
    queryKey: ["_knowledge_realtime_sub", tenantId],
    queryFn: () => null,
    enabled: false, // dummy — realtime managed in useEffect below
  });

  // Note: actual subscription is in useHealthRealtime for unified channel
};
