-- 1. Remove leftover public read policy on client-photos
DROP POLICY IF EXISTS "Client photos public read" ON storage.objects;

-- 2. Realtime channel access — restrict to authenticated users only
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated realtime read" ON realtime.messages;
CREATE POLICY "Authenticated realtime read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated realtime write" ON realtime.messages;
CREATE POLICY "Authenticated realtime write"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
