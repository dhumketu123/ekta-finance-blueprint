import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface TrustTierHeroCardProps {
  trustTier?: string | null;
  trustScore?: number | null;
}

type Tier = "Standard" | "Silver" | "Gold" | "Platinum";

const VALID_TIERS: readonly Tier[] = ["Standard", "Silver", "Gold", "Platinum"] as const;

const TIER_THRESHOLDS: Record<Tier, number> = {
  Standard: 0,
  Silver: 2000,
  Gold: 5000,
  Platinum: 10000,
};

const TIER_CONFIG: Record<Tier, {
  gradient: string;
  text: string;
  border: string;
  shadow: string;
  emoji: string;
  scoreBadge: string;
  barFill: string;
}> = {
  Standard: {
    gradient: "bg-gradient-to-r from-slate-50 to-slate-100",
    text: "text-slate-800",
    border: "border-slate-200",
    shadow: "",
    emoji: "🛡️",
    scoreBadge: "bg-slate-200/60 text-slate-700",
    barFill: "bg-slate-500",
  },
  Silver: {
    gradient: "bg-gradient-to-br from-gray-100 via-slate-200 to-gray-300",
    text: "text-gray-900",
    border: "border-gray-300",
    shadow: "shadow-[0_4px_15px_rgba(156,163,175,0.3)]",
    emoji: "🛡️",
    scoreBadge: "bg-white/40 text-gray-800",
    barFill: "bg-slate-600",
  },
  Gold: {
    gradient: "bg-gradient-to-br from-amber-100 via-yellow-200 to-amber-400",
    text: "text-amber-950",
    border: "border-amber-300",
    shadow: "shadow-[0_4px_20px_rgba(251,191,36,0.25)]",
    emoji: "🏆",
    scoreBadge: "bg-white/30 text-amber-900",
    barFill: "bg-amber-700",
  },
  Platinum: {
    gradient: "bg-gradient-to-br from-slate-900 via-slate-800 to-black",
    text: "text-white",
    border: "border-slate-700",
    shadow: "shadow-[0_4px_25px_rgba(0,0,0,0.4)]",
    emoji: "🌟",
    scoreBadge: "bg-white/15 text-white/90",
    barFill: "bg-white/80",
  },
};

const TIER_BN: Record<Tier, string> = {
  Standard: "সাধারণ",
  Silver: "সিলভার",
  Gold: "গোল্ড",
  Platinum: "প্লাটিনাম",
};

const TrustTierHeroCard = ({ trustTier, trustScore }: TrustTierHeroCardProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const tier: Tier = (trustTier && VALID_TIERS.includes(trustTier as Tier))
    ? (trustTier as Tier)
    : "Standard";
  const config = TIER_CONFIG[tier];
  const score = trustScore ?? 0;
  const tierLabel = bn ? TIER_BN[tier] : tier;

  const { nextTier, pointsNeeded, progressPct, isMaxed } = useMemo(() => {
    if (tier === "Platinum") {
      return { nextTier: "Platinum" as Tier, pointsNeeded: 0, progressPct: 100, isMaxed: true };
    }
    const tierOrder: Tier[] = ["Standard", "Silver", "Gold", "Platinum"];
    const currentIdx = tierOrder.indexOf(tier);
    const next = tierOrder[currentIdx + 1];
    const currentFloor = TIER_THRESHOLDS[tier];
    const nextCeiling = TIER_THRESHOLDS[next];
    const range = nextCeiling - currentFloor;
    const progress = Math.min(Math.max(((score - currentFloor) / range) * 100, 0), 100);
    return {
      nextTier: next,
      pointsNeeded: Math.max(nextCeiling - score, 0),
      progressPct: Math.round(progress),
      isMaxed: false,
    };
  }, [tier, score]);

  const nextTierLabel = bn ? TIER_BN[nextTier] : nextTier;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-5 mt-4 animate-slide-up",
        "flex flex-col cursor-default",
        "transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-2xl",
        config.gradient, config.text, config.border, config.shadow
      )}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)" }}
      />

      {/* Top row: emoji + text + score */}
      <div className="relative z-10 flex items-center gap-4">
        {/* Emotional anchor emoji */}
        <div className="flex-shrink-0 text-4xl select-none transition-transform duration-300 group-hover:scale-110" aria-hidden="true">
          {config.emoji}
        </div>

        {/* Text block */}
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-bold tracking-tight leading-tight">
            {bn ? `ট্রাস্ট মেম্বারশিপ: ${tierLabel}` : `Trust Tier: ${tier}`}
          </h3>
          <p className="text-xs sm:text-sm opacity-80 leading-relaxed mt-0.5 max-w-md">
            {bn
              ? "সঠিক সময়ে কিস্তি পরিশোধ করে প্রিমিয়াম সুবিধা ও জিরো-গ্যারান্টার লোন আনলক করুন।"
              : "On-time payments unlock premium benefits & zero-guarantor loans."}
          </p>
        </div>

        {/* Score badge */}
        <div className="flex-shrink-0">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md text-xs sm:text-sm font-bold tabular-nums",
            config.scoreBadge, "border border-white/20"
          )}>
            <span>{bn ? `${score} পয়েন্ট` : `${score} pts`}</span>
          </div>
        </div>
      </div>

      {/* Progress bar section */}
      <div className="relative z-10 mt-4 pt-3 border-t border-current/10">
        <div className="flex justify-between items-end mb-2 text-xs opacity-90">
          <span className="font-medium">
            {isMaxed
              ? (bn ? "সর্বোচ্চ মর্যাদা অর্জন করেছেন ✨" : "Highest Tier Reached ✨")
              : (bn ? `পরবর্তী টার্গেট: ${nextTierLabel}` : `Next: ${nextTierLabel}`)}
          </span>
          {!isMaxed && (
            <span className="tabular-nums font-medium">
              {bn ? `আর ${pointsNeeded.toLocaleString("bn-BD")} পয়েন্ট` : `${pointsNeeded.toLocaleString()} pts to go`}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-1000 ease-out", config.barFill)}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default TrustTierHeroCard;
