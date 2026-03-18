import { useState } from "react";
import { format, addDays, nextThursday, nextFriday } from "date-fns";
import { bn } from "date-fns/locale";
import { Sparkles, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLogAIChipSelect, type Commitment } from "@/hooks/useCommitments";

interface AIChipsRescheduleModalProps {
  commitment: Commitment | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (commitmentId: string, date: string, reason: string) => void;
  isPending: boolean;
}

const AIChipsRescheduleModal = ({ commitment, open, onClose, onConfirm, isPending }: AIChipsRescheduleModalProps) => {
  const { lang } = useLanguage();
  const logChipSelect = useLogAIChipSelect();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const nextThu = nextThursday(today);
  const nextFri = nextFriday(today);
  const nextWeek = addDays(today, 7);

  const aiChips = [
    { label: lang === "bn" ? "আগামীকাল" : "Tomorrow", date: format(tomorrow, "yyyy-MM-dd"), icon: "⚡" },
    { label: lang === "bn" ? "আগামী বৃহস্পতিবার" : "Next Thursday", date: format(nextThu, "yyyy-MM-dd"), icon: "📅" },
    { label: lang === "bn" ? "আগামী শুক্রবার" : "Next Friday", date: format(nextFri, "yyyy-MM-dd"), icon: "🕌" },
    { label: lang === "bn" ? "৭ দিন পর" : "In 7 Days", date: format(nextWeek, "yyyy-MM-dd"), icon: "📆" },
  ];

  const handleChipSelect = (label: string, date: string) => {
    setSelectedDate(date);
    setCustomDate("");
    logChipSelect(label, date, commitment?.id);
  };

  const handleCustomDateChange = (val: string) => {
    setCustomDate(val);
    setSelectedDate(null);
  };

  const finalDate = selectedDate || customDate;
  const canSubmit = finalDate && reason.trim().length >= 3 && !isPending;

  const handleSubmit = () => {
    if (!commitment || !canSubmit) return;
    onConfirm(commitment.id, finalDate!, reason.trim());
  };

  const handleClose = () => {
    setSelectedDate(null);
    setCustomDate("");
    setReason("");
    onClose();
  };

  const clientName = commitment?.clients
    ? lang === "bn" ? commitment.clients.name_bn : commitment.clients.name_en
    : "—";

  return (
    <Drawer open={open} onOpenChange={(o) => !o && handleClose()}>
      <DrawerContent>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="flex items-center gap-2 text-base font-bangla">
            <Sparkles className="w-5 h-5 text-accent" />
            {lang === "bn" ? "AI রিশিডিউল" : "AI Reschedule"}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="space-y-4">

        {/* Client info */}
        <div className="bg-muted/50 rounded-lg p-3 border border-border/40">
          <p className="text-sm font-semibold font-bangla text-foreground">{clientName}</p>
          <p className="text-xs text-muted-foreground">
            {lang === "bn" ? "বর্তমান তারিখ:" : "Current date:"}{" "}
            {commitment && format(new Date(commitment.commitment_date), "dd MMM yyyy", {
              locale: lang === "bn" ? bn : undefined,
            })}
          </p>
        </div>

        {/* AI Chips */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            {lang === "bn" ? "AI প্রস্তাবিত তারিখ" : "AI Suggested Dates"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {aiChips.map((chip) => (
              <button
                key={chip.date}
                onClick={() => handleChipSelect(chip.label, chip.date)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all duration-200 text-sm
                  ${selectedDate === chip.date
                    ? "border-accent bg-accent/15 shadow-sm ring-1 ring-accent/30"
                    : "border-border/60 bg-card hover:border-accent/50 hover:bg-accent/5"
                  }`}
              >
                <span className="text-lg">{chip.icon}</span>
                <div className="min-w-0">
                  <p className="font-medium text-xs text-foreground truncate">{chip.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(chip.date), "dd MMM", { locale: lang === "bn" ? bn : undefined })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom date */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {lang === "bn" ? "কাস্টম তারিখ" : "Custom Date"}
          </label>
          <Input
            type="date"
            value={customDate}
            onChange={(e) => handleCustomDateChange(e.target.value)}
            min={format(tomorrow, "yyyy-MM-dd")}
            className={`h-10 ${customDate ? "border-accent ring-1 ring-accent/30" : ""}`}
          />
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {lang === "bn" ? "কারণ (ন্যূনতম ৩ অক্ষর)" : "Reason (min 3 chars)"}
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lang === "bn" ? "রিশিডিউলের কারণ লিখুন..." : "Enter reschedule reason..."}
            rows={2}
            className="text-sm resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={handleClose} className="flex-1" disabled={isPending}>
            {lang === "bn" ? "বাতিল" : "Cancel"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isPending
              ? (lang === "bn" ? "প্রক্রিয়াকরণ..." : "Processing...")
              : (lang === "bn" ? "রিশিডিউল করুন" : "Reschedule")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AIChipsRescheduleModal;
