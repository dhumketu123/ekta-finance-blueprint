import { useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvestors } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Landmark, MessageCircle, Loader2, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CapitalInjectionModalProps {
  open: boolean;
  onClose: () => void;
}

interface SuccessData {
  investorName: string;
  amount: number;
  totalCapital: number;
  phone: string | null;
}

export const CapitalInjectionModal = ({ open, onClose }: CapitalInjectionModalProps) => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const queryClient = useQueryClient();
  const { data: investors } = useInvestors();

  const [selectedInvestorId, setSelectedInvestorId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const formatCurrency = useCallback((val: number) => `৳${val.toLocaleString("bn-BD")}`, []);

  const isFormValid = Boolean(selectedInvestorId && amount && Number(amount) > 0);

  const handleSubmit = useCallback(async () => {
    if (!isFormValid) {
      toast.error(bn ? "অনুগ্রহ করে সকল তথ্য সঠিকভাবে পূরণ করুন" : "Please fill all fields correctly");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.rpc("create_investor_weekly_transaction", {
        p_data: {
          investor_id: selectedInvestorId,
          type: "capital",
          amount: Number(amount),
          transaction_date: format(date, "yyyy-MM-dd"),
          notes: note || (bn ? "ত্রৈমাসিক মূলধন জমা" : "Quarterly Capital Injection"),
        },
      });

      if (error) throw error;

      const { data: updatedInvestor } = await supabase
        .from("investors")
        .select("name_bn, name_en, capital, phone")
        .eq("id", selectedInvestorId)
        .single();

      if (updatedInvestor) {
        setSuccessData({
          investorName: bn ? updatedInvestor.name_bn : updatedInvestor.name_en,
          amount: Number(amount),
          totalCapital: updatedInvestor.capital,
          phone: updatedInvestor.phone,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["investor_weekly_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary_metrics"] });

      toast.success(bn ? "মূলধন সফলভাবে জমা হয়েছে" : "Capital added successfully");
    } catch (err: any) {
      console.error("Capital injection error:", err);
      const fallback = bn ? "মূলধন জমা ব্যর্থ হয়েছে। অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।" : "Failed to add capital. Please check your connection and try again.";
      toast.error(err?.message || fallback);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedInvestorId, amount, date, note, bn, isFormValid, queryClient]);

  const handleWhatsAppReceipt = () => {
    if (!successData?.phone) {
      toast.error(bn ? "ফোন নম্বর পাওয়া যায়নি" : "Phone number not found");
      return;
    }

    const phone = successData.phone.replace(/\D/g, "").replace(/^0/, "88");
    const message = encodeURIComponent(
      `সম্মানিত পার্টনার ${successData.investorName}, আপনার ৳${successData.amount.toLocaleString("bn-BD")} ত্রৈমাসিক মূলধন সফলভাবে জমা হয়েছে। মোট মূলধন: ৳${successData.totalCapital.toLocaleString("bn-BD")}। ধন্যবাদ, একতা ফাইন্যান্স।`
    );
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank");
  };

  const handleClose = () => {
    setSelectedInvestorId("");
    setAmount("");
    setDate(new Date());
    setNote("");
    setSuccessData(null);
    onClose();
  };

  const displayAmount = useMemo(() => (amount ? Number(amount).toLocaleString() : ""), [amount]);
  const formattedPreview = useMemo(() => (amount && Number(amount) > 0 ? formatCurrency(Number(amount)) : null), [amount, formatCurrency]);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
    setAmount(raw);
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !isSubmitting) handleClose(); }}>
      <DialogContent
        className="sm:max-w-md flex flex-col max-h-[90vh]"
        hideClose={isSubmitting}
        onInteractOutside={(e) => { if (isSubmitting) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (isSubmitting) e.preventDefault(); }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Landmark className="w-5 h-5" />
            {bn ? "ত্রৈমাসিক মূলধন জমা" : "Quarterly Capital Injection"}
          </DialogTitle>
          <DialogDescription>
            {bn ? "পার্টনারের মূলধন অ্যাকাউন্টে অর্থ জমা করুন" : "Add funds to partner's capital account"}
          </DialogDescription>
        </DialogHeader>

        {successData ? (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {bn ? "মূলধন সফলভাবে জমা হয়েছে!" : "Capital Added Successfully!"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {successData.investorName} — {formatCurrency(successData.amount)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 w-full">
                <p className="text-xs text-muted-foreground">{bn ? "মোট মূলধন" : "Total Capital"}</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(successData.totalCapital)}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border/50">
              {successData.phone && (
                <Button
                  onClick={handleWhatsAppReceipt}
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                >
                  <MessageCircle className="w-4 h-4" />
                  {bn ? "WhatsApp রসিদ পাঠান" : "Send WhatsApp Receipt"}
                </Button>
              )}
              <Button variant="outline" onClick={handleClose} className="flex-1">
                {bn ? "বন্ধ করুন" : "Close"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable Form Body */}
            <div className="flex-1 min-h-0 overflow-y-auto py-2 pr-1">
              <div className="flex flex-col gap-4">
                {/* Partner Selection */}
                <div className="space-y-2">
                  <Label>{bn ? "পার্টনার নির্বাচন করুন" : "Select Partner"}</Label>
                  <Select value={selectedInvestorId} onValueChange={setSelectedInvestorId}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder={bn ? "পার্টনার নির্বাচন করুন..." : "Select partner..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {investors?.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {bn ? inv.name_bn : inv.name_en} — {formatCurrency(inv.capital)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label>{bn ? "পরিমাণ (৳)" : "Amount (৳)"}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-base">৳</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder={bn ? "পরিমাণ লিখুন" : "Enter amount"}
                      value={displayAmount}
                      onChange={handleAmountChange}
                      className="pl-8 text-right text-lg font-semibold tracking-wide h-11"
                      autoComplete="off"
                      aria-label={bn ? "পরিমাণ" : "Amount in Taka"}
                    />
                  </div>
                  {formattedPreview && (
                    <p className="text-xs text-muted-foreground text-right">
                      {formattedPreview}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label>{bn ? "তারিখ" : "Date"}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full h-11 justify-start text-left font-normal", !date && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : bn ? "তারিখ নির্বাচন করুন" : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={(d) => d && setDate(d)}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <Label>{bn ? "নোট (ঐচ্ছিক)" : "Note (Optional)"}</Label>
                  <Textarea
                    placeholder={bn ? "বিস্তারিত নোট লিখুন..." : "Add a note..."}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Footer — always visible, never overlaps inputs */}
            <div className="flex flex-col sm:flex-row-reverse gap-2 pt-4 border-t border-border/50 flex-shrink-0">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !isFormValid}
                className="w-full sm:w-auto gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-lg transition-all duration-200"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {bn ? "প্রক্রিয়াকরণ হচ্ছে..." : "Processing..."}
                  </>
                ) : (
                  <>
                    <Landmark className="w-4 h-4" />
                    {bn ? "মূলধন জমা নিশ্চিত করুন" : "Confirm Capital Deposit"}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto gap-2 border-border hover:bg-accent rounded-lg transition-all duration-200"
              >
                <X className="w-4 h-4" />
                {bn ? "বাতিল করুন" : "Cancel"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
