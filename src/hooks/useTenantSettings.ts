import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TenantSetting {
  id: number;
  tenant_id: string;
  setting_key: string;
  setting_value: any;
  created_at: string;
  updated_at: string;
}

export const useTenantSettings = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant_settings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings" as any)
        .select("*");
      if (error) throw error;
      return (data as any) as TenantSetting[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Convert array to key-value map
  const settingsMap: Record<string, any> = {};
  if (data) {
    data.forEach((s) => {
      settingsMap[s.setting_key] = s.setting_value;
    });
  }

  return { settings: settingsMap, rawSettings: data ?? [], isLoading };
};

export const useGetSetting = (settingKey: string) => {
  const { settings } = useTenantSettings();
  return settings[settingKey] ?? null;
};

export const useUpdateTenantSetting = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ settingKey, settingValue }: { settingKey: string; settingValue: any }) => {
      const { error } = await supabase.rpc("upsert_tenant_setting" as any, {
        p_setting_key: settingKey,
        p_setting_value: typeof settingValue === "string" ? JSON.stringify(settingValue) : settingValue,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_settings"] });
      toast.success("সেটিং আপডেট হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
