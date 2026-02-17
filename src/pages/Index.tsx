import AppLayout from "@/components/AppLayout";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, TrendingUp, Wallet, PiggyBank, CreditCard, Send, Plus, ArrowUpRight } from "lucide-react";
import { sampleClients, sampleInvestors } from "@/data/sampleData";

const Dashboard = () => {
  const totalCapital = sampleInvestors.reduce((s, i) => s + i.capital, 0);
  const activeLoans = sampleClients.filter((c) => c.loanStatus === "active");
  const totalLoanAmount = activeLoans.reduce((s, c) => s + (c.loanAmount || 0), 0);

  return (
    <AppLayout>
      <PageHeader
        titleEn="Dashboard"
        titleBn="ড্যাশবোর্ড"
        description="Overview of Ekta Finance cooperative operations"
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Send className="w-3.5 h-3.5" /> Send Notification
            </Button>
            <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-3.5 h-3.5" /> New Client
            </Button>
          </>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Clients"
          titleBn="মোট গ্রাহক"
          value={sampleClients.length}
          subtitle={`${activeLoans.length} active loans`}
          icon={<Users className="w-5 h-5" />}
          trend={{ value: 8, positive: true }}
        />
        <MetricCard
          title="Active Loans"
          titleBn="সক্রিয় ঋণ"
          value={`৳${(totalLoanAmount / 1000).toFixed(0)}K`}
          subtitle={`${activeLoans.length} disbursed`}
          icon={<Wallet className="w-5 h-5" />}
          variant="warning"
          trend={{ value: 12, positive: true }}
        />
        <MetricCard
          title="Investor Capital"
          titleBn="বিনিয়োগ মূলধন"
          value={`৳${(totalCapital / 100000).toFixed(1)}L`}
          subtitle={`${sampleInvestors.length} investors`}
          icon={<TrendingUp className="w-5 h-5" />}
          variant="success"
          trend={{ value: 5, positive: true }}
        />
        <MetricCard
          title="Savings Collected"
          titleBn="সঞ্চয় সংগ্রহ"
          value="৳45K"
          subtitle="This month"
          icon={<PiggyBank className="w-5 h-5" />}
          variant="default"
        />
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="card-elevated p-4 border-l-4 border-l-destructive">
          <p className="text-xs font-semibold text-destructive">3 Overdue Payments / বকেয়া পরিশোধ</p>
          <p className="text-[11px] text-muted-foreground mt-1">Abdul Karim, Jahid Hasan + 1 more</p>
        </div>
        <div className="card-elevated p-4 border-l-4 border-l-warning">
          <p className="text-xs font-semibold text-warning">5 Pending Deposits / জমা বাকি</p>
          <p className="text-[11px] text-muted-foreground mt-1">Due within next 3 days</p>
        </div>
        <div className="card-elevated p-4 border-l-4 border-l-success">
          <p className="text-xs font-semibold text-success">2 Profit Distributions / মুনাফা বিতরণ</p>
          <p className="text-[11px] text-muted-foreground mt-1">Hasan Ali, Shamim Ahmed — auto-reinvest</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { icon: CreditCard, label: "Pay Loan / ঋণ পরিশোধ" },
          { icon: PiggyBank, label: "Deposit / জমা" },
          { icon: ArrowUpRight, label: "Reinvest / পুনঃবিনিয়োগ" },
          { icon: Send, label: "Send Message / বার্তা" },
        ].map((action) => (
          <Button key={action.label} variant="outline" size="sm" className="gap-1.5 text-xs font-bangla">
            <action.icon className="w-3.5 h-3.5" />
            {action.label}
          </Button>
        ))}
      </div>

      {/* Recent Clients */}
      <div className="card-elevated mb-8">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold font-english">Recent Clients</h2>
            <p className="text-[11px] text-muted-foreground font-bangla">সাম্প্রতিক গ্রাহক</p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-primary" asChild>
            <a href="/clients">View All →</a>
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Name / নাম</TableHead>
              <TableHead className="text-xs">Area / এলাকা</TableHead>
              <TableHead className="text-xs">Loan / ঋণ</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleClients.slice(0, 4).map((client) => (
              <TableRow key={client.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{client.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{client.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{client.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs font-bangla">{client.area}</TableCell>
                <TableCell className="text-xs">
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

      {/* Investors */}
      <div className="card-elevated">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold font-english">Investors</h2>
            <p className="text-[11px] text-muted-foreground font-bangla">বিনিয়োগকারী</p>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-primary" asChild>
            <a href="/investors">View All →</a>
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Name / নাম</TableHead>
              <TableHead className="text-xs">Capital / মূলধন</TableHead>
              <TableHead className="text-xs">Profit %</TableHead>
              <TableHead className="text-xs">Reinvest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleInvestors.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{inv.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{inv.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{inv.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs">৳{inv.capital.toLocaleString()}</TableCell>
                <TableCell className="text-xs">{inv.monthlyProfitPercent}%</TableCell>
                <TableCell>
                  <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
