import { useState, useRef, useEffect } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Archive,
  X,
  AlertTriangle,
  Info,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════
   PRIORITY CONFIG
   ═══════════════════════════════════════════ */
const PRIORITY_BORDER: Record<string, string> = {
  HIGH: "border-l-destructive",
  MEDIUM: "border-l-orange-500",
  LOW: "border-l-emerald-500",
};

const PRIORITY_BG: Record<string, string> = {
  HIGH: "bg-destructive/5 dark:bg-destructive/10",
  MEDIUM: "bg-orange-500/5 dark:bg-orange-500/10",
  LOW: "",
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH: "bg-destructive shadow-destructive/50",
  MEDIUM: "bg-orange-500 shadow-orange-500/50",
  LOW: "bg-emerald-500 shadow-emerald-500/50",
};

const PRIORITY_ICON: Record<string, React.ReactNode> = {
  HIGH: <AlertTriangle className="w-3.5 h-3.5 text-destructive" />,
  MEDIUM: <Zap className="w-3.5 h-3.5 text-orange-500" />,
  LOW: <Info className="w-3.5 h-3.5 text-emerald-500" />,
};

/* ═══════════════════════════════════════════
   TIME AGO HELPER
   ═══════════════════════════════════════════ */
function timeAgo(dateStr: string, bn: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return bn ? "এইমাত্র" : "just now";
  if (mins < 60) return bn ? `${mins} মিনিট আগে` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return bn ? `${hrs} ঘণ্টা আগে` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return bn ? `${days} দিন আগে` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return bn ? `${months} মাস আগে` : `${months}mo ago`;
}

/* ═══════════════════════════════════════════
   SOURCE MODULE LABELS
   ═══════════════════════════════════════════ */
const MODULE_LABELS: Record<string, { en: string; bn: string }> = {
  loans: { en: "Loans", bn: "ঋণ" },
  savings: { en: "Savings", bn: "সঞ্চয়" },
  governance: { en: "Governance", bn: "গভর্ন্যান্স" },
  payments: { en: "Payments", bn: "পেমেন্ট" },
  system: { en: "System", bn: "সিস্টেম" },
  collections: { en: "Collections", bn: "আদায়" },
  investors: { en: "Investors", bn: "বিনিয়োগকারী" },
};

/* ═══════════════════════════════════════════
   NOTIFICATION ITEM
   ═══════════════════════════════════════════ */
const NotificationItem = ({
  notification: n,
  onRead,
  onArchive,
  bn,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onArchive: (id: string) => void;
  bn: boolean;
}) => {
  const moduleLabel =
    MODULE_LABELS[n.source_module]?.[bn ? "bn" : "en"] || n.source_module;

  return (
    <div
      className={cn(
        "relative px-4 py-3 border-l-[3px] transition-all duration-200 group",
        "hover:bg-accent/40 active:scale-[0.995]",
        PRIORITY_BORDER[n.priority],
        PRIORITY_BG[n.priority],
        !n.is_read && "bg-accent/20"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Priority icon */}
        <div className="pt-0.5 flex-shrink-0">{PRIORITY_ICON[n.priority]}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {!n.is_read && (
              <span
                className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0 shadow-sm",
                  PRIORITY_DOT[n.priority]
                )}
              />
            )}
            <p
              className={cn(
                "text-xs font-semibold truncate leading-tight",
                !n.is_read
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {n.title}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-relaxed">
            {n.message}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-muted-foreground/60">
              {timeAgo(n.created_at, bn)}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 h-[18px] font-medium"
            >
              {moduleLabel}
            </Badge>
            {n.priority === "HIGH" && (
              <Badge
                variant="destructive"
                className="text-[9px] px-1.5 py-0 h-[18px] font-bold"
              >
                {bn ? "জরুরি" : "URGENT"}
              </Badge>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
          {!n.is_read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-primary/10"
              onClick={(e) => {
                e.stopPropagation();
                onRead(n.id);
              }}
              title={bn ? "পঠিত করুন" : "Mark read"}
            >
              <Check className="w-3.5 h-3.5 text-primary" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              onArchive(n.id);
            }}
            title={bn ? "আর্কাইভ" : "Archive"}
          >
            <Archive className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   NOTIFICATION BELL (MAIN EXPORT)
   ═══════════════════════════════════════════ */
export const NotificationBell = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    archive,
    markAllAsRead,
  } = useNotifications();
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Split by priority for grouped view
  const highPriority = notifications.filter((n) => n.priority === "HIGH" && !n.is_read);
  const otherNotifications = notifications.filter(
    (n) => !(n.priority === "HIGH" && !n.is_read)
  );

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          "relative h-9 w-9 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground active:scale-95 transition-all duration-200",
          open && "bg-primary-foreground/10"
        )}
        aria-label={bn ? "বিজ্ঞপ্তি" : "Notifications"}
      >
        <Bell
          className={cn(
            "w-[18px] h-[18px] transition-transform duration-300",
            unreadCount > 0 && "animate-[bell-ring_0.5s_ease-in-out]"
          )}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1 shadow-lg shadow-destructive/30 animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[380px] rounded-xl border border-border/50 bg-popover shadow-2xl shadow-black/10 dark:shadow-black/30 z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-200">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Bell className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-none">
                  {bn ? "বিজ্ঞপ্তি" : "Notifications"}
                </h3>
                {unreadCount > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {bn
                      ? `${unreadCount}টি অপঠিত`
                      : `${unreadCount} unread`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
                  onClick={markAllAsRead}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {bn ? "সব পঠিত" : "Read all"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:bg-destructive/10"
                onClick={() => setOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* ── Content ── */}
          <ScrollArea className="max-h-[calc(70vh-60px)]">
            {isLoading ? (
              <div className="p-10 text-center">
                <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground mt-3">
                  {bn ? "লোড হচ্ছে..." : "Loading..."}
                </p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                  <Bell className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {bn ? "কোনো বিজ্ঞপ্তি নেই" : "No notifications"}
                </p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {bn
                    ? "নতুন বিজ্ঞপ্তি এখানে দেখা যাবে"
                    : "New notifications will appear here"}
                </p>
              </div>
            ) : (
              <div>
                {/* HIGH priority section */}
                {highPriority.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-destructive/5 dark:bg-destructive/10 border-b">
                      <p className="text-[10px] font-bold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        {bn ? "জরুরি বিজ্ঞপ্তি" : "URGENT NOTIFICATIONS"}
                        <Badge variant="destructive" className="text-[9px] px-1 h-4 ml-1">
                          {highPriority.length}
                        </Badge>
                      </p>
                    </div>
                    <div className="divide-y divide-border/50">
                      {highPriority.map((n) => (
                        <NotificationItem
                          key={n.id}
                          notification={n}
                          onRead={markAsRead}
                          onArchive={archive}
                          bn={bn}
                        />
                      ))}
                    </div>
                    {otherNotifications.length > 0 && (
                      <Separator className="opacity-50" />
                    )}
                  </>
                )}

                {/* Other notifications */}
                {otherNotifications.length > 0 && (
                  <div className="divide-y divide-border/50">
                    {otherNotifications.map((n) => (
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
              </div>
            )}
          </ScrollArea>

          {/* ── Footer ── */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground/60">
                {bn
                  ? `সর্বশেষ ${notifications.length}টি বিজ্ঞপ্তি দেখানো হচ্ছে`
                  : `Showing latest ${notifications.length} notifications`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
