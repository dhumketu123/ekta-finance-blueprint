import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLogCommunication } from "@/hooks/useSnooze";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { Phone, MessageCircle, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

interface CommunicationHubProps {
  clientId: string;
  clientPhone?: string | null;
  clientName: string;
  loanId?: string;
}

const SMS_TEMPLATES = {
  reminder: {
    bn: "প্রিয় {name}, আপনার কিস্তি পরিশোধের তারিখ আসছে। অনুগ্রহ করে সময়মতো পরিশোধ করুন। — একতা ফাইন্যান্স",
    en: "Dear {name}, your installment payment is due soon. Please pay on time. — Ekta Finance",
  },
  thanks: {
    bn: "প্রিয় {name}, আপনার কিস্তি পরিশোধের জন্য ধন্যবাদ। আপনার সহযোগিতায় কৃতজ্ঞ। — একতা ফাইন্যান্স",
    en: "Dear {name}, thank you for your payment. We appreciate your cooperation. — Ekta Finance",
  },
};

const CommunicationHub = ({ clientId, clientPhone, clientName, loanId }: CommunicationHubProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const logComm = useLogCommunication();

  const [smsOpen, setSmsOpen] = useState(false);
  const [smsText, setSmsText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const phone = clientPhone?.replace(/\s/g, "") || "";
  const intlPhone = phone.startsWith("+") ? phone : phone.startsWith("0") ? `+88${phone}` : `+880${phone}`;
  const waPhone = intlPhone.replace("+", "");

  const handleCall = () => {
    logComm.mutate({ client_id: clientId, loan_id: loanId, comm_type: "call" });
    window.open(`tel:${intlPhone}`, "_self");
  };

  const handleWhatsApp = () => {
    logComm.mutate({ client_id: clientId, loan_id: loanId, comm_type: "whatsapp" });
    window.open(`https://wa.me/${waPhone}`, "_blank");
  };

  const applyTemplate = (key: "reminder" | "thanks") => {
    const tpl = SMS_TEMPLATES[key][bn ? "bn" : "en"];
    const msg = tpl.replace("{name}", clientName);
    setSmsText(msg);
    setSelectedTemplate(key);
  };

  const handleSendSms = () => {
    if (!smsText.trim()) return;
    logComm.mutate({
      client_id: clientId,
      loan_id: loanId,
      comm_type: "sms",
      template_used: selectedTemplate || undefined,
      message_text: smsText,
    });
    window.open(`sms:${intlPhone}?body=${encodeURIComponent(smsText)}`, "_self");
    toast.success(bn ? "SMS লগ সংরক্ষিত ✅" : "SMS log saved ✅");
    setSmsOpen(false);
    setSmsText("");
    setSelectedTemplate(null);
  };

  if (!phone) return null;

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Call */}
        <button
          onClick={handleCall}
          className="w-8 h-8 rounded-full bg-success/10 border border-success/20 flex items-center justify-center hover:bg-success/20 transition-colors group"
          title={bn ? "কল করুন" : "Call"}
        >
          <Phone className="w-3.5 h-3.5 text-success group-hover:scale-110 transition-transform" />
        </button>

        {/* WhatsApp */}
        <button
          onClick={handleWhatsApp}
          className="w-8 h-8 rounded-full bg-[hsl(142,70%,45%)]/10 border border-[hsl(142,70%,45%)]/20 flex items-center justify-center hover:bg-[hsl(142,70%,45%)]/20 transition-colors group"
          title="WhatsApp"
        >
          <MessageCircle className="w-3.5 h-3.5 text-[hsl(142,70%,45%)] group-hover:scale-110 transition-transform" />
        </button>

        {/* SMS */}
        <button
          onClick={() => setSmsOpen(true)}
          className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-colors group"
          title="SMS"
        >
          <MessageSquare className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* SMS Modal */}
      <Drawer open={smsOpen} onOpenChange={setSmsOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border/40">
            <DrawerTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-primary" />
              {bn ? "SMS পাঠান" : "Send SMS"} — {clientName}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>

          <div className="space-y-4 py-2">
            {/* Quick-fill template pills */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                {bn ? "দ্রুত টেমপ্লেট" : "Quick Templates"}
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => applyTemplate("reminder")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selectedTemplate === "reminder"
                      ? "bg-warning/20 border-warning/40 text-warning"
                      : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  ⏰ {bn ? "পেমেন্ট রিমাইন্ডার" : "Payment Reminder"}
                </button>
                <button
                  onClick={() => applyTemplate("thanks")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    selectedTemplate === "thanks"
                      ? "bg-success/20 border-success/40 text-success"
                      : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  🙏 {bn ? "ধন্যবাদ" : "Thank You"}
                </button>
              </div>
            </div>

            {/* Message textarea */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                {bn ? "বার্তা" : "Message"}
              </label>
              <Textarea
                value={smsText}
                onChange={(e) => { setSmsText(e.target.value); setSelectedTemplate(null); }}
                placeholder={bn ? "আপনার বার্তা লিখুন..." : "Type your message..."}
                rows={4}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                {smsText.length}/160
              </p>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 text-xs" onClick={() => setSmsOpen(false)}>
                {bn ? "বাতিল" : "Cancel"}
              </Button>
              <Button
                className="flex-1 text-xs gap-1.5"
                onClick={handleSendSms}
                disabled={!smsText.trim()}
              >
                <Send className="w-3.5 h-3.5" />
                {bn ? "পাঠান" : "Send"}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default CommunicationHub;
