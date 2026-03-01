import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Fetches the current user's tenant_id from their profile.
 * Required for all INSERT operations on tenant-isolated tables.
 */
export const useTenantId = () => {
  const { user } = useAuth();

  const { data: tenantId, isLoading } = useQuery({
    queryKey: ["user_tenant_id", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data?.tenant_id ?? null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // cache for 5 minutes
  });

  return { tenantId, isLoading };
};
