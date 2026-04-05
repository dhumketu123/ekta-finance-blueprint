import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: "border-l-destructive bg-destructive/5",
  MEDIUM: "border-l-orange-500 bg-orange-500/5",
  LOW: "border-l-emerald-500",
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH: "bg-destructive",
  MEDIUM: "bg-orange-500",
  LOW: "bg-emerald-500",
};

function timeAgo(dateStr: string, bn: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return bn ? "এইমাত্র" : "just now";
  if (mins < 60) return bn ? `${mins} মিনিট আগে` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return bn ? `${hrs} ঘণ্টা আগে` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return bn ? `${days} দিন আগে` : `${days}d ago`;
}

const NotificationItem = ({
  notification,
  onRead,
  onArchive,
  bn,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
  bn: boolean;
}) => (
  <div
    className={cn(
      "px-4 py-3 border-l-[3px] transition-all duration-200 hover:bg-accent/50 group",
      PRIORITY_STYLES[notification.priority] || "",
      !notification.is_read && "bg-accent/30"
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", PRIORITY_DOT[notification.priority])} />
          <p className={cn("text-xs font-semibold truncate", !notification.is_read && "text-foreground", notification.is_read && "text-muted-foreground")}>
            {notification.title}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 pl-4">
          {notification.message}
        </p>
        <div className="flex items-center gap-2 mt-1 pl-4">
          <span className="text-[10px] text-muted-foreground/70">
            {timeAgo(notification.created_at, bn)}
          </span>
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
            {notification.source_module}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
            title={bn ? "পঠিত করুন" : "Mark read"}
          >
            <Check className="w-3 h-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onArchive(notification.id); }}
          title={bn ? "আর্কাইভ" : "Archive"}
        >
          <Archive className="w-3 h-3" />
        </Button>
      </div>
    </div>
  </div>
);

export const NotificationBell = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { notifications, unreadCount, isLoading, markAsRead, archive, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((p) => !p)}
        className="relative h-9 w-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground active:scale-95 transition-all"
        aria-label={bn ? "বিজ্ঞপ্তি" : "Notifications"}
      >
        <Bell className={cn("w-[18px] h-[18px]", open && "text-accent")} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1 animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[380px] max-h-[70vh] rounded-xl border bg-popover shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold">
                {bn ? "বিজ্ঞপ্তি" : "Notifications"}
              </h3>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 h-5">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] gap-1 text-primary hover:text-primary"
                  onClick={markAllAsRead}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {bn ? "সব পঠিত" : "Read all"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="max-h-[calc(70vh-56px)]">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-10 h-10 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {bn ? "কোনো বিজ্ঞপ্তি নেই" : "No notifications"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={markAsRead}
                    onArchive={archive}
                    bn={bn}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
