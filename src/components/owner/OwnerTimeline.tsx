import { memo, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";
import { differenceInDays, differenceInMonths, differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";

const PARTNERSHIP_START = new Date("2025-05-23");
const PARTNERSHIP_END = new Date("2040-05-23");
const PARTNERSHIP_TOTAL_DAYS = differenceInDays(PARTNERSHIP_END, PARTNERSHIP_START);

interface OwnerTimelineProps {
  bn: boolean;
}

const OwnerTimeline = memo(({ bn }: OwnerTimelineProps) => {
  const timeline = useMemo(() => {
    const now = new Date();
    const elapsedDays = Math.max(0, differenceInDays(now, PARTNERSHIP_START));
    const progressPct = Math.min(100, (elapsedDays / PARTNERSHIP_TOTAL_DAYS) * 100);
    const elapsedYears = differenceInYears(now, PARTNERSHIP_START);
    const elapsedMonths = differenceInMonths(now, PARTNERSHIP_START) % 12;
    const remainingYears = Math.max(0, differenceInYears(PARTNERSHIP_END, now));
    const remainingMonths = Math.max(0, differenceInMonths(PARTNERSHIP_END, now) % 12);
    return { progressPct, elapsedYears, elapsedMonths, remainingYears, remainingMonths };
  }, []);

  return (
    <Card className="border border-border/60 overflow-hidden">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {bn ? "১৫-বছর স্মার্ট কন্ট্র্যাক্ট টাইমলাইন" : "15-Year Smart Contract Timeline"}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {bn ? "ক্লোজড-লুপ পার্টনারশিপ চুক্তি" : "Closed-Loop Partnership Agreement"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Progress value={timeline.progressPct} className="h-3 bg-muted/40" />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-background shadow-lg shadow-primary/30"
              style={{ left: `calc(${Math.min(timeline.progressPct, 98)}% - 8px)` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
            <span>May 2025</span>
            <span className="text-primary font-bold">{timeline.progressPct.toFixed(1)}%</span>
            <span>May 2040</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {bn ? "বর্তমান অবস্থান" : "Current Position"}
            </p>
            <p className="text-lg font-bold text-primary mt-0.5">
              {bn
                ? `বছর ${timeline.elapsedYears + 1}, মাস ${timeline.elapsedMonths + 1}`
                : `Year ${timeline.elapsedYears + 1}, Month ${timeline.elapsedMonths + 1}`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {bn ? "অবশিষ্ট" : "Remaining"}
            </p>
            <p className="text-lg font-bold text-foreground mt-0.5">
              {bn
                ? `${timeline.remainingYears} বছর ${timeline.remainingMonths} মাস`
                : `${timeline.remainingYears}y ${timeline.remainingMonths}m`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-muted/30 border border-border/40 text-center col-span-2 sm:col-span-1">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {bn ? "ভেস্টিং স্ট্যাটাস" : "Vesting Status"}
            </p>
            <p className={cn(
              "text-sm font-bold mt-0.5",
              timeline.elapsedYears >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            )}>
              {timeline.elapsedYears >= 5
                ? (bn ? "✅ সম্পূর্ণ ভেস্টেড" : "✅ Fully Vested")
                : (bn ? "⏳ ভেস্টিং চলমান" : "⏳ Vesting In Progress")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

OwnerTimeline.displayName = "OwnerTimeline";
export default OwnerTimeline;
