import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantId } from "@/hooks/useTenantId";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, TrendingUp, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthMetric {
  title: string;
  titleBn: string;
  value: number;
  target: number;
  unit: string;
  icon: React.ReactNode;
  colorClass: string;
  progressColor: string;
  isInverse?: boolean; // Lower is better (e.g., NPL)
}

export const BusinessHealthAnalytics = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { tenantId } = useTenantId();

  // Fetch aggregated loan health metrics
  const { data: healthData, isLoading } = useQuery({
    queryKey: ["business_health_analytics", tenantId],
    queryFn: async () => {
      // Get all loans for this tenant
      const { data: loans, error: loansError } = await supabase
        .from("loans")
        .select("id, status, total_principal, outstanding_principal")
        .is("deleted_at", null);

      if (loansError) throw loansError;

      const activeLoans = loans?.filter((l) => l.status === "active") || [];
      const overdueLoans = loans?.filter((l) => l.status === "overdue") || [];
      const totalLoans = activeLoans.length + overdueLoans.length;

      // NPL Rate: (Overdue Loans / Total Active+Overdue Loans) * 100
      const nplRate = totalLoans > 0 ? (overdueLoans.length / totalLoans) * 100 : 0;

      // Average Loan Size
      const totalDisbursed = loans?.reduce((sum, l) => sum + (l.total_principal || 0), 0) || 0;
      const avgLoanSize = loans && loans.length > 0 ? totalDisbursed / loans.length : 0;

      // Recovery Rate: (Collected / Total Expected) * 100
      const totalExpected = loans?.reduce((sum, l) => sum + (l.total_principal || 0), 0) || 0;
      const totalOutstanding = loans?.reduce((sum, l) => sum + (l.outstanding_principal || 0), 0) || 0;
      const totalCollected = totalExpected - totalOutstanding;
      const recoveryRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

      return {
        nplRate: Math.min(nplRate, 100),
        recoveryRate: Math.min(recoveryRate, 100),
        avgLoanSize,
        overdueCount: overdueLoans.length,
        totalLoans,
      };
    },
    enabled: !!tenantId,
    staleTime: 3 * 60 * 1000,
  });

  const metrics: HealthMetric[] = [
    {
      title: "NPL Rate",
      titleBn: "অনাদায়ী ঋণ হার",
      value: healthData?.nplRate ?? 0,
      target: 5, // Target: Keep NPL below 5%
      unit: "%",
      icon: <AlertTriangle className="w-4 h-4" />,
      colorClass: (healthData?.nplRate ?? 0) > 10 ? "text-destructive" : (healthData?.nplRate ?? 0) > 5 ? "text-amber-500" : "text-emerald-600",
      progressColor: (healthData?.nplRate ?? 0) > 10 ? "bg-destructive" : (healthData?.nplRate ?? 0) > 5 ? "bg-amber-500" : "bg-emerald-500",
      isInverse: true,
    },
    {
      title: "Recovery Rate",
      titleBn: "আদায় হার",
      value: healthData?.recoveryRate ?? 0,
      target: 100,
      unit: "%",
      icon: <TrendingUp className="w-4 h-4" />,
      colorClass: (healthData?.recoveryRate ?? 0) > 80 ? "text-emerald-600" : (healthData?.recoveryRate ?? 0) > 60 ? "text-amber-500" : "text-destructive",
      progressColor: (healthData?.recoveryRate ?? 0) > 80 ? "bg-emerald-500" : (healthData?.recoveryRate ?? 0) > 60 ? "bg-amber-500" : "bg-destructive",
    },
    {
      title: "Avg. Loan Size",
      titleBn: "গড় ঋণের পরিমাণ",
      value: healthData?.avgLoanSize ?? 0,
      target: 50000, // Arbitrary target for visualization
      unit: "৳",
      icon: <Banknote className="w-4 h-4" />,
      colorClass: "text-primary",
      progressColor: "bg-primary",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {metrics.map((metric, idx) => {
        const progressValue = metric.unit === "৳" 
          ? Math.min((metric.value / metric.target) * 100, 100)
          : metric.value;

        return (
          <Card 
            key={idx} 
            className="border-border/50 bg-card/80 backdrop-blur-sm hover:shadow-md transition-shadow duration-200"
          >
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {bn ? metric.titleBn : metric.title}
                </span>
                <div className={cn("p-1.5 rounded-md bg-muted/50", metric.colorClass)}>
                  {metric.icon}
                </div>
              </div>

              {/* Value */}
              <div className={cn("text-2xl font-bold tracking-tight", metric.colorClass)}>
                {metric.unit === "৳" ? (
                  <>৳{metric.value.toLocaleString("bn-BD", { maximumFractionDigits: 0 })}</>
                ) : (
                  <>{metric.value.toFixed(1)}{metric.unit}</>
                )}
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <Progress 
                  value={progressValue} 
                  className="h-1.5 bg-muted"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  {metric.isInverse ? (
                    <>
                      <span>{bn ? "লক্ষ্য" : "Target"}: &lt;{metric.target}%</span>
                      <span className={metric.value > metric.target ? "text-destructive" : "text-emerald-600"}>
                        {metric.value > metric.target ? (bn ? "ঝুঁকিপূর্ণ" : "At Risk") : (bn ? "স্থিতিশীল" : "Healthy")}
                      </span>
                    </>
                  ) : metric.unit === "৳" ? (
                    <>
                      <span>{bn ? "বেসলাইন" : "Baseline"}</span>
                      <span>{bn ? "প্রিমিয়াম" : "Premium"}</span>
                    </>
                  ) : (
                    <>
                      <span>0%</span>
                      <span>100%</span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
