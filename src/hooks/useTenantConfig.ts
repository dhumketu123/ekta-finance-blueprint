import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TenantConfig {
  id: string;
  tenant_id: string;
  display_name: string;
  display_name_bn: string;
  logo_url: string | null;
  header_bg_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  footer_text: string;
  sms_sender_name: string;
}

const DEFAULT_CONFIG: Omit<TenantConfig, "id" | "tenant_id"> = {
  display_name: "Ekta Finance",
  display_name_bn: "একতা ফাইন্যান্স",
  logo_url: null,
  header_bg_url: null,
  primary_color: "#004c4d",
  secondary_color: "#ffd900",
  accent_color: "#059669",
  footer_text: "",
  sms_sender_name: "",
};

export const useTenantConfig = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant_config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_config" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as TenantConfig | null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    config: data ? { ...DEFAULT_CONFIG, ...data } : (DEFAULT_CONFIG as any as TenantConfig),
    isLoading,
  };
};

export const useUpdateTenantConfig = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<TenantConfig, "id" | "tenant_id">>) => {
      const { error } = await supabase.rpc("upsert_tenant_config" as any, {
        p_display_name: updates.display_name ?? null,
        p_display_name_bn: updates.display_name_bn ?? null,
        p_logo_url: updates.logo_url ?? null,
        p_header_bg_url: updates.header_bg_url ?? null,
        p_primary_color: updates.primary_color ?? null,
        p_secondary_color: updates.secondary_color ?? null,
        p_accent_color: updates.accent_color ?? null,
        p_footer_text: updates.footer_text ?? null,
        p_sms_sender_name: updates.sms_sender_name ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_config"] });
      toast.success("ব্র্যান্ডিং আপডেট হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
