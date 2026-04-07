import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useKnowledgeDashboardAutoRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["knowledge_graph"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_stats"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge_sync_logs"] });
    }, 30_000);

    return () => clearInterval(interval);
  }, [queryClient]);
}
