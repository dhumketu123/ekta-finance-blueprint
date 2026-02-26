import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TenantInfo {
  id: string;
  name: string;
  plan: string;
  status: string;
  end_date: string | null;
  max_customers: number;
  max_loans: number;
  client_count: number;
  loan_count: number;
  sms_count: number;
}

export interface SuperAdminData {
  total_tenants: number;
  active_subscriptions: number;
  locked_subscriptions: number;
  expired_subscriptions: number;
  total_sms_sent: number;
  sms_this_month: number;
  total_clients: number;
  total_loans: number;
  tenants: TenantInfo[];
}

export const useSuperAdmin = () => {
  const { role } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["super_admin_dashboard"],
    queryFn: async (): Promise<SuperAdminData | null> => {
      if (role !== "super_admin") throw new Error("Access denied");
      const { data, error } = await supabase.rpc("get_super_admin_dashboard" as any);
      if (error) throw error;
      return data as unknown as SuperAdminData;
    },
    enabled: role === "super_admin",
    staleTime: 30_000,
  });

  const suspendTenant = async (tenantId: string) => {
    const { error } = await supabase.rpc("suspend_tenant" as any, { p_tenant_id: tenantId });
    if (error) { toast.error(error.message); return; }
    toast.success("টেন্যান্ট সাসপেন্ড হয়েছে ✅");
    qc.invalidateQueries({ queryKey: ["super_admin_dashboard"] });
  };

  const unsuspendTenant = async (tenantId: string) => {
    const { error } = await supabase.rpc("unsuspend_tenant" as any, { p_tenant_id: tenantId });
    if (error) { toast.error(error.message); return; }
    toast.success("টেন্যান্ট আনসাসপেন্ড হয়েছে ✅");
    qc.invalidateQueries({ queryKey: ["super_admin_dashboard"] });
  };

  const resetSmsQuota = async (tenantId: string) => {
    const { error } = await supabase.rpc("reset_sms_quota" as any, { p_tenant_id: tenantId });
    if (error) { toast.error(error.message); return; }
    toast.success("SMS কোটা রিসেট হয়েছে ✅");
    qc.invalidateQueries({ queryKey: ["super_admin_dashboard"] });
  };

  return {
    data: data ?? null,
    isLoading,
    error,
    suspendTenant,
    unsuspendTenant,
    resetSmsQuota,
  };
};
