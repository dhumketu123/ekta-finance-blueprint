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
    gradientFrom: "hsl(180 100% 15%)",
    gradientTo: "hsl(180 80% 25%)",
  },
  success: {
    border: "border-l-success",
    iconBg: "bg-success/10 text-success",
    gradientFrom: "hsl(152 55% 42%)",
    gradientTo: "hsl(152 45% 52%)",
  },
  warning: {
    border: "border-l-warning",
    iconBg: "bg-warning/10 text-warning",
    gradientFrom: "hsl(36 100% 50%)",
    gradientTo: "hsl(36 80% 60%)",
  },
  destructive: {
    border: "border-l-destructive",
    iconBg: "bg-destructive/10 text-destructive",
    gradientFrom: "hsl(0 100% 65%)",
    gradientTo: "hsl(0 80% 72%)",
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
      className={`group relative overflow-hidden bg-card rounded-xl border border-border/60 p-5 border-l-4 ${config.border} animate-fade-in transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}
      style={{ boxShadow: "var(--shadow-metric)" }}
    >
      {/* Subtle gradient overlay on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 rounded-xl"
        style={{ background: `linear-gradient(135deg, ${config.gradientFrom}, ${config.gradientTo})` }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
          <p className="mt-2 text-2xl font-extrabold text-card-foreground tracking-tight">
            <AnimatedNumber value={value} />
          </p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground font-medium">{subtitle}</p>}
          {trend && (
            <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${trend.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {trend.positive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${config.iconBg} transition-all duration-300 group-hover:scale-110 group-hover:shadow-md`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

export default MetricCard;
