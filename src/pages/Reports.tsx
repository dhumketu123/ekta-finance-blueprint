import AppLayout from "@/components/AppLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { Scale, TrendingUp, Landmark, CreditCard, Users, BookOpen, DollarSign, Activity } from "lucide-react";
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

/* ── Reusable Glass Card (local, not exported yet) ── */
const GlassCard = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "bg-white/10 backdrop-blur-xl border border-white/20",
      "rounded-2xl shadow-2xl p-5 transition-all duration-300",
      "hover:scale-[1.02] active:scale-[0.98]",
      className
    )}
  >
    {children}
  </div>
);

const ReportsPage = () => {
  const { lang } = useLanguage();

  const executiveMetrics = [
    { title: lang === "bn" ? "মাসিক প্রবৃদ্ধি" : "Monthly Growth", value: "+18.4%", subtitle: lang === "bn" ? "গত মাসের তুলনায়" : "Compared to last month", icon: TrendingUp },
    { title: lang === "bn" ? "সক্রিয় ক্লায়েন্ট" : "Active Clients", value: "1,284", subtitle: lang === "bn" ? "বর্তমানে সংযুক্ত" : "Currently engaged", icon: Users },
    { title: lang === "bn" ? "ক্যাশ ফ্লো" : "Cash Flow", value: "৳ 24.6L", subtitle: lang === "bn" ? "এই মাসে নিট প্রবাহ" : "Net inflow this month", icon: DollarSign },
    { title: lang === "bn" ? "সিস্টেম কার্যক্রম" : "System Activity", value: "92%", subtitle: lang === "bn" ? "অপারেশনাল দক্ষতা" : "Operational efficiency", icon: Activity },
  ];

  return (
    <AppLayout>
      {/* Full-bleed wrapper: negative margins to escape AppLayout padding, then re-apply our own */}
      <div className="relative -mx-4 -mt-6 -mb-40 md:-mx-6 md:-mt-8 md:-mb-8 lg:-mx-8 min-h-[calc(100vh-4rem)] overflow-hidden">
        {/* Animated Mesh Background */}
        <div className="absolute inset-0">
          <div className="w-full h-full animate-mesh bg-gradient-to-br from-[hsl(217,100%,41%)] via-[hsl(228,92%,62%)] to-[hsl(211,97%,71%)]" />
        </div>

        {/* Page Content */}
        <div className="relative z-10 px-4 py-6 md:px-8 max-w-7xl mx-auto space-y-6">
          {/* Title */}
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              {lang === "bn" ? "রিপোর্ট সেন্টার" : "Report Center"}
            </h1>
            <p className="text-white/80 text-sm md:text-base">
              {lang === "bn"
                ? "ফিন্যান্সিয়াল ইন্টেলিজেন্স ও অফিসিয়াল রিপোর্টসমূহ"
                : "Financial intelligence & official reports"}
            </p>
          </div>

          {/* Executive Intelligence Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {executiveMetrics.map((metric, index) => {
              const Icon = metric.icon;
              return (
                <GlassCard key={index}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-xl bg-white/20">
                      <Icon className="w-6 h-6 text-white" aria-hidden="true" />
                    </div>
                  </div>
                  <h3 className="text-sm text-white/70 mb-1">{metric.title}</h3>
                  <p className="text-2xl font-semibold text-white">{metric.value}</p>
                  <p className="text-xs text-white/60 mt-1">{metric.subtitle}</p>
                </GlassCard>
              );
            })}
          </div>

          {/* Reports Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-8">
            {reportLinks.map((r) => (
              <Link key={r.path} to={r.path} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-2xl">
                <GlassCard>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-white/15 shrink-0">
                      <r.icon className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {lang === "bn" ? r.titleBn : r.titleEn}
                      </p>
                      <p className="text-xs text-white/70 mt-1 leading-relaxed">
                        {lang === "bn" ? r.descBn : r.descEn}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ReportsPage;
