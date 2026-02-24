/**
 * Unit tests for PDF utility functions — Phase 6 regression suite
 * Tests: SHA-256 hashing, chain hash generation, receipt/agreement hash, retry logic
 */
import { describe, it, expect, vi } from "vitest";

// We test the pure crypto functions directly since they use Web Crypto API (available in jsdom)
// For Supabase-dependent functions, we mock the client

// ─── SHA-256 Hashing ───

describe("generateSHA256", () => {
  it("produces a 64-character hex string", async () => {
    const { generateSHA256 } = await import("../pdf-utils");
    const hash = await generateSHA256("test-data");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces deterministic output for same input", async () => {
    const { generateSHA256 } = await import("../pdf-utils");
    const hash1 = await generateSHA256("ekta-finance-receipt-001");
    const hash2 = await generateSHA256("ekta-finance-receipt-001");
    expect(hash1).toBe(hash2);
  });

  it("produces different output for different input", async () => {
    const { generateSHA256 } = await import("../pdf-utils");
    const hash1 = await generateSHA256("receipt-001");
    const hash2 = await generateSHA256("receipt-002");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", async () => {
    const { generateSHA256 } = await import("../pdf-utils");
    const hash = await generateSHA256("");
    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is well-known
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("handles unicode/Bengali text", async () => {
    const { generateSHA256 } = await import("../pdf-utils");
    const hash = await generateSHA256("একতা ফাইন্যান্স গ্রুপ");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── Receipt Hash ───

describe("generateReceiptHash", () => {
  it("generates hash from receipt params", async () => {
    const { generateReceiptHash } = await import("../pdf-utils");
    const hash = await generateReceiptHash({
      receiptNumber: "REC-001",
      date: "2026-02-24",
      amount: 5000,
      clientName: "Rahim Uddin",
    });
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same params", async () => {
    const { generateReceiptHash } = await import("../pdf-utils");
    const params = { receiptNumber: "REC-002", date: "2026-01-15", amount: 10000, clientName: "Karim" };
    const h1 = await generateReceiptHash(params);
    const h2 = await generateReceiptHash(params);
    expect(h1).toBe(h2);
  });

  it("differs when amount changes", async () => {
    const { generateReceiptHash } = await import("../pdf-utils");
    const base = { receiptNumber: "REC-003", date: "2026-01-15", clientName: "Fatima" };
    const h1 = await generateReceiptHash({ ...base, amount: 5000 });
    const h2 = await generateReceiptHash({ ...base, amount: 5001 });
    expect(h1).not.toBe(h2);
  });
});

// ─── Agreement Hash ───

describe("generateAgreementHash", () => {
  it("generates hash from investor params", async () => {
    const { generateAgreementHash } = await import("../pdf-utils");
    const hash = await generateAgreementHash({
      investorId: "INV-001",
      capital: 500000,
      profitRate: 2.5,
      date: "2026-02-24",
    });
    expect(hash).toHaveLength(64);
  });

  it("differs when capital changes", async () => {
    const { generateAgreementHash } = await import("../pdf-utils");
    const base = { investorId: "INV-002", profitRate: 3, date: "2026-01-01" };
    const h1 = await generateAgreementHash({ ...base, capital: 100000 });
    const h2 = await generateAgreementHash({ ...base, capital: 200000 });
    expect(h1).not.toBe(h2);
  });
});

// ─── Chain Hash ───

describe("generateChainHash", () => {
  it("generates chain hash from current + prev + timestamp", async () => {
    const { generateChainHash } = await import("../pdf-utils");
    const chainHash = await generateChainHash({
      currentHash: "abc123",
      prevHash: "def456",
      timestamp: "2026-02-24T12:00:00Z",
    });
    expect(chainHash).toHaveLength(64);
  });

  it("uses GENESIS when prevHash is null", async () => {
    const { generateChainHash, generateSHA256 } = await import("../pdf-utils");
    const chainHash = await generateChainHash({
      currentHash: "abc123",
      prevHash: null,
      timestamp: "2026-02-24T12:00:00Z",
    });
    // Should match SHA256 of "abc123|GENESIS|2026-02-24T12:00:00Z"
    const expected = await generateSHA256("abc123|GENESIS|2026-02-24T12:00:00Z");
    expect(chainHash).toBe(expected);
  });

  it("chain changes when prevHash changes (tamper detection)", async () => {
    const { generateChainHash } = await import("../pdf-utils");
    const ts = "2026-02-24T12:00:00Z";
    const h1 = await generateChainHash({ currentHash: "abc", prevHash: "legit-hash", timestamp: ts });
    const h2 = await generateChainHash({ currentHash: "abc", prevHash: "tampered-hash", timestamp: ts });
    expect(h1).not.toBe(h2);
  });

  it("chain changes when timestamp changes", async () => {
    const { generateChainHash } = await import("../pdf-utils");
    const h1 = await generateChainHash({ currentHash: "abc", prevHash: "def", timestamp: "2026-02-24T12:00:00Z" });
    const h2 = await generateChainHash({ currentHash: "abc", prevHash: "def", timestamp: "2026-02-24T13:00:00Z" });
    expect(h1).not.toBe(h2);
  });
});

// ─── Device Fingerprint ───

describe("getDeviceFingerprint", () => {
  it("returns a non-empty string", async () => {
    const { getDeviceFingerprint } = await import("../pdf-utils");
    const fp = getDeviceFingerprint();
    expect(fp).toBeTruthy();
    expect(typeof fp).toBe("string");
  });

  it("contains pipe-separated segments", async () => {
    const { getDeviceFingerprint } = await import("../pdf-utils");
    const fp = getDeviceFingerprint();
    const parts = fp.split("|");
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});
