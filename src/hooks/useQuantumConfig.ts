import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface QuantumLedgerConfig {
  voice_enabled: boolean;
  bulk_collection_enabled: boolean;
  grace_period_days: number;
  late_fee_rate: number;
  defaulter_threshold: number;
  loan_rebate_flat: number;
  loan_rebate_reducing: number;
  processing_fee_percent: number;
  ai_prediction_enabled: boolean;
  audit_lock_enabled: boolean;
  minimum_notice_days: number;
}

const DEFAULT_CONFIG: QuantumLedgerConfig = {
  voice_enabled: true,
  bulk_collection_enabled: true,
  grace_period_days: 5,
  late_fee_rate: 2,
  defaulter_threshold: 30,
  loan_rebate_flat: 30,
  loan_rebate_reducing: 50,
  processing_fee_percent: 1,
  ai_prediction_enabled: true,
  audit_lock_enabled: true,
  minimum_notice_days: 7,
};

export const useQuantumConfig = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["system_settings", "quantum_ledger_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("setting_value")
        .eq("setting_key", "quantum_ledger_config")
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.setting_value ?? DEFAULT_CONFIG) as QuantumLedgerConfig;
    },
  });

  return { config: data ?? DEFAULT_CONFIG, isLoading };
};

export const useUpdateQuantumConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: Partial<QuantumLedgerConfig>) => {
      const { data: current } = await supabase
        .from("system_settings" as any)
        .select("setting_value")
        .eq("setting_key", "quantum_ledger_config")
        .maybeSingle();

      const merged = { ...((current as any)?.setting_value ?? DEFAULT_CONFIG), ...config };

      const { error } = await supabase
        .from("system_settings" as any)
        .update({ setting_value: merged as any, updated_at: new Date().toISOString() })
        .eq("setting_key", "quantum_ledger_config");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system_settings", "quantum_ledger_config"] });
      toast.success("কনফিগ আপডেট হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
