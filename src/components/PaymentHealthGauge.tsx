import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Activity } from "lucide-react";

interface Props {
  punctualityPct: number;
  riskLevel: string;
  paidInstallments: number;
  totalInstallments: number;
}

export default function PaymentHealthGauge({ punctualityPct, riskLevel, paidInstallments, totalInstallments }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const { color, label, strokeColor } = useMemo(() => {
    if (punctualityPct >= 80) return {
      color: "hsl(var(--success))",
      strokeColor: "hsl(var(--success) / 0.2)",
      label: bn ? "চমৎকার" : "Excellent",
    };
    if (punctualityPct >= 60) return {
      color: "hsl(var(--primary))",
      strokeColor: "hsl(var(--primary) / 0.2)",
      label: bn ? "ভালো" : "Good",
    };
    if (punctualityPct >= 40) return {
      color: "hsl(var(--warning))",
      strokeColor: "hsl(var(--warning) / 0.2)",
      label: bn ? "মাঝারি" : "Fair",
    };
    return {
      color: "hsl(var(--destructive))",
      strokeColor: "hsl(var(--destructive) / 0.2)",
      label: bn ? "ঝুঁকিপূর্ণ" : "At Risk",
    };
  }, [punctualityPct, bn]);

  const radius = 52;
  const stroke = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (punctualityPct / 100) * circumference;

  return (
    <div className="card-elevated p-5 flex flex-col items-center justify-center animate-slide-up" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center gap-2 mb-3 self-start">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
          {bn ? "পেমেন্ট স্বাস্থ্য" : "Payment Health"}
        </h3>
      </div>

      <div className="relative w-[130px] h-[130px]">
        <svg width="130" height="130" viewBox="0 0 130 130" className="-rotate-90">
          {/* Background circle */}
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
          />
          {/* Progress circle */}
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-foreground">{punctualityPct}%</span>
          <span className="text-[10px] font-semibold" style={{ color }}>{label}</span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <p className="text-[10px] text-muted-foreground">
          {paidInstallments}/{totalInstallments} {bn ? "কিস্তি পরিশোধিত" : "installments paid"}
        </p>
      </div>
    </div>
  );
}
