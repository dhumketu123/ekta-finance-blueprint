import { useRef, useState, memo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import TablePagination from "@/components/TablePagination";
import { ArrowDownRight, ArrowUpRight, Search, X, Loader2, Printer, Download } from "lucide-react";
import { formatLocalDate } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { generateReceiptHash, logPdfToLedger } from "@/lib/pdf-utils";
import { useAuth } from "@/contexts/AuthContext";

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
  notes?: string | null;
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
  investorName?: string;
}

/* Memoized table row component */
const TxRow = memo(({ tx, bn, investorName, pdfLoadingId, onPrint, onPDF }: {
  tx: Transaction;
  bn: boolean;
  investorName?: string;
  pdfLoadingId: string | null;
  onPrint: (tx: Transaction) => void;
  onPDF: (tx: Transaction) => void;
}) => {
  const lbl = typeLabels[tx.type];
  const isProfit = tx.type === "investor_profit";
  return (
    <TableRow className="transition-colors hover:bg-muted/50">
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
      <TableCell className="text-center">
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1" onClick={() => onPrint(tx)}>
            <Printer className="w-3 h-3" /> {bn ? "প্রিন্ট" : "Print"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] gap-1" onClick={() => onPDF(tx)} disabled={pdfLoadingId === tx.id}>
            {pdfLoadingId === tx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {pdfLoadingId === tx.id ? "..." : (bn ? "পিডিএফ" : "PDF")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
TxRow.displayName = "TxRow";

/* Memoized mobile card */
const TxCard = memo(({ tx, bn, pdfLoadingId, onPrint, onPDF }: {
  tx: Transaction;
  bn: boolean;
  pdfLoadingId: string | null;
  onPrint: (tx: Transaction) => void;
  onPDF: (tx: Transaction) => void;
}) => {
  const lbl = typeLabels[tx.type];
  const isProfit = tx.type === "investor_profit";
  return (
    <div className="p-4 transition-colors hover:bg-muted/30">
      <div className="flex items-center gap-3">
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
      <div className="flex gap-2 mt-2 ml-12">
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => onPrint(tx)}>
          <Printer className="w-3 h-3" /> {bn ? "প্রিন্ট" : "Print"}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => onPDF(tx)} disabled={pdfLoadingId === tx.id}>
          {pdfLoadingId === tx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {pdfLoadingId === tx.id ? "..." : (bn ? "পিডিএফ" : "PDF")}
        </Button>
      </div>
    </div>
  );
});
TxCard.displayName = "TxCard";

export default function InvestorTransactionHistory({
  transactions, isLoading, page, totalPages, totalCount, searchTerm, isSearching,
  onSearch, clearSearch, onPageChange, bn, investorName,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const { user } = useAuth();

  const handlePageChange = useCallback((newPage: number) => {
    onPageChange(newPage);
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [onPageChange]);

  const handlePrint = useCallback((tx: Transaction) => {
    const el = document.getElementById(`receipt-${tx.id}`);
    if (!el) return;
    el.style.display = "block";
    window.print();
    el.style.display = "none";
  }, []);

  const handlePDF = useCallback(async (tx: Transaction) => {
    const el = document.getElementById(`receipt-${tx.id}`);
    if (!el) return;
    try {
      setPdfLoadingId(tx.id);
      el.style.display = "block";

      const receiptNo = tx.id.slice(0, 8).toUpperCase();
      const pdfHash = await generateReceiptHash({
        receiptNumber: receiptNo,
        date: tx.transaction_date,
        amount: tx.amount,
        clientName: investorName || "Investor",
      });

      // Update hash in DOM
      const hashEl = el.querySelector("[data-hash-footer]");
      if (hashEl) {
        hashEl.textContent = `Verification Hash: ${pdfHash.slice(0, 16)}...${pdfHash.slice(-8)}`;
      }

      // Update dynamic watermark
      const wmEl = el.querySelector("[data-dynamic-watermark]");
      if (wmEl) {
        wmEl.textContent = `${investorName || "Investor"} • ${format(new Date(tx.transaction_date), "dd/MM/yyyy")} • ${receiptNo}`;
      }

      const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      pdf.setProperties({
        title: `Receipt_${receiptNo}`,
        subject: `Hash:${pdfHash}`,
        creator: "Ekta Finance Group",
        keywords: `v4|chain|${receiptNo}`,
      });
      pdf.save(`Receipt_${receiptNo}.pdf`);
      el.style.display = "none";

      // Ledger entry
      const result = await logPdfToLedger({
        entityId: tx.id,
        entityType: "receipt",
        pdfHash,
        metadata: { receiptNumber: receiptNo, amount: tx.amount, clientName: investorName || "Investor", date: tx.transaction_date },
        userId: user?.id,
      });

      if (result.success) {
        toast.success(bn ? "রিসিপ্ট তৈরি ও লেজারে রেকর্ড হয়েছে ✅" : "Receipt generated & recorded ✅");
      } else {
        toast.warning(bn ? "রিসিপ্ট তৈরি হয়েছে, লেজার এন্ট্রি ব্যর্থ" : "Receipt generated, ledger failed");
      }
    } catch (err) {
      console.error("PDF failed:", err);
      toast.error(bn ? "PDF তৈরি ব্যর্থ" : "PDF generation failed");
    } finally {
      setPdfLoadingId(null);
    }
  }, [investorName, bn, user?.id]);

  return (
    <div className="card-elevated overflow-hidden" ref={scrollRef}>
      {/* Header with search */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
        <h3 className="text-sm font-bold text-card-foreground shrink-0">
          {bn ? "লেনদেনের ইতিহাস" : "Transaction History"}
        </h3>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder={bn ? "খুঁজুন..." : "Search..."} value={searchTerm} onChange={(e) => onSearch(e.target.value)} className="pl-9 pr-9 h-8 text-xs" />
          {searchTerm && (
            <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {isSearching && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />}
        </div>
      </div>

      {isLoading ? (
        <div className="p-4"><TableSkeleton rows={5} cols={5} /></div>
      ) : !transactions.length ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          {searchTerm ? (bn ? "কোনো ফলাফল পাওয়া যায়নি" : "No results found") : (bn ? "কোনো লেনদেন পাওয়া যায়নি" : "No transactions found")}
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
                  <TableHead className="text-center">{bn ? "অ্যাকশন" : "Action"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TxRow key={tx.id} tx={tx} bn={bn} investorName={investorName} pdfLoadingId={pdfLoadingId} onPrint={handlePrint} onPDF={handlePDF} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-border">
            {transactions.map((tx) => (
              <TxCard key={tx.id} tx={tx} bn={bn} pdfLoadingId={pdfLoadingId} onPrint={handlePrint} onPDF={handlePDF} />
            ))}
          </div>

          <TablePagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={handlePageChange} />
        </>
      )}

      {/* Hidden receipt containers */}
      {transactions.map((tx) => (
        <div key={`receipt-${tx.id}`} id={`receipt-${tx.id}`} style={{ display: "none" }}>
          <div
            id="printable-area"
            style={{
              width: "210mm", minHeight: "297mm", padding: "16mm", backgroundColor: "#fff",
              fontFamily: "'SolaimanLipi', 'Noto Sans Bengali', sans-serif", color: "#1a1a1a",
              position: "relative", overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(-35deg)", fontSize: "5rem", fontWeight: 800, color: "rgba(0,0,0,0.04)", pointerEvents: "none", zIndex: 0, whiteSpace: "nowrap", letterSpacing: "0.15em" }}>EKTA FINANCE</div>
            <div data-dynamic-watermark style={{ position: "absolute", top: "35%", left: "50%", transform: "translate(-50%, -50%) rotate(-25deg)", fontSize: "1.1rem", fontWeight: 600, color: "rgba(0,0,0,0.025)", pointerEvents: "none", zIndex: 0, whiteSpace: "nowrap", letterSpacing: "0.08em" }}>
              {investorName || "Investor"} • {format(new Date(tx.transaction_date), "dd/MM/yyyy")} • {tx.id.slice(0, 8).toUpperCase()}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #0ea5e9", paddingBottom: "12px", marginBottom: "20px", position: "relative", zIndex: 1 }}>
              <div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0ea5e9", margin: 0 }}>একতা ফাইন্যান্স গ্রুপ</h1>
                <p style={{ fontSize: "13px", color: "#64748b", margin: "2px 0" }}>Ekta Finance Group</p>
                <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0" }}>Corporate Office, Dhaka, Bangladesh</p>
                <div style={{ marginTop: "8px", display: "inline-block", background: "#0ea5e9", color: "#fff", padding: "4px 14px", borderRadius: "4px", fontSize: "12px", fontWeight: 600 }}>
                  অফিসিয়াল রিসিপ্ট / OFFICIAL RECEIPT
                </div>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", position: "relative", zIndex: 1 }}>
              <tbody>
                {[
                  { label: "Client / গ্রাহক", value: investorName || "Investor" },
                  { label: "Type / ধরন", value: typeLabels[tx.type] ? (bn ? typeLabels[tx.type].bn : typeLabels[tx.type].en) : tx.type },
                  { label: "Amount / পরিমাণ", value: `৳${tx.amount.toLocaleString()}` },
                  { label: "Date / তারিখ", value: format(new Date(tx.transaction_date), "dd MMM yyyy") },
                  { label: "Status / অবস্থা", value: tx.status },
                  tx.notes ? { label: "Notes / মন্তব্য", value: tx.notes } : null,
                ].filter(Boolean).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#334155", width: "40%", backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff", borderRight: "1px solid #e2e8f0" }}>{row!.label}</td>
                    <td style={{ padding: "10px 12px", backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff" }}>{row!.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ position: "absolute", bottom: "50mm", right: "20mm", transform: "rotate(-8deg)", border: "3px solid #16a34a", borderRadius: "50%", width: "90px", height: "90px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#16a34a", fontWeight: 700, fontSize: "11px", lineHeight: 1.2, opacity: 0.7 }}>
              অনুমোদিত<br />APPROVED<br />✓
            </div>
            <div style={{ position: "absolute", bottom: "16mm", left: "16mm", right: "16mm", zIndex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #cbd5e1", paddingTop: "12px" }}>
                <div style={{ textAlign: "center", fontSize: "11px", color: "#64748b" }}>
                  <div style={{ borderTop: "1px solid #1a1a1a", width: "140px", marginBottom: "4px" }} />
                  গ্রাহকের স্বাক্ষর
                </div>
                <div style={{ textAlign: "center", fontSize: "11px", color: "#64748b" }}>
                  <div style={{ borderTop: "1px solid #1a1a1a", width: "140px", marginBottom: "4px" }} />
                  অনুমোদিত স্বাক্ষর
                </div>
              </div>
              <p data-hash-footer style={{ textAlign: "center", fontSize: "7px", color: "#94a3b8", marginTop: "6px", fontFamily: "monospace", letterSpacing: "0.05em" }}>
                Verification Hash: Generating...
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
