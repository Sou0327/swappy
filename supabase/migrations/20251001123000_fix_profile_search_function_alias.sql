-- search_public_profiles 関数の曖昧列エイリアス修正

DROP FUNCTION IF EXISTS public.search_public_profiles(TEXT);

CREATE OR REPLACE FUNCTION public.search_public_profiles(p_query TEXT)
RETURNS TABLE (
    id UUID,
    email TEXT,
    user_handle TEXT,
    display_name TEXT,
    full_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH input AS (
    SELECT
      trim(both FROM regexp_replace(coalesce(p_query, ''), '^@+', '')) AS cleaned_query,
      auth.uid() AS caller_id
  )
  SELECT
    p.id,
    p.email,
    p.user_handle,
    p.display_name,
    p.full_name
  FROM input AS i
  JOIN public.profiles AS p ON true
  WHERE i.cleaned_query <> ''
    AND i.caller_id IS NOT NULL
    AND p.is_public = true
    AND coalesce(p.user_handle, '') <> ''
    AND p.id <> i.caller_id
    AND (
      p.user_handle ILIKE '%' || i.cleaned_query || '%'
      OR coalesce(p.email, '') ILIKE '%' || i.cleaned_query || '%'
      OR coalesce(p.display_name, '') ILIKE '%' || i.cleaned_query || '%'
      OR coalesce(p.full_name, '') ILIKE '%' || i.cleaned_query || '%'
    )
  ORDER BY
    CASE
      WHEN p.user_handle = i.cleaned_query THEN 1
      WHEN coalesce(p.email, '') = i.cleaned_query THEN 2
      WHEN p.user_handle ILIKE i.cleaned_query || '%' THEN 3
      WHEN coalesce(p.display_name, '') ILIKE i.cleaned_query || '%' THEN 4
      WHEN coalesce(p.full_name, '') ILIKE i.cleaned_query || '%' THEN 5
      ELSE 6
    END,
    p.display_name NULLS LAST,
    p.user_handle
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(TEXT) TO authenticated;
