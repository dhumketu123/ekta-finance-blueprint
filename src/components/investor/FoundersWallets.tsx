import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { Wallet, TrendingUp, Crown, Sprout, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

interface Investor {
  id: string;
  name_en: string;
  name_bn: string;
  capital: number;
  total_weekly_paid: number;
  status: string;
}

interface Props {
  investors: Investor[];
}

function getFounderTier(total: number): { 
  key: string; 
  label_en: string; 
  label_bn: string; 
  icon: React.ReactNode;
  gradient: string;
  glow: string;
} {
  if (total > 50000) {
    return { 
      key: "apex", 
      label_en: "Apex", 
      label_bn: "এপেক্স",
      icon: <Crown className="w-3.5 h-3.5" />,
      gradient: "from-amber-500/20 via-yellow-500/10 to-orange-500/20",
      glow: "shadow-[0_0_20px_rgba(245,158,11,0.3)]"
    };
  }
  if (total >= 10000) {
    return { 
      key: "growth", 
      label_en: "Growth", 
      label_bn: "গ্রোথ",
      icon: <Rocket className="w-3.5 h-3.5" />,
      gradient: "from-emerald-500/20 via-teal-500/10 to-green-500/20",
      glow: "shadow-[0_0_15px_rgba(16,185,129,0.25)]"
    };
  }
  return { 
    key: "seed", 
    label_en: "Seed", 
    label_bn: "সিড",
    icon: <Sprout className="w-3.5 h-3.5" />,
    gradient: "from-slate-500/10 via-gray-500/5 to-zinc-500/10",
    glow: ""
  };
}

export const FoundersWallets = memo(function FoundersWallets({ investors }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const activeInvestors = investors.filter(inv => inv.status === "active");

  if (activeInvestors.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <h3 className="text-sm font-bold text-foreground">
          {bn ? "ফাউন্ডারস পোর্টফোলিও" : "Founders' Wallets"}
        </h3>
        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
          {activeInvestors.length} {bn ? "জন" : "active"}
        </Badge>
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-3">
          {activeInvestors.map((inv) => {
            const walletBalance = (inv.capital || 0) + (inv.total_weekly_paid || 0);
            const tier = getFounderTier(walletBalance);
            const name = bn ? (inv.name_bn || inv.name_en) : inv.name_en;

            return (
              <div
                key={inv.id}
                onClick={() => navigate(`/owners/${inv.id}`)}
                className={cn(
                  "relative flex-shrink-0 w-[180px] p-4 rounded-xl cursor-pointer",
                  "bg-gradient-to-br",
                  tier.gradient,
                  "border border-border/60 backdrop-blur-sm",
                  "transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5",
                  tier.glow
                )}
              >
                {/* Tier Badge - Top Right */}
                <div className="absolute -top-1.5 -right-1.5">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[9px] px-1.5 py-0 leading-4 gap-0.5",
                      tier.key === "apex" && "border-amber-500/50 text-amber-600 bg-amber-500/20 dark:text-amber-400",
                      tier.key === "growth" && "border-emerald-500/50 text-emerald-600 bg-emerald-500/20 dark:text-emerald-400",
                      tier.key === "seed" && "border-muted-foreground/30 text-muted-foreground bg-muted/80"
                    )}
                  >
                    {tier.icon}
                    {bn ? tier.label_bn : tier.label_en}
                  </Badge>
                </div>

                {/* Content */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground truncate pr-8" title={name}>
                    {name}
                  </p>
                  
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-foreground">
                      ৳{walletBalance.toLocaleString("bn-BD")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <TrendingUp className="w-3 h-3 text-success" />
                    {bn ? "ওয়ালেট ব্যালেন্স" : "Wallet Balance"}
                  </div>
                </div>

                {/* Decorative element */}
                <div className="absolute bottom-0 right-0 w-12 h-12 opacity-5">
                  <Wallet className="w-full h-full" />
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
});

export default FoundersWallets;
