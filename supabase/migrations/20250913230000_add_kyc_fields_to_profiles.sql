-- Add KYC fields to profiles table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS first_name_kana text,
  ADD COLUMN IF NOT EXISTS last_name_kana text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS prefecture text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS building text,
  ADD COLUMN IF NOT EXISTS kyc_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS kyc_level integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kyc_updated_at timestamp WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS kyc_notes text;

-- Create KYC documents table
CREATE TABLE IF NOT EXISTS public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('identity', 'address', 'selfie', 'income')),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamp WITH TIME ZONE,
  review_notes text,
  created_at timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at timestamp WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on kyc_documents
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- Create KYC settings table
CREATE TABLE IF NOT EXISTS public.kyc_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  created_at timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at timestamp WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on kyc_settings
ALTER TABLE public.kyc_settings ENABLE ROW LEVEL SECURITY;

-- Insert default KYC settings
INSERT INTO public.kyc_settings (key, value) VALUES
  ('kyc_enabled', 'true'),
  ('kyc_required_for_deposit', 'false'),
  ('kyc_required_for_withdrawal', 'true'),
  ('kyc_max_file_size', '5242880'),
  ('kyc_allowed_file_types', '["image/jpeg", "image/png", "application/pdf"]')
ON CONFLICT (key) DO NOTHING;

-- Add updated_at trigger to kyc_documents
DROP TRIGGER IF EXISTS update_kyc_documents_updated_at ON public.kyc_documents;
CREATE TRIGGER update_kyc_documents_updated_at
  BEFORE UPDATE ON public.kyc_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add updated_at trigger to kyc_settings
DROP TRIGGER IF EXISTS update_kyc_settings_updated_at ON public.kyc_settings;
CREATE TRIGGER update_kyc_settings_updated_at
  BEFORE UPDATE ON public.kyc_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for kyc_documents
DROP POLICY IF EXISTS "Users can view their own KYC documents" ON public.kyc_documents;
CREATE POLICY "Users can view their own KYC documents"
  ON public.kyc_documents
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own KYC documents" ON public.kyc_documents;
CREATE POLICY "Users can insert their own KYC documents"
  ON public.kyc_documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all KYC documents" ON public.kyc_documents;
CREATE POLICY "Admins can view all KYC documents"
  ON public.kyc_documents
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all KYC documents" ON public.kyc_documents;
CREATE POLICY "Admins can update all KYC documents"
  ON public.kyc_documents
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for kyc_settings
DROP POLICY IF EXISTS "Users can view KYC settings" ON public.kyc_settings;
CREATE POLICY "Users can view KYC settings"
  ON public.kyc_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage KYC settings" ON public.kyc_settings;
CREATE POLICY "Admins can manage KYC settings"
  ON public.kyc_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));