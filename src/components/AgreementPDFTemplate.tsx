/**
 * Phase 4 — Investment Agreement PDF Template
 * Dynamic watermark, blockchain hash chaining, device fingerprint, retry logic
 */
import { useRef, useState, forwardRef, useImperativeHandle, useCallback, memo } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import QRCode from "react-qr-code";
import { Button } from "@/components/ui/button";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateAgreementHash, logPdfToLedger } from "@/lib/pdf-utils";
import { useAuth } from "@/contexts/AuthContext";

interface InvestorData {
  id: string;
  name_en: string;
  name_bn?: string;
  phone?: string | null;
  nid_number?: string | null;
  address?: string | null;
  investor_id?: string | null;
  capital: number;
  monthly_profit_percent: number;
  tenure_years?: number | null;
  investment_model?: string;
  maturity_date?: string | null;
  nominee_name?: string | null;
  nominee_phone?: string | null;
  nominee_nid?: string | null;
  nominee_relation?: string | null;
  reinvest?: boolean;
  source_of_fund?: string | null;
}

interface Props {
  investor: InvestorData;
  bn?: boolean;
}

export interface AgreementPDFHandle {
  generate: () => Promise<void>;
}

const AgreementPDFTemplate = memo(forwardRef<AgreementPDFHandle, Props>(({ investor, bn }, ref) => {
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

      const dateStr = new Date().toISOString();
      const pdfHash = await generateAgreementHash({
        investorId: investor.investor_id || investor.id,
        capital: investor.capital,
        profitRate: investor.monthly_profit_percent,
        date: dateStr,
      });

      // Update hash footer
      const hashEl = el.querySelector("[data-hash-footer]");
      if (hashEl) {
        hashEl.textContent = `Verification Hash: ${pdfHash.slice(0, 16)}...${pdfHash.slice(-8)}`;
      }

      // Update dynamic watermark
      const wmEl = el.querySelector("[data-dynamic-watermark]");
      if (wmEl) {
        const invId = investor.investor_id || investor.id.slice(0, 8).toUpperCase();
        wmEl.textContent = `${investor.name_en} • ${new Date().toLocaleDateString("en-GB")} • ${invId}`;
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
        title: `Agreement_${investor.name_en}`,
        subject: `Hash:${pdfHash}`,
        creator: "Ekta Finance Group",
        keywords: `v4|chain|${investor.investor_id || investor.id}`,
      });

      pdf.save(`Agreement_${investor.name_en.replace(/\s+/g, "_")}.pdf`);
      el.style.display = origDisplay;

      // Log to ledger with chain hash + retry
      const ledgerResult = await logPdfToLedger({
        entityId: investor.id,
        entityType: "agreement",
        pdfHash,
        metadata: {
          investorId: investor.investor_id || investor.id,
          investorName: investor.name_en,
          capital: investor.capital,
          profitRate: investor.monthly_profit_percent,
        },
        userId: user?.id,
      });

      if (ledgerResult.success) {
        toast.success(bn ? "চুক্তিপত্র তৈরি ও লেজারে রেকর্ড হয়েছে ✅" : "Agreement generated & recorded ✅");
      } else {
        toast.warning(bn ? "চুক্তিপত্র তৈরি হয়েছে, লেজার এন্ট্রি ব্যর্থ ⚠️" : "Agreement generated, ledger entry failed ⚠️");
      }
    } catch (err) {
      console.error("Agreement PDF generation failed:", err);
      toast.error(bn ? "PDF তৈরি ব্যর্থ" : "PDF generation failed");
    } finally {
      setLoading(false);
    }
  }, [investor, bn, user?.id]);

  useImperativeHandle(ref, () => ({ generate: generatePDF }));

  const today = new Date().toLocaleDateString("bn-BD", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const modelLabel = investor.investment_model === "profit_principal"
    ? (bn ? "লাভ + মূলধন (চক্রবৃদ্ধি)" : "Profit + Principal (Compound)")
    : (bn ? "শুধুমাত্র লাভ" : "Profit Only");

  const rows = [
    { label: "বিনিয়োগকারীর নাম / Investor Name", value: `${investor.name_bn || ""} — ${investor.name_en}` },
    { label: "আইডি / Investor ID", value: investor.investor_id || investor.id.slice(0, 8).toUpperCase() },
    investor.phone ? { label: "ফোন / Phone", value: investor.phone } : null,
    investor.nid_number ? { label: "জাতীয় পরিচয়পত্র / NID", value: investor.nid_number } : null,
    investor.address ? { label: "ঠিকানা / Address", value: investor.address } : null,
    investor.source_of_fund ? { label: "তহবিলের উৎস / Source of Fund", value: investor.source_of_fund } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const nomineeRows = [
    investor.nominee_name ? { label: "নমিনির নাম / Nominee", value: investor.nominee_name } : null,
    investor.nominee_relation ? { label: "সম্পর্ক / Relation", value: investor.nominee_relation } : null,
    investor.nominee_phone ? { label: "ফোন / Phone", value: investor.nominee_phone } : null,
    investor.nominee_nid ? { label: "NID", value: investor.nominee_nid } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const contractRows = [
    { label: "মূলধন / Capital Amount", value: `৳${investor.capital.toLocaleString()}` },
    { label: "মাসিক লাভের হার / Monthly Profit Rate", value: `${investor.monthly_profit_percent}%` },
    { label: "মাসিক আনুমানিক লাভ / Est. Monthly Profit", value: `৳${Math.round(investor.capital * investor.monthly_profit_percent / 100).toLocaleString()}` },
    { label: "বিনিয়োগ মডেল / Investment Model", value: modelLabel },
    investor.tenure_years ? { label: "মেয়াদ / Tenure", value: `${investor.tenure_years} ${bn ? "বছর" : "Years"}` } : null,
    investor.maturity_date ? { label: "পরিপক্কতার তারিখ / Maturity", value: new Date(investor.maturity_date).toLocaleDateString("bn-BD") } : null,
    { label: "পুনঃবিনিয়োগ / Auto-Reinvest", value: investor.reinvest ? "✅ হ্যাঁ / Yes" : "❌ না / No" },
  ].filter(Boolean) as { label: string; value: string }[];

  const renderTable = (title: string, data: { label: string; value: string }[]) => (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ background: "#0ea5e9", color: "#fff", padding: "6px 12px", fontSize: "12px", fontWeight: 700, borderRadius: "4px 4px 0 0", letterSpacing: "0.03em" }}>
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "8px 10px", fontWeight: 600, color: "#334155", width: "42%", backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff", borderRight: "1px solid #e2e8f0" }}>
                {row.label}
              </td>
              <td style={{ padding: "8px 10px", backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      {/* Hidden A4 container */}
      <div
        ref={containerRef}
        style={{
          width: "210mm",
          minHeight: "297mm",
          padding: "14mm 16mm",
          backgroundColor: "#fff",
          display: "none",
          fontFamily: "'SolaimanLipi', 'Noto Sans Bengali', 'Hind Siliguri', sans-serif",
          color: "#1a1a1a",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Static Watermark */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(-35deg)", fontSize: "5rem", fontWeight: 800, color: "rgba(0,0,0,0.03)", pointerEvents: "none", zIndex: 0, whiteSpace: "nowrap", letterSpacing: "0.15em" }}>
          EKTA FINANCE
        </div>

        {/* Dynamic Watermark (Name + Date + ID) */}
        <div
          data-dynamic-watermark
          style={{
            position: "absolute",
            top: "35%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-25deg)",
            fontSize: "1.1rem",
            fontWeight: 600,
            color: "rgba(0,0,0,0.02)",
            pointerEvents: "none",
            zIndex: 0,
            whiteSpace: "nowrap",
            letterSpacing: "0.08em",
          }}
        >
          {investor.name_en} • {new Date().toLocaleDateString("en-GB")} • {investor.investor_id || investor.id.slice(0, 8).toUpperCase()}
        </div>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #0ea5e9", paddingBottom: "10px", marginBottom: "16px", position: "relative", zIndex: 1 }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0ea5e9", margin: 0 }}>
              একতা ফাইন্যান্স গ্রুপ
            </h1>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0" }}>Ekta Finance Group</p>
            <p style={{ fontSize: "10px", color: "#94a3b8", margin: "2px 0" }}>Corporate Office, Dhaka, Bangladesh</p>
            <div style={{ marginTop: "6px", display: "inline-block", background: "#0ea5e9", color: "#fff", padding: "3px 12px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }}>
              বিনিয়োগ চুক্তিপত্র / INVESTMENT AGREEMENT
            </div>
          </div>
          <QRCode
            data-qr-code
            value={JSON.stringify({ inv: investor.investor_id || investor.id, c: investor.capital, r: investor.monthly_profit_percent, v: "5" })}
            size={68}
            style={{ border: "2px solid #e2e8f0", padding: "3px", borderRadius: "4px" }}
          />
        </div>

        {/* Date */}
        <div style={{ fontSize: "11px", color: "#475569", marginBottom: "14px", position: "relative", zIndex: 1 }}>
          তারিখ / Date: <strong>{today}</strong>
        </div>

        {/* Section 1: Investor Details */}
        {renderTable("১. বিনিয়োগকারীর তথ্য / Investor Details", rows)}

        {/* Section 2: Nominee */}
        {nomineeRows.length > 0 && renderTable("২. নমিনি তথ্য / Nominee Details", nomineeRows)}

        {/* Section 3: Contract Terms */}
        {renderTable(`${nomineeRows.length > 0 ? "৩" : "২"}. চুক্তির শর্তাবলী / Smart Contract Terms`, contractRows)}

        {/* Section 4: Terms & Conditions */}
        <div style={{ marginBottom: "16px", position: "relative", zIndex: 1 }}>
          <div style={{ background: "#0ea5e9", color: "#fff", padding: "6px 12px", fontSize: "12px", fontWeight: 700, borderRadius: "4px 4px 0 0" }}>
            {nomineeRows.length > 0 ? "৪" : "৩"}. শর্তাবলী / Terms & Conditions
          </div>
          <div style={{ padding: "10px 12px", fontSize: "11px", lineHeight: 1.7, color: "#334155", border: "1px solid #e2e8f0", borderTop: "none" }}>
            <p style={{ margin: "0 0 6px" }}>
              ক) মেয়াদপূর্তির আগে মূলধন উত্তোলন করলে জরিমানা প্রযোজ্য হবে (Anti-Loss Rule)।
            </p>
            <p style={{ margin: "0 0 6px" }}>
              খ) লভ্যাংশ প্রতি মাসের প্রথম সপ্তাহে প্রদান করা হবে।
            </p>
            <p style={{ margin: "0 0 6px" }}>
              গ) পুনঃবিনিয়োগ সক্রিয় থাকলে লভ্যাংশ স্বয়ংক্রিয়ভাবে মূলধনে যোগ হবে।
            </p>
            <p style={{ margin: "0 0 6px" }}>
              ঘ) উভয় পক্ষের সম্মতিতে এই চুক্তি সংশোধনযোগ্য।
            </p>
            <p style={{ margin: 0, fontStyle: "italic", color: "#64748b" }}>
              a) Pre-mature encashment is subject to penalty (Anti-Loss Rule). b) Dividends are paid in the first week of each month. c) If reinvestment is active, profits are auto-compounded. d) This agreement may be amended with mutual consent.
            </p>
          </div>
        </div>

        {/* Digital Seal */}
        <div style={{ position: "absolute", bottom: "48mm", right: "20mm", transform: "rotate(-8deg)", border: "3px solid #16a34a", borderRadius: "50%", width: "85px", height: "85px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#16a34a", fontWeight: 700, fontSize: "10px", lineHeight: 1.2, opacity: 0.7, zIndex: 1 }}>
          অনুমোদিত<br />APPROVED<br />✓
        </div>

        {/* Footer Signatures */}
        <div style={{ position: "absolute", bottom: "16mm", left: "16mm", right: "16mm", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #cbd5e1", paddingTop: "12px" }}>
            <div style={{ textAlign: "center", fontSize: "10px", color: "#64748b" }}>
              <div style={{ borderTop: "1px solid #1a1a1a", width: "130px", marginBottom: "4px" }} />
              বিনিয়োগকারীর স্বাক্ষর<br />Investor Signature
            </div>
            <div style={{ textAlign: "center", fontSize: "10px", color: "#64748b" }}>
              <div style={{ borderTop: "1px solid #1a1a1a", width: "130px", marginBottom: "4px" }} />
              অনুমোদিত স্বাক্ষর<br />Authorized Signature
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
          <p style={{ textAlign: "center", fontSize: "8px", color: "#94a3b8", marginTop: "4px" }}>
            একতা ফাইন্যান্স — স্বয়ংক্রিয়ভাবে তৈরি চুক্তিপত্র | এই ডকুমেন্ট আইনগত উদ্দেশ্যে ব্যবহারযোগ্য | {new Date().toISOString()}
          </p>
        </div>
      </div>

      {/* Visible button */}
      <Button onClick={generatePDF} disabled={loading} className="gap-2" size="sm" variant="outline">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        {loading ? (bn ? "যাচাই ও লেজার এন্ট্রি..." : "Validating & Recording...") : (bn ? "📄 চুক্তিপত্র (PDF)" : "📄 Agreement PDF")}
      </Button>
    </>
  );
}));

AgreementPDFTemplate.displayName = "AgreementPDFTemplate";

export default AgreementPDFTemplate;
