import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  titleBn: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: { value: number; positive: boolean };
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantStyles = {
  default: "border-l-primary",
  success: "border-l-success",
  warning: "border-l-warning",
  destructive: "border-l-destructive",
};

const MetricCard = ({ title, titleBn, value, subtitle, icon, trend, variant = "default" }: MetricCardProps) => {
  return (
    <div className={`card-elevated p-5 border-l-4 ${variantStyles[variant]} animate-fade-in`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground font-english">{title}</p>
          <p className="text-[10px] text-muted-foreground/70 font-bangla">{titleBn}</p>
          <p className="mt-2 text-2xl font-bold text-foreground font-english">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={`mt-1 text-xs font-medium ${trend.positive ? "text-success" : "text-destructive"}`}>
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className="p-2.5 rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
