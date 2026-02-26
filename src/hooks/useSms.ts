import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface SmsLog {
  id: string;
  recipient_phone: string;
  recipient_name: string | null;
  message_text: string;
  message_type: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export const useSms = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["sms_logs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const sendSMS = useMutation({
    mutationFn: async ({
      recipient,
      message,
      recipientName,
      messageType,
    }: {
      recipient: string;
      message: string;
      recipientName?: string;
      messageType?: string;
    }) => {
      const { data, error } = await supabase.rpc("send_sms" as any, {
        p_recipient: recipient,
        p_message: message,
        p_recipient_name: recipientName ?? null,
        p_message_type: messageType ?? "manual",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms_logs"] });
      toast.success("SMS পাঠানো হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { logs: logs as SmsLog[], isLoading, sendSMS };
};
