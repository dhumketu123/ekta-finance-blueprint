import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, CheckCircle2, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  itemName?: string;
  loading?: boolean;
}

type Phase = "confirm" | "deleting" | "success";

export default function DeleteConfirmDialog({ open, onClose, onConfirm, itemName, loading }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [phase, setPhase] = useState<Phase>("confirm");
  const prevLoadingRef = useRef(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPhase("confirm");
      prevLoadingRef.current = false;
    }
  }, [open]);

  // Detect when loading transitions from true → false while deleting → show success
  useEffect(() => {
    if (phase === "deleting" && prevLoadingRef.current && !loading) {
      setPhase("success");
    }
    prevLoadingRef.current = !!loading;
  }, [loading, phase]);

  // Auto-close after success
  useEffect(() => {
    if (phase === "success") {
      const timer = setTimeout(() => onClose(), 1900);
      return () => clearTimeout(timer);
    }
  }, [phase, onClose]);

  const handleConfirmClick = () => {
    setPhase("deleting");
    prevLoadingRef.current = true;
    onConfirm();
  };

  // ── SUCCESS PHASE ──────────────────────────────────────────────
  if (phase === "success") {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-xs border-0 shadow-2xl overflow-hidden p-0 gap-0 [&>button]:hidden">
          <div className="flex flex-col items-center justify-center py-10 px-6 bg-background animate-fade-in">
            <div className="relative flex items-center justify-center mb-5">
              <div className="absolute w-20 h-20 rounded-full bg-success/20 animate-ping-once" />
              <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-success animate-scale-in" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-sm font-bold text-foreground mb-1">
              {bn ? "সফলভাবে মুছে ফেলা হয়েছে!" : "Deleted Successfully!"}
            </p>
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              {bn
                ? `"${itemName || "আইটেম"}" মুছে ফেলা হয়েছে`
                : `"${itemName || "Item"}" has been removed`}
            </p>
            <div className="mt-5 w-32 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-success rounded-full animate-shrink-bar" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── DELETING PHASE ─────────────────────────────────────────────
  if (phase === "deleting") {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-xs border-0 shadow-2xl p-0 gap-0 [&>button]:hidden">
          <div className="flex flex-col items-center justify-center py-10 px-6 bg-background">
            <div className="relative mb-5">
              <div className="w-14 h-14 rounded-full border-4 border-destructive/15 border-t-destructive animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-destructive/60" />
              </div>
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              {bn ? "মুছে ফেলা হচ্ছে..." : "Deleting..."}
            </p>
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              {bn ? "অনুগ্রহ করে অপেক্ষা করুন" : "Please wait"}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── CONFIRM PHASE ──────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm border-0 shadow-2xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
        <div className="h-1 w-full bg-gradient-to-r from-destructive via-destructive/60 to-destructive/20 flex-shrink-0" />

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0 w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground leading-tight">
                {bn ? "মুছে ফেলার নিশ্চিতকরণ" : "Confirm Deletion"}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                {bn
                  ? <><span className="font-semibold text-foreground">"{itemName || "এই আইটেম"}"</span> মুছে ফেলা হবে।</>
                  : <><span className="font-semibold text-foreground">"{itemName || "this item"}"</span> will be deleted.</>
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto -mt-1 -mr-1 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-start gap-2.5 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-px" />
            <p className="text-[10px] font-medium leading-snug text-muted-foreground">
              {bn
                ? "সফট ডিলিট — ৩০ দিনের মধ্যে পুনরুদ্ধার সম্ভব। নিশ্চিত হয়ে এগিয়ে যান।"
                : "Soft delete — recoverable within 30 days. Proceed with caution."}
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="flex-1 text-xs h-9"
            >
              {bn ? "না, বাতিল" : "No, Cancel"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmClick}
              disabled={loading}
              className="flex-1 text-xs h-9 shadow-sm hover:shadow-destructive/25 hover:shadow-md transition-all duration-200 font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {bn ? "হ্যাঁ, মুছুন" : "Yes, Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
