/**
 * PDF Utility Functions — Phase 3: Security & Integrity
 * SHA256 hashing, ledger logging, and PDF generation helpers
 */

/**
 * Generate SHA256 hash from string data (browser-native crypto)
 */
export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate receipt hash from transaction data
 */
export async function generateReceiptHash(params: {
  receiptNumber: string;
  date: string;
  amount: number;
  clientName: string;
}): Promise<string> {
  const payload = `${params.receiptNumber}|${params.date}|${params.amount}|${params.clientName}`;
  return generateSHA256(payload);
}

/**
 * Generate agreement hash from investor data
 */
export async function generateAgreementHash(params: {
  investorId: string;
  capital: number;
  profitRate: number;
  date: string;
}): Promise<string> {
  const payload = `${params.investorId}|${params.capital}|${params.profitRate}|${params.date}`;
  return generateSHA256(payload);
}

/**
 * Log PDF generation event to event_sourcing ledger
 */
export async function logPdfToLedger(params: {
  entityId: string;
  entityType: "receipt" | "agreement";
  pdfHash: string;
  metadata: Record<string, unknown>;
  userId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    
    const { error } = await supabase.from("event_sourcing").insert({
      entity_id: params.entityId,
      entity_type: `pdf_${params.entityType}`,
      action: "pdf_generated",
      payload: {
        hash: params.pdfHash,
        generated_at: new Date().toISOString(),
        ...params.metadata,
      },
      performed_by: params.userId || null,
    });

    if (error) {
      console.error("Ledger logging failed:", error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error("Ledger logging failed:", err);
    return { success: false, error: err.message };
  }
}
