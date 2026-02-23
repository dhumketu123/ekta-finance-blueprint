import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRef, useCallback } from "react";
import { toast } from "sonner";

export interface Commitment {
  id: string;
  client_id: string;
  officer_id: string;
  commitment_date: string;
  status: "pending" | "fulfilled" | "rescheduled";
  reschedule_reason: string | null;
  penalty_suspended: boolean;
  audit_hash_signature: string | null;
  created_at: string;
  updated_at: string;
  clients?: { name_bn: string; name_en: string; phone: string | null };
}

// ═══════════════════════════════════════════════════════════
// Batched Telemetry Engine — zero UX impact
// ═══════════════════════════════════════════════════════════
interface AnalyticsEvent {
  user_id: string;
  commitment_id: string | null;
  action_type: string;
  action_metadata: Record<string, unknown>;
  device_info: string | null;
}

const BATCH_SIZE = 5;
const FLUSH_INTERVAL_MS = 10_000; // 10 seconds
let analyticsQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedUserId: string | null = null;

const flushAnalyticsQueue = async () => {
  if (analyticsQueue.length === 0) return;
  const batch = analyticsQueue.splice(0);
  try {
    await (supabase.from("commitment_analytics") as any).insert(batch);
  } catch {
    // Silent fail — telemetry never blocks UX
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    // Use requestIdleCallback for zero main-thread impact
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => flushAnalyticsQueue());
    } else {
      setTimeout(flushAnalyticsQueue, 0);
    }
  }, FLUSH_INTERVAL_MS);
};

const logCommitmentAnalytics = async (
  actionType: string,
  commitmentId?: string,
  metadata?: Record<string, unknown>
) => {
  try {
    if (!cachedUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      cachedUserId = user.id;
    }

    analyticsQueue.push({
      user_id: cachedUserId,
      commitment_id: commitmentId || null,
      action_type: actionType,
      action_metadata: metadata || {},
      device_info: navigator.userAgent?.slice(0, 200) || null,
    });

    // Flush immediately when batch is full, otherwise schedule
    if (analyticsQueue.length >= BATCH_SIZE) {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => flushAnalyticsQueue());
      } else {
        setTimeout(flushAnalyticsQueue, 0);
      }
    } else {
      scheduleFlush();
    }
  } catch {
    // Silent fail
  }
};

// Flush remaining events on page unload
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAnalyticsQueue();
  });
}

// ═══════════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════════

export const useCommitments = (filters?: { status?: string; officer_id?: string }) =>
  useQuery({
    queryKey: ["commitments", filters],
    queryFn: async () => {
      let query = (supabase.from("commitments") as any)
        .select("*, clients(name_bn, name_en, phone)")
        .order("commitment_date", { ascending: true });

      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.officer_id) query = query.eq("officer_id", filters.officer_id);

      const { data, error } = await query;
      if (error) throw error;
      return data as Commitment[];
    },
  });

export const useMyCommitments = () => {
  const { user } = useAuth();
  return useCommitments(user ? { officer_id: user.id } : undefined);
};

export const useFulfillCommitment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commitmentId: string) => {
      const { data, error } = await (supabase.from("commitments") as any)
        .update({ status: "fulfilled" })
        .eq("id", commitmentId)
        .select()
        .single();
      if (error) throw error;
      logCommitmentAnalytics("swipe_fulfill", commitmentId);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commitments"] });
      toast.success("প্রতিশ্রুতি পূরণ হয়েছে ✅");
    },
    onError: (err: Error, commitmentId: string) => {
      // ─── Failure Telemetry ─────────────────────────
      logCommitmentAnalytics("swipe_fulfill_failed", commitmentId, {
        error_message: err.message?.slice(0, 300),
      });
      toast.error(err.message);
    },
  });
};

export const useRescheduleCommitmentSwipe = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      commitment_id: string;
      reschedule_date: string;
      reschedule_reason: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "commitments-reschedule-swipe",
        { body: payload }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      logCommitmentAnalytics("reschedule_confirm", payload.commitment_id, {
        new_date: payload.reschedule_date,
        reason_length: payload.reschedule_reason.length,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commitments"] });
      toast.success("সফলভাবে রিশিডিউল হয়েছে ✅");
    },
    onError: (err: Error, payload) => {
      // ─── Failure Telemetry ─────────────────────────
      logCommitmentAnalytics("reschedule_failed", payload.commitment_id, {
        error_message: err.message?.slice(0, 300),
        attempted_date: payload.reschedule_date,
      });
      toast.error(err.message);
    },
  });
};

// ─── AI Chip Selection Telemetry ─────────────────────────
export const useLogAIChipSelect = () => {
  return (chipLabel: string, chipDate: string, commitmentId?: string) => {
    logCommitmentAnalytics("ai_chip_select", commitmentId, {
      chip_label: chipLabel,
      chip_date: chipDate,
    });
  };
};

// ─── Swipe Debounce Hook (500ms) ─────────────────────────
export const useSwipeDebounce = (delayMs = 500) => {
  const lastSwipeRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastSwipeRef.current < delayMs) return false;
    lastSwipeRef.current = now;
    return true;
  }, [delayMs]);
};

export const useFeatureFlag = (flagName: string) =>
  useQuery({
    queryKey: ["feature_flags", flagName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("is_enabled")
        .eq("feature_name", flagName)
        .maybeSingle();
      if (error) throw error;
      return data?.is_enabled ?? false;
    },
    staleTime: 60_000,
  });
