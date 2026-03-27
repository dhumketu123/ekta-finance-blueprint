import { useMemo } from "react";
import { PiggyBank, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SavingsAccount {
  id: string;
  balance: number;
  savings_products?: {
    product_name_en?: string;
    product_name_bn?: string;
  } | null;
}

interface DreamVaultCardProps {
  savingsAccounts: SavingsAccount[];
  bn: boolean;
}

const getMilestoneBadge = (progress: number, bn: boolean) => {
  if (progress >= 100) return { emoji: "🏆", label: bn ? "টার্গেট পূর্ণ!" : "Target Met!", pulse: true };
  if (progress >= 75) return { emoji: "🥇", label: bn ? "গোল্ড" : "Gold", pulse: false };
  if (progress >= 50) return { emoji: "🥈", label: bn ? "সিলভার" : "Silver", pulse: false };
  if (progress >= 25) return { emoji: "🥉", label: bn ? "ব্রোঞ্জ" : "Bronze", pulse: false };
  return { emoji: "🌱", label: bn ? "শুরু" : "Start", pulse: false };
};

export default function DreamVaultCard({ savingsAccounts, bn }: DreamVaultCardProps) {
  const totalBalance = useMemo(
    () => savingsAccounts.reduce((s, a) => s + Number(a.balance), 0),
    [savingsAccounts]
  );

  const mockTarget = useMemo(
    () => (totalBalance === 0 ? 10000 : Math.ceil(totalBalance / 50000) * 50000 + 10000),
    [totalBalance]
  );

  const progress = useMemo(
    () => Math.min(100, (totalBalance / mockTarget) * 100),
    [totalBalance, mockTarget]
  );

  const milestone = useMemo(() => getMilestoneBadge(progress, bn), [progress, bn]);
  const remaining = Math.max(0, mockTarget - totalBalance);

  return (
    <div className="space-y-3">
      {/* Dream Vault Hero */}
      <div className="relative rounded-2xl border border-border/50 bg-slate-900/5 dark:bg-slate-900/40 backdrop-blur-sm p-5 overflow-hidden">
        {/* Subtle decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-purple-500/5 pointer-events-none" />

        <div className="relative z-10 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  🌟 {bn ? "ভবিষ্যত স্বপ্ন" : "Future Dream"}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {bn ? "উদ্দেশ্যভিত্তিক সঞ্চয়" : "Purpose-driven savings"}
                </p>
              </div>
            </div>
            <Badge
              className={cn(
                "text-xs font-bold border-0 px-2.5 py-1",
                milestone.pulse && "animate-pulse",
                progress >= 75
                  ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                  : progress >= 50
                  ? "bg-slate-400/15 text-slate-500 dark:text-slate-300"
                  : progress >= 25
                  ? "bg-amber-600/15 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {milestone.emoji} {milestone.label}
            </Badge>
          </div>

          {/* Balance & Target */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {bn ? "মোট সঞ্চয়" : "Total Savings"}
              </p>
              <p className="text-2xl font-bold text-foreground mt-0.5">
                ৳{totalBalance.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {bn ? "লক্ষ্যমাত্রা" : "Target"}
              </p>
              <p className="text-sm font-bold text-muted-foreground mt-0.5">
                ৳{mockTarget.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              {bn
                ? `স্বপ্ন পূরণের পথে: ${progress.toFixed(1)}% সম্পন্ন`
                : `Journey to Dream: ${progress.toFixed(1)}% Complete`}
            </p>
            <div className="relative h-2.5 w-full rounded-full bg-slate-200/50 dark:bg-slate-700/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            {remaining > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {bn
                  ? `আর মাত্র ৳${remaining.toLocaleString()} বাকি! 🚀`
                  : `Only ৳${remaining.toLocaleString()} remaining! 🚀`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Individual Account Breakdown */}
      {savingsAccounts.map((sa) => {
        const spData =
          typeof sa.savings_products === "object" &&
          sa.savings_products !== null &&
          !Array.isArray(sa.savings_products)
            ? sa.savings_products
            : null;
        const spName = spData?.[bn ? "product_name_bn" : "product_name_en"];
        const displayName =
          typeof spName === "string" && spName ? spName : sa.id?.slice(0, 8) ?? "—";

        return (
          <div
            key={sa.id}
            className="flex items-center justify-between py-2 px-1 border-b border-border last:border-0"
          >
            <div className="flex items-center gap-2">
              <PiggyBank className="w-3.5 h-3.5 text-success flex-shrink-0" />
              <p className="text-xs font-medium">{displayName}</p>
            </div>
            <p className="text-sm font-bold text-success">
              ৳{Number(sa.balance).toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}
