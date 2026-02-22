interface Props {
  principalAmount: number;
  accumulatedProfit: number;
  reinvest: boolean;
  bn: boolean;
}

export default function InvestorInfoCards({ principalAmount, accumulatedProfit, reinvest, bn }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="card-elevated p-5 border-l-4 border-l-primary">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {bn ? "মূল বিনিয়োগ" : "Principal Investment"}
        </p>
        <p className="mt-2 text-2xl font-bold text-primary">৳{principalAmount.toLocaleString()}</p>
      </div>
      <div className="card-elevated p-5 border-l-4 border-l-success">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {bn ? "জমাকৃত লভ্যাংশ" : "Accumulated Profit"}
        </p>
        <p className="mt-2 text-2xl font-bold text-success">৳{accumulatedProfit.toLocaleString()}</p>
      </div>
      <div className="card-elevated p-5 border-l-4 border-l-warning">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {bn ? "পুনঃবিনিয়োগ" : "Auto-Reinvest"}
        </p>
        <p className="mt-2 text-2xl font-bold">
          {reinvest ? (bn ? "✅ সক্রিয়" : "✅ Active") : (bn ? "❌ নিষ্ক্রিয়" : "❌ Inactive")}
        </p>
      </div>
    </div>
  );
}
