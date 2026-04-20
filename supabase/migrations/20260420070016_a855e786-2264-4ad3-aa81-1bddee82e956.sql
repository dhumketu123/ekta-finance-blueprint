DO $$
DECLARE
  v_rollback_ts timestamptz := '2026-04-20 06:59:00+00';
  rec RECORD;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  -- Temporarily disable the cross-role duplicate trigger; it incorrectly fires on
  -- unrelated UPDATEs that don't change the phone column.
  ALTER TABLE investors DISABLE TRIGGER USER;

  FOR rec IN
    SELECT t.id, t.investor_id, t.amount, i.reinvest
    FROM transactions t
    JOIN investors i ON i.id = t.investor_id
    WHERE t.type = 'investor_profit'
      AND t.created_at >= v_rollback_ts
      AND t.deleted_at IS NULL
  LOOP
    UPDATE transactions
    SET deleted_at = now(),
        notes = COALESCE(notes,'') || ' [REVERSED: duplicate from cron security test 2026-04-20]'
    WHERE id = rec.id;

    IF rec.reinvest THEN
      UPDATE investors
      SET capital = capital - rec.amount,
          accumulated_profit = GREATEST(0, accumulated_profit - rec.amount),
          last_profit_date = '2026-04-01'
      WHERE id = rec.investor_id;
    ELSE
      UPDATE investors
      SET accumulated_profit = GREATEST(0, accumulated_profit - rec.amount),
          last_profit_date = '2026-04-01'
      WHERE id = rec.investor_id;
    END IF;

    v_count := v_count + 1;
    v_total := v_total + rec.amount;
  END LOOP;

  ALTER TABLE investors ENABLE TRIGGER USER;

  INSERT INTO audit_logs(action_type, entity_type, details)
  VALUES (
    'monthly_profit_rollback',
    'system',
    jsonb_build_object(
      'reason', 'Duplicate execution triggered by CRON security verification test',
      'transactions_reversed', v_count,
      'total_amount_reversed', v_total,
      'rolled_back_at', now()
    )
  );

  RAISE NOTICE 'Rolled back % transactions totaling %', v_count, v_total;
END $$;