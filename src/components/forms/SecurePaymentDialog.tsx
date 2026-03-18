import { ReactNode } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from "@/components/ui/drawer";
import { ShieldCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SecurePaymentDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function SecurePaymentDialog({ open, onClose, children }: SecurePaymentDialogProps) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {bn ? "নিরাপদ ঋণ পরিশোধ" : "Secure Loan Payment"}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>{children}</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
