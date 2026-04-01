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

        {/* Executive Intelligence Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {executiveMetrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <div
                key={index}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 md:p-5 transition-all duration-300",
                  "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] md:text-xs font-bold text-muted-foreground uppercase tracking-widest truncate">
                      {metric.title}
                    </p>
                    <p className="mt-1.5 md:mt-2 text-2xl md:text-3xl font-extrabold text-card-foreground tracking-tight">
                      {metric.value}
                    </p>
                    <p className="mt-0.5 md:mt-1 text-xs md:text-sm text-muted-foreground font-medium truncate">
                      {metric.subtitle}
                    </p>
                  </div>
                  <div className="p-2.5 md:p-3 rounded-xl shrink-0 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:shadow-md">
                    <Icon className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportLinks.map((r) => (
            <Link
              key={r.path}
              to={r.path}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-border/60 bg-card p-5 transition-all duration-300",
                "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              )}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl shrink-0 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110">
                  <r.icon className="w-5 h-5" aria-hidden="true" />
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
      </div>
    </AppLayout>
  );
};

export default ReportsPage;
