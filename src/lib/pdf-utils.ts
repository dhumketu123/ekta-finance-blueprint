/**
 * PDF Utility Functions — Phase 5: Chain Hash QR, Audit, Verification
 * Blockchain-style immutable audit trail for all generated documents
 */

import { supabase } from "@/integrations/supabase/client";

// ─── SHA256 Hashing ───

export async function generateSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Receipt Hash ───

export async function generateReceiptHash(params: {
  receiptNumber: string;
  date: string;
  amount: number;
  clientName: string;
}): Promise<string> {
  const payload = `${params.receiptNumber}|${params.date}|${params.amount}|${params.clientName}`;
  return generateSHA256(payload);
}

// ─── Agreement Hash ───

export async function generateAgreementHash(params: {
  investorId: string;
  capital: number;
  profitRate: number;
  date: string;
}): Promise<string> {
  const payload = `${params.investorId}|${params.capital}|${params.profitRate}|${params.date}`;
  return generateSHA256(payload);
}

// ─── Device/Browser Fingerprint (lightweight, no external lib) ───

export function getDeviceFingerprint(): string {
  try {
    const nav = navigator;
    const screen = window.screen;
    const parts = [
      nav.userAgent,
      nav.language,
      `${screen.width}x${screen.height}`,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      nav.hardwareConcurrency?.toString() || "unknown",
    ];
    return parts.join("|");
  } catch {
    return "unknown-device";
  }
}

// ─── Fetch Previous Hash for Chain Linkage ───

async function fetchPreviousHash(entityType: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("event_sourcing")
      .select("hash_self")
      .eq("entity_type", entityType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data.hash_self || null;
  } catch {
    return null;
  }
}

// ─── Generate Chain Hash (current_hash + prev_hash + timestamp) ───

export async function generateChainHash(params: {
  currentHash: string;
  prevHash: string | null;
  timestamp: string;
}): Promise<string> {
  const payload = `${params.currentHash}|${params.prevHash || "GENESIS"}|${params.timestamp}`;
  return generateSHA256(payload);
}

// ─── Exponential Backoff Retry with Jitter ───

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Exponential backoff + random jitter to avoid thundering herd
        const exponential = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * baseDelay;
        const delay = exponential + jitter;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── Log PDF to Ledger (with chain hash + retry + device fingerprint) ───

export async function logPdfToLedger(params: {
  entityId: string;
  entityType: "receipt" | "agreement";
  pdfHash: string;
  metadata: Record<string, unknown>;
  userId?: string;
}): Promise<{ success: boolean; error?: string; chainHash?: string }> {
  const fullEntityType = `pdf_${params.entityType}`;
  const timestamp = new Date().toISOString();
  const deviceFingerprint = getDeviceFingerprint();

  try {
    // Fetch previous hash for chain linkage
    const prevHash = await fetchPreviousHash(fullEntityType);

    // Generate blockchain-style chain hash
    const chainHash = await generateChainHash({
      currentHash: params.pdfHash,
      prevHash,
      timestamp,
    });

    // Insert with retry
    await retryWithBackoff(async () => {
      const { error } = await supabase.from("event_sourcing").insert({
        entity_id: params.entityId,
        entity_type: fullEntityType,
        action: "pdf_generated",
        payload: {
          hash: params.pdfHash,
          chain_hash: chainHash,
          prev_hash: prevHash || "GENESIS",
          generated_at: timestamp,
          device: deviceFingerprint,
          version: "4.0",
          ...params.metadata,
        },
        performed_by: params.userId || null,
        hash_self: chainHash,
        hash_prev: prevHash || null,
      });
      if (error) throw error;
    });

    return { success: true, chainHash };
  } catch (err: any) {
    console.error("Ledger logging failed after retries:", err);
    return { success: false, error: err.message };
  }
}

// ─── Verify PDF Hash Against Ledger ───

export async function verifyPdfHash(
  entityId: string,
  expectedHash: string
): Promise<{ valid: boolean; chainIntact: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("event_sourcing")
      .select("payload, hash_self, hash_prev")
      .eq("entity_id", entityId)
      .eq("action", "pdf_generated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { valid: false, chainIntact: false, error: "Ledger entry not found" };
    }

    const payload = data.payload as Record<string, any>;
    const hashMatch = payload?.hash === expectedHash;

    // Verify chain integrity: recalculate chain hash
    let chainIntact = true;
    if (data.hash_self && payload?.chain_hash) {
      const recalculated = await generateChainHash({
        currentHash: payload.hash,
        prevHash: payload.prev_hash || null,
        timestamp: payload.generated_at,
      });
      chainIntact = recalculated === data.hash_self;
    }

    return { valid: hashMatch, chainIntact };
  } catch (err: any) {
    return { valid: false, chainIntact: false, error: err.message };
  }
}

// ─── Batch Chain Verification (for Audit UI) ───

export async function verifyLedgerChain(
  entityType?: string
): Promise<{
  totalEntries: number;
  brokenLinks: number;
  entries: Array<{
    id: string;
    entity_id: string;
    entity_type: string;
    created_at: string;
    hash_self: string | null;
    hash_prev: string | null;
    chainIntact: boolean;
    payload: Record<string, any>;
  }>;
}> {
  try {
    let query = supabase
      .from("event_sourcing")
      .select("id, entity_id, entity_type, created_at, hash_self, hash_prev, payload, performed_by")
      .eq("action", "pdf_generated")
      .order("created_at", { ascending: true });

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    const { data, error } = await query.limit(500);
    if (error || !data) return { totalEntries: 0, brokenLinks: 0, entries: [] };

    let brokenLinks = 0;
    const entries = [];

    for (let i = 0; i < data.length; i++) {
      const entry = data[i];
      const payload = entry.payload as Record<string, any>;
      let chainIntact = true;

      // First entry: prev should be null/GENESIS
      if (i === 0) {
        chainIntact = !entry.hash_prev || entry.hash_prev === null;
      } else {
        // Check prev hash links to previous entry's self hash
        const prevEntry = data[i - 1];
        if (entry.hash_prev !== prevEntry.hash_self) {
          chainIntact = false;
          brokenLinks++;
        }
      }

      // Verify self hash integrity
      if (chainIntact && entry.hash_self && payload?.hash && payload?.generated_at) {
        const recalculated = await generateChainHash({
          currentHash: payload.hash,
          prevHash: payload.prev_hash || null,
          timestamp: payload.generated_at,
        });
        if (recalculated !== entry.hash_self) {
          chainIntact = false;
          brokenLinks++;
        }
      }

      entries.push({
        id: entry.id,
        entity_id: entry.entity_id,
        entity_type: entry.entity_type,
        created_at: entry.created_at,
        hash_self: entry.hash_self,
        hash_prev: entry.hash_prev,
        chainIntact,
        payload,
      });
    }

    return { totalEntries: entries.length, brokenLinks, entries: entries.reverse() };
  } catch (err) {
    console.error("Chain verification failed:", err);
    return { totalEntries: 0, brokenLinks: 0, entries: [] };
  }
}
