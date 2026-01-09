-- Extend profiles with optional security and profile fields

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phishing_code text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS date_of_birth date;

