-- Create Storage bucket for KYC documents
-- This migration creates the kyc-documents bucket with proper access controls

-- Create the kyc-documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('kyc-documents', 'kyc-documents')
ON CONFLICT (id) DO NOTHING;

-- Create RLS policy for kyc-documents bucket
-- Users can only access their own documents
CREATE POLICY "Users can upload their own KYC documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own KYC documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own KYC documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own KYC documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create RLS policy to allow admins to access all KYC documents
CREATE POLICY "Admins can access all KYC documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'kyc-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'admin'
  )
);

-- Create RLS policy for moderators to review KYC documents
CREATE POLICY "Moderators can view KYC documents for review"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'moderator')
  )
);

-- Note: RLS is already enabled on storage.objects table by default