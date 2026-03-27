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
      id: "payment",
      icon: hasActiveLoans ? Banknote : TrendingUp,
      label_bn: hasActiveLoans ? "পেমেন্ট" : "ঋণ বিতরণ",
      label_en: hasActiveLoans ? "Payment" : "Disburse",
      onClick: onPaymentOrDisburse,
      enabled: true,
    },
    {
      id: "savings",
      icon: PiggyBank,
      label_bn: "সঞ্চয়",
      label_en: "Savings",
      onClick: onSavings,
      enabled: true,
    },
    {
      id: "fee",
      icon: Receipt,
      label_bn: "ফি/অন্যান্য",
      label_en: "Fee/Other",
      onClick: onFeeOther,
      enabled: true,
    },
    {
      id: "export",
      icon: Download,
      label_bn: "এক্সপোর্ট",
      label_en: "Export",
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
            key={action.id}
            type="button"
            aria-label={bn ? action.label_bn : action.label_en}
            onClick={action.enabled ? action.onClick : undefined}
            disabled={!action.enabled}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 min-h-[88px] rounded-xl p-2 sm:p-4",
              "text-[10px] md:text-xs font-medium touch-manipulation",
              "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
              "active:scale-95 hover:-translate-y-1 hover:shadow-lg hover:bg-accent/50",
              "focus:ring-2 focus:ring-primary focus:outline-none",
              !action.enabled && "opacity-40 pointer-events-none"
            )}
          >
            <span className="flex items-center justify-center p-2.5 rounded-xl bg-muted/60 shadow-sm mb-1">
              <action.icon className="w-5 h-5 text-muted-foreground" strokeWidth={1.8} />
            </span>
            <span className="truncate max-w-full px-0.5 leading-tight">{bn ? action.label_bn : action.label_en}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionGrid;
