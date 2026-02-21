import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GatewayMode = "api" | "mobile_native" | "webhook";

export interface GatewayConfig {
  mode: GatewayMode;
  webhook_url: string;
  active: boolean;
}

export const useSmsGateway = () =>
  useQuery({
    queryKey: ["system_settings", "sms_gateway"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("*")
        .eq("setting_key", "sms_gateway")
        .maybeSingle();
      if (error) throw error;
      const row = data as any;
      return (row?.setting_value as GatewayConfig) ?? { mode: "api", webhook_url: "", active: true };
    },
    staleTime: 60_000,
  });

/** Build sms: intent URI for mobile native mode */
export function buildSmsIntentUri(phone: string, message: string): string {
  const cleanPhone = phone.replace(/[^\d+]/g, "");
  return `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
}
