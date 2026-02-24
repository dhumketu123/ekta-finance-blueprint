/**
 * Phase 1 (Updated with QR Code)
 * TransactionReceiptTemplate with QR Code Integration
 * Author: Giga Factory — Senior UX & Security Guidelines
 *
 * Features:
 * - Pixel-perfect A4 (w-[210mm], min-h-[297mm])
 * - Hidden container during render
 * - Watermark + Digital Seal
 * - Bengali & English rendering
 * - Loading state while PDF is generating
 * - QR Code: Encodes ReceiptNo + ClientName + Amount
 */

import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";

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

const TransactionReceiptTemplate = ({ txn }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  const generatePDF = async () => {
    if (!containerRef.current) return;
    try {
      setLoading(true);
      const el = containerRef.current;
      const origDisplay = el.style.display;
      el.style.display = "block";

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      pdf.save(`Receipt_${txn.receiptNumber || txn.id}.pdf`);

      el.style.display = origDisplay;
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setLoading(false);
    }
  };

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
        {/* Watermark */}
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
          <p style={{ textAlign: "center", fontSize: "9px", color: "#94a3b8", marginTop: "12px" }}>
            একতা ফাইন্যান্স — স্বয়ংক্রিয়ভাবে তৈরি রিসিপ্ট | এই ডকুমেন্ট শুধুমাত্র তথ্যের জন্য |{" "}
            {new Date().toISOString()}
          </p>
        </div>
      </div>

      {/* Visible action button */}
      <Button onClick={generatePDF} disabled={loading} className="gap-2" size="sm">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        {loading ? "তৈরি হচ্ছে..." : "🖨️ রিসিপ্ট PDF"}
      </Button>
    </>
  );
};

export default TransactionReceiptTemplate;
