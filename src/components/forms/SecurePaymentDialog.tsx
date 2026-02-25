import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SecurePaymentDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export default function SecurePaymentDialog({ open, onClose, children, footer }: SecurePaymentDialogProps) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {bn ? "নিরাপদ ঋণ পরিশোধ" : "Secure Loan Payment"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="shrink-0 bg-background border-t border-border p-4 mt-auto flex gap-3 z-50">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
