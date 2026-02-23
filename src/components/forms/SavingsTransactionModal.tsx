import { useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClients } from "@/hooks/useSupabaseData";
import { useSubmitPendingTransaction } from "@/hooks/usePendingTransactions";
import { Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onClose: () => void;
  prefillClientId?: string;
  prefillSavingsId?: string;
  prefillType?: "savings_deposit" | "savings_withdrawal";
}

export default function SavingsTransactionModal({ open, onClose, prefillClientId, prefillSavingsId, prefillType }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const { data: clients, isLoading: clientsLoading } = useClients();
  const submitMut = useSubmitPendingTransaction();

  const [clientId, setClientId] = useState(prefillClientId || "");
  const [savingsId, setSavingsId] = useState(prefillSavingsId || "");
  const [txType, setTxType] = useState<"savings_deposit" | "savings_withdrawal">(prefillType || "savings_deposit");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: savingsAccounts } = useQuery({
    queryKey: ["client_savings_modal", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_accounts")
        .select("id, balance, savings_product_id, savings_products(product_name_en, product_name_bn, min_amount)")
        .eq("client_id", clientId)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const selectedAccount = savingsAccounts?.find((s) => s.id === savingsId);

  const handleSubmit = () => {
    const errs: Record<string, string> = {};
    if (!clientId) errs.client = bn ? "গ্রাহক নির্বাচন করুন" : "Select a client";
    if (!savingsId) errs.savings = bn ? "অ্যাকাউন্ট নির্বাচন করুন" : "Select account";

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      errs.amount = bn ? "পরিমাণ ০ এর বেশি হতে হবে" : "Amount must be greater than 0";
    }

    if (txType === "savings_withdrawal" && selectedAccount && numAmount > selectedAccount.balance) {
      errs.amount = bn ? `ব্যালেন্স ৳${selectedAccount.balance.toLocaleString()} এর বেশি উত্তোলন করা যাবে না` : `Cannot withdraw more than balance ৳${selectedAccount.balance.toLocaleString()}`;
    }

    if (txType === "savings_deposit" && selectedAccount) {
      const minAmt = (selectedAccount as any).savings_products?.min_amount;
      if (minAmt && numAmount < minAmt) {
        errs.amount = bn ? `সর্বনিম্ন জমা ৳${Number(minAmt).toLocaleString()}` : `Minimum deposit ৳${Number(minAmt).toLocaleString()}`;
      }
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setErrors({});
    const refId = `FO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    submitMut.mutate(
      {
        type: txType,
        reference_id: refId,
        amount: numAmount,
        client_id: clientId,
        savings_id: savingsId,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => resetAndClose() }
    );
  };

  const resetAndClose = () => {
    setClientId(prefillClientId || "");
    setSavingsId(prefillSavingsId || "");
    setTxType(prefillType || "savings_deposit");
    setAmount("");
    setNotes("");
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            {txType === "savings_deposit" ? (
              <ArrowDownCircle className="w-4 h-4 text-success" />
            ) : (
              <ArrowUpCircle className="w-4 h-4 text-warning" />
            )}
            {bn ? "সঞ্চয় লেনদেন" : "Savings Transaction"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Client */}
          <div>
            <Label className="text-xs">{bn ? "গ্রাহক *" : "Client *"}</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setSavingsId(""); }}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={bn ? "গ্রাহক নির্বাচন করুন" : "Select client"} />
              </SelectTrigger>
              <SelectContent>
                {clientsLoading ? (
                  <SelectItem value="loading" disabled>{bn ? "লোড হচ্ছে..." : "Loading..."}</SelectItem>
                ) : (
                  clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {bn ? c.name_bn || c.name_en : c.name_en}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.client && <p className="text-xs text-destructive mt-1">{errors.client}</p>}
          </div>

          {/* Savings Account */}
          {clientId && (
            <div>
              <Label className="text-xs">{bn ? "সঞ্চয় অ্যাকাউন্ট *" : "Savings Account *"}</Label>
              <Select value={savingsId} onValueChange={setSavingsId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder={bn ? "অ্যাকাউন্ট নির্বাচন করুন" : "Select account"} />
                </SelectTrigger>
                <SelectContent>
                  {savingsAccounts?.length ? savingsAccounts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {(s as any).savings_products?.[bn ? "product_name_bn" : "product_name_en"] || s.id.slice(0, 8)} — ৳{s.balance.toLocaleString()}
                    </SelectItem>
                  )) : (
                    <SelectItem value="none" disabled>{bn ? "সক্রিয় অ্যাকাউন্ট নেই" : "No active accounts"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.savings && <p className="text-xs text-destructive mt-1">{errors.savings}</p>}
            </div>
          )}

          {/* Type Toggle */}
          <div>
            <Label className="text-xs">{bn ? "ধরন *" : "Type *"}</Label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button"
                size="sm"
                variant={txType === "savings_deposit" ? "default" : "outline"}
                className="flex-1 text-xs gap-1.5"
                onClick={() => setTxType("savings_deposit")}
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                {bn ? "জমা" : "Deposit"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={txType === "savings_withdrawal" ? "default" : "outline"}
                className="flex-1 text-xs gap-1.5"
                onClick={() => setTxType("savings_withdrawal")}
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                {bn ? "উত্তোলন" : "Withdraw"}
              </Button>
            </div>
          </div>

          {/* Balance info */}
          {selectedAccount && (
            <div className="rounded-md bg-muted/50 p-2.5 text-xs">
              <span className="text-muted-foreground">{bn ? "বর্তমান ব্যালেন্স:" : "Current Balance:"}</span>
              <span className="font-bold ml-1">৳{selectedAccount.balance.toLocaleString()}</span>
            </div>
          )}

          {/* Amount */}
          <div>
            <Label className="text-xs">{bn ? "পরিমাণ ৳ *" : "Amount ৳ *"}</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-sm"
              placeholder="0"
              min={0}
            />
            {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">{bn ? "মন্তব্য" : "Notes"}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
              rows={2}
              placeholder={bn ? "ঐচ্ছিক মন্তব্য" : "Optional notes"}
              maxLength={500}
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitMut.isPending} className="w-full text-xs">
            {submitMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {bn ? "অনুমোদনের জন্য জমা দিন" : "Submit for Approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
