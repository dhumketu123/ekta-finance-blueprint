import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Loader2, Zap, Banknote, AlertTriangle, Settings2 } from "lucide-react";

interface Props {
  investorId: string;
  investorName: string;
  open: boolean;
  onClose: () => void;
}

type TransactionType = "extra_capital" | "penalty" | "adjustment";

const TRANSACTION_TYPES: { value: TransactionType; labelBn: string; labelEn: string; icon: typeof Banknote; color: string }[] = [
  { value: "extra_capital", labelBn: "অতিরিক্ত মূলধন", labelEn: "Additional Capital", icon: Banknote, color: "text-success" },
  { value: "penalty", labelBn: "জরিমানা / বিলম্ব ফি", labelEn: "Penalty / Late Fee", icon: AlertTriangle, color: "text-destructive" },
  { value: "adjustment", labelBn: "সমন্বয় / কারেকশন", labelEn: "Adjustment / Correction", icon: Settings2, color: "text-warning" },
];

export function CustomTransactionModal({ investorId, investorName, open, onClose }: Props) {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const bn = lang === "bn";

  const [type, setType] = useState<TransactionType>("extra_capital");
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (amount <= 0) throw new Error(bn ? "পরিমাণ অবশ্যই ০ এর বেশি হতে হবে" : "Amount must be greater than 0");

      const typeLabels: Record<TransactionType, string> = {
        extra_capital: bn ? "অতিরিক্ত মূলধন" : "Additional Capital",
        penalty: bn ? "জরিমানা" : "Penalty",
        adjustment: bn ? "সমন্বয়" : "Adjustment",
      };

      const fullNotes = `[${typeLabels[type]}] ${notes}`.trim();

      const { data, error } = await supabase.rpc("create_investor_weekly_transaction", {
        p_data: {
          investor_id: investorId,
          type: type,
          amount: amount,
          notes: fullNotes,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["investors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary_metrics"] });
      toast.success(bn ? "লেনদেন সফলভাবে সম্পন্ন হয়েছে!" : "Transaction completed successfully!");
      handleClose();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClose = () => {
    setType("extra_capital");
    setAmount(0);
    setNotes("");
    onClose();
  };

  const selectedType = TRANSACTION_TYPES.find((t) => t.value === type);
  const TypeIcon = selectedType?.icon ?? Banknote;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {bn ? "কাস্টম লেনদেন" : "Custom Transaction"}
          </DialogTitle>
          <DialogDescription>
            {bn ? `পার্টনার: ${investorName}` : `Partner: ${investorName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transaction Type */}
          <div className="space-y-2">
            <Label htmlFor="type">{bn ? "লেনদেনের ধরন" : "Transaction Type"}</Label>
            <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <t.icon className={`w-4 h-4 ${t.color}`} />
                      <span>{bn ? t.labelBn : t.labelEn}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">{bn ? "পরিমাণ (৳)" : "Amount (৳)"}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">৳</span>
              <Input
                id="amount"
                type="number"
                min={1}
                step={100}
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="pl-8 text-lg font-semibold"
                placeholder="0"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{bn ? "নোট / রেফারেন্স" : "Note / Reference"}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={bn ? "লেনদেনের বিবরণ লিখুন..." : "Enter transaction details..."}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Preview Card */}
          {amount > 0 && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TypeIcon className={`w-5 h-5 ${selectedType?.color}`} />
                  <span className="text-sm font-medium">
                    {bn ? selectedType?.labelBn : selectedType?.labelEn}
                  </span>
                </div>
                <span className="text-lg font-bold text-primary">
                  ৳{amount.toLocaleString("bn-BD")}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            {bn ? "বাতিল" : "Cancel"}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={amount <= 0 || mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {bn ? "প্রক্রিয়াকরণ..." : "Processing..."}
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                {bn ? "নিশ্চিত করুন" : "Confirm"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
