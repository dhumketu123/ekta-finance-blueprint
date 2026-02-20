import { forwardRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";

interface RepaymentProgressProps {
  totalAmount: number;
  paidAmount: number;
  tenure?: number;
  paidInstallments?: number;
  nextPaymentDate?: string | null;
  compact?: boolean;
}

const RepaymentProgress = forwardRef<HTMLDivElement, RepaymentProgressProps>(({
  totalAmount,
  paidAmount,
  tenure,
  paidInstallments,
  nextPaymentDate,
  compact = false,
}, ref) => {
  const { t } = useLanguage();
  const percentage = totalAmount > 0 ? Math.min(Math.round((paidAmount / totalAmount) * 100), 100) : 0;
  const remaining = Math.max(totalAmount - paidAmount, 0);

  const progressColor =
    percentage >= 75 ? "bg-success" :
    percentage >= 40 ? "bg-primary" :
    percentage >= 20 ? "bg-warning" : "bg-destructive";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div ref={ref} className={`w-full ${compact ? "" : "space-y-1.5"}`}>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${progressColor} progress-glow`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            {!compact && (
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>৳{paidAmount.toLocaleString()} paid</span>
                <span className="font-semibold text-foreground">{percentage}%</span>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="tooltip-premium max-w-[200px]" side="top">
          <div className="space-y-1">
            <p className="font-semibold">Repayment: {percentage}%</p>
            <p>Paid: ৳{paidAmount.toLocaleString()}</p>
            <p>Remaining: ৳{remaining.toLocaleString()}</p>
            {tenure && paidInstallments !== undefined && (
              <p>Installments: {paidInstallments}/{tenure}</p>
            )}
            {nextPaymentDate && (
              <p className="text-warning font-medium">Next: {nextPaymentDate}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

RepaymentProgress.displayName = "RepaymentProgress";

export default RepaymentProgress;
