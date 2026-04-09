
-- ═══════════════════════════════════════════════════
--  Ledger Mismatches — Isolation Table
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ledger_mismatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  reference_type text NOT NULL,
  reference_id uuid,
  total_debit numeric NOT NULL DEFAULT 0,
  total_credit numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  affected_entry_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'detected'
    CHECK (status IN ('detected', 'investigating', 'resolved', 'override_approved')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_mismatches_tenant ON public.ledger_mismatches (tenant_id, detected_at DESC);
CREATE INDEX idx_ledger_mismatches_status ON public.ledger_mismatches (status) WHERE status != 'resolved';

ALTER TABLE public.ledger_mismatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_owner_read_mismatches" ON public.ledger_mismatches
  FOR SELECT TO authenticated USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "block_anon_mismatches" ON public.ledger_mismatches
  FOR SELECT TO anon USING (false);

CREATE POLICY "service_role_all_mismatches" ON public.ledger_mismatches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "block_user_insert_mismatches" ON public.ledger_mismatches
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "admin_update_mismatches" ON public.ledger_mismatches
  FOR UPDATE TO authenticated
  USING (is_admin_or_owner() AND tenant_id = get_user_tenant_id());

CREATE POLICY "block_user_delete_mismatches" ON public.ledger_mismatches
  FOR DELETE TO authenticated USING (false);

-- ═══════════════════════════════════════════════════
--  fn_daily_ledger_reconciliation
--  Scans double_entry_ledger for debit≠credit per reference
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_daily_ledger_reconciliation(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mismatch_count integer := 0;
  v_total_checked integer := 0;
  v_row record;
  v_start_time timestamptz := clock_timestamp();
BEGIN
  -- Scan all reference groups for debit/credit imbalance
  FOR v_row IN
    SELECT
      tenant_id,
      reference_type,
      reference_id,
      sum(debit) AS total_debit,
      sum(credit) AS total_credit,
      count(*) AS entry_count
    FROM double_entry_ledger
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND created_at >= (now() - interval '48 hours')  -- scan last 48h for safety
    GROUP BY tenant_id, reference_type, reference_id
    HAVING sum(debit) != sum(credit)
  LOOP
    v_total_checked := v_total_checked + 1;

    -- Upsert mismatch (idempotent — won't duplicate on re-run)
    INSERT INTO ledger_mismatches (tenant_id, reference_type, reference_id,
                                    total_debit, total_credit, variance, affected_entry_count)
    VALUES (v_row.tenant_id, v_row.reference_type, v_row.reference_id,
            v_row.total_debit, v_row.total_credit,
            abs(v_row.total_debit - v_row.total_credit), v_row.entry_count)
    ON CONFLICT DO NOTHING;

    v_mismatch_count := v_mismatch_count + 1;
  END LOOP;

  -- Also count total reference groups checked
  SELECT count(DISTINCT (reference_type, reference_id)) INTO v_total_checked
  FROM double_entry_ledger
  WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    AND created_at >= (now() - interval '48 hours');

  RETURN jsonb_build_object(
    'status', CASE WHEN v_mismatch_count = 0 THEN 'healthy' ELSE 'mismatches_found' END,
    'total_reference_groups_checked', v_total_checked,
    'mismatches_detected', v_mismatch_count,
    'duration_ms', extract(milliseconds FROM clock_timestamp() - v_start_time)::integer,
    'reconciled_at', now()
  );
END;
$$;

-- ═══════════════════════════════════════════════════
--  fn_get_reconciliation_status — dashboard summary
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_get_reconciliation_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open integer;
  v_resolved integer;
  v_total_variance numeric;
  v_last_run timestamptz;
BEGIN
  SELECT
    count(*) FILTER (WHERE status IN ('detected', 'investigating')),
    count(*) FILTER (WHERE status IN ('resolved', 'override_approved')),
    coalesce(sum(variance) FILTER (WHERE status IN ('detected', 'investigating')), 0)
  INTO v_open, v_resolved, v_total_variance
  FROM ledger_mismatches;

  SELECT max(detected_at) INTO v_last_run FROM ledger_mismatches;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_open = 0 THEN 'healthy' ELSE 'attention_required' END,
    'open_mismatches', v_open,
    'resolved_mismatches', v_resolved,
    'total_open_variance_bdt', v_total_variance,
    'last_reconciliation_at', v_last_run
  );
END;
$$;

-- ═══════════════════════════════════════════════════
--  fn_resolve_mismatch — manual override with audit
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_resolve_mismatch(
  p_mismatch_id uuid,
  p_resolved_by uuid,
  p_notes text,
  p_status text DEFAULT 'resolved'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('resolved', 'override_approved') THEN
    RAISE EXCEPTION 'Invalid resolution status: %', p_status;
  END IF;

  UPDATE ledger_mismatches
  SET status = p_status,
      resolved_by = p_resolved_by,
      resolved_at = now(),
      resolution_notes = p_notes
  WHERE id = p_mismatch_id
    AND status IN ('detected', 'investigating');

  -- Audit log entry
  INSERT INTO audit_logs (entity_type, entity_id, action_type, user_id, details)
  VALUES ('ledger_mismatch', p_mismatch_id, 'mismatch_resolved', p_resolved_by,
          jsonb_build_object('resolution_status', p_status, 'notes', p_notes));
END;
$$;

COMMENT ON TABLE public.ledger_mismatches IS 'Isolated ledger debit≠credit discrepancies detected by daily reconciliation';
COMMENT ON FUNCTION public.fn_daily_ledger_reconciliation IS 'Daily cron: scans double_entry_ledger for debit/credit imbalances per reference';
COMMENT ON FUNCTION public.fn_resolve_mismatch IS 'Manual override workflow with audit logging for ledger mismatches';
