import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ChartPoint {
  month: string;
  profit: number;
}

interface Props {
  data: ChartPoint[];
  bn: boolean;
}

export default function InvestorProfitChart({ data, bn }: Props) {
  if (!data.some((d) => d.profit > 0)) return null;

  return (
    <div className="card-elevated p-5">
      <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">
        {bn ? "৬ মাসের লভ্যাংশ ইতিহাস" : "6-Month Profit History"}
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
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
  );
}
