
-- Step 1: Add treasurer to app_role enum only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'treasurer';
