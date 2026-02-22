import { useCashflowOracle } from "@/hooks/useCashflowOracle";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Brain, Users, Percent, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CashflowOracleWidget() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { data, isLoading } = useCashflowOracle();

  if (isLoading) {
    return (
      <div className="card-elevated p-5">
        <div className="animate-pulse space-y-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const TrendIcon = data.trend_direction === "up" ? TrendingUp :
    data.trend_direction === "down" ? TrendingDown : Minus;
  const trendColor = data.trend_direction === "up" ? "text-success" :
    data.trend_direction === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold">{bn ? "AI ক্যাশফ্লো অরাকল" : "AI Cashflow Oracle"}</h3>
        <Badge variant="outline" className="text-[10px] ml-auto bg-primary/10 text-primary border-primary/30">
          {bn ? "প্রেডিকটিভ" : "Predictive"}
        </Badge>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {/* Predicted Recovery */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground">{bn ? "পরবর্তী মাস আদায়" : "Next Month Recovery"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">৳{(data.predicted_recovery / 1000).toFixed(0)}K</span>
            <TrendIcon className={`w-4 h-4 ${trendColor}`} />
          </div>
        </div>

        {/* Risk Clients */}
        <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] text-muted-foreground">{bn ? "ঝুঁকিপূর্ণ সদস্য" : "Risk Clients"}</span>
          </div>
          <span className="text-lg font-bold text-destructive">{data.risk_clients_count}</span>
        </div>

        {/* Collection Efficiency */}
        <div className="p-3 rounded-xl bg-success/5 border border-success/20">
          <div className="flex items-center gap-1.5 mb-1">
            <Percent className="w-3.5 h-3.5 text-success" />
            <span className="text-[10px] text-muted-foreground">{bn ? "আদায় দক্ষতা" : "Collection Efficiency"}</span>
          </div>
          <span className="text-lg font-bold text-success">{data.collection_efficiency}%</span>
        </div>

        {/* Active EMIs */}
        <div className="p-3 rounded-xl bg-warning/5 border border-warning/20">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-warning" />
            <span className="text-[10px] text-muted-foreground">{bn ? "সক্রিয় ঋণ" : "Active EMIs"}</span>
          </div>
          <span className="text-lg font-bold">{data.active_emi_count}</span>
        </div>
      </div>

      {/* Consistency bar */}
      <div className="px-4 pb-4">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>{bn ? "সামঞ্জস্যতা" : "Consistency Factor"}</span>
          <span>{Math.round(data.consistency_factor * 100)}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              data.consistency_factor >= 0.8 ? "bg-success" :
              data.consistency_factor >= 0.6 ? "bg-warning" : "bg-destructive"
            }`}
            style={{ width: `${data.consistency_factor * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
