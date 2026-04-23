
-- ============================================================
-- PHASE 1: DATA INTEGRITY — Foreign Keys (non-breaking, RESTRICT)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_loan_id_fkey'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_loan_id_fkey
      FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loan_schedules_client_id_fkey'
      AND conrelid = 'public.loan_schedules'::regclass
  ) THEN
    ALTER TABLE public.loan_schedules
      ADD CONSTRAINT loan_schedules_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
  END IF;
END$$;

-- ============================================================
-- PHASE 2: TENANT ISOLATION (defense-in-depth, additive policy)
-- Uses public.get_user_tenant_id() — confirmed available
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'Tenant isolation via parent loan (defense)'
      AND polrelid = 'public.loan_schedules'::regclass
  ) THEN
    CREATE POLICY "Tenant isolation via parent loan (defense)"
    ON public.loan_schedules
    AS RESTRICTIVE
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.loans l
        WHERE l.id = loan_schedules.loan_id
          AND l.tenant_id = public.get_user_tenant_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.loans l
        WHERE l.id = loan_schedules.loan_id
          AND l.tenant_id = public.get_user_tenant_id()
      )
    );
  END IF;
END$$;

-- ============================================================
-- PHASE 3: FORCE RLS (block BYPASSRLS abuse)
-- ============================================================
ALTER TABLE public.loan_schedules FORCE ROW LEVEL SECURITY;

-- ============================================================
-- PHASE 4: PERFORMANCE — Index already exists, ensure idempotent
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_loan_schedules_loan_id
  ON public.loan_schedules (loan_id);
