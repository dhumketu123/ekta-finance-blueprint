import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "active" | "inactive" | "paid" | "pending" | "overdue" | "closed" | "none";
  labelBn?: string;
}

const config: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "status-active" },
  inactive: { label: "Inactive", className: "status-inactive" },
  paid: { label: "Paid", className: "status-paid" },
  pending: { label: "Pending", className: "status-pending" },
  overdue: { label: "Overdue", className: "status-overdue" },
  closed: { label: "Closed", className: "status-closed" },
  none: { label: "None", className: "status-inactive" },
};

const StatusBadge = ({ status, labelBn }: StatusBadgeProps) => {
  const c = config[status] || config.none;
  return (
    <Badge variant="outline" className={`${c.className} border-0 text-[11px] rounded-full px-2.5 py-0.5`}>
      {c.label} {labelBn && <span className="ml-1 font-bangla opacity-70">({labelBn})</span>}
    </Badge>
  );
};

export default StatusBadge;
