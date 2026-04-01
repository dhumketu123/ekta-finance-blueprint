import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { Scale, TrendingUp, Landmark, CreditCard, Users, BookOpen, Wallet, Activity, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const reportLinks = [
  {
    path: "/reports/trial-balance",
    icon: Scale,
    titleBn: "ট্রায়াল ব্যালেন্স",
    titleEn: "Trial Balance",
    descBn: "সকল হিসাবের মোট ডেবিট ও ক্রেডিট সারাংশ",
    descEn: "Summary of total debit & credit for all accounts",
  },
  {
    path: "/reports/balance-sheet",
    icon: BookOpen,
    titleBn: "ব্যালেন্স শীট",
    titleEn: "Balance Sheet",
    descBn: "সম্পদ, দায় ও মালিকানা স্বত্ব — আর্থিক অবস্থান বিবরণী",
    descEn: "Assets, Liabilities & Equity — Statement of Financial Position",
  },
  {
    path: "/reports/profit-loss",
    icon: TrendingUp,
    titleBn: "আয়-ব্যয় বিবরণী",
    titleEn: "Profit & Loss",
    descBn: "আয় ও ব্যয় হিসাব থেকে নিট আয় গণনা",
    descEn: "Net income from income & expense accounts",
  },
  {
    path: "/reports/payment-status",
    icon: CreditCard,
    titleBn: "পেমেন্ট স্ট্যাটাস",
    titleEn: "Payment Status",
    descBn: "কিস্তি পরিশোধ অবস্থা — বকেয়া, পরিশোধিত, মুলতুবি",
    descEn: "Installment payment status — Overdue, Paid, Pending",
  },
  {
    path: "/reports/investor-summary",
    icon: Users,
    titleBn: "বিনিয়োগকারী সারাংশ",
    titleEn: "Investor Summary",
    descBn: "পোর্টফোলিও, লভ্যাংশ বিতরণ ও পুনর্বিনিয়োগ রিপোর্ট",
    descEn: "Portfolio, profit distribution & reinvestment report",
  },
  {
    path: "/transactions",
    icon: Landmark,
    titleBn: "আর্থিক লেনদেন",
    titleEn: "Financial Transactions",
    descBn: "সকল লেনদেন, রিসিপ্ট ও অনুমোদন",
    descEn: "All transactions, receipts & approvals",
  },
];

/* ── Mock Finance Snapshot (will be replaced by Supabase) ── */
const mockFinanceSnapshot = {
  totalCollections: 1250000,
  totalOutstanding: 340000,
  activeMembers: 412,
  recoveryRate: 94,
  weeklyGrowthPercent: 12,
  todaysTransactions: 187,
};

/* ── KPI variant styles for visual hierarchy ── */
const kpiVariants = [
  { border: "border-l-primary", iconBg: "bg-primary/10 text-primary" },
  { border: "border-l-success", iconBg: "bg-success/10 text-success" },
  { border: "border-l-warning", iconBg: "bg-warning/10 text-warning" },
  { border: "border-l-accent", iconBg: "bg-accent text-accent-foreground" },
] as const;

/* ── Pure KPI Calculation Engine ── */
const useKpiEngine = () => {
  return useMemo(() => ({
    weeklyGrowth: mockFinanceSnapshot.weeklyGrowthPercent,
    activeMembers: mockFinanceSnapshot.activeMembers,
    todaysTransactions: mockFinanceSnapshot.todaysTransactions,
    recoveryRate: mockFinanceSnapshot.recoveryRate,
  }), []);
};

/* ── Executive Metrics Builder ── */
const buildExecutiveMetrics = (kpi: ReturnType<typeof useKpiEngine>, lang: string) => [
  {
    icon: TrendingUp,
    title: lang === "bn" ? "সাপ্তাহিক প্রবৃদ্ধি" : "Weekly Growth",
    value: `${kpi.weeklyGrowth}%`,
    subtitle: lang === "bn" ? "গত ৭ দিনে সংগ্রহ বৃদ্ধি" : "Collection growth (7 days)",
  },
  {
    icon: Users,
    title: lang === "bn" ? "সক্রিয় সদস্য" : "Active Members",
    value: `${kpi.activeMembers}`,
    subtitle: lang === "bn" ? "বর্তমানে সক্রিয় প্রোফাইল" : "Currently active profiles",
  },
  {
    icon: Wallet,
    title: lang === "bn" ? "লেনদেন (আজ)" : "Today's Txns",
    value: `${kpi.todaysTransactions}`,
    subtitle: lang === "bn" ? "আজকের মোট কার্যক্রম" : "Total activity today",
  },
  {
    icon: Activity,
    title: lang === "bn" ? "রিকভারি রেট" : "Recovery Rate",
    value: `${kpi.recoveryRate}%`,
    subtitle: lang === "bn" ? "সামগ্রিক আদায় হার" : "Overall collection rate",
  },
];

const ReportsPage = () => {
  const { lang } = useLanguage();
  const kpi = useKpiEngine();
  const executiveMetrics = buildExecutiveMetrics(kpi, lang);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Title */}
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {lang === "bn" ? "রিপোর্ট সেন্টার" : "Report Center"}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {lang === "bn"
              ? "ফিন্যান্সিয়াল ইন্টেলিজেন্স ও অফিসিয়াল রিপোর্টসমূহ"
              : "Financial intelligence & official reports"}
          </p>
        </div>

        {/* Executive KPI Grid */}
        <section aria-label={lang === "bn" ? "কর্মক্ষমতা সূচক" : "Key Performance Indicators"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {executiveMetrics.map((metric, index) => {
              const Icon = metric.icon;
              const variant = kpiVariants[index % kpiVariants.length];
              return (
                <div
                  key={index}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-3.5 md:p-5 border-l-4 transition-all duration-300",
                    "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]",
                    variant.border
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider truncate">
                        {metric.title}
                      </p>
                      <p className="mt-1 md:mt-2 text-xl md:text-3xl font-extrabold text-card-foreground tracking-tight">
                        {metric.value}
                      </p>
                      <p className="mt-0.5 text-[10px] md:text-xs text-muted-foreground font-medium truncate hidden sm:block">
                        {metric.subtitle}
                      </p>
                    </div>
                    <div className={cn(
                      "p-2 md:p-3 rounded-xl shrink-0 transition-all duration-300 group-hover:scale-110",
                      variant.iconBg
                    )}>
                      <Icon className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              );
            })}
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
              <Link
                key={r.path}
                to={r.path}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 md:p-5 transition-all duration-300",
                  "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                )}
              >
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="p-2.5 md:p-3 rounded-xl shrink-0 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110">
                    <r.icon className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-card-foreground">
                      {lang === "bn" ? r.titleBn : r.titleEn}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {lang === "bn" ? r.descBn : r.descEn}
                    </p>
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
