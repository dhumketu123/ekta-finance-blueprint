import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      return (data ?? []) as SyncLog[];
    },
    enabled: !!tenantId,
  });
};

export const useRunKnowledgeSync = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("knowledge-sync");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`নলেজ সিঙ্ক সম্পূর্ণ — ${data.total_nodes} নোড প্রসেস হয়েছে`);
      queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_sync_logs"] });
    },
    onError: (err) => {
      toast.error(`সিঙ্ক ব্যর্থ: ${err.message}`);
    },
  });
};
