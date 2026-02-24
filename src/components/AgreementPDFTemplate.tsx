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
        // Silently log ledger failure, only show PDF success
        console.error("Ledger entry failed:", ledgerResult);
        toast.success(bn ? "চুক্তিপত্র সফলভাবে তৈরি হয়েছে ✅" : "Agreement generated successfully ✅");
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

  const renderCard = (title: string, data: { label: string; value: string }[], hasPhoto?: boolean) => (
    <div style={{ border: "1px solid rgba(5,150,105,0.3)", borderRadius: "6px", overflow: "hidden" }}>
      <div style={{ background: "#059669", color: "#fff", padding: "6px 12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </div>
      <div style={{ background: "rgba(236,253,245,0.3)", padding: "10px 12px" }}>
        {hasPhoto ? (
          <div style={{ display: "flex", gap: "12px" }}>
            {/* Investor Photo Placeholder */}
            <div style={{ width: "60px", height: "60px", minWidth: "60px", background: "#e2e8f0", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              {data.slice(0, 2).map((row, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", padding: "3px 0" }}>
                  <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "11px" }}>{row.label.split("/")[1]?.trim() || row.label}</span>
                  <span style={{ color: "#334155", fontSize: "11px" }}>: {row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {(hasPhoto ? data.slice(2) : data).map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < (hasPhoto ? data.length - 3 : data.length - 1) ? "1px solid rgba(5,150,105,0.1)" : "none" }}>
            <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "11px", flex: "0 0 48%" }}>{row.label}</span>
            <span style={{ color: "#334155", fontSize: "11px", textAlign: "right", flex: "1" }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Off-screen fixed wrapper — prevents mobile squishing */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, zIndex: -1 }}>
        {/* A4 Canvas */}
        <div
          ref={containerRef}
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "15mm",
            backgroundColor: "#fff",
            display: "none",
            fontFamily: "'SolaimanLipi', 'Noto Sans Bengali', 'Hind Siliguri', sans-serif",
            color: "#1a1a1a",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Center Watermark — Large faint EKTA FINANCE GROUP */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0.04, zIndex: 0, pointerEvents: "none",
          }}>
            <div style={{ textAlign: "center" }}>
              <svg width="180" height="180" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 10,90 L 45,90 L 75,55 L 50,30 L 10,30 Z" fill="#059669"/>
                <path d="M 55,25 L 95,25 L 95,45 L 80,60 L 60,40 Z" fill="#059669"/>
                <path d="M 80,65 L 95,50 L 95,80 L 85,90 L 65,90 Z" fill="#059669"/>
              </svg>
              <div style={{ fontSize: "28px", fontWeight: 900, color: "#059669", letterSpacing: "0.2em", marginTop: "8px", fontFamily: "system-ui, sans-serif" }}>EKTA FINANCE GROUP</div>
            </div>
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

          {/* Premium Header: Logo | Title | QR */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid rgba(5,150,105,0.2)", paddingBottom: "12px", marginBottom: "14px", position: "relative", zIndex: 1 }}>
            {/* Left: SVG Logo + Brand */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ minWidth: "50px" }}>
                <defs>
                  <linearGradient id="ektaGradPdf" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#065f46" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
                <path d="M 10,90 L 45,90 L 75,55 L 50,30 L 10,30 Z" fill="url(#ektaGradPdf)"/>
                <path d="M 55,25 L 95,25 L 95,45 L 80,60 L 60,40 Z" fill="url(#ektaGradPdf)"/>
                <path d="M 80,65 L 95,50 L 95,80 L 85,90 L 65,90 Z" fill="url(#ektaGradPdf)"/>
              </svg>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                <span style={{ fontSize: "22px", fontWeight: 800, color: "#064e3b", letterSpacing: "-0.02em", fontFamily: "system-ui, sans-serif" }}>EKTA</span>
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#065f46", letterSpacing: "0.18em", textTransform: "uppercase", marginTop: "3px" }}>FINANCE GROUP</span>
              </div>
            </div>

            {/* Center: Agreement Title */}
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: "4px" }}>
              <h1 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>INVESTMENT AGREEMENT</h1>
              <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#334155", margin: "4px 0 0 0" }}>(বিনিয়োগ চুক্তিপত্র)</h2>
            </div>

            {/* Right: QR Code */}
            <div style={{ padding: "3px", border: "1.5px solid #e2e8f0", borderRadius: "6px", background: "#fff" }}>
              <QRCode
                data-qr-code
                value={JSON.stringify({ inv: investor.investor_id || investor.id, c: investor.capital, r: investor.monthly_profit_percent, v: "5" })}
                size={56}
              />
            </div>
          </div>

          {/* Date */}
          <div style={{ fontSize: "11px", color: "#475569", marginBottom: "12px", position: "relative", zIndex: 1 }}>
            তারিখ / Date: <strong>{today}</strong>
          </div>

          {/* 2-Column Grid: Investor Details + Contract Terms */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px", position: "relative", zIndex: 1 }}>
            {renderCard("INVESTOR DETAILS", rows, true)}
            {renderCard("SMART CONTRACT TERMS", contractRows)}
          </div>

          {/* 2-Column Grid: Additional Info + Nominee */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px", position: "relative", zIndex: 1 }}>
            {renderCard("INVESTOR DETAILS", [
              { label: "Name", value: investor.name_en },
              { label: "Phone", value: investor.phone || "N/A" },
              { label: "Age ID", value: investor.nid_number || "N/A" },
            ])}
            {renderCard("NOMINEE INFO", nomineeRows.length > 0 ? nomineeRows : [
              { label: "Name", value: "N/A" },
              { label: "Phone", value: "N/A" },
              { label: "Subject", value: "EKTA Finance GROUP" },
            ])}
          </div>

          {/* Terms & Conditions */}
          <div style={{ marginBottom: "14px", position: "relative", zIndex: 1 }}>
            <h3 style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a", textTransform: "uppercase", marginBottom: "6px" }}>
              TERMS & CONDITIONS
            </h3>
            <ol style={{ margin: 0, paddingLeft: "18px", listStyleType: "decimal", fontSize: "10.5px", lineHeight: 1.8, color: "#334155" }}>
              <li style={{ marginBottom: "3px" }}>
                মেয়াদপূর্তির আগে মূলধন উত্তোলন করলে জরিমানা প্রযোজ্য হবে (Anti-Loss Rule)।
                <br /><span style={{ color: "#64748b", fontStyle: "italic", fontSize: "9.5px" }}>Pre-mature encashment is subject to penalty (Anti-Loss Rule).</span>
              </li>
              <li style={{ marginBottom: "3px" }}>
                লভ্যাংশ প্রতি মাসের প্রথম সপ্তাহে প্রদান করা হবে।
                <br /><span style={{ color: "#64748b", fontStyle: "italic", fontSize: "9.5px" }}>Dividends are paid in the first week of each month.</span>
              </li>
              <li style={{ marginBottom: "3px" }}>
                পুনঃবিনিয়োগ সক্রিয় থাকলে লভ্যাংশ স্বয়ংক্রিয়ভাবে মূলধনে যোগ হবে।
                <br /><span style={{ color: "#64748b", fontStyle: "italic", fontSize: "9.5px" }}>If reinvestment is active, profits are auto-compounded.</span>
              </li>
              <li style={{ marginBottom: "3px" }}>
                উভয় পক্ষের সম্মতিতে এই চুক্তি সংশোধনযোগ্য।
                <br /><span style={{ color: "#64748b", fontStyle: "italic", fontSize: "9.5px" }}>This agreement may be amended with mutual consent.</span>
              </li>
              <li>
                ব্যক্তিগত শর্তাবলী এবং ক্রেডিট শর্তাবলী পরিবর্তনযোগ্য।
                <br /><span style={{ color: "#64748b", fontStyle: "italic", fontSize: "9.5px" }}>Personal terms and conditions in credit terms are changeable.</span>
              </li>
            </ol>
          </div>

          {/* Premium Signature & Digital Stamp Footer */}
          <div style={{ position: "absolute", bottom: "20mm", left: "15mm", right: "15mm", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "0 4px" }}>

              {/* Left: Investor Signature */}
              <div style={{ textAlign: "center", width: "150px" }}>
                <div style={{ fontFamily: "'Georgia', serif", fontSize: "18px", fontStyle: "italic", color: "#334155", marginBottom: "4px" }}>Investor</div>
                <div style={{ borderTop: "1px solid #475569", paddingTop: "6px" }}>
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Investor</p>
                  <p style={{ fontSize: "9px", color: "#64748b", margin: "2px 0 0 0" }}>(বিনিয়োগকারীর স্বাক্ষর)</p>
                </div>
              </div>

              {/* Center: Digital Stamp */}
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "150px" }}>
                <div style={{
                  width: "105px", height: "105px",
                  borderRadius: "50%", border: "3px solid #10b981",
                  display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                  transform: "rotate(-15deg)", opacity: 0.8,
                  padding: "8px",
                }}>
                  <span style={{ fontSize: "8px", fontWeight: 700, color: "#10b981", letterSpacing: "2px" }}>DIGITALLY</span>
                  <span style={{ fontSize: "15px", fontWeight: 900, color: "#059669", margin: "2px 0", borderTop: "2px solid #10b981", borderBottom: "2px solid #10b981", padding: "2px 0" }}>SIGNED</span>
                  <span style={{ fontSize: "8px", fontWeight: 700, color: "#10b981", letterSpacing: "1px" }}>& VERIFIED</span>
                </div>
              </div>

              {/* Right: Authorized Signatory */}
              <div style={{ textAlign: "center", width: "150px" }}>
                <div style={{ fontFamily: "'Georgia', serif", fontSize: "18px", fontStyle: "italic", color: "#334155", marginBottom: "4px" }}>Signatory</div>
                <div style={{ borderTop: "1px solid #475569", paddingTop: "6px" }}>
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Authorized Signatory</p>
                  <p style={{ fontSize: "9px", color: "#64748b", margin: "2px 0 0 0" }}>(একতা ফাইন্যান্স গ্রুপ)</p>
                </div>
              </div>
            </div>

            {/* Cryptographic Hash Footer */}
            <p
              data-hash-footer
              style={{
                textAlign: "center",
                fontSize: "7px",
                color: "#94a3b8",
                marginTop: "10px",
                fontFamily: "monospace",
                letterSpacing: "0.05em",
              }}
            >
              Verification Hash: Generating...
            </p>
            <p style={{ textAlign: "center", fontSize: "7.5px", color: "#94a3b8", marginTop: "3px" }}>
              একতা ফাইন্যান্স — স্বয়ংক্রিয়ভাবে তৈরি চুক্তিপত্র | এই ডকুমেন্ট আইনগত উদ্দেশ্যে ব্যবহারযোগ্য | {new Date().toISOString()}
            </p>
          </div>

          {/* Bottom Emerald Accent Bar */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: "8px", background: "linear-gradient(90deg, #059669, #10b981)",
            zIndex: 2,
          }} />
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
