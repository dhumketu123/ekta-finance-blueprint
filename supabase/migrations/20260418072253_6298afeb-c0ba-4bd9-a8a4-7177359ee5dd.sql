-- Add 'manager' to the app_role enum so the role can be assigned and used in RLS.
-- This is purely additive: no existing role/policy is modified, and 'manager'
-- gets no DB privileges until explicit policies are added for it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';