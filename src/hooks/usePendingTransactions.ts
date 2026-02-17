import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const usePendingTransactions = (statusFilter?: string) =>
  useQuery({
    queryKey: ["pending_transactions", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("pending_transactions")
        .select("*, clients(name_en, name_bn), loans(id, total_principal, outstanding_principal, status), savings_accounts(id, balance)")
        .order("created_at", { ascending: false });

      if (statusFilter) query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

export const useSubmitPendingTransaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      type: string;
      reference_id: string;
      amount: number;
      loan_id?: string;
      savings_id?: string;
      client_id?: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("pending_transactions")
        .insert([{ ...data, submitted_by: user?.id, type: data.type as any }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_transactions"] });
      toast.success("লেনদেন অনুমোদনের জন্য জমা দেওয়া হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useApprovePendingTransaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ txId, reason }: { txId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc("approve_pending_transaction", {
        _tx_id: txId,
        _reviewer_id: user?.id,
        _reason: reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_transactions"] });
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("লেনদেন অনুমোদিত হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRejectPendingTransaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ txId, reason }: { txId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_pending_transaction", {
        _tx_id: txId,
        _reviewer_id: user?.id,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending_transactions"] });
      toast.success("লেনদেন প্রত্যাখ্যান করা হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
