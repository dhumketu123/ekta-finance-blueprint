import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCardSkeleton, TableSkeleton, SummaryCardSkeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, Wallet, PiggyBank, CreditCard, Send, Plus, ArrowUpRight } from "lucide-react";
import { sampleClients, sampleInvestors } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const Dashboard = () => {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const totalCapital = sampleInvestors.reduce((s, i) => s + i.capital, 0);
  const activeLoans = sampleClients.filter((c) => c.loanStatus === "active");
  const totalLoanAmount = activeLoans.reduce((s, c) => s + (c.loanAmount || 0), 0);

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {Array.from({ length: 3 }).map((_, i) => <SummaryCardSkeleton key={i} />)}
        </div>
        <TableSkeleton rows={4} cols={5} />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-lg shadow-sm btn-depth">
              <Send className="w-3.5 h-3.5" /> {t("dashboard.sendNotification")}
            </Button>
            <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 btn-depth">
              <Plus className="w-3.5 h-3.5" /> {t("dashboard.newClient")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <MetricCard
          title={t("dashboard.totalClients")}
          value={sampleClients.length}
          subtitle={`${activeLoans.length} ${t("dashboard.activeLoansCount")}`}
          icon={<Users className="w-5 h-5" />}
          trend={{ value: 8, positive: true }}
        />
        <MetricCard
          title={t("dashboard.activeLoans")}
          value={`৳${(totalLoanAmount / 1000).toFixed(0)}K`}
          subtitle={`${activeLoans.length} ${t("dashboard.disbursed")}`}
          icon={<Wallet className="w-5 h-5" />}
          variant="warning"
          trend={{ value: 12, positive: true }}
        />
        <MetricCard
          title={t("dashboard.investorCapital")}
          value={`৳${(totalCapital / 100000).toFixed(1)}L`}
          subtitle={`${sampleInvestors.length} ${t("dashboard.investors")}`}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success"
          trend={{ value: 5, positive: true }}
        />
        <MetricCard
          title={t("dashboard.savingsCollected")}
          value="৳45K"
          subtitle={t("dashboard.thisMonth")}
          icon={<PiggyBank className="w-5 h-5" />}
          variant="default"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="card-elevated p-4 border-l-4 border-l-destructive">
          <p className="text-xs font-semibold text-destructive">3 {t("dashboard.overduePayments")}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Abdul Karim, Jahid Hasan + 1 more</p>
        </div>
        <div className="card-elevated p-4 border-l-4 border-l-warning">
          <p className="text-xs font-semibold text-warning">5 {t("dashboard.pendingDeposits")}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Due within next 3 days</p>
        </div>
        <div className="card-elevated p-4 border-l-4 border-l-success">
          <p className="text-xs font-semibold text-success">2 {t("dashboard.profitDistributions")}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Hasan Ali, Shamim Ahmed — auto-reinvest</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { icon: CreditCard, labelKey: "action.payLoan" },
          { icon: PiggyBank, labelKey: "action.deposit" },
          { icon: ArrowUpRight, labelKey: "action.reinvest" },
          { icon: Send, labelKey: "action.sendMessage" },
        ].map((action) => (
          <Button key={action.labelKey} variant="outline" size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm btn-depth hover:bg-accent hover:text-accent-foreground hover:border-accent transition-all">
            <action.icon className="w-3.5 h-3.5" />
            {t(action.labelKey)}
          </Button>
        ))}
      </div>

      <div className="card-elevated mb-8 overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-primary">{t("dashboard.recentClients")}</h2>
          <Button variant="ghost" size="sm" className="text-xs text-primary font-semibold" asChild>
            <a href="/clients">{t("dashboard.viewAll")}</a>
          </Button>
        </div>

        <div className="hidden sm:block">
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.area")}</TableHead>
                <TableHead>{t("table.loan")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleClients.slice(0, 4).map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{client.id}</TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{lang === "bn" ? client.nameBn : client.nameEn}</p>
                  </TableCell>
                  <TableCell className="text-xs">{client.area}</TableCell>
                  <TableCell className="text-xs font-semibold">
                    {client.loanAmount ? `৳${client.loanAmount.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={client.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="sm:hidden divide-y divide-border">
          {sampleClients.slice(0, 4).map((client) => (
            <div key={client.id} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{lang === "bn" ? client.nameBn : client.nameEn}</p>
                  <StatusBadge status={client.status} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{client.area}</span>
                  <span>•</span>
                  <span className="font-semibold text-foreground">
                    {client.loanAmount ? `৳${client.loanAmount.toLocaleString()}` : "—"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold text-primary">{t("nav.investors")}</h2>
          <Button variant="ghost" size="sm" className="text-xs text-primary font-semibold" asChild>
            <a href="/investors">{t("dashboard.viewAll")}</a>
          </Button>
        </div>

        <div className="hidden sm:block">
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.capital")}</TableHead>
                <TableHead>{t("table.monthlyProfit")}</TableHead>
                <TableHead>{t("table.reinvest")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleInvestors.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{inv.id}</TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{lang === "bn" ? inv.nameBn : inv.nameEn}</p>
                  </TableCell>
                  <TableCell className="text-xs font-semibold">৳{inv.capital.toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{inv.monthlyProfitPercent}%</TableCell>
                  <TableCell>
                    <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="sm:hidden divide-y divide-border">
          {sampleInvestors.map((inv) => (
            <div key={inv.id} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{lang === "bn" ? inv.nameBn : inv.nameEn}</p>
                  <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">৳{inv.capital.toLocaleString()}</span>
                  <span>•</span>
                  <span>{inv.monthlyProfitPercent}% {t("table.monthlyProfit")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
