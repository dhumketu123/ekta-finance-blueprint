
-- ═══════════════════════════════════════
-- PHASE 1: Double-Entry Ledger Table
-- ═══════════════════════════════════════

CREATE TABLE public.double_entry_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  reference_type text NOT NULL,
  reference_id uuid,
  account_type text NOT NULL,
  account_id uuid NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  narration text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,

  CONSTRAINT chk_debit_non_negative CHECK (debit >= 0),
  CONSTRAINT chk_credit_non_negative CHECK (credit >= 0),
  CONSTRAINT chk_no_dual_entry CHECK (debit = 0 OR credit = 0),
  CONSTRAINT chk_has_entry CHECK (debit > 0 OR credit > 0)
);

-- Idempotency: prevent duplicate operations
CREATE UNIQUE INDEX idx_del_idempotent 
  ON public.double_entry_ledger(reference_type, reference_id, account_id, debit, credit)
  WHERE reference_id IS NOT NULL;

-- Query indexes
CREATE INDEX idx_del_tenant_account ON public.double_entry_ledger(tenant_id, account_id);
CREATE INDEX idx_del_ref ON public.double_entry_ledger(reference_type, reference_id);
CREATE INDEX idx_del_created ON public.double_entry_ledger(created_at DESC);
CREATE INDEX idx_del_account_type ON public.double_entry_ledger(account_type, account_id);

-- ═══════════════════════════════════════
-- PHASE 2: Account Balances (Materialized)
-- ═══════════════════════════════════════

CREATE TABLE public.account_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  account_type text NOT NULL,
  account_id uuid NOT NULL,
  balance numeric NOT NULL DEFAULT 0,
  last_entry_id uuid REFERENCES public.double_entry_ledger(id),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_account_balance UNIQUE (tenant_id, account_type, account_id)
);

CREATE INDEX idx_ab_tenant ON public.account_balances(tenant_id);
CREATE INDEX idx_ab_account ON public.account_balances(account_type, account_id);

-- Enable RLS
ALTER TABLE public.double_entry_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
