import { Banknote, PiggyBank, Receipt, Download, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface QuickActionGridProps {
  hasActiveLoans: boolean;
  canExport: boolean;
  onPaymentOrDisburse: () => void;
  onSavings: () => void;
  onFeeOther: () => void;
  onExport: () => void;
}

const QuickActionGrid = ({
  hasActiveLoans,
  canExport,
  onPaymentOrDisburse,
  onSavings,
  onFeeOther,
  onExport,
}: QuickActionGridProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const actions = [
    {
      icon: hasActiveLoans ? Banknote : TrendingUp,
      label: hasActiveLoans
        ? (bn ? "পেমেন্ট" : "Payment")
        : (bn ? "ঋণ বিতরণ" : "Disburse"),
      onClick: onPaymentOrDisburse,
      enabled: true,
    },
    {
      icon: PiggyBank,
      label: bn ? "সঞ্চয়" : "Savings",
      onClick: onSavings,
      enabled: true,
    },
    {
      icon: Receipt,
      label: bn ? "ফি/অন্যান্য" : "Fee/Other",
      onClick: onFeeOther,
      enabled: true,
    },
    {
      icon: Download,
      label: bn ? "এক্সপোর্ট" : "Export",
      onClick: onExport,
      enabled: canExport,
    },
  ];

  return (
    <div
      className="rounded-xl border border-border/30 p-2 animate-slide-up"
      style={{
        background: "hsl(var(--card) / 0.85)",
        backdropFilter: "blur(12px) saturate(1.3)",
        WebkitBackdropFilter: "blur(12px) saturate(1.3)",
      }}
    >
      <div className="grid grid-cols-4 gap-3">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.enabled ? action.onClick : undefined}
            disabled={!action.enabled}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 min-h-[88px] rounded-lg",
              "text-[11px] font-medium transition-all duration-100",
              action.enabled
                ? "text-foreground active:scale-95"
                : "opacity-40 pointer-events-none"
            )}
          >
            <action.icon className="w-5 h-5 text-muted-foreground" strokeWidth={1.8} />
            <span className="truncate max-w-full px-0.5">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionGrid;
