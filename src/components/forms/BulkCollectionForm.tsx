import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClients } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Send, Users } from "lucide-react";
import { toast } from "sonner";

interface CollectionRow {
  id: string;
  client_id: string;
  type: "loan_repayment" | "savings_deposit" | "savings_withdrawal";
  target_id: string; // loan_id or savings_id
  amount: string;
}

const createEmptyRow = (): CollectionRow => ({
  id: crypto.randomUUID(),
  client_id: "",
  type: "loan_repayment",
  target_id: "",
  amount: "",
});

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BulkCollectionForm({ open, onClose }: Props) {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const qc = useQueryClient();
  const bn = lang === "bn";

  const [rows, setRows] = useState<CollectionRow[]>([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch loans for all selected clients in bulk
  const clientIds = [...new Set(rows.filter(r => r.client_id && r.type === "loan_repayment").map(r => r.client_id))];
  const { data: allLoans } = useQuery({
    queryKey: ["bulk_client_loans", clientIds],
    queryFn: async () => {
      if (!clientIds.length) return [];
      const { data, error } = await supabase
        .from("loans")
        .select("id, loan_id, client_id, outstanding_principal, status")
        .in("client_id", clientIds)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: clientIds.length > 0,
  });

  const savingsClientIds = [...new Set(rows.filter(r => r.client_id && r.type !== "loan_repayment").map(r => r.client_id))];
  const { data: allSavings } = useQuery({
    queryKey: ["bulk_client_savings", savingsClientIds],
    queryFn: async () => {
      if (!savingsClientIds.length) return [];
      const { data, error } = await supabase
        .from("savings_accounts")
        .select("id, client_id, balance")
        .in("client_id", savingsClientIds)
        .eq("status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return data;
    },
    enabled: savingsClientIds.length > 0,
  });

  const updateRow = (id: string, field: keyof CollectionRow, value: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // Reset target when client or type changes
      if (field === "client_id" || field === "type") updated.target_id = "";
      return updated;
    }));
  };

  const addRow = () => setRows(prev => [...prev, createEmptyRow()]);
  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const validRows = rows.filter(r => r.client_id && r.target_id && Number(r.amount) > 0);
  const totalAmount = validRows.reduce((sum, r) => sum + Number(r.amount), 0);

  const handleSubmit = async () => {
    if (!validRows.length) {
      toast.error(bn ? "কমপক্ষে একটি সম্পূর্ণ এন্ট্রি প্রয়োজন" : "At least one complete entry required");
      return;
    }

    // Validate withdrawal amounts
    const errs: Record<string, string> = {};
    validRows.forEach(r => {
      if (r.type === "savings_withdrawal") {
        const acc = allSavings?.find(s => s.id === r.target_id);
        if (acc && Number(r.amount) > acc.balance) {
          errs[r.id] = bn ? `ব্যালেন্স ৳${acc.balance.toLocaleString()} এর বেশি নয়` : `Max ৳${acc.balance.toLocaleString()}`;
        }
      }
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setErrors({});

    try {
      const inserts = validRows.map(r => ({
        type: r.type as any,
        reference_id: `BULK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amount: Number(r.amount),
        client_id: r.client_id,
        loan_id: r.type === "loan_repayment" ? r.target_id : null,
        savings_id: r.type !== "loan_repayment" ? r.target_id : null,
        submitted_by: user?.id,
        notes: `Bulk collection (${validRows.length} items)`,
      }));

      const { error } = await supabase.from("pending_transactions").insert(inserts);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["pending_transactions"] });
      toast.success(bn
        ? `${validRows.length}টি লেনদেন অনুমোদনের জন্য জমা দেওয়া হয়েছে`
        : `${validRows.length} transactions submitted for approval`);
      resetAndClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {bn ? "বাল্ক সংগ্রহ" : "Bulk Collection"}
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              {bn ? `${validRows.length}টি এন্ট্রি · মোট ৳${totalAmount.toLocaleString()}` : `${validRows.length} entries · Total ৳${totalAmount.toLocaleString()}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_1fr_100px_32px] gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wide px-1">
            <span>{bn ? "গ্রাহক" : "Client"}</span>
            <span>{bn ? "ধরন" : "Type"}</span>
            <span>{bn ? "ঋণ/সঞ্চয়" : "Loan/Savings"}</span>
            <span>{bn ? "পরিমাণ ৳" : "Amount ৳"}</span>
            <span></span>
          </div>

          {rows.map((row) => {
            const clientLoans = allLoans?.filter(l => l.client_id === row.client_id) || [];
            const clientSavingsAccounts = allSavings?.filter(s => s.client_id === row.client_id) || [];
            const targets = row.type === "loan_repayment" ? clientLoans : clientSavingsAccounts;

            return (
              <div key={row.id} className="grid grid-cols-[1fr_120px_1fr_100px_32px] gap-2 items-start">
                {/* Client */}
                <Select value={row.client_id} onValueChange={(v) => updateRow(row.id, "client_id", v)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder={bn ? "গ্রাহক" : "Client"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientsLoading ? (
                      <SelectItem value="loading" disabled>{bn ? "লোড..." : "Loading..."}</SelectItem>
                    ) : clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {bn ? c.name_bn || c.name_en : c.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Type */}
                <Select value={row.type} onValueChange={(v) => updateRow(row.id, "type", v)}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loan_repayment" className="text-xs">{bn ? "ঋণ" : "Loan"}</SelectItem>
                    <SelectItem value="savings_deposit" className="text-xs">{bn ? "জমা" : "Deposit"}</SelectItem>
                    <SelectItem value="savings_withdrawal" className="text-xs">{bn ? "উত্তোলন" : "Withdraw"}</SelectItem>
                  </SelectContent>
                </Select>

                {/* Target */}
                <Select value={row.target_id} onValueChange={(v) => updateRow(row.id, "target_id", v)} disabled={!row.client_id}>
                  <SelectTrigger className="text-xs h-8">
                    <SelectValue placeholder={bn ? "নির্বাচন" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    {!targets.length ? (
                      <SelectItem value="none" disabled className="text-xs">{bn ? "নেই" : "None"}</SelectItem>
                    ) : targets.map((t: any) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {row.type === "loan_repayment"
                          ? `${t.loan_id ?? t.id.slice(0, 8)} — ৳${t.outstanding_principal?.toLocaleString()}`
                          : `৳${t.balance?.toLocaleString()}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Amount */}
                <div>
                  <Input
                    type="number"
                    value={row.amount}
                    onChange={(e) => updateRow(row.id, "amount", e.target.value)}
                    className="text-xs h-8"
                    placeholder="0"
                  />
                  {errors[row.id] && <p className="text-[10px] text-destructive mt-0.5">{errors[row.id]}</p>}
                </div>

                {/* Remove */}
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length <= 1}
                  className="h-8 w-8 flex items-center justify-center rounded hover:bg-destructive/10 disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            );
          })}

          {/* Add Row */}
          <Button variant="outline" size="sm" onClick={addRow} className="w-full text-xs h-8 border-dashed">
            <Plus className="w-3 h-3 mr-1" /> {bn ? "আরো যোগ করুন" : "Add Row"}
          </Button>
        </div>

        {/* Summary & Submit */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div className="text-xs text-muted-foreground">
            {bn
              ? `${validRows.length}টি বৈধ এন্ট্রি · মোট ৳${totalAmount.toLocaleString()}`
              : `${validRows.length} valid entries · Total ৳${totalAmount.toLocaleString()}`}
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !validRows.length} className="text-xs h-8">
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            {bn ? "সব জমা দিন" : "Submit All"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
