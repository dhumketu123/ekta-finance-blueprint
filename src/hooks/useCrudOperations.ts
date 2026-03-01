import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantId } from "@/hooks/useTenantId";
import { toast } from "sonner";

type CrudTable = "clients" | "investors" | "loan_products" | "savings_products";

/** Tables that require tenant_id on INSERT */
const TENANT_TABLES: CrudTable[] = ["clients", "investors"];

const auditLog = async (action: string, entityType: string, entityId: string | null, userId?: string, details?: Record<string, unknown>) => {
  await supabase.from("audit_logs").insert([{
    action_type: action,
    entity_type: entityType,
    entity_id: entityId,
    user_id: userId ?? null,
    details: details as any ?? null,
  }]);
};

export function useCreateRecord(table: CrudTable) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { tenantId } = useTenantId();

  return useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const payload = { ...data };
      // Inject tenant_id for tenant-isolated tables
      if (TENANT_TABLES.includes(table) && tenantId) {
        payload.tenant_id = tenantId;
      }
      const { data: result, error } = await (supabase.from(table) as any).insert([payload]).select().single();
      if (error) throw error;
      await auditLog("create", table, result?.id, user?.id, { table });
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("সফলভাবে তৈরি হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateRecord(table: CrudTable) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { data: result, error } = await (supabase.from(table) as any).update(data).eq("id", id).select().single();
      if (error) throw error;
      await auditLog("update", table, id, user?.id, { table, changes: data });
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("সফলভাবে আপডেট হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useSoftDelete(table: CrudTable) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(table) as any).update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await auditLog("soft_delete", table, id, user?.id, { table });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success("সফলভাবে মুছে ফেলা হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
