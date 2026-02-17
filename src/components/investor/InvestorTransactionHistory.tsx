import { useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import TablePagination from "@/components/TablePagination";
import { ArrowDownRight, ArrowUpRight, Search, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

const typeLabels: Record<string, { bn: string; en: string }> = {
  investor_profit: { bn: "মাসিক লভ্যাংশ", en: "Monthly Profit" },
  investor_principal_return: { bn: "মূলধন ফেরত", en: "Principal Return" },
};

interface Transaction {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  status: string;
  reference_id: string | null;
  transaction_date: string;
}

interface Props {
  transactions: Transaction[];
  isLoading: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  searchTerm: string;
  isSearching: boolean;
  onSearch: (term: string) => void;
  clearSearch: () => void;
  onPageChange: (page: number) => void;
  bn: boolean;
}

export default function InvestorTransactionHistory({
  transactions,
  isLoading,
  page,
  totalPages,
  totalCount,
  searchTerm,
  isSearching,
  onSearch,
  clearSearch,
  onPageChange,
  bn,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handlePageChange = (newPage: number) => {
    onPageChange(newPage);
    // Keep scroll position stable by scrolling to top of table
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="card-elevated overflow-hidden" ref={scrollRef}>
      {/* Header with search */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
        <h3 className="text-sm font-bold text-card-foreground shrink-0">
          {bn ? "লেনদেনের ইতিহাস" : "Transaction History"}
        </h3>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={bn ? "খুঁজুন..." : "Search..."}
            value={searchTerm}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9 pr-9 h-8 text-xs"
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {isSearching && (
            <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-4">
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : !transactions.length ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          {searchTerm
            ? (bn ? "কোনো ফলাফল পাওয়া যায়নি" : "No results found")
            : (bn ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found")}
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <Table className="table-premium">
              <TableHeader className="table-header-premium sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>{bn ? "তারিখ" : "Date"}</TableHead>
                  <TableHead>{bn ? "ধরন" : "Type"}</TableHead>
                  <TableHead className="text-right">{bn ? "পরিমাণ" : "Amount"}</TableHead>
                  <TableHead>{bn ? "স্থিতি" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const lbl = typeLabels[tx.type];
                  const isProfit = tx.type === "investor_profit";
                  return (
                    <TableRow key={tx.id} className="transition-colors hover:bg-muted/50">
                      <TableCell className="text-xs">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-xs font-medium">
                        <span className="inline-flex items-center gap-1">
                          {isProfit ? <ArrowDownRight className="w-3 h-3 text-success" /> : <ArrowUpRight className="w-3 h-3 text-primary" />}
                          {lbl ? (bn ? lbl.bn : lbl.en) : tx.type}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right text-xs font-semibold ${isProfit ? "text-success" : "text-primary"}`}>
                        ৳{tx.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={tx.status === "paid" ? "active" : tx.status === "pending" ? "pending" : "inactive"} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-border">
            {transactions.map((tx) => {
              const lbl = typeLabels[tx.type];
              const isProfit = tx.type === "investor_profit";
              return (
                <div key={tx.id} className="p-4 flex items-center gap-3 transition-colors hover:bg-muted/30">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isProfit ? "bg-success/10" : "bg-primary/10"}`}>
                    {isProfit ? <ArrowDownRight className="w-4 h-4 text-success" /> : <ArrowUpRight className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{lbl ? (bn ? lbl.bn : lbl.en) : tx.type}</p>
                      <p className={`text-xs font-bold ${isProfit ? "text-success" : "text-primary"}`}>৳{tx.amount.toLocaleString()}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <TablePagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
