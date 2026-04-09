
-- Function to auto-generate risk alerts for critical/high risk clients
CREATE OR REPLACE FUNCTION public.generate_risk_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alert_count int := 0;
  rec RECORD;
  admin_id uuid;
  t_id uuid;
BEGIN
  -- Get first admin user and tenant
  SELECT p.id, p.tenant_id INTO admin_id, t_id
  FROM profiles p
  WHERE p.role IN ('admin', 'owner')
  LIMIT 1;

  IF admin_id IS NULL THEN
    RETURN jsonb_build_object('alerts_created', 0, 'reason', 'no admin user found');
  END IF;

  FOR rec IN (
    SELECT cr.client_id, cr.risk_level, cr.probability_score, cr.notes,
           c.name_bn, c.name_en
    FROM client_risk cr
    JOIN clients c ON c.id = cr.client_id
    WHERE cr.risk_level IN ('critical', 'high')
      AND cr.resolved_at IS NULL
      AND c.deleted_at IS NULL
      -- Skip if alert already exists in last 24h
      AND NOT EXISTS (
        SELECT 1 FROM in_app_notifications n
        WHERE n.event_type = 'risk_alert'
          AND n.action_payload->>'client_id' = cr.client_id::text
          AND n.created_at > now() - interval '24 hours'
      )
  ) LOOP
    INSERT INTO in_app_notifications (
      tenant_id, user_id, role, event_type, source_module,
      title, message, priority, action_payload
    ) VALUES (
      t_id, admin_id, 'admin', 'risk_alert', 'risk_engine',
      CASE rec.risk_level
        WHEN 'critical' THEN '🔴 ক্রিটিকাল রিস্ক: ' || COALESCE(rec.name_bn, rec.name_en)
        ELSE '🟠 হাই রিস্ক: ' || COALESCE(rec.name_bn, rec.name_en)
      END,
      'রিস্ক স্কোর: ' || rec.probability_score || '%. ' || COALESCE(rec.notes, ''),
      'HIGH',
      jsonb_build_object('client_id', rec.client_id, 'risk_level', rec.risk_level, 'score', rec.probability_score)
    );
    alert_count := alert_count + 1;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', alert_count);
END;
$$;
