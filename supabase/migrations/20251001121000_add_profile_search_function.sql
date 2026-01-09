-- 公開プロフィール検索用RPC関数の追加
-- 送金先候補を安定して取得するためのファジー検索を提供

CREATE OR REPLACE FUNCTION public.search_public_profiles(p_query TEXT)
RETURNS TABLE (
    id UUID,
    email TEXT,
    user_handle TEXT,
    display_name TEXT,
    full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cleaned_query TEXT;
    pattern TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    cleaned_query := trim(both from COALESCE(p_query, ''));
    cleaned_query := regexp_replace(cleaned_query, '^@+', '');

    IF cleaned_query = '' THEN
        RETURN;
    END IF;

    pattern := '%' || cleaned_query || '%';

    RETURN QUERY
    WITH ranked_profiles AS (
        SELECT
            p.id,
            p.email,
            p.user_handle,
            p.display_name,
            p.full_name,
            CASE
                WHEN p.user_handle = cleaned_query THEN 1
                WHEN p.email = cleaned_query THEN 2
                WHEN p.user_handle ILIKE cleaned_query || '%' THEN 3
                WHEN p.display_name ILIKE cleaned_query || '%' THEN 4
                WHEN p.full_name ILIKE cleaned_query || '%' THEN 5
                ELSE 6
            END AS priority
        FROM public.profiles AS p
        WHERE p.is_public = true
          AND p.user_handle IS NOT NULL
          AND p.user_handle <> ''
          AND p.id <> auth.uid()
          AND (
            p.user_handle ILIKE pattern OR
            p.email ILIKE pattern OR
            p.display_name ILIKE pattern OR
            p.full_name ILIKE pattern
          )
        LIMIT 50
    )
    SELECT
        id,
        email,
        user_handle,
        display_name,
        full_name
    FROM ranked_profiles
    ORDER BY priority, display_name NULLS LAST, user_handle
    LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(TEXT) TO authenticated;
