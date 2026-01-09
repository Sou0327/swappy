-- Add personal information fields to profiles table
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
  ADD COLUMN IF NOT EXISTS building text;

-- Add comments for the new fields
COMMENT ON COLUMN profiles.first_name IS '名前（名）';
COMMENT ON COLUMN profiles.last_name IS '名前（姓）';
COMMENT ON COLUMN profiles.first_name_kana IS '名前カナ（名）';
COMMENT ON COLUMN profiles.last_name_kana IS '名前カナ（姓）';
COMMENT ON COLUMN profiles.birth_date IS '生年月日';
COMMENT ON COLUMN profiles.postal_code IS '郵便番号';
COMMENT ON COLUMN profiles.prefecture IS '都道府県';
COMMENT ON COLUMN profiles.city IS '市区町村';
COMMENT ON COLUMN profiles.address IS '住所';
COMMENT ON COLUMN profiles.building IS '建物名・部屋番号';