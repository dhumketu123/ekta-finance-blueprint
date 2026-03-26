import { useLanguage } from "@/contexts/LanguageContext";
import { Shield, Star, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import ProfileCompletionRing from "@/components/ProfileCompletionRing";
import ClientPhotoUpload from "@/components/ClientPhotoUpload";
import StatusBadge from "@/components/StatusBadge";
import CommunicationHub from "@/components/CommunicationHub";

type TrustTier = "Standard" | "Silver" | "Gold" | "Platinum";

const TIER_ACCENT: Record<TrustTier, {
  ring: string;
  badge: string;
  glow: string;
  icon: string;
}> = {
  Standard: {
    ring: "border-border/40",
    badge: "bg-muted/60 text-muted-foreground",
    glow: "",
    icon: "text-muted-foreground",
  },
  Silver: {
    ring: "border-slate-300/60",
    badge: "bg-slate-200/70 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300",
    glow: "shadow-[0_0_20px_-4px_hsl(var(--muted)/0.3)]",
    icon: "text-slate-500",
  },
  Gold: {
    ring: "border-amber-400/50",
    badge: "bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    glow: "shadow-[0_0_24px_-4px_hsl(45_93%_47%/0.25)]",
    icon: "text-amber-500",
  },
  Platinum: {
    ring: "border-purple-400/40",
    badge: "bg-purple-100/70 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    glow: "shadow-[0_0_28px_-4px_hsl(270_60%_60%/0.2)]",
    icon: "text-purple-500",
  },
};

const TIER_BN: Record<TrustTier, string> = {
  Standard: "সাধারণ",
  Silver: "সিলভার",
  Gold: "গোল্ড",
  Platinum: "প্লাটিনাম",
};

interface ClientProfileHeaderProps {
  client: Record<string, any>;
  clientId: string;
  canEditClients: boolean;
  activeLoans?: any[];
  maskedMemberId: string;
}

const ClientProfileHeader = ({
  client,
  clientId,
  canEditClients,
  activeLoans,
  maskedMemberId,
}: ClientProfileHeaderProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const c = client;
  const name = bn ? (c.name_bn || c.name_en) : c.name_en;
  const tier: TrustTier =
    (["Standard", "Silver", "Gold", "Platinum"] as const).includes(c.trust_tier)
      ? (c.trust_tier as TrustTier)
      : "Standard";
  const accent = TIER_ACCENT[tier];
  const score = c.trust_score ?? 0;
  const tierLabel = bn ? TIER_BN[tier] : tier;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 sm:p-5 animate-slide-up",
        accent.ring, accent.glow
      )}
      style={{
        background: "hsl(var(--card) / 0.88)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        boxShadow: "0 8px 32px -8px hsl(var(--primary) / 0.10), var(--shadow-card)",
      }}
    >
      {/* Gradient accent overlay */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))" }}
      />

      {/* Row 1: Avatar + Identity */}
      <div className="relative flex items-center gap-3 sm:gap-4">
        <ProfileCompletionRing client={c} size={96} strokeWidth={4}>
          <ClientPhotoUpload clientId={clientId} currentPhotoUrl={c.photo_url} canEdit={canEditClients} />
        </ProfileCompletionRing>

        <div className="min-w-0 flex-1">
          {/* Name */}
          <h2 className="text-lg font-bold text-foreground truncate leading-tight">{name}</h2>
          {c.name_bn && c.name_bn !== name && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.name_bn}</p>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {c.member_id ? (
              <span
                className="text-[11px] font-mono font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20 tracking-wider"
                title={c.member_id}
              >
                {maskedMemberId}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground font-mono">{clientId.slice(0, 8)}</span>
            )}
            <StatusBadge status={c.status as any} />
          </div>

          {/* Occupation */}
          {c.occupation && (
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {bn ? "পেশা:" : "Occ:"}{" "}
              <span className="text-foreground font-medium">{c.occupation}</span>
            </p>
          )}
        </div>
      </div>

      {/* Row 2: Trust tier strip + Communication */}
      <div className="relative mt-3 flex items-center justify-between gap-2 flex-wrap">
        {/* Trust tier pill */}
        <div className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-border/30",
          accent.badge
        )}>
          <Shield className={cn("w-3.5 h-3.5", accent.icon)} />
          <span>{tierLabel}</span>
          <span className="mx-1 opacity-30">|</span>
          <Star className="w-3 h-3 opacity-60" />
          <span className="tabular-nums font-bold">{score.toLocaleString()}</span>
          <span className="opacity-60 text-[10px]">{bn ? "পয়েন্ট" : "pts"}</span>
        </div>

        {/* Communication hub */}
        <CommunicationHub
          clientId={clientId}
          clientPhone={c.phone}
          clientName={name}
          loanId={activeLoans?.[0]?.id}
        />
      </div>

      {/* Photo hint */}
      {canEditClients && (
        <p className="text-[10px] text-muted-foreground mt-2.5 italic opacity-70">
          {bn ? "ছবির উপর হোভার করুন প্রোফাইল ছবি পরিবর্তন করতে" : "Hover over photo to update profile picture"}
        </p>
      )}
    </div>
  );
};

export default ClientProfileHeader;
