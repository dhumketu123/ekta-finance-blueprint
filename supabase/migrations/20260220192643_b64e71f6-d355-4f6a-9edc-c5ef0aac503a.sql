
-- ============================================================
-- PHASE 1: CORE LEDGER ENGINE (FOUNDATION)
-- Branch-aware, immutable, double-entry accounting core
-- Existing master_ledger & functions remain UNTOUCHED
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. ENUM TYPES
-- ──────────────────────────────────────────────────────────────
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'income', 'expense', 'equity');
CREATE TYPE public.entry_type AS ENUM ('debit', 'credit');

-- ──────────────────────────────────────────────────────────────
-- 2. BRANCHES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  code text NOT NULL UNIQUE,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access branches"
  ON public.branches FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Authenticated can view active branches"
  ON public.branches FOR SELECT
  USING (is_active = true);

CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────────────────────────
-- 3. ACCOUNTS (Chart of Accounts) TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  name text NOT NULL,
  name_bn text NOT NULL DEFAULT '',
  account_type public.account_type NOT NULL,
  parent_account_id uuid REFERENCES public.accounts(id),
  account_code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, account_code)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access accounts"
  ON public.accounts FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Authenticated view active accounts"
  ON public.accounts FOR SELECT
  USING (is_active = true);

CREATE POLICY "Treasurer view accounts"
  ON public.accounts FOR SELECT
  USING (public.is_treasurer());

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_accounts_branch ON public.accounts(branch_id);
CREATE INDEX idx_accounts_type ON public.accounts(account_type);

-- ──────────────────────────────────────────────────────────────
-- 4. MASTER LEDGER V2 (Branch-aware, immutable)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE public.ledger_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  transaction_group_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  account_type public.account_type NOT NULL,
  entry_type public.entry_type NOT NULL,
  amount numeric NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid,
  narration text,
  is_reversal boolean NOT NULL DEFAULT false,
  original_group_id uuid,  -- for reversals, references original transaction_group_id
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_amount_positive CHECK (amount > 0)
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/owner full access ledger_entries"
  ON public.ledger_entries FOR ALL
  USING (public.is_admin_or_owner());

CREATE POLICY "Treasurer view ledger_entries"
  ON public.ledger_entries FOR SELECT
  USING (public.is_treasurer());

-- Performance indexes
CREATE INDEX idx_ledger_branch ON public.ledger_entries(branch_id);
CREATE INDEX idx_ledger_txn_group ON public.ledger_entries(transaction_group_id);
CREATE INDEX idx_ledger_account ON public.ledger_entries(account_id);
CREATE INDEX idx_ledger_reference ON public.ledger_entries(reference_type, reference_id);
CREATE INDEX idx_ledger_created_at ON public.ledger_entries(created_at);
CREATE INDEX idx_ledger_original_group ON public.ledger_entries(original_group_id) WHERE original_group_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 5. IMMUTABILITY TRIGGER (No UPDATE, No DELETE on ledger_entries)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_ledger_v2_modification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable — cannot be modified';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger entries are immutable — cannot be deleted';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER prevent_ledger_entries_edit
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_v2_modification();

-- ──────────────────────────────────────────────────────────────
-- 6. CORE ENGINE: create_ledger_entry()
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_ledger_entry(
  _branch_id uuid,
  _reference_type text,
  _reference_id uuid,
  _entries jsonb,  -- array of {account_id, account_type, entry_type, amount, narration?}
  _created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _txn_group_id uuid;
  _entry jsonb;
  _total_debit numeric := 0;
  _total_credit numeric := 0;
  _entry_count integer := 0;
  _has_debit boolean := false;
  _has_credit boolean := false;
  _acct_id uuid;
  _acct_branch uuid;
  _acct_active boolean;
  _amt numeric;
  _etype text;
  _atype text;
  _narr text;
  _caller uuid;
BEGIN
  -- Resolve caller
  _caller := COALESCE(_created_by, auth.uid());
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'created_by is required';
  END IF;

  -- Validate branch exists and is active
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _branch_id AND is_active = true) THEN
    RAISE EXCEPTION 'Branch not found or inactive: %', _branch_id;
  END IF;

  -- Validate entries is a non-empty array
  IF _entries IS NULL OR jsonb_array_length(_entries) < 2 THEN
    RAISE EXCEPTION 'At least 2 entries (1 debit + 1 credit) required';
  END IF;

  -- Generate transaction group ID
  _txn_group_id := gen_random_uuid();

  -- Validate and process each entry
  FOR _entry IN SELECT * FROM jsonb_array_elements(_entries)
  LOOP
    _acct_id := (_entry->>'account_id')::uuid;
    _etype := _entry->>'entry_type';
    _atype := _entry->>'account_type';
    _amt := (_entry->>'amount')::numeric;
    _narr := _entry->>'narration';

    -- Validate amount
    IF _amt IS NULL OR _amt <= 0 THEN
      RAISE EXCEPTION 'Amount must be > 0, got: %', _amt;
    END IF;

    -- Validate entry_type
    IF _etype NOT IN ('debit', 'credit') THEN
      RAISE EXCEPTION 'Invalid entry_type: %. Must be debit or credit', _etype;
    END IF;

    -- Validate account_type
    IF _atype NOT IN ('asset', 'liability', 'income', 'expense', 'equity') THEN
      RAISE EXCEPTION 'Invalid account_type: %', _atype;
    END IF;

    -- Validate account exists, belongs to branch, and is active
    SELECT a.branch_id, a.is_active INTO _acct_branch, _acct_active
    FROM public.accounts a WHERE a.id = _acct_id;

    IF _acct_branch IS NULL THEN
      RAISE EXCEPTION 'Account not found: %', _acct_id;
    END IF;

    IF _acct_branch != _branch_id THEN
      RAISE EXCEPTION 'Account % does not belong to branch %', _acct_id, _branch_id;
    END IF;

    IF NOT _acct_active THEN
      RAISE EXCEPTION 'Account % is inactive', _acct_id;
    END IF;

    -- Track totals
    IF _etype = 'debit' THEN
      _total_debit := _total_debit + _amt;
      _has_debit := true;
    ELSE
      _total_credit := _total_credit + _amt;
      _has_credit := true;
    END IF;

    -- Insert ledger entry
    INSERT INTO public.ledger_entries (
      branch_id, transaction_group_id, account_id, account_type,
      entry_type, amount, reference_type, reference_id,
      narration, is_reversal, created_by
    ) VALUES (
      _branch_id, _txn_group_id, _acct_id, _atype::public.account_type,
      _etype::public.entry_type, _amt, _reference_type, _reference_id,
      _narr, false, _caller
    );

    _entry_count := _entry_count + 1;
  END LOOP;

  -- RULE 1: Must have at least one debit and one credit
  IF NOT _has_debit THEN
    RAISE EXCEPTION 'At least one debit entry is required';
  END IF;
  IF NOT _has_credit THEN
    RAISE EXCEPTION 'At least one credit entry is required';
  END IF;

  -- RULE 2: Total debit MUST equal total credit
  IF _total_debit != _total_credit THEN
    RAISE EXCEPTION 'Ledger imbalance: debit=% credit=%. Must be equal.', _total_debit, _total_credit;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('ledger_entry', 'ledger', _txn_group_id, _caller,
    jsonb_build_object(
      'branch_id', _branch_id,
      'transaction_group_id', _txn_group_id,
      'reference_type', _reference_type,
      'reference_id', _reference_id,
      'total_debit', _total_debit,
      'total_credit', _total_credit,
      'entry_count', _entry_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_group_id', _txn_group_id,
    'total_debit', _total_debit,
    'total_credit', _total_credit,
    'entry_count', _entry_count
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 7. REVERSAL FUNCTION: reverse_ledger_transaction()
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_ledger_transaction(
  _transaction_group_id uuid,
  _reason text,
  _reversed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _entry RECORD;
  _new_group_id uuid;
  _caller uuid;
  _branch uuid;
  _entry_count integer := 0;
  _total numeric := 0;
  _reversed_type public.entry_type;
BEGIN
  _caller := COALESCE(_reversed_by, auth.uid());
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'reversed_by is required';
  END IF;

  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'Reversal reason is required';
  END IF;

  -- Check original entries exist
  IF NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE transaction_group_id = _transaction_group_id) THEN
    RAISE EXCEPTION 'No ledger entries found for transaction_group_id: %', _transaction_group_id;
  END IF;

  -- Prevent double reversal: check if already reversed
  IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE original_group_id = _transaction_group_id AND is_reversal = true) THEN
    RAISE EXCEPTION 'Transaction already reversed: %', _transaction_group_id;
  END IF;

  -- Prevent reversing a reversal
  IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE transaction_group_id = _transaction_group_id AND is_reversal = true) THEN
    RAISE EXCEPTION 'Cannot reverse a reversal entry';
  END IF;

  _new_group_id := gen_random_uuid();

  -- Get branch from original entries
  SELECT branch_id INTO _branch FROM public.ledger_entries
  WHERE transaction_group_id = _transaction_group_id LIMIT 1;

  -- Create reversed entries (swap debit ↔ credit)
  FOR _entry IN
    SELECT * FROM public.ledger_entries
    WHERE transaction_group_id = _transaction_group_id
    ORDER BY created_at
  LOOP
    _reversed_type := CASE _entry.entry_type
      WHEN 'debit' THEN 'credit'::public.entry_type
      WHEN 'credit' THEN 'debit'::public.entry_type
    END;

    INSERT INTO public.ledger_entries (
      branch_id, transaction_group_id, account_id, account_type,
      entry_type, amount, reference_type, reference_id,
      narration, is_reversal, original_group_id, created_by
    ) VALUES (
      _entry.branch_id, _new_group_id, _entry.account_id, _entry.account_type,
      _reversed_type, _entry.amount, _entry.reference_type, _entry.reference_id,
      'REVERSAL: ' || COALESCE(_reason, '') || ' | Original: ' || _entry.narration,
      true, _transaction_group_id, _caller
    );

    _entry_count := _entry_count + 1;
    IF _entry.entry_type = 'debit' THEN
      _total := _total + _entry.amount;
    END IF;
  END LOOP;

  -- Audit log
  INSERT INTO public.audit_logs (action_type, entity_type, entity_id, user_id, details)
  VALUES ('ledger_reversal', 'ledger', _new_group_id, _caller,
    jsonb_build_object(
      'original_group_id', _transaction_group_id,
      'new_group_id', _new_group_id,
      'reason', _reason,
      'entries_reversed', _entry_count,
      'total_amount', _total
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'original_group_id', _transaction_group_id,
    'reversal_group_id', _new_group_id,
    'entries_reversed', _entry_count,
    'total_amount', _total
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 8. HELPER: Validate global ledger balance
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_ledger_v2_balance(_txn_group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total_debit numeric;
  _total_credit numeric;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO _total_debit, _total_credit
  FROM public.ledger_entries
  WHERE transaction_group_id = _txn_group_id;

  IF _total_debit != _total_credit THEN
    RAISE EXCEPTION 'Ledger imbalance for group %: debit=% credit=%', _txn_group_id, _total_debit, _total_credit;
  END IF;

  IF _total_debit = 0 THEN
    RAISE EXCEPTION 'No ledger entries found for group %', _txn_group_id;
  END IF;

  RETURN true;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 9. ADD branch_id TO audit_logs (nullable for backward compat)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_branch ON public.audit_logs(branch_id);
