
-- ══════════════════════════════════════════════
-- 1. ESCALATION OVERVIEW
-- Returns count per escalation stage based on overdue days
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_governance_escalation_overview()
RETURNS TABLE (
  stage_id text,
  stage_title text,
  stage_desc text,
  stage_tag text,
  metric bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tenant AS (
    SELECT get_user_tenant_id() AS tid
  ),
  overdue_data AS (
    SELECT
      ls.id,
      GREATEST(CURRENT_DATE - ls.due_date, 0) AS days_overdue
    FROM loan_schedules ls
    JOIN loans l ON l.id = ls.loan_id
    CROSS JOIN tenant t
    WHERE ls.status IN ('pending', 'overdue', 'partial')
      AND l.status = 'active'
      AND l.tenant_id = t.tid
      AND l.deleted_at IS NULL
  )
  SELECT
    s.stage_id,
    s.stage_title,
    s.stage_desc,
    s.stage_tag,
    COALESCE(COUNT(o.id), 0)::bigint AS metric
  FROM (VALUES
    ('pre-due',          'Pre-Due Monitoring',        'পরিশোধের আগে পর্যবেক্ষণ',        'Passive',    -999, 0),
    ('early-1-7',        'Early Delinquency (1–7)',   'প্রাথমিক বিলম্ব সনাক্তকরণ',      'Soft Alert', 1,    7),
    ('control-8-15',     'Control Risk (8–15)',       'ঝুঁকি নিয়ন্ত্রণ পর্যায়',        'Follow-up',  8,    15),
    ('escalation-16-30', 'Escalation (16–30)',        'এসকেলেশন পর্যায়',                'Escalated',  16,   30),
    ('critical-31-59',   'Critical Watch (31–59)',    'জরুরি নজরদারি',                  'Critical',   31,   59)
  ) AS s(stage_id, stage_title, stage_desc, stage_tag, min_days, max_days)
  LEFT JOIN overdue_data o ON (
    CASE 
      WHEN s.min_days = -999 THEN o.days_overdue = 0
      ELSE o.days_overdue BETWEEN s.min_days AND s.max_days
    END
  )
  GROUP BY s.stage_id, s.stage_title, s.stage_desc, s.stage_tag, s.min_days
  ORDER BY s.min_days;
$$;

-- ══════════════════════════════════════════════
-- 2. AGING BUCKETS
-- Returns 4-bucket NPL classification
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_governance_aging_buckets()
RETURNS TABLE (
  bucket_id text,
  bucket_label text,
  bucket_title text,
  loan_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tenant AS (
    SELECT get_user_tenant_id() AS tid
  ),
  overdue_data AS (
    SELECT
      ls.id,
      GREATEST(CURRENT_DATE - ls.due_date, 0) AS days_overdue
    FROM loan_schedules ls
    JOIN loans l ON l.id = ls.loan_id
    CROSS JOIN tenant t
    WHERE ls.status IN ('overdue', 'partial')
      AND l.status = 'active'
      AND l.tenant_id = t.tid
      AND l.deleted_at IS NULL
      AND ls.due_date < CURRENT_DATE
  )
  SELECT
    b.bucket_id,
    b.bucket_label,
    b.bucket_title,
    COALESCE(COUNT(o.id), 0)::bigint AS loan_count
  FROM (VALUES
    ('bucket-0-30',    'Current Risk',   '0–30 দিন',  1,  30),
    ('bucket-31-60',   'Watchlist',      '31–60 দিন', 31, 60),
    ('bucket-61-90',   'NPL Emerging',   '61–90 দিন', 61, 90),
    ('bucket-90-plus', 'NPL Confirmed',  '90+ দিন',   91, 9999)
  ) AS b(bucket_id, bucket_label, bucket_title, min_days, max_days)
  LEFT JOIN overdue_data o ON o.days_overdue BETWEEN b.min_days AND b.max_days
  GROUP BY b.bucket_id, b.bucket_label, b.bucket_title, b.min_days
  ORDER BY b.min_days;
$$;

-- ══════════════════════════════════════════════
-- 3. COLLECTION PRIORITY QUEUE
-- Returns top 50 overdue clients ranked by composite priority
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_governance_collection_queue()
RETURNS TABLE (
  row_id text,
  client_name text,
  overdue_days integer,
  risk_score integer,
  priority_score integer,
  queue_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tenant AS (
    SELECT get_user_tenant_id() AS tid
  ),
  overdue_schedules AS (
    SELECT DISTINCT ON (c.id)
      c.id AS client_id,
      COALESCE(c.name_bn, c.name_en) AS client_name,
      (CURRENT_DATE - ls.due_date)::integer AS days_overdue
    FROM loan_schedules ls
    JOIN loans l ON l.id = ls.loan_id
    JOIN clients c ON c.id = l.client_id
    CROSS JOIN tenant t
    WHERE ls.status IN ('overdue', 'partial')
      AND l.status = 'active'
      AND l.tenant_id = t.tid
      AND l.deleted_at IS NULL
      AND ls.due_date < CURRENT_DATE
    ORDER BY c.id, ls.due_date ASC
  )
  SELECT
    ('q-' || LEFT(os.client_id::text, 8)) AS row_id,
    os.client_name,
    os.days_overdue,
    COALESCE(cs.score, 50) AS risk_score,
    -- Priority = 40% overdue weight + 60% risk weight (inverted: low credit = high priority)
    LEAST(
      ROUND(
        (LEAST(os.days_overdue, 120)::numeric / 120.0 * 40) +
        ((100 - COALESCE(cs.score, 50))::numeric / 100.0 * 60)
      )::integer,
      100
    ) AS priority_score,
    CASE
      WHEN os.days_overdue >= 31 THEN 'Critical'
      WHEN os.days_overdue >= 16 THEN 'Escalated'
      WHEN os.days_overdue >= 8  THEN 'Follow-up'
      WHEN os.days_overdue >= 1  THEN 'Soft Alert'
      ELSE 'Passive'
    END AS queue_status
  FROM overdue_schedules os
  LEFT JOIN credit_scores cs ON cs.client_id = os.client_id
  ORDER BY priority_score DESC
  LIMIT 50;
$$;

-- ══════════════════════════════════════════════
-- 4. GOVERNANCE POLICY CONFIG
-- Returns current governance policy settings
-- ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_governance_policy_config()
RETURNS TABLE (
  policy_label text,
  policy_value text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (VALUES
    ('Default Trigger',  '60 Days'),
    ('Audit Log',        'Enabled'),
    ('Maker-Checker',    'Required'),
    ('Cron Controlled',  'Yes'),
    ('NPL Classification', '90+ Days'),
    ('Penalty Freeze',   'Manual Override')
  ) AS p(policy_label, policy_value);
$$;
