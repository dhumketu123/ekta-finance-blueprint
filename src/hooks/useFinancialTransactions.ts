import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type FinTransactionType =
  | "loan_repayment"
  | "loan_disbursement"
  | "savings_deposit"
  | "savings_withdrawal"
  | "admission_fee"
  | "share_capital_deposit"
  | "insurance_premium"
  | "insurance_claim_payout"
  | "adjustment_entry";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface FinancialTransaction {
  id: string;
  member_id: string | null;
  account_id: string | null;
  transaction_type: FinTransactionType;
  amount: number;
  allocation_breakdown: Record<string, any>;
  reference_id: string | null;
  notes: string | null;
  approval_status: ApprovalStatus;
  manual_flag: boolean;
  receipt_number: string | null;
  receipt_snapshot: Record<string, any> | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  running_balance: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  clients?: { name_en: string; name_bn: string; phone: string | null; member_id: string | null } | null;
}

export const useFinancialTransactions = (statusFilter?: ApprovalStatus) =>
  useQuery({
    queryKey: ["financial_transactions", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("financial_transactions" as any)
        .select("*, clients(name_en, name_bn, phone, member_id)")
        .order("created_at", { ascending: false });

      if (statusFilter) query = query.eq("approval_status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as FinancialTransaction[];
    },
  });

export const useSubmitFinancialTransaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      transaction_type: FinTransactionType;
      amount: number;
      member_id?: string;
      account_id?: string;
      reference_id?: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from("financial_transactions" as any)
        .insert([{
          ...data,
          created_by: user?.id,
          transaction_type: data.transaction_type as any,
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_transactions"] });
      toast.success("লেনদেন জমা দেওয়া হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useApproveFinancialTransaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ txId, reason }: { txId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc("approve_financial_transaction" as any, {
        _tx_id: txId,
        _approver_id: user?.id,
        _reason: reason ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_transactions"] });
      qc.invalidateQueries({ queryKey: ["loans"] });
      qc.invalidateQueries({ queryKey: ["savings_accounts"] });
      toast.success("লেনদেন অনুমোদিত ও রিসিপ্ট তৈরি হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useRejectFinancialTransaction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ txId, reason }: { txId: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_financial_transaction" as any, {
        _tx_id: txId,
        _rejector_id: user?.id,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_transactions"] });
      toast.success("লেনদেন প্রত্যাখ্যান করা হয়েছে");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useSmsLogs = (transactionId?: string) =>
  useQuery({
    queryKey: ["sms_logs", transactionId],
    queryFn: async () => {
      let query = supabase
        .from("sms_logs" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (transactionId) query = query.eq("transaction_id", transactionId);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!transactionId || transactionId === undefined,
  });

// Transaction type labels
export const TX_TYPE_LABELS: Record<FinTransactionType, { bn: string; en: string }> = {
  loan_repayment: { bn: "ঋণ পরিশোধ", en: "Loan Repayment" },
  loan_disbursement: { bn: "ঋণ বিতরণ", en: "Loan Disbursement" },
  savings_deposit: { bn: "সঞ্চয় জমা", en: "Savings Deposit" },
  savings_withdrawal: { bn: "সঞ্চয় উত্তোলন", en: "Savings Withdrawal" },
  admission_fee: { bn: "ভর্তি ফি", en: "Admission Fee" },
  share_capital_deposit: { bn: "শেয়ার মূলধন জমা", en: "Share Capital" },
  insurance_premium: { bn: "বীমা প্রিমিয়াম", en: "Insurance Premium" },
  insurance_claim_payout: { bn: "বীমা দাবি পরিশোধ", en: "Insurance Claim" },
  adjustment_entry: { bn: "সমন্বয় এন্ট্রি", en: "Adjustment Entry" },
};

export const MANUAL_TYPES: FinTransactionType[] = [
  "adjustment_entry",
  "insurance_claim_payout",
];
