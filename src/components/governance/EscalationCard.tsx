import React from "react";
import type { EscalationStage } from "./types";

interface EscalationCardProps {
  stage: EscalationStage;
}

export const EscalationCard = React.memo(({ stage }: EscalationCardProps) => {
  const Icon = stage.icon;
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl shadow-lg p-5 flex flex-col gap-3 transition-transform duration-200 hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-primary/10 text-primary">
          {stage.tag}
        </span>
      </div>
      <h3 className="text-sm font-bold text-foreground leading-tight">{stage.title}</h3>
      <p className="text-xs text-muted-foreground">{stage.desc}</p>
      <span className="mt-auto text-2xl font-extrabold text-foreground">{stage.metric}</span>
    </div>
  );
});

EscalationCard.displayName = "EscalationCard";
