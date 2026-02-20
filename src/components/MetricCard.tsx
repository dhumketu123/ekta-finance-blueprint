import { ReactNode, useEffect, useRef, useState } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: { value: number; positive: boolean };
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantConfig = {
  default: {
    border: "border-l-primary",
    iconBg: "bg-primary/10 text-primary",
    gradientFrom: "hsl(var(--primary))",
    gradientTo: "hsl(var(--ring))",
  },
  success: {
    border: "border-l-success",
    iconBg: "bg-success/10 text-success",
    gradientFrom: "hsl(var(--success))",
    gradientTo: "hsl(var(--success) / 0.7)",
  },
  warning: {
    border: "border-l-warning",
    iconBg: "bg-warning/10 text-warning",
    gradientFrom: "hsl(var(--warning))",
    gradientTo: "hsl(var(--warning) / 0.7)",
  },
  destructive: {
    border: "border-l-destructive",
    iconBg: "bg-destructive/10 text-destructive",
    gradientFrom: "hsl(var(--destructive))",
    gradientTo: "hsl(var(--destructive) / 0.7)",
  },
};

const AnimatedNumber = ({ value }: { value: string | number }) => {
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof value === "number") {
      let start = 0;
      const end = value;
      const duration = 900;
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
  const config = variantConfig[variant];

  return (
    <div
      className={`group relative overflow-hidden bg-card rounded-xl border border-border/60 p-4 md:p-5 border-l-4 ${config.border} animate-fade-in transition-all duration-300 hover:shadow-lg active:scale-[0.98] hover:-translate-y-1`}
      style={{ boxShadow: "var(--shadow-metric)" }}
    >
      {/* Subtle gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 rounded-xl"
        style={{ background: `linear-gradient(135deg, ${config.gradientFrom}, ${config.gradientTo})` }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] md:text-[11px] font-bold text-muted-foreground uppercase tracking-widest truncate">{title}</p>
          <p className="mt-1.5 md:mt-2 text-xl md:text-2xl font-extrabold text-card-foreground tracking-tight">
            <AnimatedNumber value={value} />
          </p>
          {subtitle && <p className="mt-0.5 md:mt-1 text-[11px] md:text-xs text-muted-foreground font-medium truncate">{subtitle}</p>}
          {trend && (
            <div className={`mt-1.5 md:mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold ${trend.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className={`p-2 md:p-3 rounded-lg md:rounded-xl shrink-0 ${config.iconBg} transition-all duration-300 group-hover:scale-110 group-hover:shadow-md`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
