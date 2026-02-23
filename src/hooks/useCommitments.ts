import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Commitment {
  id: string;
  client_id: string;
  officer_id: string;
  commitment_date: string;
  status: "pending" | "fulfilled" | "rescheduled";
  reschedule_reason: string | null;
  penalty_suspended: boolean;
  audit_hash_signature: string | null;
  created_at: string;
  updated_at: string;
  clients?: { name_bn: string; name_en: string; phone: string | null };
}

export const useCommitments = (filters?: { status?: string; officer_id?: string }) =>
  useQuery({
    queryKey: ["commitments", filters],
    queryFn: async () => {
      let query = (supabase.from("commitments") as any)
        .select("*, clients(name_bn, name_en, phone)")
        .order("commitment_date", { ascending: true });

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.officer_id) query = query.eq("officer_id", filters.officer_id);

      const { data, error } = await query;
      if (error) throw error;
      return data as Commitment[];
    },
  });

export const useMyCommitments = () => {
  const { user } = useAuth();
  return useCommitments(user ? { officer_id: user.id } : undefined);
};

export const useFulfillCommitment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commitmentId: string) => {
      const { data, error } = await (supabase.from("commitments") as any)
        .update({ status: "fulfilled" })
        .eq("id", commitmentId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commitments"] });
      toast.success("প্রতিশ্রুতি পূরণ হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRescheduleCommitmentSwipe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      commitment_id: string;
      reschedule_date: string;
      reschedule_reason: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "commitments-reschedule-swipe",
        { body: payload }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commitments"] });
      toast.success("সফলভাবে রিশিডিউল হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useFeatureFlag = (flagName: string) =>
  useQuery({
    queryKey: ["feature_flags", flagName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("is_enabled")
        .eq("feature_name", flagName)
        .maybeSingle();
      if (error) throw error;
      return data?.is_enabled ?? false;
    },
    staleTime: 60_000,
  });
