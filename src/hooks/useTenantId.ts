import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Fetches the current user's tenant_id from their profile.
 * If tenant_id is NULL (e.g. preview/new users), auto-resolves via
 * the SECURITY DEFINER RPC `auto_resolve_user_tenant`.
 */
export const useTenantId = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: tenantId, isLoading } = useQuery({
    queryKey: ["user_tenant_id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Step 1: Try fetching from profile
      const { data, error } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      // Step 2: If already set, return immediately
      if (data?.tenant_id) {
        return data.tenant_id as string;
      }

      // Step 3: Auto-resolve via SECURITY DEFINER RPC
      console.log("[useTenantId] tenant_id is NULL, calling auto_resolve_user_tenant...");
      const { data: resolvedId, error: rpcError } = await supabase.rpc(
        "auto_resolve_user_tenant"
      );

      if (rpcError) {
        console.error("[useTenantId] auto_resolve RPC failed:", rpcError);
        throw rpcError;
      }

      console.log("[useTenantId] Auto-resolved tenant_id:", resolvedId);

      // Invalidate dependent caches so they refetch with the new tenant_id
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary_metrics"] });

      return resolvedId as string;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return { tenantId, isLoading };
};
