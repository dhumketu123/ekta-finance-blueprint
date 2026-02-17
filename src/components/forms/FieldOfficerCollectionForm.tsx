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
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const schema = z.object({
  client_id: z.string().uuid("গ্রাহক নির্বাচন করুন"),
  type: z.enum(["loan_repayment", "savings_deposit", "savings_withdrawal"]),
  amount: z.coerce.number().positive("পরিমাণ ০ এর বেশি হতে হবে"),
  notes: z.string().trim().max(500).optional(),
});

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FieldOfficerCollectionForm({ open, onClose }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const submitMut = useSubmitPendingTransaction();

  const [form, setForm] = useState({
    client_id: "",
    type: "loan_repayment" as "loan_repayment" | "savings_deposit" | "savings_withdrawal",
    amount: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch loan/savings for selected client
  const { data: clientLoans } = useQuery({
    queryKey: ["client_loans", form.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("id, total_principal, outstanding_principal, status")
        .eq("client_id", form.client_id)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: !!form.client_id && form.type === "loan_repayment",
  });

  const { data: clientSavings } = useQuery({
    queryKey: ["client_savings", form.client_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_accounts")
        .select("id, balance, savings_product_id")
        .eq("client_id", form.client_id)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: !!form.client_id && (form.type === "savings_deposit" || form.type === "savings_withdrawal"),
  });

  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [selectedSavingsId, setSelectedSavingsId] = useState("");

  const handleSubmit = () => {
    const parsed = schema.safeParse({ ...form, amount: Number(form.amount) });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { errs[e.path[0] as string] = e.message; });
      setErrors(errs);
      return;
    }

    if (form.type === "loan_repayment" && !selectedLoanId) {
      setErrors({ loan: lang === "bn" ? "ঋণ নির্বাচন করুন" : "Select a loan" });
      return;
    }
    if ((form.type === "savings_deposit" || form.type === "savings_withdrawal") && !selectedSavingsId) {
      setErrors({ savings: lang === "bn" ? "সঞ্চয় অ্যাকাউন্ট নির্বাচন করুন" : "Select savings account" });
      return;
    }

    // Validate withdrawal doesn't exceed balance
    if (form.type === "savings_withdrawal" && selectedSavingsId) {
      const account = clientSavings?.find((s) => s.id === selectedSavingsId);
      if (account && Number(form.amount) > account.balance) {
        setErrors({ amount: lang === "bn" ? `ব্যালেন্স ৳${account.balance.toLocaleString()} এর বেশি উত্তোলন করা যাবে না` : `Cannot withdraw more than balance ৳${account.balance.toLocaleString()}` });
        return;
      }
    }

    setErrors({});
    const refId = `FO_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    submitMut.mutate(
      {
        type: parsed.data.type,
        reference_id: refId,
        amount: parsed.data.amount,
        client_id: parsed.data.client_id,
        loan_id: form.type === "loan_repayment" ? selectedLoanId : undefined,
        savings_id: (form.type === "savings_deposit" || form.type === "savings_withdrawal") ? selectedSavingsId : undefined,
        notes: parsed.data.notes || undefined,
      },
      {
        onSuccess: () => {
          resetAndClose();
        },
      }
    );
  };

  const resetAndClose = () => {
    setForm({ client_id: "", type: "loan_repayment", amount: "", notes: "" });
    setSelectedLoanId("");
    setSelectedSavingsId("");
    setErrors({});
    onClose();
  };

  const bn = lang === "bn";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold">
            {bn ? "সংগ্রহ জমা দিন" : "Submit Collection"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Client Select */}
          <div>
            <Label className="text-xs">{bn ? "গ্রাহক *" : "Client *"}</Label>
            <Select value={form.client_id} onValueChange={(v) => { setForm({ ...form, client_id: v }); setSelectedLoanId(""); setSelectedSavingsId(""); }}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={bn ? "গ্রাহক নির্বাচন করুন" : "Select client"} />
              </SelectTrigger>
              <SelectContent>
                {clientsLoading ? (
                  <SelectItem value="loading" disabled>{bn ? "লোড হচ্ছে..." : "Loading..."}</SelectItem>
                ) : (
                  clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {bn ? c.name_bn || c.name_en : c.name_en} ({c.id.slice(0, 8)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.client_id && <p className="text-xs text-destructive mt-1">{errors.client_id}</p>}
          </div>

          {/* Transaction Type */}
          <div>
            <Label className="text-xs">{bn ? "ধরন *" : "Type *"}</Label>
            <Select value={form.type} onValueChange={(v) => { setForm({ ...form, type: v as any }); setSelectedLoanId(""); setSelectedSavingsId(""); }}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loan_repayment">{bn ? "ঋণ পরিশোধ" : "Loan Repayment"}</SelectItem>
                <SelectItem value="savings_deposit">{bn ? "সঞ্চয় জমা" : "Savings Deposit"}</SelectItem>
                <SelectItem value="savings_withdrawal">{bn ? "সঞ্চয় উত্তোলন" : "Savings Withdrawal"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Loan/Savings selector */}
          {form.client_id && form.type === "loan_repayment" && (
            <div>
              <Label className="text-xs">{bn ? "ঋণ নির্বাচন *" : "Select Loan *"}</Label>
              <Select value={selectedLoanId} onValueChange={setSelectedLoanId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder={bn ? "ঋণ নির্বাচন করুন" : "Select loan"} />
                </SelectTrigger>
                <SelectContent>
                  {clientLoans?.length ? clientLoans.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      ৳{l.outstanding_principal.toLocaleString()} {bn ? "বাকি" : "outstanding"} ({l.id.slice(0, 8)})
                    </SelectItem>
                  )) : (
                    <SelectItem value="none" disabled>{bn ? "সক্রিয় ঋণ নেই" : "No active loans"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.loan && <p className="text-xs text-destructive mt-1">{errors.loan}</p>}
            </div>
          )}

          {form.client_id && (form.type === "savings_deposit" || form.type === "savings_withdrawal") && (
            <div>
              <Label className="text-xs">{bn ? "সঞ্চয় অ্যাকাউন্ট *" : "Savings Account *"}</Label>
              <Select value={selectedSavingsId} onValueChange={setSelectedSavingsId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder={bn ? "অ্যাকাউন্ট নির্বাচন করুন" : "Select account"} />
                </SelectTrigger>
                <SelectContent>
                  {clientSavings?.length ? clientSavings.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      ৳{s.balance.toLocaleString()} {bn ? "ব্যালেন্স" : "balance"} ({s.id.slice(0, 8)})
                    </SelectItem>
                  )) : (
                    <SelectItem value="none" disabled>{bn ? "সক্রিয় অ্যাকাউন্ট নেই" : "No active accounts"}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {errors.savings && <p className="text-xs text-destructive mt-1">{errors.savings}</p>}
            </div>
          )}

          {/* Amount */}
          <div>
            <Label className="text-xs">{bn ? "পরিমাণ ৳ *" : "Amount ৳ *"}</Label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="text-sm"
              placeholder="0"
            />
            {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">{bn ? "মন্তব্য" : "Notes"}</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="text-sm"
              rows={2}
              placeholder={bn ? "ঐচ্ছিক মন্তব্য" : "Optional notes"}
            />
          </div>

          <Button onClick={handleSubmit} disabled={submitMut.isPending} className="w-full text-xs">
            {submitMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
            {bn ? "অনুমোদনের জন্য জমা দিন" : "Submit for Approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
