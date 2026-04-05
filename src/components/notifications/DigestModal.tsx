import { Zap, Info, Clock, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

const PRIORITY_STYLES: Record<string, string> = {
  MEDIUM: "border-l-orange-500 bg-orange-500/5",
  LOW: "border-l-emerald-500 bg-emerald-500/5",
};

const PRIORITY_ICON: Record<string, React.ReactNode> = {
  MEDIUM: <Zap className="w-3.5 h-3.5 text-orange-500" />,
  LOW: <Info className="w-3.5 h-3.5 text-emerald-500" />,
};

function formatDate(dateStr: string, bn: boolean): string {
  return new Date(dateStr).toLocaleDateString(bn ? "bn-BD" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DigestModalProps {
  open: boolean;
  onClose: () => void;
}

export const DigestModal = ({ open, onClose }: DigestModalProps) => {
  const { notifications, markAsRead, archive } = useNotifications();
  const { lang } = useLanguage();
  const bn = lang === "bn";

  const digestItems = notifications.filter(
    (n) => (n.priority === "LOW" || n.priority === "MEDIUM") && !n.is_read
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">
                {bn ? "ডাইজেস্ট নোটিফিকেশন" : "Digest Notifications"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {bn
                  ? `${digestItems.length}টি অপঠিত মিডিয়াম/লো বিজ্ঞপ্তি`
                  : `${digestItems.length} unread medium/low notifications`}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {digestItems.length === 0 ? (
            <div className="p-10 text-center">
              <Clock className="w-10 h-10 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                {bn ? "কোনো ডাইজেস্ট আইটেম নেই" : "No digest items"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {digestItems.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "px-5 py-3 border-l-[3px] transition-colors hover:bg-accent/40 group",
                    PRIORITY_STYLES[n.priority]
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5 flex-shrink-0">
                      {PRIORITY_ICON[n.priority]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {n.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-muted-foreground/60">
                          {formatDate(n.created_at, bn)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4"
                        >
                          {n.source_module}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => markAsRead(n.id)}
                        title={bn ? "পঠিত" : "Read"}
                      >
                        <Info className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => archive(n.id)}
                        title={bn ? "আর্কাইভ" : "Archive"}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {digestItems.length > 0 && (
          <div className="px-5 py-3 border-t bg-muted/20">
            <p className="text-[10px] text-muted-foreground/60 text-center">
              {bn
                ? "এই বিজ্ঞপ্তিগুলো আপনার ডাইজেস্ট কিউ থেকে সংগৃহীত"
                : "These notifications are collected from your digest queue"}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DigestModal;
