import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface TenantRule {
  id: string;
  tenant_id: string;
  rule_key: string;
  rule_value: any;
  description: string | null;
}

const DEFAULT_RULES: Record<string, any> = {
  dps_interest_rate: 10,
  penalty_late_fee_rate: 2,
  min_loan_amount: 5000,
  max_loan_amount: 500000,
  approval_workflow: "maker_checker",
  grace_period_days: 5,
  defaulter_threshold_days: 30,
};

export const useTenantRules = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant_rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_rules" as any)
        .select("*");
      if (error) throw error;
      return (data as any) as TenantRule[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Convert array to key-value map with defaults
  const rulesMap: Record<string, any> = { ...DEFAULT_RULES };
  if (data) {
    data.forEach((r) => {
      rulesMap[r.rule_key] = r.rule_value;
    });
  }

  return { rules: rulesMap, rawRules: data ?? [], isLoading };
};

export const useGetRule = (ruleKey: string) => {
  const { rules } = useTenantRules();
  return rules[ruleKey] ?? DEFAULT_RULES[ruleKey];
};

export const useUpdateTenantRule = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleKey, ruleValue, description }: { ruleKey: string; ruleValue: any; description?: string }) => {
      const { error } = await supabase.rpc("upsert_tenant_rule" as any, {
        p_rule_key: ruleKey,
        p_rule_value: typeof ruleValue === "string" ? JSON.stringify(ruleValue) : ruleValue,
        p_description: description ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant_rules"] });
      toast.success("নিয়ম আপডেট হয়েছে ✅");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};
