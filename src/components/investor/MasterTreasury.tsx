import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Building2, TrendingUp, Landmark, Handshake, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Investor {
  capital: number;
  total_weekly_paid: number;
  accumulated_profit?: number;
}

interface TreasuryMetrics {
  total_investor_capital: number;
  total_interest_earned: number;
}

interface Props {
  investors: Investor[];
  metrics: TreasuryMetrics | null;
  isLoading?: boolean;
}

export const MasterTreasury = memo(function MasterTreasury({ 
  investors, 
  metrics, 
  isLoading 
}: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  // Calculate aggregates
  const totalFounderCapital = investors.reduce((sum, inv) => sum + (inv.capital || 0), 0);
  const totalWeeklyContributions = investors.reduce((sum, inv) => sum + (inv.total_weekly_paid || 0), 0);
  const coreCapital = totalFounderCapital + totalWeeklyContributions;

  // Use metrics if available, fallback to investor data
  const retainedEarnings = metrics?.total_interest_earned || 0;
  const totalAssets = coreCapital + retainedEarnings;

  // Revenue streams (placeholder calculations for UI)
  const loanPortfolioIncome = retainedEarnings * 0.85; // 85% from loans
  const externalInvestorMargin = retainedEarnings * 0.15; // 15% margin retained

  const formatCurrency = (val: number) => `৳${val.toLocaleString("bn-BD")}`;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 rounded-2xl bg-muted/50" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-24 rounded-xl bg-muted/50" />
          <div className="h-24 rounded-xl bg-muted/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero Section - Total Assets */}
      <Card className={cn(
        "relative overflow-hidden border-0",
        "bg-gradient-to-br from-primary/10 via-primary/5 to-background",
        "shadow-[0_8px_32px_rgba(0,76,77,0.12)]"
      )}>
        {/* Glassmorphic overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent backdrop-blur-[2px]" />
        
        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-success/5 blur-2xl" />
        
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            {/* Main Value */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {bn ? "কোম্পানির মোট সম্পদ" : "Total Company Assets"}
              </div>
              <p className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight">
                {formatCurrency(totalAssets)}
              </p>
              <p className="text-xs text-muted-foreground">
                {bn ? "সকল ফাউন্ডার ইকুইটি + রিটেইনড আর্নিংস" : "All Founder Equity + Retained Earnings"}
              </p>
            </div>

            {/* Icon */}
            <div className="hidden sm:flex p-4 rounded-2xl bg-primary/10 border border-primary/20">
              <Building2 className="w-10 h-10 text-primary" />
            </div>
          </div>

          {/* Breakdown */}
          <div className="mt-6 pt-6 border-t border-border/50 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Core Capital */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/40">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                  {bn ? "🏢 কোর ক্যাপিটাল" : "🏢 Core Capital"}
                </p>
                <p className="text-lg font-bold text-foreground truncate">
                  {formatCurrency(coreCapital)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {bn ? "সাপ্তাহিক সঞ্চয় + ইনজেকশন" : "Weekly Savings + Injections"}
                </p>
              </div>
            </div>

            {/* Retained Earnings */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/40">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                  {bn ? "📈 অর্জিত প্রফিট ও রিজার্ভ" : "📈 Retained Earnings"}
                </p>
                <p className="text-lg font-bold text-success truncate">
                  {formatCurrency(retainedEarnings)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {bn ? "সঞ্চিত মুনাফা" : "Accumulated Profits"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Streams */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Loan Portfolio Income */}
        <Card className="group relative overflow-hidden border border-border/60 hover:border-primary/30 transition-all duration-300 hover:shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardContent className="relative p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                  {bn ? "🏦 লোন পোর্টফোলিও আয়" : "🏦 Loan Portfolio Income"}
                </p>
                <p className="text-xl font-bold text-foreground">
                  {formatCurrency(loanPortfolioIncome)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {bn ? "বিতরণকৃত ঋণ থেকে মুনাফা" : "Profit from distributed loans"}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10 group-hover:scale-110 transition-transform">
                <Landmark className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* External Investor Margin */}
        <Card className="group relative overflow-hidden border border-border/60 hover:border-amber-500/30 transition-all duration-300 hover:shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardContent className="relative p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                  {bn ? "🤝 এক্সটার্নাল ইনভেস্টর মার্জিন" : "🤝 External Investor Margin"}
                </p>
                <p className="text-xl font-bold text-foreground">
                  {formatCurrency(externalInvestorMargin)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {bn ? "২% মাসিক প্রফিট শেয়ার রিটেইনড" : "2% monthly profit share retained"}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 group-hover:scale-110 transition-transform">
                <Handshake className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

export default MasterTreasury;
