import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueRow } from "./types";
import { runGovernanceBatch, type BatchRunResult } from "./batchRunner";

/* ══════════════════════════════════════════════
   ACTION METRICS
   ══════════════════════════════════════════════ */

export interface ActionMetrics {
  totalExecuted: number;
  successCount: number;
  failureCount: number;
  lastRunAt: string | null;
}

const INITIAL_METRICS: ActionMetrics = {
  totalExecuted: 0,
  successCount: 0,
  failureCount: 0,
  lastRunAt: null,
};

/* ══════════════════════════════════════════════
   HOOK: useGovernanceBatchRunner
   ══════════════════════════════════════════════ */

export const useGovernanceBatchRunner = (queue: QueueRow[]) => {
  const [metrics, setMetrics] = useState<ActionMetrics>(INITIAL_METRICS);
  const [isRunning, setIsRunning] = useState(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const runBatch = useCallback(async (): Promise<BatchRunResult | null> => {
    if (queueRef.current.length === 0) return null;
    setIsRunning(true);

    try {
      const result = await runGovernanceBatch(queueRef.current);

      setMetrics((prev) => ({
        totalExecuted: prev.totalExecuted + result.executed,
        successCount: prev.successCount + result.successCount,
        failureCount: prev.failureCount + result.failureCount,
        lastRunAt: new Date().toISOString(),
      }));

      return result;
    } catch (err) {
      console.error("[GovernanceBatch] Failed:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { metrics, isRunning, runBatch };
};
