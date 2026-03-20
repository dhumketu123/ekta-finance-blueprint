import { MetricCard } from "@/components/dashboard/MetricCard";
import { Wallet, TrendingUp, Banknote, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Props {
  capital: number;
  monthlyProfit: number;
  profitPercent: number;
  totalProfitPaid: number;
  maturityDate: string | null;
  bn: boolean;
}

export default function InvestorMetrics({ capital, monthlyProfit, profitPercent, totalProfitPaid, maturityDate, bn }: Props) {
  return (
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
        subtitle={`${profitPercent}%`}
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
        value={maturityDate ? format(new Date(maturityDate), "dd MMM yyyy") : "—"}
        icon={<Calendar className="w-5 h-5" />}
        variant="default"
      />
    </div>
  );
}
