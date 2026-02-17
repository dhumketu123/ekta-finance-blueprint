import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Calendar, ArrowDownRight, ArrowUpRight, Banknote } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const typeLabels: Record<string, { bn: string; en: string }> = {
  investor_profit: { bn: "মাসিক লভ্যাংশ", en: "Monthly Profit" },
  investor_principal_return: { bn: "মূলধন ফেরত", en: "Principal Return" },
};

const InvestorWallet = () => {
  const { t, lang } = useLanguage();
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

  // Fetch transactions for this investor
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["my_investor_transactions", investor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("investor_id", investor!.id)
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!investor?.id,
  });

  const loading = invLoading || txLoading;

  const totalProfitPaid = useMemo(() =>
    (transactions ?? [])
      .filter((tx) => tx.type === "investor_profit" && tx.status === "paid")
      .reduce((s, tx) => s + tx.amount, 0),
    [transactions]
  );

  const monthlyProfit = investor ? Math.round(Number(investor.capital) * Number(investor.monthly_profit_percent) / 100) : 0;

  // Build 6-month profit chart data
  const chartData = useMemo(() => {
    if (!transactions) return [];
    const now = new Date();
    const months: { month: string; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yy");
      const profit = transactions
        .filter((tx) => tx.type === "investor_profit" && tx.status === "paid" && tx.transaction_date.startsWith(key))
        .reduce((s, tx) => s + tx.amount, 0);
      months.push({ month: label, profit });
    }
    return months;
  }, [transactions]);

  if (loading) {
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

  const capital = Number(investor.capital);
  const principalAmount = Number(investor.principal_amount);
  const accumulatedProfit = Number(investor.accumulated_profit);

  return (
    <AppLayout>
      <PageHeader
        title={bn ? "আমার ওয়ালেট" : "My Wallet"}
        description={bn ? `${investor.name_bn} — ${investor.investment_model === "profit_plus_principal" ? "লাভ + মূলধন" : "শুধু লাভ"}` : `${investor.name_en} — ${investor.investment_model === "profit_plus_principal" ? "Profit + Principal" : "Profit Only"}`}
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={bn ? "বর্তমান মূলধন" : "Current Capital"}
          value={`৳${capital.toLocaleString()}`}
          icon={<Wallet className="w-5 h-5" />}
          variant="success"
        />
        <MetricCard
          title={bn ? "মাসিক লভ্যাংশ" : "Monthly Profit"}
          value={`৳${monthlyProfit.toLocaleString()}`}
          subtitle={`${investor.monthly_profit_percent}%`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          title={bn ? "মোট লভ্যাংশ প্রদান" : "Total Profit Paid"}
          value={`৳${totalProfitPaid.toLocaleString()}`}
          icon={<Banknote className="w-5 h-5" />}
          variant="warning"
        />
        <MetricCard
          title={bn ? "পরিপক্কতার তারিখ" : "Maturity Date"}
          value={investor.maturity_date ? format(new Date(investor.maturity_date), "dd MMM yyyy") : "—"}
          icon={<Calendar className="w-5 h-5" />}
          variant="default"
        />
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-elevated p-5 border-l-4 border-l-primary">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{bn ? "মূল বিনিয়োগ" : "Principal Investment"}</p>
          <p className="mt-2 text-xl font-bold text-primary">৳{principalAmount.toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-success">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{bn ? "জমাকৃত লভ্যাংশ" : "Accumulated Profit"}</p>
          <p className="mt-2 text-xl font-bold text-success">৳{accumulatedProfit.toLocaleString()}</p>
        </div>
        <div className="card-elevated p-5 border-l-4 border-l-warning">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{bn ? "পুনঃবিনিয়োগ" : "Auto-Reinvest"}</p>
          <p className="mt-2 text-xl font-bold">{investor.reinvest ? (bn ? "✅ সক্রিয়" : "✅ Active") : (bn ? "❌ নিষ্ক্রিয়" : "❌ Inactive")}</p>
        </div>
      </div>

      {/* Profit Chart */}
      {chartData.some((d) => d.profit > 0) && (
        <div className="card-elevated p-5">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">
            {bn ? "৬ মাসের লভ্যাংশ ইতিহাস" : "6-Month Profit History"}
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(value: number) => [`৳${value.toLocaleString()}`, bn ? "লভ্যাংশ" : "Profit"]}
                />
                <Area type="monotone" dataKey="profit" stroke="hsl(var(--success))" fill="url(#profitGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Transaction History */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-card-foreground">{bn ? "লেনদেনের ইতিহাস" : "Transaction History"}</h3>
        </div>

        {!transactions?.length ? (
          <p className="text-center text-muted-foreground py-8 text-sm">{bn ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found"}</p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block">
              <Table className="table-premium">
                <TableHeader className="table-header-premium">
                  <TableRow>
                    <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
                    <TableHead>{bn ? "ধরন" : "Type"}</TableHead>
                    <TableHead className="text-right">{bn ? "পরিমাণ" : "Amount"}</TableHead>
                    <TableHead>{bn ? "স্থিতি" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const lbl = typeLabels[tx.type];
                    const isProfit = tx.type === "investor_profit";
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="text-xs font-medium">
                          <span className="inline-flex items-center gap-1">
                            {isProfit ? <ArrowDownRight className="w-3 h-3 text-success" /> : <ArrowUpRight className="w-3 h-3 text-primary" />}
                            {lbl ? (bn ? lbl.bn : lbl.en) : tx.type}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right text-xs font-semibold ${isProfit ? "text-success" : "text-primary"}`}>
                          ৳{tx.amount.toLocaleString()}
                        </TableCell>
                        <TableCell><StatusBadge status={tx.status === "paid" ? "active" : tx.status === "pending" ? "pending" : "inactive"} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border">
              {transactions.map((tx) => {
                const lbl = typeLabels[tx.type];
                const isProfit = tx.type === "investor_profit";
                return (
                  <div key={tx.id} className="p-4 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isProfit ? "bg-success/10" : "bg-primary/10"}`}>
                      {isProfit ? <ArrowDownRight className="w-4 h-4 text-success" /> : <ArrowUpRight className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{lbl ? (bn ? lbl.bn : lbl.en) : tx.type}</p>
                        <p className={`text-xs font-bold ${isProfit ? "text-success" : "text-primary"}`}>৳{tx.amount.toLocaleString()}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default InvestorWallet;
