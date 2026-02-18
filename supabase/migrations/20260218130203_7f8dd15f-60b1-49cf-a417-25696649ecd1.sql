
-- Add new columns to clients table for extended profile
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS father_or_husband_name text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS nid_number varchar(20),
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS marital_status text CHECK (marital_status IN ('unmarried','married','widowed','divorced')),
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS village text,
  ADD COLUMN IF NOT EXISTS post_office text,
  ADD COLUMN IF NOT EXISTS union_name text,
  ADD COLUMN IF NOT EXISTS upazila text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS nominee_name text,
  ADD COLUMN IF NOT EXISTS nominee_relation text,
  ADD COLUMN IF NOT EXISTS nominee_phone varchar(20),
  ADD COLUMN IF NOT EXISTS nominee_nid varchar(20),
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Unique constraint on NID (ignoring nulls - postgres does this automatically)
CREATE UNIQUE INDEX IF NOT EXISTS clients_nid_number_unique
  ON public.clients (nid_number)
  WHERE nid_number IS NOT NULL AND deleted_at IS NULL;

-- Create client-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: public read
CREATE POLICY "Client photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-photos');

-- RLS: only admin/owner or assigned officer can upload
CREATE POLICY "Client photos upload admin or officer"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'client-photos'
    AND (public.is_admin_or_owner() OR public.is_field_officer())
  );

-- RLS: only admin/owner or assigned officer can update
CREATE POLICY "Client photos update admin or officer"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'client-photos'
    AND (public.is_admin_or_owner() OR public.is_field_officer())
  );

-- RLS: only admin can delete photos
CREATE POLICY "Client photos delete admin only"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'client-photos' AND public.is_admin_or_owner());
