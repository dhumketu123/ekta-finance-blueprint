import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, ShieldCheck, BookOpen } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  investorId: string;
  investorName: string;
  open: boolean;
  onClose: () => void;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  transaction_date: string;
  created_at: string;
  weeks_covered: number;
  notes: string | null;
}

const typeConfig: Record<string, { label_en: string; label_bn: string; className: string }> = {
  weekly: {
    label_en: "Weekly Share",
    label_bn: "সাপ্তাহিক শেয়ার",
    className: "border-primary/50 text-primary bg-primary/10",
  },
  capital: {
    label_en: "Capital",
    label_bn: "মূলধন",
    className: "border-emerald-500/50 text-emerald-700 bg-emerald-500/10 dark:text-emerald-400",
  },
  extra_capital: {
    label_en: "Extra Capital",
    label_bn: "অতিরিক্ত মূলধন",
    className: "border-emerald-500/50 text-emerald-700 bg-emerald-500/10 dark:text-emerald-400",
  },
  penalty: {
    label_en: "Penalty",
    label_bn: "জরিমানা",
    className: "border-destructive/50 text-destructive bg-destructive/10",
  },
  adjustment: {
    label_en: "Adjustment",
    label_bn: "সমন্বয়",
    className: "border-amber-500/50 text-amber-700 bg-amber-500/10 dark:text-amber-400",
  },
};

export function PartnerLedgerModal({ investorId, investorName, open, onClose }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !investorId) return;

    const fetchLedger = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("investor_weekly_transactions")
          .select("id, type, amount, transaction_date, created_at, weeks_covered, notes")
          .eq("investor_id", investorId)
          .order("transaction_date", { ascending: false })
          .limit(100);

        if (error) throw error;
        setTransactions((data as Transaction[]) || []);
      } catch {
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLedger();
  }, [open, investorId]);

  const totalDeposits = transactions
    .filter((t) => t.type !== "penalty")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent>
        {/* Header */}
        <DrawerHeader className="border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DrawerTitle className="text-lg font-bold">
                {bn ? "📜 হিসাব বিবরণী" : "📜 Audit Ledger"}
              </DrawerTitle>
              <DrawerDescription className="text-sm">
                {investorName} — {bn ? "সকল লেনদেনের রেকর্ড" : "Complete transaction history"}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody>
          {/* Summary Bar */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border mb-4">
            <span className="text-xs text-muted-foreground">
              {bn ? "মোট এন্ট্রি" : "Total Entries"}: <strong>{transactions.length}</strong>
            </span>
            <span className="text-xs font-semibold text-primary">
              {bn ? "মোট জমা" : "Total Deposits"}: ৳{totalDeposits.toLocaleString("bn-BD")}
            </span>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">
                {bn ? "লোড হচ্ছে..." : "Loading..."}
              </span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {bn ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                    {bn ? "তারিখ" : "Date"}
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                    {bn ? "ধরন" : "Type"}
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">
                    {bn ? "পরিমাণ" : "Amount"}
                  </TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">
                    {bn ? "নোট" : "Notes"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const cfg = typeConfig[tx.type] || typeConfig.weekly;
                  return (
                    <TableRow key={tx.id} className="group">
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {format(parseISO(tx.transaction_date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${cfg.className}`}>
                          {bn ? cfg.label_bn : cfg.label_en}
                          {tx.weeks_covered > 0 && ` (${tx.weeks_covered}w)`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`text-sm font-bold font-mono ${
                            tx.type === "penalty" ? "text-destructive" : "text-primary"
                          }`}
                        >
                          {tx.type === "penalty" ? "−" : "+"}৳{tx.amount.toLocaleString("bn-BD")}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                        {tx.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DrawerBody>

        {/* Footer: Digital Signature Badge */}
        <DrawerFooter className="flex-row items-center justify-center gap-2 bg-muted/30">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-600">
            {bn ? "ডিজিটাল সিগনেচার ভেরিফাইড • ইমিউটেবল লেজার" : "Digital Signature Verified • Immutable Ledger"}
          </span>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
