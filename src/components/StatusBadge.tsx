import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "active" | "inactive" | "paid" | "pending" | "overdue" | "closed" | "none" | "approved" | "rejected";
  labelBn?: string;
}

const config: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "status-active" },
  inactive: { label: "Inactive", className: "status-inactive" },
  paid: { label: "Paid", className: "status-paid" },
  pending: { label: "Pending", className: "status-pending" },
  overdue: { label: "Overdue", className: "status-overdue" },
  closed: { label: "Closed", className: "status-closed" },
  approved: { label: "Approved", className: "status-active" },
  rejected: { label: "Rejected", className: "status-overdue" },
  none: { label: "None", className: "status-inactive" },
};

const StatusBadge = ({ status, labelBn }: StatusBadgeProps) => {
  const c = config[status] || config.none;
  const isOverdue = status === "overdue";
  return (
    <Badge variant="outline" className={`${c.className} border-0 text-[11px] rounded-full px-2.5 py-0.5 transition-all duration-300 ${isOverdue ? "badge-pulse" : ""}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isOverdue ? "bg-destructive" : status === "active" || status === "paid" ? "bg-success" : status === "pending" ? "bg-warning" : "bg-muted-foreground"}`} />
      {c.label} {labelBn && <span className="ml-1 font-bangla opacity-70">({labelBn})</span>}
    </Badge>
  );
};

export default StatusBadge;
