import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface SubscriptionData {
  plan: string;
  status: string;
  max_customers: number;
  max_loans: number;
  end_date: string;
  days_remaining: number;
}

export const useSubscription = () => {
  const { user } = useAuth();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription-status", user?.id],
    queryFn: async (): Promise<SubscriptionData | null> => {
      const { data, error } = await supabase.rpc("get_subscription_status");
      if (error) {
        console.error("Subscription fetch error:", error);
        return null;
      }
      // RPC returns a table — take first row
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLocked = subscription?.status === "locked" || subscription?.status === "expired";
  const daysRemaining = subscription?.days_remaining ?? 999;
  const isExpiringSoon = !isLocked && daysRemaining <= 7 && daysRemaining >= 0;

  /** Client-side limit check — call before creating a client or loan */
  const checkLimit = (entityType: "client" | "loan", currentCount: number): boolean => {
    if (!subscription) return true; // no subscription = no limit

    if (entityType === "client" && currentCount >= subscription.max_customers) {
      toast.error(`গ্রাহক সীমা পূর্ণ (${subscription.max_customers})। আপগ্রেড করুন।`);
      return false;
    }
    if (entityType === "loan" && currentCount >= subscription.max_loans) {
      toast.error(`ঋণ সীমা পূর্ণ (${subscription.max_loans})। আপগ্রেড করুন।`);
      return false;
    }
    return true;
  };

  return {
    subscription,
    isLoading,
    isLocked,
    isExpiringSoon,
    daysRemaining,
    checkLimit,
  };
};
