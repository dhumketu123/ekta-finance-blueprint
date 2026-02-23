import { useState, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { format, addDays, nextThursday, isAfter, parseISO } from "date-fns";
import { bn } from "date-fns/locale";
import { Check, CalendarClock, ChevronRight, ChevronLeft, User, Phone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Commitment } from "@/hooks/useCommitments";

interface CommitmentSwipeCardProps {
  commitment: Commitment;
  onFulfill: (id: string) => void;
  onReschedule: (commitment: Commitment) => void;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 80;

const CommitmentSwipeCard = ({ commitment, onFulfill, onReschedule, disabled }: CommitmentSwipeCardProps) => {
  const { lang } = useLanguage();
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

  const handleTouchStart = (e: ReactTouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (!isSwiping || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }

    if (!isHorizontal.current) return;
    e.preventDefault();
    setOffsetX(Math.max(-150, Math.min(150, dx)));
  };

  const handleTouchEnd = () => {
    if (!isSwiping || disabled) return;
    setIsSwiping(false);

    if (offsetX > SWIPE_THRESHOLD) {
      onFulfill(commitment.id);
    } else if (offsetX < -SWIPE_THRESHOLD) {
      onReschedule(commitment);
    }

    setOffsetX(0);
    isHorizontal.current = null;
  };

  const clientName = commitment.clients
    ? lang === "bn" ? commitment.clients.name_bn : commitment.clients.name_en
    : "—";

  const commitDate = parseISO(commitment.commitment_date);
  const isOverdue = isAfter(new Date(), commitDate) && commitment.status === "pending";

  const statusColors: Record<string, string> = {
    pending: isOverdue ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
    fulfilled: "bg-success/15 text-success",
    rescheduled: "bg-primary/15 text-primary",
  };

  const statusLabels: Record<string, Record<string, string>> = {
    pending: { bn: "বাকি", en: "Pending" },
    fulfilled: { bn: "পরিশোধিত", en: "Fulfilled" },
    rescheduled: { bn: "রিশিডিউল", en: "Rescheduled" },
  };

  return (
    <div className="relative overflow-hidden rounded-xl select-none">
      {/* Swipe indicators behind the card */}
      <div className="absolute inset-0 flex">
        {/* Right swipe → Fulfill (green) */}
        <div
          className="flex items-center justify-center w-1/2 transition-opacity"
          style={{
            background: `linear-gradient(90deg, hsl(var(--success)), hsl(var(--success) / 0.6))`,
            opacity: offsetX > 20 ? Math.min(offsetX / SWIPE_THRESHOLD, 1) : 0,
          }}
        >
          <div className="flex flex-col items-center gap-1 text-success-foreground">
            <Check className="w-7 h-7" />
            <span className="text-xs font-bold">{lang === "bn" ? "পরিশোধ" : "Paid"}</span>
          </div>
        </div>
        {/* Left swipe → Reschedule (accent) */}
        <div
          className="flex items-center justify-center w-1/2 ml-auto transition-opacity"
          style={{
            background: `linear-gradient(-90deg, hsl(var(--accent)), hsl(var(--accent) / 0.6))`,
            opacity: offsetX < -20 ? Math.min(Math.abs(offsetX) / SWIPE_THRESHOLD, 1) : 0,
          }}
        >
          <div className="flex flex-col items-center gap-1 text-accent-foreground">
            <CalendarClock className="w-7 h-7" />
            <span className="text-xs font-bold">{lang === "bn" ? "রিশিডিউল" : "Reschedule"}</span>
          </div>
        </div>
      </div>

      {/* Card content */}
      <div
        className="relative bg-card border border-border/60 rounded-xl p-4 transition-transform duration-200 ease-out cursor-grab active:cursor-grabbing"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? "none" : "transform 0.3s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe hints */}
        {commitment.status === "pending" && !disabled && (
          <div className="absolute inset-y-0 left-2 right-2 flex items-center justify-between pointer-events-none opacity-20">
            <ChevronRight className="w-5 h-5 text-success animate-pulse" />
            <ChevronLeft className="w-5 h-5 text-accent-foreground animate-pulse" />
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="font-semibold text-sm text-foreground truncate font-bangla">
                {clientName}
              </span>
            </div>
            {commitment.clients?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground">{commitment.clients.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className={`text-xs font-medium ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                {format(commitDate, "dd MMM yyyy", { locale: lang === "bn" ? bn : undefined })}
              </span>
              {isOverdue && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 badge-pulse">
                  {lang === "bn" ? "বিলম্বিত" : "Overdue"}
                </Badge>
              )}
            </div>
            {commitment.penalty_suspended && (
              <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                {lang === "bn" ? "জরিমানা স্থগিত" : "Penalty Suspended"}
              </Badge>
            )}
          </div>
          <Badge className={`${statusColors[commitment.status]} text-[11px] px-2 py-0.5 font-semibold border-none`}>
            {statusLabels[commitment.status]?.[lang] ?? commitment.status}
          </Badge>
        </div>

        {commitment.reschedule_reason && (
          <p className="mt-2 text-[11px] text-muted-foreground italic border-t border-border/40 pt-1.5">
            {lang === "bn" ? "কারণ:" : "Reason:"} {commitment.reschedule_reason}
          </p>
        )}
      </div>
    </div>
  );
};

export default CommitmentSwipeCard;
