import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-muted animate-pulse",
        className
      )}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
    </div>
  );
}

function MetricCardSkeleton() {
  return (
    <div className="card-elevated p-5 border-l-4 border-l-muted" style={{ boxShadow: "var(--shadow-metric)" }}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-7 w-20 mb-2" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-11 w-11 rounded-xl" />
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton
                key={j}
                className={cn("h-4", j === 0 ? "w-12" : j === 1 ? "w-28" : "w-20")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCardSkeleton() {
  return (
    <div className="card-elevated p-4 border-l-4 border-l-muted">
      <Skeleton className="h-3 w-36 mb-2" />
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

export { Skeleton, MetricCardSkeleton, TableSkeleton, SummaryCardSkeleton };
