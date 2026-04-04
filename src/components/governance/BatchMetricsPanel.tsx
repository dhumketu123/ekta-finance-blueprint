import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle, XCircle, Clock } from "lucide-react";
import type { ActionMetrics } from "./useGovernanceBatchRunner";

interface BatchMetricsPanelProps {
  metrics: ActionMetrics;
  isRunning: boolean;
  onRunBatch: () => void;
}

export const BatchMetricsPanel = memo(({ metrics, isRunning, onRunBatch }: BatchMetricsPanelProps) => (
  <Card className="border-border/60 bg-card/80 backdrop-blur-xl shadow-lg">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Activity className="h-4 w-4 text-primary" />
        Batch Execution Metrics
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="flex flex-col items-center rounded-lg border border-border/40 bg-background/50 p-3">
          <CheckCircle className="h-5 w-5 text-green-500 mb-1" />
          <span className="text-lg font-bold">{metrics.successCount}</span>
          <span className="text-[10px] text-muted-foreground">সফল</span>
        </div>
        <div className="flex flex-col items-center rounded-lg border border-border/40 bg-background/50 p-3">
          <XCircle className="h-5 w-5 text-destructive mb-1" />
          <span className="text-lg font-bold">{metrics.failureCount}</span>
          <span className="text-[10px] text-muted-foreground">ব্যর্থ</span>
        </div>
        <div className="flex flex-col items-center rounded-lg border border-border/40 bg-background/50 p-3">
          <Clock className="h-5 w-5 text-muted-foreground mb-1" />
          <span className="text-lg font-bold">{metrics.totalExecuted}</span>
          <span className="text-[10px] text-muted-foreground">মোট</span>
        </div>
      </div>

      {metrics.lastRunAt && (
        <p className="text-xs text-muted-foreground mb-3 text-center">
          শেষ রান: {new Date(metrics.lastRunAt).toLocaleTimeString("bn-BD")}
        </p>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={isRunning}
        onClick={onRunBatch}
      >
        {isRunning ? "চলছে..." : "ম্যানুয়াল ব্যাচ রান"}
      </Button>
    </CardContent>
  </Card>
));

BatchMetricsPanel.displayName = "BatchMetricsPanel";
