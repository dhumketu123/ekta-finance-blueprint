import React from "react";
import type { AgingBucket } from "./types";

interface AgingBucketCardProps {
  bucket: AgingBucket;
}

export const AgingBucketCard = React.memo(({ bucket }: AgingBucketCardProps) => {
  const Icon = bucket.icon;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">{bucket.label}</span>
      </div>
      <h3 className="text-lg font-bold text-foreground">{bucket.title}</h3>
      <span className="text-3xl font-extrabold text-foreground">{bucket.count}</span>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
        <div className={`h-full w-1/3 rounded-full ${bucket.color}`} />
      </div>
    </div>
  );
});

AgingBucketCard.displayName = "AgingBucketCard";
