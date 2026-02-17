import { ReactNode, useEffect, useRef, useState } from "react";

interface MetricCardProps {
  title: string;
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

const iconBg = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

const AnimatedNumber = ({ value }: { value: string | number }) => {
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof value === "number") {
      let start = 0;
      const end = value;
      const duration = 800;
      const startTime = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        start = Math.round(eased * end);
        setDisplay(start);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else {
      setDisplay(value);
    }
  }, [value]);

  return <span ref={ref}>{display}</span>;
};

const MetricCard = ({ title, value, subtitle, icon, trend, variant = "default" }: MetricCardProps) => {
  return (
    <div
      className={`card-elevated p-5 border-l-4 ${variantStyles[variant]} animate-fade-in`}
      style={{ boxShadow: "var(--shadow-metric)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            <AnimatedNumber value={value} />
          </p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={`mt-1.5 text-xs font-semibold ${trend.positive ? "text-success" : "text-destructive"}`}>
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${iconBg[variant]} transition-transform duration-300 group-hover:scale-110`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
