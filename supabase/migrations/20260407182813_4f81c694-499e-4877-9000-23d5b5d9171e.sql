
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS canonical_phone TEXT;
ALTER TABLE public.investors ADD COLUMN IF NOT EXISTS canonical_phone TEXT;

UPDATE public.clients SET canonical_phone = phone WHERE canonical_phone IS NULL AND phone IS NOT NULL;
UPDATE public.investors SET canonical_phone = phone WHERE canonical_phone IS NULL AND phone IS NOT NULL;

-- Deduplicate clients: keep newest row per canonical_phone, null out the rest
UPDATE public.clients SET canonical_phone = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY canonical_phone ORDER BY created_at DESC) AS rn
    FROM public.clients
    WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL
  ) sub WHERE rn > 1
);

-- Deduplicate investors: keep newest row per canonical_phone, null out the rest
UPDATE public.investors SET canonical_phone = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY canonical_phone ORDER BY created_at DESC) AS rn
    FROM public.investors
    WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL
  ) sub WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_canonical_phone_unique
ON public.clients (canonical_phone)
WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investors_canonical_phone_unique
ON public.investors (canonical_phone)
WHERE canonical_phone IS NOT NULL AND deleted_at IS NULL;
