import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from "@/components/ui/drawer";
import { useLanguage } from "@/contexts/LanguageContext";
import { Download, FileText, FileSpreadsheet, Loader2 } from "lucide-react";

interface LoanData {
  loan_id: string | null;
  total_principal: number;
  total_interest: number;
  outstanding_principal: number;
  outstanding_interest: number;
  penalty_amount: number;
  emi_amount: number;
  status: string;
  disbursement_date: string | null;
  maturity_date: string | null;
}

interface TxData {
  created_at: string;
  transaction_type: string;
  amount: number;
  approval_status: string;
  receipt_number?: string;
  reference_id?: string;
  notes?: string;
}

interface AnalyticsSnapshot {
  punctualityPct: number;
  totalRepaid: number;
  riskLevel: string;
  highRiskCount: number;
  overdueCount: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientName: string;
  memberId: string;
  loans: LoanData[];
  transactions: TxData[];
  savingsBalance: number;
  analytics?: AnalyticsSnapshot;
}

export default function ClientStatementExport({ open, onClose, clientName, memberId, loans, transactions, savingsBalance, analytics }: Props) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [exporting, setExporting] = useState<string | null>(null);

  const generateCSV = () => {
    setExporting("csv");
    try {
      const headers = ["Date", "Type", "Amount", "Status", "Receipt", "Reference", "Notes"];
      const rows = transactions.map(tx => [
        new Date(tx.created_at).toLocaleDateString("en-US"),
        tx.transaction_type,
        tx.amount.toString(),
        tx.approval_status,
        tx.receipt_number || "",
        tx.reference_id || "",
        tx.notes || "",
      ]);

      // Add summary metrics at bottom
      const summaryRows = [
        [],
        ["--- Summary ---"],
        ["Total Loans", loans.length.toString()],
        ["Total Outstanding", loans.reduce((s, l) => s + Number(l.outstanding_principal) + Number(l.outstanding_interest) + Number(l.penalty_amount), 0).toString()],
        ["Savings Balance", savingsBalance.toString()],
      ];
      if (analytics) {
        summaryRows.push(
          ["Punctuality %", `${analytics.punctualityPct}%`],
          ["Risk Level", analytics.riskLevel],
          ["Total Repaid", analytics.totalRepaid.toString()],
          ["High Risk Loans", analytics.highRiskCount.toString()],
          ["Overdue Loans", analytics.overdueCount.toString()],
        );
      }

      const csvContent = [
        headers.join(","),
        ...rows.map(r => r.map(c => `"${c}"`).join(",")),
        ...summaryRows.map(r => r.map(c => `"${c}"`).join(",")),
      ].join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${memberId}_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const generatePDFStatement = () => {
    setExporting("pdf");
    try {
      const totalOutstanding = loans.reduce((s, l) => s + Number(l.outstanding_principal) + Number(l.outstanding_interest) + Number(l.penalty_amount), 0);
      const totalPaid = loans.reduce((s, l) => s + (Number(l.total_principal) + Number(l.total_interest)) - (Number(l.outstanding_principal) + Number(l.outstanding_interest)), 0);

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${bn ? "ক্লায়েন্ট স্টেটমেন্ট" : "Client Statement"} - ${clientName}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; color: #1a1a1a; font-size: 12px; }
  .header { text-align: center; border-bottom: 3px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { color: #0ea5e9; margin: 0; font-size: 22px; }
  .header p { margin: 4px 0; color: #666; }
  .section { margin: 20px 0; }
  .section h2 { font-size: 14px; color: #0ea5e9; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin: 12px 0; }
  .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
  .summary-card .label { font-size: 10px; color: #64748b; text-transform: uppercase; }
  .summary-card .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
  .success { color: #16a34a; }
  .danger { color: #dc2626; }
  .warning { color: #d97706; }
  .primary { color: #0ea5e9; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
  th { background: #f1f5f9; color: #334155; padding: 8px 6px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 6px; border-bottom: 1px solid #f1f5f9; }
  tr:nth-child(even) { background: #fafafa; }
  .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
  .approved { background: #dcfce7; color: #16a34a; }
  .pending { background: #fef3c7; color: #d97706; }
  .rejected { background: #fee2e2; color: #dc2626; }
  .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; text-align: center; font-size: 10px; color: #94a3b8; }
  @media print { body { margin: 20px; } }
</style></head><body>

<div class="header">
  <h1>${bn ? "একতা ফাইন্যান্স" : "Ekta Finance"}</h1>
  <p>${bn ? "ক্লায়েন্ট স্টেটমেন্ট" : "Client Financial Statement"}</p>
  <p><strong>${clientName}</strong> | ${bn ? "সদস্য:" : "Member:"} ${memberId}</p>
  <p>${bn ? "তারিখ:" : "Date:"} ${new Date().toLocaleDateString(bn ? "bn-BD" : "en-US", { day: "2-digit", month: "long", year: "numeric" })}</p>
</div>

<div class="section">
  <h2>${bn ? "সারসংক্ষেপ" : "Financial Summary"}</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">${bn ? "মোট ঋণ" : "Total Loans"}</div>
      <div class="value">${loans.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">${bn ? "মোট পরিশোধিত" : "Total Paid"}</div>
      <div class="value success">৳${Math.max(totalPaid, 0).toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div class="label">${bn ? "মোট বকেয়া" : "Total Outstanding"}</div>
      <div class="value danger">৳${totalOutstanding.toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div class="label">${bn ? "সঞ্চয় ব্যালেন্স" : "Savings Balance"}</div>
      <div class="value primary">৳${savingsBalance.toLocaleString()}</div>
    </div>
  </div>
</div>

${analytics ? `
<div class="section">
  <h2>${bn ? "বিশ্লেষণ স্ন্যাপশট" : "Analytics Snapshot"}</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">${bn ? "সময়মতো পরিশোধ" : "Punctuality"}</div>
      <div class="value ${analytics.punctualityPct >= 75 ? "success" : analytics.punctualityPct >= 50 ? "warning" : "danger"}">${analytics.punctualityPct}%</div>
    </div>
    <div class="summary-card">
      <div class="label">${bn ? "ঝুঁকি মাত্রা" : "Risk Level"}</div>
      <div class="value ${analytics.riskLevel === "low" ? "success" : analytics.riskLevel === "critical" ? "danger" : "warning"}">${analytics.riskLevel.toUpperCase()}</div>
    </div>
    <div class="summary-card">
      <div class="label">${bn ? "উচ্চ ঝুঁকি ঋণ" : "High Risk Loans"}</div>
      <div class="value ${analytics.highRiskCount > 0 ? "danger" : "success"}">${analytics.highRiskCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">${bn ? "বকেয়া ঋণ" : "Overdue Loans"}</div>
      <div class="value ${analytics.overdueCount > 0 ? "danger" : "success"}">${analytics.overdueCount}</div>
    </div>
  </div>
</div>
` : ""}

<div class="section">
  <h2>${bn ? "ঋণের বিবরণ" : "Loan Details"}</h2>
  <table>
    <thead><tr>
      <th>${bn ? "ঋণ আইডি" : "Loan ID"}</th>
      <th>${bn ? "অবস্থা" : "Status"}</th>
      <th>${bn ? "মূলধন" : "Principal"}</th>
      <th>${bn ? "সুদ" : "Interest"}</th>
      <th>${bn ? "বকেয়া" : "Outstanding"}</th>
      <th>${bn ? "জরিমানা" : "Penalty"}</th>
      <th>${bn ? "কিস্তি" : "EMI"}</th>
    </tr></thead>
    <tbody>
    ${loans.map(l => `<tr>
      <td>${l.loan_id || "—"}</td>
      <td><span class="status-badge ${l.status === "active" ? "approved" : l.status === "default" ? "rejected" : "pending"}">${l.status}</span></td>
      <td>৳${Number(l.total_principal).toLocaleString()}</td>
      <td>৳${Number(l.total_interest).toLocaleString()}</td>
      <td class="danger">৳${(Number(l.outstanding_principal) + Number(l.outstanding_interest)).toLocaleString()}</td>
      <td>${Number(l.penalty_amount) > 0 ? `<span class="danger">৳${Number(l.penalty_amount).toLocaleString()}</span>` : "—"}</td>
      <td>৳${Number(l.emi_amount).toLocaleString()}</td>
    </tr>`).join("")}
    </tbody>
  </table>
</div>

<div class="section">
  <h2>${bn ? "লেনদেন ইতিহাস" : "Transaction History"} (${transactions.length})</h2>
  <table>
    <thead><tr>
      <th>${bn ? "তারিখ" : "Date"}</th>
      <th>${bn ? "ধরন" : "Type"}</th>
      <th>${bn ? "পরিমাণ" : "Amount"}</th>
      <th>${bn ? "অবস্থা" : "Status"}</th>
      <th>${bn ? "রিসিপ্ট" : "Receipt"}</th>
    </tr></thead>
    <tbody>
    ${transactions.slice(0, 100).map(tx => `<tr>
      <td>${new Date(tx.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" })}</td>
      <td>${tx.transaction_type.replace(/_/g, " ")}</td>
      <td>৳${Number(tx.amount).toLocaleString()}</td>
      <td><span class="status-badge ${tx.approval_status === "approved" ? "approved" : tx.approval_status === "rejected" ? "rejected" : "pending"}">${tx.approval_status}</span></td>
      <td>${tx.receipt_number || "—"}</td>
    </tr>`).join("")}
    </tbody>
  </table>
</div>

<div class="footer">
  <p>${bn ? "একতা ফাইন্যান্স — স্বয়ংক্রিয়ভাবে তৈরি" : "Ekta Finance — Auto-generated statement"} | ${new Date().toISOString()}</p>
  <p>${bn ? "এই ডকুমেন্ট শুধুমাত্র তথ্যের জন্য" : "This document is for informational purposes only"}</p>
</div>

</body></html>`;

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }
    } finally {
      setExporting(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent>
        <DrawerHeader className="border-b border-border/40">
          <DrawerTitle className="text-sm font-bold flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            {bn ? "স্টেটমেন্ট এক্সপোর্ট" : "Export Statement"}
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {bn ? `${clientName} — ${loans.length} টি ঋণ, ${transactions.length} টি লেনদেন` : `${clientName} — ${loans.length} loans, ${transactions.length} transactions`}
          </p>
          <Button
            className="w-full gap-2 text-xs"
            onClick={generatePDFStatement}
            disabled={!!exporting}
          >
            {exporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            {bn ? "PDF স্টেটমেন্ট (প্রিন্ট)" : "PDF Statement (Print)"}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 text-xs"
            onClick={generateCSV}
            disabled={!!exporting}
          >
            {exporting === "csv" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            {bn ? "CSV ডাউনলোড" : "CSV Download"}
          </Button>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
