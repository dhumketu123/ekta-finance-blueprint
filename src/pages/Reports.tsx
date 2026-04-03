import AppLayout from "@/components/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { Scale, TrendingUp, Landmark, CreditCard, Users, BookOpen, Wallet, Activity, FileText, Loader2, ShieldAlert, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReportsMetrics } from "@/hooks/useReportsMetrics";
import { Badge } from "@/components/ui/badge";

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

const alertMeta: Record<string, { bn: string; en: string; variant: "destructive" | "secondary" | "outline" }> = {
  high_risk: { bn: "⚠ উচ্চ ঝুঁকি", en: "⚠ High Risk", variant: "destructive" },
  expansion_opportunity: { bn: "🚀 সম্প্রসারণ সুযোগ", en: "🚀 Expansion", variant: "secondary" },
  liquidity_warning: { bn: "💧 তারল্য সতর্কতা", en: "💧 Liquidity Warning", variant: "destructive" },
  low_recovery: { bn: "📉 নিম্ন আদায়", en: "📉 Low Recovery", variant: "destructive" },
};

const buildExecutiveMetrics = (m: ReturnType<typeof useReportsMetrics>, lang: string) => [
  { icon: Wallet, title: "AUM", value: formatCompact(m.aum), subtitle: lang === "bn" ? "মোট পরিচালিত সম্পদ" : "Assets Under Management" },
  { icon: Users, title: lang === "bn" ? "সক্রিয় সদস্য" : "Active Members", value: `${m.activeMembers}`, subtitle: lang === "bn" ? "বর্তমানে সক্রিয় প্রোফাইল" : "Currently active profiles" },
  { icon: Activity, title: lang === "bn" ? "রিকভারি রেট" : "Recovery Rate", value: `${m.recoveryRate}%`, subtitle: lang === "bn" ? "সামগ্রিক আদায় হার" : "Overall collection rate" },
  { icon: TrendingUp, title: lang === "bn" ? "সাপ্তাহিক প্রবৃদ্ধি" : "Weekly Growth", value: `${m.growthVelocity}%`, subtitle: lang === "bn" ? "গত ৭ দিনে সংগ্রহ বৃদ্ধি" : "Collection growth (7 days)" },
];

const ReportsPage = () => {
  const { lang } = useLanguage();
  const metrics = useReportsMetrics();
  const executiveMetrics = buildExecutiveMetrics(metrics, lang);

  return (
    <AppLayout>
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
              return (
                <Badge key={a} variant={meta.variant} className="text-xs">
                  {lang === "bn" ? meta.bn : meta.en}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Executive KPI Grid */}
        <section aria-label={lang === "bn" ? "কর্মক্ষমতা সূচক" : "Key Performance Indicators"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {executiveMetrics.map((metric, index) => {
              const Icon = metric.icon;
              const variant = kpiVariants[index % kpiVariants.length];
              return (
                <div key={index} className={cn("group relative overflow-hidden rounded-xl border border-border/60 bg-card p-3.5 md:p-5 border-l-4 transition-all duration-300", "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]", variant.border)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">{metric.title}</p>
                      {metrics.isLoading ? (
                        <div className="mt-2"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                      ) : (
                        <>
                          <p className="mt-1 md:mt-2 text-xl md:text-3xl font-extrabold text-card-foreground tracking-tight">{metric.value}</p>
                          <p className="mt-0.5 text-[10px] md:text-xs text-muted-foreground font-medium truncate hidden sm:block">{metric.subtitle}</p>
                        </>
                      )}
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
            {/* Risk Index */}
            <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {lang === "bn" ? "ঝুঁকি সূচক (PAR)" : "Risk Index (PAR)"}
                </p>
              </div>
              {metrics.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <p className={cn("text-2xl md:text-3xl font-extrabold tracking-tight", getRiskColor(metrics.riskIndex))}>{metrics.riskIndex}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {lang === "bn" ? `ওয়েটেড: ${metrics.weightedRisk}%` : `Weighted: ${metrics.weightedRisk}%`}
                  </p>
                </>
              )}
            </div>

            {/* 30-Day Projection */}
            <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {lang === "bn" ? "৩০-দিন প্রক্ষেপণ" : "30-Day Projection"}
                </p>
              </div>
              {metrics.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl md:text-3xl font-extrabold text-card-foreground tracking-tight">
                  {formatCompact(metrics.projected30DayCollections)}
                </p>
              )}
            </div>

            {/* Today's Txns */}
            <div className="rounded-xl border border-border/60 bg-card p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {lang === "bn" ? "আজকের লেনদেন" : "Today's Txns"}
                </p>
              </div>
              {metrics.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl md:text-3xl font-extrabold text-card-foreground tracking-tight">{metrics.todaysTransactions}</p>
              )}
            </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
    </AppLayout>
  );
};

export default ReportsPage;
