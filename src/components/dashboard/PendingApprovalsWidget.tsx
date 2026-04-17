import { useNavigate } from "react-router-dom";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePendingApprovalCount } from "@/hooks/useApprovals";

/**
 * Compact dashboard widget showing the number of pending Maker-Checker
 * requests awaiting review. Clicking navigates to /approvals.
 */
export const PendingApprovalsWidget = () => {
  const navigate = useNavigate();
  const { data: count = 0, isLoading } = usePendingApprovalCount();
  const hasPending = count > 0;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate("/approvals")}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate("/approvals")}
      className="p-4 md:p-5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Pending approvals: ${count}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={
              "h-10 w-10 rounded-xl flex items-center justify-center " +
              (hasPending ? "bg-warning/15 text-warning" : "bg-success/15 text-success")
            }
          >
            {hasPending ? <AlertCircle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">অনুমোদনের অপেক্ষায়</div>
            <div className="text-2xl font-bold leading-tight">
              {isLoading ? "—" : count}
            </div>
          </div>
        </div>
        {hasPending && (
          <Badge variant="destructive" className="shrink-0">
            পর্যালোচনা প্রয়োজন
          </Badge>
        )}
      </div>
    </Card>
  );
};

export default PendingApprovalsWidget;
