BEGIN;

-- 1. Remove legacy engines
DROP FUNCTION IF EXISTS public.execution_engine_v1(uuid);
DROP FUNCTION IF EXISTS public.execution_engine_v2(uuid);

-- 2. Enforce execution_lock uniqueness
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'execution_lock_request_id_key'
  ) THEN
    ALTER TABLE public.execution_lock
    ADD CONSTRAINT execution_lock_request_id_key UNIQUE (request_id);
  END IF;
END$$;

-- 3. Harden execution_registry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'executor_whitelist_check'
  ) THEN
    ALTER TABLE public.execution_registry
    ADD CONSTRAINT executor_whitelist_check
    CHECK (
      executor_name IN (
        'execute_loan_disbursement',
        'execute_stub_not_ready'
      )
    );
  END IF;
END$$;

-- 4. Force SECURITY DEFINER on core engine
ALTER FUNCTION public.execution_engine_v3(uuid)
SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.execution_engine_v3(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execution_engine_v3(uuid) TO authenticated;

-- 5. Harden audit writer
ALTER FUNCTION public.write_execution_audit(uuid, text, text, boolean, text)
SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_execution_audit(uuid, text, text, boolean, text) TO authenticated;

-- 6. Enforce RLS on approval_requests
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

COMMIT;