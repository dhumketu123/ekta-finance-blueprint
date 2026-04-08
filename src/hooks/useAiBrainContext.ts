import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ═══════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════ */

export interface AiContextEntry {
  entity_category: string;
  entity_name: string;
  description: string | null;
  version: number;
  criticality_score: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  knowledge_metadata: Record<string, unknown> | null;
}

export interface EntityRelation {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: string;
}

export interface DnaHistoryEntry {
  id: string;
  dna_id: string;
  snapshot: Record<string, unknown>;
  version: number;
  changed_at: string;
}

export interface ContextStats {
  totalEntries: number;
  byCategory: Record<string, number>;
  avgCriticality: string;
  highCriticalCount: number;
  activeCount: number;
}

/* ═══════════════════════════════════════════
   MERGED CONTEXT QUERY (ai_assistant_overview)
   ═══════════════════════════════════════════ */

export const useAiMergedContext = () =>
  useQuery({
    queryKey: ["ai_brain_merged_context"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_assistant_overview")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as AiContextEntry[];
    },
    staleTime: 2 * 60_000,
  });

/* ═══════════════════════════════════════════
   ENTITY RELATIONS (dependency graph)
   ═══════════════════════════════════════════ */

export const useEntityRelations = () =>
  useQuery({
    queryKey: ["ai_brain_entity_relations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_relations")
        .select("id, source_entity_id, target_entity_id, relation_type");
      if (error) throw error;
      return (data ?? []) as EntityRelation[];
    },
    staleTime: 5 * 60_000,
  });

/* ═══════════════════════════════════════════
   DNA HISTORY (version awareness)
   ═══════════════════════════════════════════ */

export const useDnaHistory = (dnaId?: string) =>
  useQuery({
    queryKey: ["ai_brain_dna_history", dnaId],
    queryFn: async () => {
      let query = supabase
        .from("system_dna_history")
        .select("id, dna_id, snapshot, version, changed_at")
        .order("version", { ascending: false })
        .limit(50);
      if (dnaId) query = query.eq("dna_id", dnaId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as DnaHistoryEntry[];
    },
    enabled: true,
    staleTime: 3 * 60_000,
  });

/* ═══════════════════════════════════════════
   GRAPH TRAVERSAL (depth-limited to 3)
   ═══════════════════════════════════════════ */

function traverseGraph(
  entityId: string,
  relations: EntityRelation[],
  maxDepth = 3
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: entityId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    for (const rel of relations) {
      if (rel.source_entity_id === id && !visited.has(rel.target_entity_id)) {
        queue.push({ id: rel.target_entity_id, depth: depth + 1 });
      }
      if (rel.target_entity_id === id && !visited.has(rel.source_entity_id)) {
        queue.push({ id: rel.source_entity_id, depth: depth + 1 });
      }
    }
  }

  visited.delete(entityId); // exclude self
  return visited;
}

/* ═══════════════════════════════════════════
   MAIN HOOK: useAiBrainContext
   ═══════════════════════════════════════════ */

export const useAiBrainContext = () => {
  const queryClient = useQueryClient();
  const { data: entries = [], isLoading: loadingEntries } = useAiMergedContext();
  const { data: relations = [], isLoading: loadingRelations } = useEntityRelations();
  const { data: history = [], isLoading: loadingHistory } = useDnaHistory();

  // ── Stats ──
  const stats: ContextStats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    let totalCrit = 0;
    let highCrit = 0;
    let active = 0;

    for (const e of entries) {
      byCategory[e.entity_category] = (byCategory[e.entity_category] || 0) + 1;
      totalCrit += e.criticality_score ?? 0;
      if ((e.criticality_score ?? 0) >= 4) highCrit++;
      if (e.is_active) active++;
    }

    return {
      totalEntries: entries.length,
      byCategory,
      avgCriticality: entries.length ? (totalCrit / entries.length).toFixed(1) : "0",
      highCriticalCount: highCrit,
      activeCount: active,
    };
  }, [entries]);

  // ── Query by category ──
  const queryByCategory = useCallback(
    (category: string) => entries.filter((e) => e.entity_category === category),
    [entries]
  );

  // ── Query by name (fuzzy match) ──
  const queryByName = useCallback(
    (name: string) => {
      const lower = name.toLowerCase();
      return entries.filter(
        (e) =>
          e.entity_name?.toLowerCase().includes(lower) ||
          e.description?.toLowerCase().includes(lower)
      );
    },
    [entries]
  );

  // ── Get related entities via graph traversal ──
  const getRelatedEntities = useCallback(
    (entityId: string, depth = 3) => traverseGraph(entityId, relations, depth),
    [relations]
  );

  // ── Sync & refresh ──
  const syncAndRefresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("populate-system-dna");
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["ai_brain_merged_context"] });
      queryClient.invalidateQueries({ queryKey: ["ai_brain_entity_relations"] });
      queryClient.invalidateQueries({ queryKey: ["ai_brain_dna_history"] });
      queryClient.invalidateQueries({ queryKey: ["ai_assistant_knowledge_view"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });

      return data;
    } catch (err: any) {
      toast.error(`AI Brain সিঙ্ক ব্যর্থ: ${err.message || err}`);
      throw err;
    }
  }, [queryClient]);

  return {
    entries,
    relations,
    history,
    stats,
    isLoading: loadingEntries || loadingRelations || loadingHistory,
    queryByCategory,
    queryByName,
    getRelatedEntities,
    syncAndRefresh,
  };
};
