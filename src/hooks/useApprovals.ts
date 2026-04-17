import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { toast } from "sonner";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXECUTED"
  | "EXECUTION_FAILED";

export type ApprovalEntityType =
  | "loan_disbursement"
  | "loan_reschedule"
  | "early_settlement"
  | "profit_distribution"
  | "owner_exit"
  | "journal_adjustment";

export interface ApprovalRequest {
  id: string;
  tenant_id: string;
  entity_type: ApprovalEntityType | string;
  entity_id: string | null;
  action_type: string;
  payload: Record<string, any>;
  amount: number | null;
  status: ApprovalStatus;
  maker_id: string;
  checker_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  executed_at: string | null;
}

const TABLE = "approval_requests" as const;

/** List approval requests scoped to current tenant. */
export const useApprovalRequests = (status?: ApprovalStatus) => {
  const { tenantId } = useTenantId();
  return useQuery({
    queryKey: ["approval_requests", tenantId, status ?? "ALL"],
    enabled: !!tenantId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      let q = (supabase.from(TABLE as any) as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ApprovalRequest[];
    },
  });
};

/** Pending count for the badge. */
export const usePendingApprovalCount = () => {
  const { tenantId } = useTenantId();
  return useQuery({
    queryKey: ["approval_requests_pending_count", tenantId],
    enabled: !!tenantId,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { count, error } = await (supabase.from(TABLE as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING");
      if (error) throw error;
      return count ?? 0;
    },
  });
};

/** Maker: submit a new approval request. */
export const useCreateApprovalRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entity_type: ApprovalEntityType;
      action_type: string;
      payload: Record<string, any>;
      entity_id?: string | null;
      amount?: number | null;
    }) => {
      const { data, error } = await supabase.rpc("create_approval_request" as any, {
        p_entity_type: input.entity_type,
        p_action_type: input.action_type,
        p_payload: input.payload as any,
        p_entity_id: input.entity_id ?? null,
        p_amount: input.amount ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval_requests"] });
      qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });
      toast.success("অনুমোদনের জন্য পাঠানো হয়েছে");
    },
    onError: (e: any) => toast.error(e?.message ?? "অনুরোধ পাঠানো ব্যর্থ"),
  });
};

/** Checker: approve or reject a pending request. */
export const useDecideApprovalRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) => {
      const { data, error } = await supabase.rpc("decide_approval_request" as any, {
        p_request_id: input.id,
        p_decision: input.decision,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["approval_requests"] });
      qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });
      toast.success(vars.decision === "APPROVED" ? "অনুমোদিত" : "প্রত্যাখ্যাত");
    },
    onError: (e: any) => toast.error(e?.message ?? "সিদ্ধান্ত ব্যর্থ"),
  });
};

/** Execute an APPROVED request via execution_engine_v3 (TTL-locked, registry-dispatched). */
export const useExecuteApproval = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { data, error } = await supabase.rpc("execution_engine_v3" as any, {
        p_request_id: input.id,
      });
      if (error) throw error;
      return data as {
        status: "EXECUTED" | "ALREADY_EXECUTED" | "NOT_IMPLEMENTED";
        entity_type?: string;
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["approval_requests"] });
      qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });

      if (data?.status === "EXECUTED") {
        toast.success("সফলভাবে কার্যকর হয়েছে");
      } else if (data?.status === "ALREADY_EXECUTED") {
        toast.info("ইতিমধ্যে কার্যকর হয়েছে");
      } else if (data?.status === "NOT_IMPLEMENTED") {
        toast.warning(`এই ফিচার এখনো প্রস্তুত নয়${data.entity_type ? ` (${data.entity_type})` : ""}`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "কার্যকর করতে ব্যর্থ"),
  });
};

/** @deprecated Use useExecuteApproval instead. Kept as alias for backward compatibility. */
export const useProcessApprovedRequest = useExecuteApproval;

/** Retry an EXECUTION_FAILED request — resets state to APPROVED and re-runs router. */
export const useRetryFailedExecution = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { data, error } = await supabase.rpc("retry_failed_execution" as any, {
        p_request_id: input.id,
      });
      if (error) throw error;
      return data as { id: string; status: "EXECUTED" | "ALREADY_EXECUTED" };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval_requests"] });
      qc.invalidateQueries({ queryKey: ["approval_requests_pending_count"] });
      toast.success("পুনরায় কার্যকর হয়েছে");
    },
    onError: (e: any) => toast.error(e?.message ?? "পুনরায় চেষ্টা ব্যর্থ"),
  });
};
