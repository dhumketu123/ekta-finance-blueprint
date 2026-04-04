import type { SystemStatus } from "./types";

interface SystemHealthIndicatorProps {
  status: SystemStatus;
}

export const SystemHealthIndicator = ({ status }: SystemHealthIndicatorProps) => {
  const dotColor = status === "online" ? "bg-success" : status === "degraded" ? "bg-warning" : "bg-destructive";
  const label = status === "online" ? "System Online" : status === "degraded" ? "Degraded" : "Offline";
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-primary">
      <span className={`h-2 w-2 rounded-full ${dotColor} animate-pulse`} />
      {label}
    </span>
  );
};
