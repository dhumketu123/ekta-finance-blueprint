import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName?: string;
  loading?: boolean;
}

export default function DeleteConfirmDialog({ open, onClose, onConfirm, itemName, loading }: Props) {
  const { lang } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            {lang === "bn" ? "মুছে ফেলার নিশ্চিতকরণ" : "Confirm Delete"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {lang === "bn"
            ? `আপনি কি "${itemName || "এই আইটেম"}" মুছে ফেলতে চান? এটি সফট ডিলিট হবে এবং ৩০ দিন পর্যন্ত পুনরুদ্ধারযোগ্য।`
            : `Are you sure you want to delete "${itemName || "this item"}"? This is a soft delete and recoverable for 30 days.`}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            {lang === "bn" ? "বাতিল" : "Cancel"}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={loading} className="text-xs">
            {loading ? "..." : lang === "bn" ? "মুছুন" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
