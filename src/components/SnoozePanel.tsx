import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSnoozeInstallment } from "@/hooks/useSnooze";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlarmClock, Handshake, Timer, AlertTriangle, CheckCircle } from "lucide-react";

interface SnoozePanelProps {
  schedule: {
    id: string;
    due_date: string;
    promised_date?: string | null;
    promised_status?: string;
    snooze_count?: number;
    is_penalty_frozen?: boolean;
    status?: string;
  };
  onClose?: () => void;
}

const SnoozePanel = ({ schedule, onClose }: SnoozePanelProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const snooze = useSnoozeInstallment();
  const [open, setOpen] = useState(false);
  const [promiseDate, setPromiseDate] = useState("");

  const snoozeCount = schedule.snooze_count ?? 0;
  const promisedStatus = schedule.promised_status ?? "none";
  const isPenaltyFrozen = schedule.is_penalty_frozen ?? false;
  const promisedDate = schedule.promised_date;
  const isPaid = schedule.status === "paid";

  // Calculate days left
  const daysLeft = promisedDate
    ? Math.ceil((new Date(promisedDate).getTime() - Date.now()) / 86400000)
    : null;

  const handleSnooze = async () => {
    if (!promiseDate) return;
    await snooze.mutateAsync({ schedule_id: schedule.id, promised_date: promiseDate });
    setOpen(false);
    setPromiseDate("");
  };

  if (isPaid) return null;

  return (
    <>
      {/* Status Display */}
      <div className="flex items-center gap-2 flex-wrap">
        {promisedStatus === "promised" && daysLeft !== null && (
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs shadow-sm ${
            daysLeft < 0
              ? "bg-destructive text-destructive-foreground"
              : daysLeft === 0
                ? "bg-warning text-warning-foreground"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          }`}>
            {daysLeft < 0
              ? (bn ? `🚨 প্রতিশ্রুতি ভঙ্গ: ${Math.abs(daysLeft)} দিন ওভারডিউ` : `🚨 Promise Broken: ${Math.abs(daysLeft)} days overdue`)
              : daysLeft === 0
                ? (bn ? "⚠️ প্রতিশ্রুতি: আজই শেষ দিন" : "⚠️ Promise: Due Today")
                : (bn ? `🤝 প্রতিশ্রুতি: ${daysLeft} দিন বাকি` : `🤝 Promise: ${daysLeft} days left`)}
          </div>
        )}

        {promisedStatus === "broken" && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive">
            <AlertTriangle className="w-3.5 h-3.5" />
            {bn ? "প্রতিশ্রুতি ভঙ্গ — জরিমানা পুনরায় সক্রিয়" : "Promise Broken — Penalty Reactivated"}
          </div>
        )}

        {isPenaltyFrozen && promisedStatus === "promised" && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/10 border border-success/20 text-[10px] font-semibold text-success">
            <CheckCircle className="w-3 h-3" />
            {bn ? "জরিমানা স্থগিত" : "Penalty Frozen"}
          </div>
        )}

        {/* Snooze habit tracker */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
          <Timer className="w-3 h-3" />
          {bn ? `স্নুজ: ${snoozeCount}/3` : `Snoozed: ${snoozeCount}/3`}
          <div className="flex gap-0.5 ml-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${i < snoozeCount ? "bg-warning" : "bg-border"}`}
              />
            ))}
          </div>
        </div>

        {/* Snooze trigger button */}
        {snoozeCount < 3 && promisedStatus !== "promised" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1 text-xs h-7 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => setOpen(true)}
          >
            <AlarmClock className="w-3 h-3" />
            {bn ? "স্নুজ" : "Snooze"}
          </Button>
        )}
      </div>

      {/* Snooze Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <AlarmClock className="w-4 h-4 text-primary" />
              {bn ? "স্মার্ট স্নুজ — প্রতিশ্রুতি তারিখ" : "Smart Snooze — Promise Date"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground mb-1">
                {bn ? "মূল কিস্তির তারিখ" : "Original Due Date"}
              </p>
              <p className="text-sm font-bold">{schedule.due_date}</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                {bn ? "নতুন প্রতিশ্রুতি তারিখ" : "New Promise Date"}
              </label>
              <Input
                type="date"
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                className="text-sm"
              />
            </div>

            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-warning">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              {bn
                ? "প্রতিশ্রুতি ভঙ্গ হলে জরিমানা পূর্ববর্তী তারিখ থেকে প্রযোজ্য হবে"
                : "If promise is broken, penalties will apply retroactively from original date"}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setOpen(false)}
              >
                {bn ? "বাতিল" : "Cancel"}
              </Button>
              <Button
                className="flex-1 text-xs gap-1.5"
                onClick={handleSnooze}
                disabled={!promiseDate || snooze.isPending}
              >
                <Handshake className="w-3.5 h-3.5" />
                {snooze.isPending
                  ? (bn ? "প্রক্রিয়াকরণ..." : "Processing...")
                  : (bn ? "প্রতিশ্রুতি নিশ্চিত" : "Confirm Promise")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SnoozePanel;
