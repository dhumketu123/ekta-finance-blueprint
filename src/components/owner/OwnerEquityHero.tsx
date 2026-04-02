import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface OwnerEquityHeroProps {
  name: string;
  ownerId: string;
  phone?: string | null;
  status?: string;
  sharePct: number;
  bn: boolean;
}

const OwnerEquityHero = memo(({ name, ownerId, phone, status, sharePct, bn }: OwnerEquityHeroProps) => (
  <Card className={cn(
    "relative overflow-hidden border-0",
    "bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950",
    "shadow-[0_8px_40px_rgba(217,176,96,0.15)]"
  )}>
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(217,176,96,0.08),transparent_70%)]" />
    <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-amber-500/5 blur-3xl" />

    <CardContent className="relative p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        <div className="flex-1 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[10px] font-bold uppercase tracking-widest">
            <Crown className="w-3 h-3" />
            {bn ? "ফাউন্ডিং পার্টনার" : "Founding Partner"}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{name}</h1>
            <p className="text-xs text-amber-200/60 font-mono mt-1">ID: {ownerId}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn(
              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
              status === "active"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-red-500/15 text-red-300 border border-red-500/30"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", status === "active" ? "bg-emerald-400" : "bg-red-400")} />
              {status === "active" ? (bn ? "সক্রিয়" : "Active") : (bn ? "নিষ্ক্রিয়" : "Inactive")}
            </span>
            {phone && (
              <span className="text-xs text-white/40 flex items-center gap-1">
                <Phone className="w-3 h-3" /> {phone}
              </span>
            )}
          </div>
        </div>

        <div className="text-center sm:text-right">
          <p className="text-[10px] text-amber-200/50 font-bold uppercase tracking-widest mb-1">
            {bn ? "ইকুইটি হোল্ডিং" : "Equity Holding"}
          </p>
          <p className="text-5xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-amber-400 tracking-tighter leading-none">
            {sharePct.toFixed(2)}%
          </p>
          <p className="text-[10px] text-white/30 mt-1.5">
            {bn ? "মোট কোম্পানি ইকুইটি" : "of total company equity"}
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
));

OwnerEquityHero.displayName = "OwnerEquityHero";
export default OwnerEquityHero;
