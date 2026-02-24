# Ekta Finance Group — Microfinance Management System

> Full-stack microfinance platform with blockchain-style document integrity, automated ledger auditing, and enterprise-grade RBAC.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — Auth, Database, Edge Functions, Storage
- **PDF Engine**: html2canvas + jsPDF + react-qr-code
- **Security**: SHA-256 hash chaining, RLS policies, RBAC

---

## Phase Summary

### Phase 1–3: Core Platform
- Client, Loan, Savings, Investor management with full CRUD
- Double-entry accounting (master_ledger + ledger_entries)
- Role-based access: Admin, Owner, Treasurer, Field Officer, Investor
- Notification system (SMS/WhatsApp ready via BulkSMSBD)
- Risk scoring, credit scores, commitment tracking

### Phase 4: Ultra PDF + Ledger Automation
- **SHA-256 Hash Chaining**: Every PDF links to the previous entry via `hash_self` / `hash_prev`
- **Dynamic Watermarks**: Client Name • Date • TxID overlaid on every document
- **Device Fingerprinting**: Browser/OS metadata logged with each ledger entry
- **Retry Logic**: Exponential backoff with randomized jitter (3 attempts, `baseDelay * 2^attempt + random`)
- **Embedded Metadata**: PDF properties include version tags (`v4|chain`), creator info, hash in subject field

### Phase 5: PDF & Ledger Supervision
- **QR Code Integration**: Chain hash metadata encoded in QR on every PDF (version `v5`)
- **Ledger Audit Dashboard** (`/ledger-audit`): KPI cards (Total/Intact/Broken), filter by type, re-verify button
- **Batch Chain Verification**: `verifyLedgerChain()` recalculates SHA-256 across all entries
- **Automated Audit Worker**: Edge function `ledger-audit` for scheduled integrity checks

### Phase 6: Deployment & Monitoring
- **Cron Schedule**: `pg_cron` runs `ledger-audit` every 12 hours
- **Edge Function**: Returns `{status, total, broken, brokenEntryIds, verifiedAt}`
- **Alerts**: Toast notifications on chain breaks; broken entries highlighted in UI

---

## Key Components

### PDF Templates
| Template | File | Features |
|----------|------|----------|
| Transaction Receipt | `src/components/TransactionReceiptTemplate.tsx` | SHA-256 hash, QR, dual watermark, Bengali+English |
| Investment Agreement | `src/components/AgreementPDFTemplate.tsx` | Chain hash QR, terms & conditions, nominee info |

### PDF Utilities (`src/lib/pdf-utils.ts`)
| Function | Purpose |
|----------|---------|
| `generateReceiptHash()` | SHA-256 from receipt number, date, amount, client |
| `generateAgreementHash()` | SHA-256 from investor ID, capital, rate, date |
| `generateChainHash()` | Combines current hash + prev hash + timestamp |
| `logPdfToLedger()` | Inserts into `event_sourcing` with chain linkage + retry |
| `verifyPdfHash()` | Checks individual entry hash + chain integrity |
| `verifyLedgerChain()` | Batch verification of entire chain (up to 500 entries) |
| `getDeviceFingerprint()` | Lightweight browser/OS fingerprint |

### Retry Logic (Exponential Backoff + Jitter)
```
Attempt 0: 500ms + random(0-500)ms
Attempt 1: 1000ms + random(0-500)ms
Attempt 2: 2000ms + random(0-500)ms
```
Jitter prevents thundering herd when multiple clients retry simultaneously.

### Edge Function: `ledger-audit`
- **Path**: `supabase/functions/ledger-audit/index.ts`
- **Schedule**: Every 12 hours via `pg_cron`
- **Auth**: Uses `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)
- **Response**: `{ status: "ok"|"warning", total, broken, brokenEntryIds, verifiedAt }`

### Ledger Audit UI (`/ledger-audit`)
- **Access**: Admin & Owner roles only
- **KPI Cards**: Total Entries, Intact Links, Broken Links
- **Filters**: All Types / Receipts / Agreements
- **Actions**: Re-verify button triggers full chain recalculation
- **Alerts**: Toast on broken chain detection; rows highlighted in red

---

## Deployment

### Frontend
Click **Publish** in Lovable to deploy frontend changes.

### Backend (Auto-deployed)
- Edge functions deploy automatically on code push
- Database migrations apply via Lovable Cloud

### Cron Verification
```sql
-- Check scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'ledger-audit-every-12h';

-- Check recent runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'ledger-audit-every-12h')
ORDER BY start_time DESC LIMIT 5;
```

---

## Security Architecture

- **RLS**: All tables enforce row-level security with `RESTRICTIVE` policies
- **RBAC**: Server-side role checks via `public.has_role()` security definer function
- **Hash Chain**: Tamper-evident document trail — modifying any historical PDF breaks the chain
- **Append-Only Ledger**: `event_sourcing` table with immutable entries
- **Device Tracking**: Browser fingerprint logged with every document generation
