import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricCardProps {
  title: string;
  value: string | number;
  label?: string;
  subtitle?: string;
  icon: ReactNode;
  trend?: { value: number; positive: boolean };
  isLoading?: boolean;
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantStyles = {
  default: {
    border: "border-l-primary",
    iconBg: "bg-primary/10 text-primary",
    gradientFrom: "from-primary/5",
    gradientTo: "to-transparent",
  },
  success: {
    border: "border-l-success",
    iconBg: "bg-success/10 text-success",
    gradientFrom: "from-success/5",
    gradientTo: "to-transparent",
  },
  warning: {
    border: "border-l-warning",
    iconBg: "bg-warning/10 text-warning",
    gradientFrom: "from-warning/5",
    gradientTo: "to-transparent",
  },
  destructive: {
    border: "border-l-destructive",
    iconBg: "bg-destructive/10 text-destructive",
    gradientFrom: "from-destructive/5",
    gradientTo: "to-transparent",
  },
};

const AnimatedCounter = ({ value }: { value: string | number }) => {
  const [displayValue, setDisplayValue] = useState<string | number>(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (typeof value === "number" && typeof prevValue.current === "number") {
      const start = prevValue.current;
      const end = value;
      const duration = 800;
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (end - start) * easeOut);
        setDisplayValue(current);
        if (progress < 1) requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    } else {
      setDisplayValue(value);
    }
    prevValue.current = value;
  }, [value]);

  return <>{displayValue}</>;
};

export const MetricCard = ({
  title,
  value,
  label,
  subtitle,
  icon,
  trend,
  isLoading = false,
  variant = "default",
}: MetricCardProps) => {
  const displayLabel = label || subtitle;
  const styles = variantStyles[variant];

  if (isLoading) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 md:p-5 border-l-4",
          styles.border
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 md:p-5 border-l-4 transition-all duration-300",
        "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]",
        styles.border
      )}
    >
      {/* Gradient overlay on hover */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
          styles.gradientFrom,
          styles.gradientTo
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
            {title}
          </p>
          <p className="mt-1.5 md:mt-2 text-2xl md:text-3xl font-extrabold text-card-foreground tracking-tight">
            <AnimatedCounter value={value} />
          </p>
          {displayLabel && (
            <p className="mt-0.5 md:mt-1 text-xs md:text-sm text-muted-foreground font-medium truncate">
              {displayLabel}
            </p>
          )}
          {trend && (
            <div
              className={cn(
                "mt-1.5 md:mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] md:text-xs font-bold",
                trend.positive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div
          className={cn(
            "p-2.5 md:p-3 rounded-xl shrink-0 transition-all duration-300",
            "group-hover:scale-110 group-hover:shadow-md",
            styles.iconBg
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
