import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AppNotification {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  source_module: string;
  event_type: string;
  title: string;
  message: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  action_payload: Record<string, unknown> | null;
  is_read: boolean;
  is_archived: boolean;
  read_at: string | null;
  event_hash: string | null;
  created_at: string;
}

export const useNotifications = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  /* ── helpers ────────────────────────────────── */
  const recalcUnread = useCallback(
    (list: AppNotification[]) =>
      list.filter((n) => !n.is_read && !n.is_archived).length,
    []
  );

  const updateList = useCallback(
    (fn: (prev: AppNotification[]) => AppNotification[]) => {
      setNotifications((prev) => {
        const next = fn(prev);
        setUnreadCount(next.filter((n) => !n.is_read && !n.is_archived).length);
        return next;
      });
    },
    []
  );

  /* ── initial fetch + realtime ───────────────── */
  useEffect(() => {
    mountedRef.current = true;

    if (!user?.id) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    const fetchNotifications = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("in_app_notifications")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_archived", false)
          .order("created_at", { ascending: false })
          .limit(100);

        if (!mountedRef.current) return;
        if (!error && data) {
          const typed = data as unknown as AppNotification[];
          setNotifications(typed);
          setUnreadCount(typed.filter((n) => !n.is_read && !n.is_archived).length);
        }
      } catch (err) {
        console.error("[useNotifications] fetch error:", err);
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    fetchNotifications();

    // Realtime: INSERT + UPDATE (DELETE not expected due to archive pattern)
    const channel = supabase
      .channel(`notif_realtime_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const newNotif = payload.new as unknown as AppNotification;
          updateList((prev) => {
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev].slice(0, 100);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const updated = payload.new as unknown as AppNotification;
          updateList((prev) => {
            // If archived via another device, remove from list
            if (updated.is_archived) return prev.filter((n) => n.id !== updated.id);
            return prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n));
          });
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id, updateList]);

  /* ── actions (optimistic + RPC) ─────────────── */
  const markAsRead = useCallback(
    async (id: string) => {
      updateList((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      try {
        await supabase.rpc("mark_notification_read", { p_id: id });
      } catch (err) {
        console.error("[useNotifications] markAsRead RPC failed:", err);
      }
    },
    [updateList]
  );

  const archive = useCallback(
    async (id: string) => {
      updateList((prev) => prev.filter((n) => n.id !== id));
      try {
        await supabase.rpc("archive_notification", { p_id: id });
      } catch (err) {
        console.error("[useNotifications] archive RPC failed:", err);
      }
    },
    [updateList]
  );

  const markAllAsRead = useCallback(async () => {
    updateList((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      }))
    );
    try {
      await supabase.rpc("mark_all_notifications_read");
    } catch (err) {
      console.error("[useNotifications] markAllAsRead RPC failed:", err);
    }
  }, [updateList]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    archive,
    markAllAsRead,
  };
};
