
-- Drop ONLY the older/incomplete overloads, keeping the newer complete versions

-- 1. assert_pipeline_idempotency — keep (auto_fix boolean), drop ()
DROP FUNCTION IF EXISTS public.assert_pipeline_idempotency();

-- 2. create_ledger_entry — keep new signature, drop legacy branch-based
DROP FUNCTION IF EXISTS public.create_ledger_entry(_branch_id uuid, _reference_type text, _reference_id uuid, _entries jsonb, _created_by uuid);

-- 3. create_notification — keep version WITH p_reference, drop version WITHOUT
DROP FUNCTION IF EXISTS public.create_notification(p_tenant_id uuid, p_user_id uuid, p_role text, p_source_module text, p_event_type text, p_title text, p_message text, p_priority text, p_action_payload jsonb);

-- 4. generate_event_hash — keep parameterized version, drop no-arg (trigger uses BEFORE INSERT trigger, not this)
-- Actually both are needed: no-arg is trigger function, parameterized is utility
-- SKIP this one — both serve different purposes

-- 5. process_investor_dividend — keep version with p_accrue_profit, drop without
DROP FUNCTION IF EXISTS public.process_investor_dividend(p_investor_id uuid, p_amount numeric, p_reinvest boolean, p_actor_id uuid);

-- 6. process_owner_exit — keep version with _accrued_profit, drop without
DROP FUNCTION IF EXISTS public.process_owner_exit(_owner_user_id uuid, _total_capital numeric, _total_profit_earned numeric, _early_exit_penalty numeric, _loyalty_bonus numeric, _non_compete_months integer, _notes text, _legal_doc_url text);
