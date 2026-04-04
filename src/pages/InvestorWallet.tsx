import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Wallet } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { formatChartDate } from "@/lib/date-utils";

import InvestorMetrics from "@/components/investor/InvestorMetrics";
import InvestorInfoCards from "@/components/investor/InvestorInfoCards";
import InvestorProfitChart from "@/components/investor/InvestorProfitChart";
import InvestorTransactionHistory from "@/components/investor/InvestorTransactionHistory";
import { useInvestorTransactions } from "@/hooks/useInvestorTransactions";

const InvestorWallet = () => {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const bn = lang === "bn";

  // Fetch investor record linked to this user
  const { data: investor, isLoading: invLoading } = useQuery({
    queryKey: ["my_investor_record", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investors")
        .select("*")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Paginated + searchable + realtime transactions
  const txState = useInvestorTransactions({
    investorId: investor?.id,
    pageSize: 10,
  });

  // Fetch ALL profit transactions for metrics (lightweight — only amount)
  const { data: profitTxs } = useQuery({
    queryKey: ["investor_profit_totals", investor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount")
        .eq("investor_id", investor!.id)
        .eq("type", "investor_profit")
        .eq("status", "paid")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: !!investor?.id,
  });

  // Fetch last 6 months of profit for chart
  const { data: chartTxs } = useQuery({
    queryKey: ["investor_chart_data", investor?.id],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, transaction_date")
        .eq("investor_id", investor!.id)
        .eq("type", "investor_profit")
        .eq("status", "paid")
        .is("deleted_at", null)
        .gte("transaction_date", format(sixMonthsAgo, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!investor?.id,
  });

  const totalProfitPaid = useMemo(
    () => (profitTxs ?? []).reduce((s, tx) => s + tx.amount, 0),
    [profitTxs]
  );

  const monthlyProfit = investor
    ? Math.round(Number(investor.capital) * Number(investor.monthly_profit_percent) / 100)
    : 0;

  const chartData = useMemo(() => {
    const now = new Date();
    const months: { month: string; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, "yyyy-MM");
      const label = formatChartDate(d, lang);
      const profit = (chartTxs ?? [])
        .filter((tx) => tx.transaction_date.startsWith(key))
        .reduce((s, tx) => s + tx.amount, 0);
      months.push({ month: label, profit });
    }
    return months;
  }, [chartTxs]);

  if (invLoading) {
    return (
      <AppLayout>
        <PageHeader title={bn ? "আমার ওয়ালেট" : "My Wallet"} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={5} cols={4} />
      </AppLayout>
    );
  }

  if (!investor) {
    return (
      <AppLayout>
        <PageHeader title={bn ? "আমার ওয়ালেট" : "My Wallet"} />
        <div className="card-elevated p-8 text-center">
          <Wallet className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {bn ? "আপনার অ্যাকাউন্টে কোনো বিনিয়োগকারী রেকর্ড সংযুক্ত নেই।" : "No investor record linked to your account."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {bn ? "অনুগ্রহ করে প্রশাসকের সাথে যোগাযোগ করুন।" : "Please contact an administrator."}
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "আমার ওয়ালেট" : "My Wallet"}
        description={bn
          ? `${investor.name_bn} — ${investor.investment_model === "profit_plus_principal" ? "লাভ + মূলধন" : "শুধু লাভ"}`
          : `${investor.name_en} — ${investor.investment_model === "profit_plus_principal" ? "Profit + Principal" : "Profit Only"}`}
        badge={bn ? "💰 ইনভেস্টর ওয়ালেট" : "💰 Investor Wallet"}
      />

      <InvestorMetrics
        capital={Number(investor.capital)}
        monthlyProfit={monthlyProfit}
        profitPercent={Number(investor.monthly_profit_percent)}
        totalProfitPaid={totalProfitPaid}
        maturityDate={investor.maturity_date}
        bn={bn}
      />

      <InvestorInfoCards
        principalAmount={Number(investor.principal_amount)}
        accumulatedProfit={Number(investor.accumulated_profit)}
        reinvest={investor.reinvest}
        bn={bn}
      />

      <InvestorProfitChart data={chartData} bn={bn} />

      <InvestorTransactionHistory
        transactions={txState.transactions}
        isLoading={txState.isLoading}
        page={txState.page}
        totalPages={txState.totalPages}
        totalCount={txState.totalCount}
        searchTerm={txState.searchTerm}
        isSearching={txState.isSearching}
        onSearch={txState.onSearch}
        clearSearch={txState.clearSearch}
        onPageChange={txState.setPage}
        bn={bn}
        investorName={investor ? (bn ? investor.name_bn : investor.name_en) : undefined}
      />
    </AppLayout>
  );
};

export default InvestorWallet;
