import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import type { QueueRow } from "./types";
import {
  processEscalationActions,
  ACTION_STYLE_MAP,
  type ActionableQueueRow,
} from "./escalationActions";
import { EXTERNAL_ACTION_MAP, CHANNEL_STYLE_MAP } from "./externalIntegration";

interface AutomatedActionsPanelProps {
  queue: QueueRow[];
}

const MAX_DISPLAY = 10;

export const AutomatedActionsPanel = memo(({ queue }: AutomatedActionsPanelProps) => {
  const actionableRows = useMemo(() => {
    const all = processEscalationActions(queue);
    return all
      .filter((r): r is ActionableQueueRow & { nextAction: NonNullable<ActionableQueueRow["nextAction"]> } => r.nextAction !== null)
      .sort((a, b) => b.priority - a.priority);
  }, [queue]);

  const displayed = actionableRows.slice(0, MAX_DISPLAY);
  const remaining = actionableRows.length - MAX_DISPLAY;

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-xl shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-primary" />
          Automated Actions Preview
          <Badge variant="secondary" className="ml-auto text-xs">
            {actionableRows.length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayed.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            কোনো স্বয়ংক্রিয় অ্যাকশন নেই ✅
          </p>
        ) : (
          <div className="space-y-2">
            {displayed.map((row) => {
              const channels = EXTERNAL_ACTION_MAP[row.nextAction]?.channels ?? [];
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium truncate">{row.client}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.days} দিন ওভারডিউ · Risk {row.risk}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {channels.map((ch) => (
                      <Badge key={ch} variant="outline" className={`text-[10px] px-1.5 py-0 ${CHANNEL_STYLE_MAP[ch]}`}>
                        {ch}
                      </Badge>
                    ))}
                    <Badge className={ACTION_STYLE_MAP[row.nextAction]}>
                      {row.nextAction}
                    </Badge>
                  </div>
                </div>
              );
            })}
            {remaining > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{remaining} আরো অ্যাকশন
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

AutomatedActionsPanel.displayName = "AutomatedActionsPanel";
