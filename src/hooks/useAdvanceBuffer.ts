import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export const useAdvanceBufferEntries = (status?: string) =>
  useQuery({
    queryKey: ["advance_buffer", status],
    queryFn: async () => {
      let query = supabase
        .from("advance_buffer" as any)
        .select("*, clients(name_en, name_bn, member_id)")
        .order("post_date", { ascending: true });
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

export const useCreateAdvanceBuffer = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      client_id: string;
      loan_id?: string;
      savings_id?: string;
      amount: number;
      buffer_type: string;
      post_date: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("advance_buffer" as any)
        .insert([{ ...data, posted_by: user?.id }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["advance_buffer"] });
      toast.success("অগ্রিম বাফারে যোগ হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useCreditScores = () =>
  useQuery({
    queryKey: ["credit_scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_scores" as any)
        .select("*, clients(name_en, name_bn, member_id)")
        .order("score", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

export const useCalculateCreditScore = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { data, error } = await supabase.rpc("calculate_credit_score" as any, { _client_id: clientId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["credit_scores"] });
      toast.success("ক্রেডিট স্কোর হালনাগাদ হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useEventSourcing = (entityType?: string, entityId?: string) =>
  useQuery({
    queryKey: ["event_sourcing", entityType, entityId],
    queryFn: async () => {
      let query = supabase
        .from("event_sourcing" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (entityType) query = query.eq("entity_type", entityType);
      if (entityId) query = query.eq("entity_id", entityId);
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!entityType || entityType === undefined,
  });
