import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useSnoozeInstallment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { schedule_id: string; promised_date: string }) => {
      const { data, error } = await supabase.rpc("snooze_installment" as any, {
        p_schedule_id: payload.schedule_id,
        p_promised_date: payload.promised_date,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loan-schedules"] });
      qc.invalidateQueries({ queryKey: ["schedule-stats-all"] });
      toast.success("প্রতিশ্রুতি সফল ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useLogCommunication = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      client_id: string;
      loan_id?: string;
      comm_type: "call" | "whatsapp" | "sms";
      template_used?: string;
      message_text?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await (supabase.from("communication_logs") as any).insert({
        user_id: user.id,
        client_id: payload.client_id,
        loan_id: payload.loan_id || null,
        comm_type: payload.comm_type,
        template_used: payload.template_used || null,
        message_text: payload.message_text || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communication-logs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
