-- セキュリティ問題修正マイグレーション
-- 1. SECURITY DEFINER Views の修正
-- 2. RLS無効化テーブルの修正

-- ================================================
-- 1. SECURITY DEFINER Views を SECURITY INVOKER で再作成
-- ================================================

-- v_deposit_summary ビューの再作成
CREATE OR REPLACE VIEW public.v_deposit_summary
WITH (security_invoker=true) AS
SELECT
    d.*,
    cc.config->>'name' as chain_name,
    cc.config->>'symbol' as asset_symbol,
    cc.config->>'explorer' as explorer_url,
    cc.active as chain_active,
    CASE
        WHEN d.confirmations_observed >= d.confirmations_required THEN true
        ELSE false
    END as fully_confirmed
FROM deposits d
LEFT JOIN chain_configs cc ON d.chain = cc.chain AND d.network = cc.network AND d.asset = cc.asset;

-- user_balances_view ビューの再作成
CREATE OR REPLACE VIEW public.user_balances_view
WITH (security_invoker=true) AS
SELECT
  le.user_id,
  le.currency,
  COALESCE(SUM(le.amount), 0)::numeric(20,10) AS total,
  COALESCE(SUM(le.locked_delta), 0)::numeric(20,10) AS locked,
  (COALESCE(SUM(le.amount), 0) - COALESCE(SUM(le.locked_delta), 0))::numeric(20,10) AS available
FROM public.ledger_entries le
GROUP BY le.user_id, le.currency;

-- webhook_errors_summary ビューの再作成
CREATE OR REPLACE VIEW public.webhook_errors_summary
WITH (security_invoker=true) AS
SELECT
  DATE_TRUNC('day', created_at) as error_date,
  chain,
  network,
  error_type,
  COUNT(*) as error_count,
  COUNT(*) FILTER (WHERE resolved = false) as unresolved_count,
  COUNT(*) FILTER (WHERE resolved = true) as resolved_count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved = true) as avg_resolution_time_seconds
FROM webhook_errors
GROUP BY DATE_TRUNC('day', created_at), chain, network, error_type
ORDER BY error_date DESC, error_count DESC;

-- active_chain_configs ビューの再作成
CREATE OR REPLACE VIEW public.active_chain_configs
WITH (security_invoker=true) AS
SELECT * FROM chain_configs
WHERE deposit_enabled = true
ORDER BY chain, network, asset;

-- v_user_kyc_status ビューの再作成
CREATE OR REPLACE VIEW public.v_user_kyc_status
WITH (security_invoker=true) AS
SELECT
    p.id as user_id,
    p.email,
    p.full_name,
    p.kyc_status,
    p.kyc_level,
    p.kyc_updated_at,
    p.kyc_notes,
    COUNT(d.id) as document_count,
    COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_documents,
    COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_documents,
    COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_documents
FROM profiles p
LEFT JOIN kyc_documents d ON p.id = d.user_id
GROUP BY p.id, p.email, p.full_name, p.kyc_status, p.kyc_level, p.kyc_updated_at, p.kyc_notes;

-- ================================================
-- 2. RLS無効化テーブルの修正
-- ================================================

-- deposit_detection_state テーブルのRLS有効化
ALTER TABLE public.deposit_detection_state ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能なポリシー
CREATE POLICY "Admin access only on deposit_detection_state" ON public.deposit_detection_state
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- deposit_confirmation_configs テーブルのRLS有効化
ALTER TABLE public.deposit_confirmation_configs ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能なポリシー
CREATE POLICY "Admin access only on deposit_confirmation_configs" ON public.deposit_confirmation_configs
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- deposit_approval_rules テーブルのRLS有効化
ALTER TABLE public.deposit_approval_rules ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能なポリシー
CREATE POLICY "Admin access only on deposit_approval_rules" ON public.deposit_approval_rules
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- manual_approval_queue テーブルのRLS有効化
ALTER TABLE public.manual_approval_queue ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能なポリシー
CREATE POLICY "Admin access only on manual_approval_queue" ON public.manual_approval_queue
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ================================================
-- 3. コメント追加
-- ================================================

COMMENT ON VIEW public.v_deposit_summary IS '入金情報とチェーン設定を結合した便利ビュー (SECURITY INVOKER)';
COMMENT ON VIEW public.user_balances_view IS 'ユーザー残高ビュー (SECURITY INVOKER)';
COMMENT ON VIEW public.webhook_errors_summary IS 'Webhook エラー統計ビュー (SECURITY INVOKER)';
COMMENT ON VIEW public.active_chain_configs IS 'アクティブなチェーン設定ビュー (SECURITY INVOKER)';
COMMENT ON VIEW public.v_user_kyc_status IS 'ユーザーKYC状況ビュー (SECURITY INVOKER)';

-- セキュリティ修正完了ログ
INSERT INTO public.audit_logs (
    action,
    resource,
    resource_id,
    details
) VALUES (
    'SECURITY_UPDATE',
    'database_security',
    'security_fixes_20250927',
    jsonb_build_object(
        'fixed_views', ARRAY['v_deposit_summary', 'user_balances_view', 'webhook_errors_summary', 'active_chain_configs', 'v_user_kyc_status'],
        'fixed_tables', ARRAY['deposit_detection_state', 'deposit_confirmation_configs', 'deposit_approval_rules', 'manual_approval_queue'],
        'security_definer_removed', true,
        'rls_enabled', true,
        'description', 'Supabaseセキュリティ問題修正: SECURITY DEFINER削除、RLS有効化完了'
    )
);