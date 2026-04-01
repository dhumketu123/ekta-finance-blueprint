import jsPDF from "jspdf";
import { format } from "date-fns";

interface ExitMouData {
  ownerName: string;
  ownerNameBn: string;
  ownerId: string;
  phone: string;
  exitDate: string;
  tenureDays: number;
  totalCapital: number;
  totalProfitEarned: number;
  accruedProfit?: number;
  earlyExitPenalty: number;
  loyaltyBonus: number;
  finalPayout: number;
  nonCompeteMonths: number;
}

export const generateExitMouPdf = async (data: ExitMouData): Promise<Blob> => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 20;

  const addLine = (thickness = 0.3) => {
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(thickness);
    doc.line(margin, y, pageW - margin, y);
    y += 4;
  };

  const addText = (text: string, size: number, style: "normal" | "bold" = "normal", align: "left" | "center" = "left") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    const x = align === "center" ? pageW / 2 : margin;
    doc.text(text, x, y, { align });
    y += size * 0.5 + 2;
  };

  const addKeyValue = (key: string, value: string) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(key, margin, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + 55, y);
    y += 6;
  };

  // Header
  doc.setTextColor(30, 60, 120);
  addText("EXIT MEMORANDUM & NOC", 18, "bold", "center");
  doc.setTextColor(100, 100, 100);
  addText("Confidential — Equity Partner Settlement Document", 9, "normal", "center");
  y += 2;
  addLine(0.5);

  // Document Info
  doc.setTextColor(0, 0, 0);
  addText("DOCUMENT REFERENCE", 11, "bold");
  y += 1;
  addKeyValue("Document No:", `EXM-${data.ownerId}-${Date.now().toString(36).toUpperCase()}`);
  addKeyValue("Issue Date:", format(new Date(data.exitDate), "dd MMMM yyyy"));
  addKeyValue("Effective Date:", format(new Date(data.exitDate), "dd MMMM yyyy"));
  y += 3;
  addLine();

  // Party Details
  addText("PARTY DETAILS", 11, "bold");
  y += 1;
  addKeyValue("Full Name:", data.ownerName);
  addKeyValue("Partner ID:", data.ownerId);
  addKeyValue("Contact:", data.phone || "N/A");
  addKeyValue("Tenure:", `${data.tenureDays} days (${(data.tenureDays / 365).toFixed(1)} years)`);
  y += 3;
  addLine();

  // Financial Settlement
  addText("FINANCIAL SETTLEMENT", 11, "bold");
  y += 1;
  addKeyValue("Total Capital:", `BDT ${data.totalCapital.toLocaleString()}`);
  addKeyValue("Total Profit Earned:", `BDT ${data.totalProfitEarned.toLocaleString()}`);
  if (data.accruedProfit && data.accruedProfit > 0) {
    addKeyValue("Accrued Profit (Pro-Rata):", `BDT ${data.accruedProfit.toLocaleString()}`);
  }
  addKeyValue("Gross Settlement:", `BDT ${(data.totalCapital + data.totalProfitEarned + (data.accruedProfit || 0)).toLocaleString()}`);

  if (data.earlyExitPenalty > 0) {
    doc.setTextColor(180, 50, 50);
    addKeyValue("Early Exit Penalty:", `(-) BDT ${data.earlyExitPenalty.toLocaleString()}`);
    doc.setTextColor(0, 0, 0);
  }
  if (data.loyaltyBonus > 0) {
    doc.setTextColor(50, 130, 50);
    addKeyValue("Loyalty Bonus:", `(+) BDT ${data.loyaltyBonus.toLocaleString()}`);
    doc.setTextColor(0, 0, 0);
  }

  y += 2;
  doc.setFillColor(240, 245, 255);
  doc.roundedRect(margin, y - 3, contentW, 12, 2, 2, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 60, 120);
  doc.text("FINAL PAYOUT:", margin + 5, y + 4);
  doc.text(`BDT ${data.finalPayout.toLocaleString()}`, pageW - margin - 5, y + 4, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 16;
  addLine();

  // Clauses
  addText("TERMS & CONDITIONS", 11, "bold");
  y += 1;

  const clauses = [
    `1. ROLE TRANSITION: The exiting partner's system access shall be transitioned to "Alumni" status, granting read-only access to historical transaction records and dividend reports only.`,
    `2. NON-COMPETE: The exiting partner agrees to a ${data.nonCompeteMonths}-month non-compete period from the effective date, during which they shall not engage in directly competing financial services within the operational geography.`,
    `3. CONFIDENTIALITY: All proprietary business information, client data, financial algorithms, and operational procedures remain strictly confidential in perpetuity.`,
    `4. NOC (No Objection Certificate): The Company hereby certifies that the exiting partner has fulfilled all financial obligations and there are no outstanding claims against them as of the effective date.`,
    `5. INDEMNIFICATION: Both parties mutually release and discharge each other from any claims, demands, or liabilities arising from the partnership, effective from the settlement date.`,
    `6. DISPUTE RESOLUTION: Any disputes arising from this memorandum shall be resolved through arbitration under the laws of Bangladesh.`,
  ];

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  clauses.forEach((clause) => {
    const lines = doc.splitTextToSize(clause, contentW);
    if (y + lines.length * 4 > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, margin, y);
    y += lines.length * 4 + 3;
  });

  y += 5;
  addLine();

  // Signatures
  if (y + 40 > 270) {
    doc.addPage();
    y = 20;
  }
  addText("SIGNATURES", 11, "bold");
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("____________________________", margin, y);
  doc.text("____________________________", pageW - margin - 55, y);
  y += 5;
  doc.text("Exiting Partner", margin, y);
  doc.text("Authorized Signatory", pageW - margin - 55, y);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(data.ownerName, margin, y);
  doc.text("Company Representative", pageW - margin - 55, y);
  y += 8;

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Generated electronically on ${format(new Date(), "dd MMM yyyy, HH:mm:ss")} — This document is system-generated and valid without physical signature.`,
    pageW / 2,
    285,
    { align: "center" }
  );

  return doc.output("blob");
};
