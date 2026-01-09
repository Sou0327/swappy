-- トークン使用状況ビュー
-- 削除ガードのために、各トークンのシンボルごとに残高があるかどうかを集計

CREATE OR REPLACE VIEW public.token_usage_summary AS
SELECT
  st.id,
  st.chain,
  st.network,
  st.asset,
  st.symbol,
  st.name,
  st.active,
  COUNT(DISTINCT ua.user_id) as user_count,
  COALESCE(SUM(ua.balance), 0) as total_balance,
  COALESCE(SUM(ua.locked_balance), 0) as total_locked_balance
FROM public.supported_tokens st
LEFT JOIN public.user_assets ua ON ua.currency = st.symbol
GROUP BY st.id, st.chain, st.network, st.asset, st.symbol, st.name, st.active;

-- コメント追加
COMMENT ON VIEW public.token_usage_summary IS '削除ガード用：トークンごとのユーザー残高集計ビュー';
