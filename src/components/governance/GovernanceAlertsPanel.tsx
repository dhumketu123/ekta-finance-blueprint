import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { QueueRow } from "./types";
import { getStatusStyle } from "./types";

interface GovernanceAlertsPanelProps {
  queueRows: QueueRow[];
}

export const GovernanceAlertsPanel = React.memo(({ queueRows }: GovernanceAlertsPanelProps) => {
  const criticalClients = useMemo(
    () => queueRows.filter((q) => q.status === "Critical"),
    [queueRows]
  );

  const escalatedClients = useMemo(
    () => queueRows.filter((q) => q.status === "Escalated"),
    [queueRows]
  );

  const policyViolations = useMemo(
    () => queueRows.filter((q) => q.days > 60 && q.status !== "Escalated"),
    [queueRows]
  );

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-xl shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Alerts & Violations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Critical Clients */}
        {criticalClients.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
              Critical ({criticalClients.length})
            </p>
            <ul className="space-y-1.5">
              {criticalClients.slice(0, 5).map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between text-sm rounded-lg px-3 py-2 bg-destructive/10"
                >
                  <span className="font-medium text-foreground">{q.client}</span>
                  <span className="text-xs text-destructive font-semibold">{q.days} দিন</span>
                </li>
              ))}
              {criticalClients.length > 5 && (
                <p className="text-xs text-muted-foreground pl-3">
                  +{criticalClients.length - 5} আরও...
                </p>
              )}
            </ul>
          </div>
        ) : null}

        {/* Policy Violations */}
        {policyViolations.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              Policy Violations ({policyViolations.length})
            </p>
            <ul className="space-y-1.5">
              {policyViolations.slice(0, 3).map((q) => (
                <li
                  key={q.id}
                  className="flex items-center justify-between text-sm rounded-lg px-3 py-2 bg-amber-500/10"
                >
                  <span className="font-medium text-foreground">{q.client}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusStyle(q.status)}`}>
                    {q.status} · {q.days}d
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Escalated Summary */}
        {escalatedClients.length > 0 && (
          <p className="text-xs text-muted-foreground">
            🔥 {escalatedClients.length} client(s) escalated
          </p>
        )}

        {/* All Clear */}
        {criticalClients.length === 0 && policyViolations.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            কোনো critical alert নেই ✅
          </div>
        )}
      </CardContent>
    </Card>
  );
});

GovernanceAlertsPanel.displayName = "GovernanceAlertsPanel";
