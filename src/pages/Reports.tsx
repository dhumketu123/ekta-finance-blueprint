import AppLayout from "@/components/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { Scale, TrendingUp, TrendingDown, Landmark, CreditCard, Users, BookOpen, Wallet, Activity, FileText, Loader2, ShieldAlert, Target, AlertTriangle, Rocket, Droplets, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReportsMetrics } from "@/hooks/useReportsMetrics";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

const reportLinks = [
  { path: "/reports/trial-balance", icon: Scale, titleBn: "ট্রায়াল ব্যালেন্স", titleEn: "Trial Balance", descBn: "সকল হিসাবের মোট ডেবিট ও ক্রেডিট সারাংশ", descEn: "Summary of total debit & credit for all accounts" },
  { path: "/reports/balance-sheet", icon: BookOpen, titleBn: "ব্যালেন্স শীট", titleEn: "Balance Sheet", descBn: "সম্পদ, দায় ও মালিকানা স্বত্ব — আর্থিক অবস্থান বিবরণী", descEn: "Assets, Liabilities & Equity — Statement of Financial Position" },
  { path: "/reports/profit-loss", icon: TrendingUp, titleBn: "আয়-ব্যয় বিবরণী", titleEn: "Profit & Loss", descBn: "আয় ও ব্যয় হিসাব থেকে নিট আয় গণনা", descEn: "Net income from income & expense accounts" },
  { path: "/reports/payment-status", icon: CreditCard, titleBn: "পেমেন্ট স্ট্যাটাস", titleEn: "Payment Status", descBn: "কিস্তি পরিশোধ অবস্থা — বকেয়া, পরিশোধিত, মুলতুবি", descEn: "Installment payment status — Overdue, Paid, Pending" },
  { path: "/reports/investor-summary", icon: Users, titleBn: "বিনিয়োগকারী সারাংশ", titleEn: "Investor Summary", descBn: "পোর্টফোলিও, লভ্যাংশ বিতরণ ও পুনর্বিনিয়োগ রিপোর্ট", descEn: "Portfolio, profit distribution & reinvestment report" },
  { path: "/transactions", icon: Landmark, titleBn: "আর্থিক লেনদেন", titleEn: "Financial Transactions", descBn: "সকল লেনদেন, রিসিপ্ট ও অনুমোদন", descEn: "All transactions, receipts & approvals" },
];

const kpiVariants = [
  { border: "border-l-primary", iconBg: "bg-primary/10 text-primary" },
  { border: "border-l-success", iconBg: "bg-success/10 text-success" },
  { border: "border-l-warning", iconBg: "bg-warning/10 text-warning" },
  { border: "border-l-accent", iconBg: "bg-accent text-accent-foreground" },
] as const;

const formatCompact = (n: number): string => {
  if (n >= 10_000_000) return `৳${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `৳${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `৳${(n / 1_000).toFixed(1)}K`;
  return `৳${n.toLocaleString("en-BD")}`;
};

const getRiskColor = (index: number) =>
  index < 3 ? "text-green-500" : index < 6 ? "text-yellow-500" : "text-red-500";

const getRiskBarColor = (index: number) =>
  index < 3 ? "bg-green-500" : index < 6 ? "bg-yellow-500" : "bg-red-500";

const alertMeta: Record<string, { bn: string; en: string; variant: "destructive" | "secondary" | "outline"; icon: typeof AlertTriangle }> = {
  high_risk: { bn: "⚠ উচ্চ ঝুঁকি", en: "⚠ High Risk", variant: "destructive", icon: AlertTriangle },
  expansion_opportunity: { bn: "🚀 সম্প্রসারণ সুযোগ", en: "🚀 Expansion", variant: "secondary", icon: Rocket },
  liquidity_warning: { bn: "💧 তারল্য সতর্কতা", en: "💧 Liquidity Warning", variant: "destructive", icon: Droplets },
  low_recovery: { bn: "📉 নিম্ন আদায়", en: "📉 Low Recovery", variant: "destructive", icon: BarChart3 },
  data_unavailable: { bn: "⚠ ডেটা পাওয়া যায়নি", en: "⚠ Data Unavailable", variant: "outline", icon: AlertTriangle },
};

const buildExecutiveMetrics = (m: ReturnType<typeof useReportsMetrics>, lang: string) => [
  { icon: Wallet, title: "AUM", value: formatCompact(m.aum), subtitle: lang === "bn" ? "মোট পরিচালিত সম্পদ" : "Assets Under Management" },
  { icon: Users, title: lang === "bn" ? "সক্রিয় সদস্য" : "Active Members", value: `${m.activeMembers}`, subtitle: lang === "bn" ? "বর্তমানে সক্রিয় প্রোফাইল" : "Currently active profiles" },
  { icon: Activity, title: lang === "bn" ? "রিকভারি রেট" : "Recovery Rate", value: `${m.recoveryRate}%`, subtitle: lang === "bn" ? "সামগ্রিক আদায় হার" : "Overall collection rate" },
  { icon: TrendingUp, title: lang === "bn" ? "সাপ্তাহিক প্রবৃদ্ধি" : "Weekly Growth", value: `${m.growthVelocity}%`, subtitle: lang === "bn" ? "গত ৭ দিনে সংগ্রহ বৃদ্ধি" : "Collection growth (7 days)" },
];

const KpiSkeleton = () => (
  <div className="rounded-xl border border-border/60 bg-card p-3.5 md:p-5 border-l-4 border-l-muted">
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-32 hidden sm:block" />
      </div>
      <Skeleton className="h-10 w-10 rounded-xl" />
    </div>
  </div>
);

const AdvancedSkeleton = () => (
  <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5 space-y-3">
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-4" />
      <Skeleton className="h-3 w-28" />
    </div>
    <Skeleton className="h-8 w-20" />
    <Skeleton className="h-2 w-full rounded-full" />
  </div>
);

const ReportsPage = () => {
  const { lang } = useLanguage();
  const metrics = useReportsMetrics();
  const executiveMetrics = buildExecutiveMetrics(metrics, lang);

  const projectionDelta = metrics.projected30DayCollections - metrics.prev30DayCollections;
  const projectionPct = metrics.prev30DayCollections > 0
    ? Math.round((projectionDelta / metrics.prev30DayCollections) * 100)
    : metrics.projected30DayCollections > 0 ? 100 : 0;
  const trendPositive = projectionDelta >= 0;

  return (
    <AppLayout>
      <TooltipProvider>
        <div className="space-y-6">
          {/* Hero Header */}
          <div className="w-full flex flex-col items-center justify-center text-center py-8 mb-6">
            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 mb-4">
              ⚡ {lang === "bn" ? "লাইভ ইন্টেলিজেন্স হাব" : "Live Intelligence Hub"}
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500">
              {lang === "bn" ? "রিপোর্ট সেন্টার" : "Report Center"}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-lg mx-auto font-medium">
              {lang === "bn" ? "ফিন্যান্সিয়াল ইন্টেলিজেন্স ও অফিসিয়াল রিপোর্টসমূহ" : "Financial intelligence & official reports"}
            </p>
          </div>

          {/* Alerts Banner */}
          {!metrics.isLoading && metrics.alerts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {metrics.alerts.map((a) => {
                const meta = alertMeta[a];
                if (!meta) return null;
                const Icon = meta.icon;
                return (
                  <Badge key={a} variant={meta.variant} className="text-xs flex items-center gap-1.5 px-3 py-1">
                    <Icon className="w-3 h-3" />
                    {lang === "bn" ? meta.bn : meta.en}
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Executive KPI Grid */}
          <section aria-label={lang === "bn" ? "কর্মক্ষমতা সূচক" : "Key Performance Indicators"}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {metrics.isLoading
                ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
                : executiveMetrics.map((metric, index) => {
                    const Icon = metric.icon;
                    const variant = kpiVariants[index % kpiVariants.length];
                    return (
                      <div key={index} className={cn("group relative overflow-hidden rounded-xl border border-border/60 bg-card p-3.5 md:p-5 border-l-4 transition-all duration-300", "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]", variant.border)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">{metric.title}</p>
                            <p className="mt-1 md:mt-2 text-xl md:text-3xl font-extrabold text-card-foreground tracking-tight">{metric.value}</p>
                            <p className="mt-0.5 text-[10px] md:text-xs text-muted-foreground font-medium truncate hidden sm:block">{metric.subtitle}</p>
                          </div>
                          <div className={cn("p-2 md:p-3 rounded-xl shrink-0 transition-all duration-300 group-hover:scale-110", variant.iconBg)}>
                            <Icon className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </section>

          {/* Advanced Intelligence Row */}
          <section aria-label={lang === "bn" ? "উন্নত বিশ্লেষণ" : "Advanced Analytics"}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {metrics.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <AdvancedSkeleton key={i} />)
              ) : (
                <>
                  {/* Risk Index */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5 cursor-help">
                        <div className="flex items-center gap-2 mb-2">
                          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                          <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {lang === "bn" ? "ঝুঁকি সূচক (PAR)" : "Risk Index (PAR)"}
                          </p>
                        </div>
                        <p className={cn("text-2xl md:text-3xl font-extrabold tracking-tight", getRiskColor(metrics.riskIndex))}>{metrics.riskIndex}%</p>
                        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", getRiskBarColor(metrics.weightedRisk))}
                            style={{ width: `${Math.min(metrics.weightedRisk * 10, 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          {lang === "bn" ? `ওয়েটেড ঝুঁকি: ${metrics.weightedRisk}%` : `Weighted Risk: ${metrics.weightedRisk}%`}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[240px]">
                      <p className="text-xs">
                        {lang === "bn"
                          ? "PAR = মোট বকেয়া / মোট ঋণ মূলধন। ওয়েটেড ঝুঁকি = PAR × (ঋণ মূলধন / AUM)।"
                          : "PAR = Total Overdue / Total Loan Principal. Weighted Risk = PAR × (Loan Principal / AUM)."}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  {/* 30-Day Projection */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5 cursor-help">
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="w-4 h-4 text-muted-foreground" />
                          <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {lang === "bn" ? "৩০-দিন প্রক্ষেপণ" : "30-Day Projection"}
                          </p>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl md:text-3xl font-extrabold text-card-foreground tracking-tight">
                            {formatCompact(metrics.projected30DayCollections)}
                          </p>
                          <span className={cn("text-xs font-semibold flex items-center gap-0.5", trendPositive ? "text-green-500" : "text-red-500")}>
                            {trendPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {trendPositive ? "+" : ""}{projectionPct}%
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {lang === "bn" ? `পূর্ববর্তী ৩০-দিন: ${formatCompact(metrics.prev30DayCollections)}` : `Prev 30d: ${formatCompact(metrics.prev30DayCollections)}`}
                        </p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[240px]">
                      <p className="text-xs">
                        {lang === "bn"
                          ? "গত ৭ দিনের গড় দৈনিক আদায় × ৩০ = প্রক্ষেপিত সংগ্রহ। পূর্ববর্তী ৩০ দিনের তুলনায় পরিবর্তন দেখানো হচ্ছে।"
                          : "Avg daily collection (last 7d) × 30 = projected. Delta shown vs actual previous 30-day collections."}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Today's Txns */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                      <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        {lang === "bn" ? "আজকের লেনদেন" : "Today's Txns"}
                      </p>
                    </div>
                    <p className="text-2xl md:text-3xl font-extrabold text-card-foreground tracking-tight">{metrics.todaysTransactions}</p>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Reports Section */}
          <section aria-label={lang === "bn" ? "রিপোর্টসমূহ" : "Reports"}>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {lang === "bn" ? "অফিসিয়াল রিপোর্টসমূহ" : "Official Reports"}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {reportLinks.map((r) => (
                <Link key={r.path} to={r.path} className={cn("group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 md:p-5 transition-all duration-300", "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]", "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50")}>
                  <div className="flex items-start gap-3 md:gap-4">
                    <div className="p-2.5 md:p-3 rounded-xl shrink-0 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110">
                      <r.icon className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-card-foreground">{lang === "bn" ? r.titleBn : r.titleEn}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{lang === "bn" ? r.descBn : r.descEn}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
};

export default ReportsPage;
