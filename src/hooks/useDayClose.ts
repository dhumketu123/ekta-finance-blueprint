import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DayCloseSummary {
  opening_balance: number;
  total_collection: number;
  total_expense: number;
  internal_transfer: number;
  expected_cash: number;
  existing_close: {
    id: string;
    status: string;
    declared_cash: number;
    variance: number;
    note: string | null;
    closed_at: string;
  } | null;
}

interface RpcResult {
  status: string;
  message?: string;
  id?: string;
  variance?: number;
  request_id?: string;
  close_id?: string;
}

export const useDayClose = (date: string) => {
  const qc = useQueryClient();

  const summary = useQuery({
    queryKey: ["day-close-summary", date],
    queryFn: async (): Promise<DayCloseSummary> => {
      const { data, error } = await supabase.rpc("get_day_close_summary" as never, {
        p_date: date,
      } as never);
      if (error) throw new Error(error.message);
      return data as unknown as DayCloseSummary;
    },
    enabled: !!date,
  });

  const submitClose = useMutation({
    mutationFn: async ({ declaredCash, note }: { declaredCash: number; note?: string }) => {
      const { data, error } = await supabase.rpc("submit_day_close" as never, {
        p_date: date,
        p_declared_cash: declaredCash,
        p_note: note || null,
      } as never);
      if (error) throw new Error(error.message);
      const result = data as unknown as RpcResult;
      if (result.status === "error") throw new Error(result.message || "Failed");
      return result;
    },
    onSuccess: () => {
      toast.success("দিন বন্ধ সফল হয়েছে ✅");
      qc.invalidateQueries({ queryKey: ["day-close-summary", date] });
    },
    onError: (error: unknown) => {
      console.error("[DayClose:submitClose]", error);
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("violates") || raw.includes("invalid input") || raw.includes("enum")) {
        toast.error("⚠️ ইনপুট সঠিক নয়, অনুগ্রহ করে চেক করুন।");
      } else {
        toast.error("❌ সিস্টেম এরর: ডাটাবেসে তথ্য সংরক্ষণে সমস্যা হয়েছে।");
      }
    },
  });

  const requestReopen = useMutation({
    mutationFn: async ({ closeId, reason }: { closeId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("request_day_reopen" as never, {
        p_close_id: closeId,
        p_reason: reason,
      } as never);
      if (error) throw new Error(error.message);
      const result = data as unknown as RpcResult;
      if (result.status === "error") throw new Error(result.message || "Failed");
      return result;
    },
    onSuccess: () => {
      toast.success("রিওপেন অনুরোধ পাঠানো হয়েছে ✅");
      qc.invalidateQueries({ queryKey: ["day-close-summary", date] });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "অজানা ত্রুটি";
      toast.error(msg);
    },
  });

  const approveReopen = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.rpc("approve_day_reopen" as never, {
        p_request_id: requestId,
      } as never);
      if (error) throw new Error(error.message);
      const result = data as unknown as RpcResult;
      if (result.status === "error") throw new Error(result.message || "Failed");
      return result;
    },
    onSuccess: () => {
      toast.success("রিওপেন অনুমোদন হয়েছে ✅");
      qc.invalidateQueries({ queryKey: ["day-close-summary", date] });
      qc.invalidateQueries({ queryKey: ["reopen-requests"] });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "অজানা ত্রুটি";
      toast.error(msg);
    },
  });

  return { summary, submitClose, requestReopen, approveReopen };
};

export const useReopenRequests = () => {
  return useQuery({
    queryKey: ["reopen-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reopen_requests" as never)
        .select("*")
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as unknown as Array<{
        id: string;
        close_id: string;
        requested_by: string;
        reason: string;
        requested_at: string;
        status: string;
      }>;
    },
  });
};
