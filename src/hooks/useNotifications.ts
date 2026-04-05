import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

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

  const recalcUnread = useCallback((list: AppNotification[]) => {
    return list.filter((n) => !n.is_read && !n.is_archived).length;
  }, []);

  // Initial fetch
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
      const { data, error } = await supabase
        .from("in_app_notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!mountedRef.current) return;

      if (!error && data) {
        const typed = data as unknown as AppNotification[];
        setNotifications(typed);
        setUnreadCount(recalcUnread(typed));
      }
      setIsLoading(false);
    };

    fetchNotifications();

    // Realtime subscription
    const channel = supabase
      .channel(`notif_${user.id}`)
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
          setNotifications((prev) => {
            // Deduplicate
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            const updated = [newNotif, ...prev].slice(0, 100);
            setUnreadCount(recalcUnread(updated));
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id, recalcUnread]);

  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) => {
        const updated = prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        );
        setUnreadCount(recalcUnread(updated));
        return updated;
      });
      await supabase.rpc("mark_notification_read", { p_id: id });
    },
    [recalcUnread]
  );

  const archive = useCallback(
    async (id: string) => {
      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== id);
        setUnreadCount(recalcUnread(updated));
        return updated;
      });
      await supabase.rpc("archive_notification", { p_id: id });
    },
    [recalcUnread]
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at || new Date().toISOString(),
      }));
      setUnreadCount(0);
      return updated;
    });
    await supabase.rpc("mark_all_notifications_read");
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    archive,
    markAllAsRead,
  };
};
