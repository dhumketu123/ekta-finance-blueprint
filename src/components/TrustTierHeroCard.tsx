import { useLanguage } from "@/contexts/LanguageContext";
import { Shield, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustTierHeroCardProps {
  trustTier?: string | null;
  trustScore?: number | null;
}

const TIER_CONFIG: Record<string, {
  gradient: string;
  textColor: string;
  border: string;
  shadow: string;
  badgeBg: string;
  icon: string;
}> = {
  Standard: {
    gradient: "from-slate-50 to-slate-100",
    textColor: "text-slate-800",
    border: "border-slate-200",
    shadow: "",
    badgeBg: "bg-slate-200/60 text-slate-700",
    icon: "text-slate-500",
  },
  Silver: {
    gradient: "from-gray-100 via-slate-200 to-gray-300",
    textColor: "text-gray-900",
    border: "border-gray-300",
    shadow: "shadow-[0_0_15px_rgba(156,163,175,0.4)]",
    badgeBg: "bg-white/40 text-gray-800",
    icon: "text-gray-500",
  },
  Gold: {
    gradient: "from-amber-100 via-yellow-300 to-amber-500",
    textColor: "text-amber-950",
    border: "border-amber-300",
    shadow: "shadow-[0_0_20px_rgba(251,191,36,0.3)]",
    badgeBg: "bg-white/30 text-amber-900",
    icon: "text-amber-600",
  },
  Platinum: {
    gradient: "from-slate-900 via-slate-800 to-black",
    textColor: "text-white",
    border: "border-slate-700",
    shadow: "shadow-[0_0_25px_rgba(255,255,255,0.1)]",
    badgeBg: "bg-white/15 text-white/90",
    icon: "text-white/80",
  },
};

const TIER_BN: Record<string, string> = {
  Standard: "সাধারণ",
  Silver: "সিলভার",
  Gold: "গোল্ড",
  Platinum: "প্লাটিনাম",
};

const TrustTierHeroCard = ({ trustTier, trustScore }: TrustTierHeroCardProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const tier = trustTier && TIER_CONFIG[trustTier] ? trustTier : "Standard";
  const config = TIER_CONFIG[tier];
  const score = trustScore ?? 0;
  const tierLabel = bn ? TIER_BN[tier] : tier;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5 sm:p-6 mb-4 animate-slide-up",
        "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4",
        `bg-gradient-to-br ${config.gradient} ${config.textColor} ${config.border} ${config.shadow}`
      )}
    >
      {/* Decorative shimmer overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{ background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.5) 50%, transparent 70%)" }}
      />

      {/* Left side */}
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <Shield className={cn("w-5 h-5", config.icon)} />
          <span className="text-xl sm:text-2xl font-bold tracking-tight">
            {bn ? `ট্রাস্ট মেম্বারশিপ: ${tierLabel}` : `Trust Tier: ${tier}`}
          </span>
        </div>
        <p className={cn("text-sm opacity-80 leading-relaxed max-w-md", config.textColor)}>
          {bn
            ? "সঠিক সময়ে কিস্তি পরিশোধ করে প্রিমিয়াম সুবিধা ও জিরো-গ্যারান্টার লোন আনলক করুন।"
            : "On-time payments unlock premium benefits & zero-guarantor loans."}
        </p>
      </div>

      {/* Right side — Score badge */}
      <div className="relative z-10 flex-shrink-0">
        <div className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-md",
          config.badgeBg, "border border-white/20"
        )}>
          <Star className="w-4 h-4" />
          <span className="text-lg sm:text-xl font-bold tabular-nums">
            {bn ? `ট্রাস্ট পয়েন্ট: ${score}` : `Trust Score: ${score}`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TrustTierHeroCard;
