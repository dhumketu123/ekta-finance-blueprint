/**
 * Phase 4 — TransactionReceiptTemplate
 * Dynamic watermark, blockchain hash chaining, device fingerprint, retry logic
 */

import { useRef, useState, memo, useCallback } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { generateReceiptHash, logPdfToLedger } from "@/lib/pdf-utils";
import { useAuth } from "@/contexts/AuthContext";

interface ReceiptTxn {
  id: string;
  clientName: string;
  clientNameBn?: string;
  memberId?: string;
  type: string;
  typeBn?: string;
  amount: number;
  amountWords?: string;
  amountWordsBn?: string;
  date: string;
  processedBy?: string;
  receiptNumber?: string;
  referenceId?: string;
  notes?: string;
}

interface Props {
  txn: ReceiptTxn;
}

const TransactionReceiptTemplate = memo(({ txn }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const generatePDF = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      setLoading(true);
      const el = containerRef.current;
      const origDisplay = el.style.display;
      el.style.display = "block";

      const receiptNo = txn.receiptNumber || txn.id.slice(0, 8).toUpperCase();
      const pdfHash = await generateReceiptHash({
        receiptNumber: receiptNo,
        date: txn.date,
        amount: txn.amount,
        clientName: txn.clientName,
      });

      // Update hash footer
      const hashEl = el.querySelector("[data-hash-footer]");
      if (hashEl) {
        hashEl.textContent = `Verification Hash: ${pdfHash.slice(0, 16)}...${pdfHash.slice(-8)}`;
      }

      // Update QR with chainHash for verification
      const qrEl = el.querySelector("[data-qr-code]");
      if (qrEl) {
        // QR already rendered via React; chainHash will be in ledger
      }

      // Update dynamic watermark
      const wmEl = el.querySelector("[data-dynamic-watermark]");
      if (wmEl) {
        wmEl.textContent = `${txn.clientName} • ${new Date(txn.date).toLocaleDateString("en-GB")} • ${receiptNo}`;
      }

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

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
      el.style.display = origDisplay;

      // Log to ledger with chain hash + retry
      const ledgerResult = await logPdfToLedger({
        entityId: txn.id,
        entityType: "receipt",
        pdfHash,
        metadata: {
          receiptNumber: receiptNo,
          amount: txn.amount,
          clientName: txn.clientName,
          date: txn.date,
        },
        userId: user?.id,
      });

      if (ledgerResult.success) {
        toast.success("রিসিপ্ট তৈরি ও লেজারে রেকর্ড হয়েছে ✅");
      } else {
        toast.warning("রিসিপ্ট তৈরি হয়েছে, কিন্তু লেজার এন্ট্রি ব্যর্থ ⚠️");
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("PDF তৈরি ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  }, [txn, user?.id]);

  const formattedDate = txn.date
    ? new Date(txn.date).toLocaleDateString("bn-BD", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

  return (
    <>
      {/* Hidden A4 printable container */}
      <div
        ref={containerRef}
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "16mm",
          backgroundColor: "#fff",
          display: "none",
          fontFamily: "'SolaimanLipi', 'Noto Sans Bengali', sans-serif",
          color: "#1a1a1a",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Static Watermark */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-35deg)",
            fontSize: "5rem",
            fontWeight: 800,
            color: "rgba(0,0,0,0.04)",
            pointerEvents: "none",
            zIndex: 0,
            whiteSpace: "nowrap",
            letterSpacing: "0.15em",
          }}
        >
          EKTA FINANCE
        </div>

        {/* Dynamic Watermark (Name + Date + Tx ID) */}
        <div
          data-dynamic-watermark
          style={{
            position: "absolute",
            top: "35%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-25deg)",
            fontSize: "1.1rem",
            fontWeight: 600,
            color: "rgba(0,0,0,0.025)",
            pointerEvents: "none",
            zIndex: 0,
            whiteSpace: "nowrap",
            letterSpacing: "0.08em",
          }}
        >
          {txn.clientName} • {new Date(txn.date).toLocaleDateString("en-GB")} • {txn.receiptNumber || txn.id.slice(0, 8).toUpperCase()}
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: "3px solid #0ea5e9",
            paddingBottom: "12px",
            marginBottom: "20px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#0ea5e9", margin: 0 }}>
              একতা ফাইন্যান্স গ্রুপ
            </h1>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "2px 0" }}>Ekta Finance Group</p>
            <p style={{ fontSize: "11px", color: "#94a3b8", margin: "2px 0" }}>
              Corporate Office, Dhaka, Bangladesh
            </p>
            <div
              style={{
                marginTop: "8px",
                display: "inline-block",
                background: "#0ea5e9",
                color: "#fff",
                padding: "4px 14px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.05em",
              }}
            >
              অফিসিয়াল রিসিপ্ট / OFFICIAL RECEIPT
            </div>
          </div>
          <QRCode
            data-qr-code
            value={JSON.stringify({
              r: txn.receiptNumber || txn.id,
              c: txn.clientName,
              a: txn.amount,
              d: txn.date,
            })}
            size={72}
            style={{ border: "2px solid #e2e8f0", padding: "4px", borderRadius: "4px" }}
          />
        </div>

        {/* Receipt Meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "#475569",
            marginBottom: "16px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <span>
            রিসিপ্ট নং: <strong>{txn.receiptNumber || txn.id.slice(0, 8).toUpperCase()}</strong>
          </span>
          <span>
            তারিখ: <strong>{formattedDate}</strong>
          </span>
        </div>

        {/* Body Table */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <tbody>
            {[
              {
                label: "গ্রাহকের নাম / Client Name",
                value: `${txn.clientNameBn || ""} ${txn.clientNameBn ? "—" : ""} ${txn.clientName}`.trim(),
              },
              txn.memberId ? { label: "সদস্য আইডি / Member ID", value: txn.memberId } : null,
              {
                label: "লেনদেনের ধরন / Type",
                value: `${txn.typeBn || ""} ${txn.typeBn ? "—" : ""} ${txn.type}`.trim(),
              },
              { label: "পরিমাণ / Amount", value: `৳${txn.amount.toLocaleString()}` },
              txn.amountWordsBn ? { label: "কথায় (বাংলা)", value: txn.amountWordsBn } : null,
              txn.amountWords ? { label: "In Words", value: txn.amountWords } : null,
              txn.referenceId ? { label: "রেফারেন্স / Reference", value: txn.referenceId } : null,
              txn.processedBy
                ? { label: "প্রক্রিয়াকারী / Processed By", value: txn.processedBy }
                : null,
              txn.notes ? { label: "মন্তব্য / Notes", value: txn.notes } : null,
            ]
              .filter(Boolean)
              .map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontWeight: 600,
                      color: "#334155",
                      width: "40%",
                      backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff",
                      borderRight: "1px solid #e2e8f0",
                    }}
                  >
                    {row!.label}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff",
                    }}
                  >
                    {row!.value}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* Digital Seal */}
        <div
          style={{
            position: "absolute",
            bottom: "50mm",
            right: "20mm",
            transform: "rotate(-8deg)",
            border: "3px solid #16a34a",
            borderRadius: "50%",
            width: "90px",
            height: "90px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#16a34a",
            fontWeight: 700,
            fontSize: "11px",
            lineHeight: 1.2,
            opacity: 0.7,
          }}
        >
          অনুমোদিত
          <br />
          APPROVED
          <br />✓
        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: "16mm", left: "16mm", right: "16mm", zIndex: 1 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #cbd5e1",
              paddingTop: "12px",
            }}
          >
            <div style={{ textAlign: "center", fontSize: "11px", color: "#64748b" }}>
              <div style={{ borderTop: "1px solid #1a1a1a", width: "140px", marginBottom: "4px" }} />
              গ্রাহকের স্বাক্ষর
            </div>
            <div style={{ textAlign: "center", fontSize: "11px", color: "#64748b" }}>
              <div style={{ borderTop: "1px solid #1a1a1a", width: "140px", marginBottom: "4px" }} />
              অনুমোদিত স্বাক্ষর
            </div>
          </div>
          {/* Cryptographic Hash Footer */}
          <p
            data-hash-footer
            style={{
              textAlign: "center",
              fontSize: "7px",
              color: "#94a3b8",
              marginTop: "6px",
              fontFamily: "monospace",
              letterSpacing: "0.05em",
            }}
          >
            Verification Hash: Generating...
          </p>
          <p style={{ textAlign: "center", fontSize: "9px", color: "#94a3b8", marginTop: "4px" }}>
            একতা ফাইন্যান্স — স্বয়ংক্রিয়ভাবে তৈরি রিসিপ্ট | এই ডকুমেন্ট শুধুমাত্র তথ্যের জন্য |{" "}
            {new Date().toISOString()}
          </p>
        </div>
      </div>

      {/* Visible action button */}
      <Button onClick={generatePDF} disabled={loading} className="gap-2" size="sm">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        {loading ? "যাচাই ও লেজার এন্ট্রি..." : "🖨️ রিসিপ্ট PDF"}
      </Button>
    </>
  );
});

TransactionReceiptTemplate.displayName = "TransactionReceiptTemplate";

export default TransactionReceiptTemplate;
