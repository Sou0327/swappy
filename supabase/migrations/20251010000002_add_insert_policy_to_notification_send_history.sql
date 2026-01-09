-- INSERTポリシーを通知送信履歴テーブルに追加
-- Edge Functionから履歴レコードを作成できるようにする

-- 管理者とモデレーターが自分自身のIDで履歴レコードを作成可能
CREATE POLICY notification_send_history_admin_insert_policy
  ON public.notification_send_history
  FOR INSERT
  WITH CHECK (
    -- admin/moderatorロールを持つ
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
    -- かつ、sent_byが自分自身のIDである（偽装防止）
    AND sent_by = auth.uid()
  );

-- コメント追加
COMMENT ON POLICY notification_send_history_admin_insert_policy
  ON public.notification_send_history
  IS '管理者とモデレーターが自分自身のIDで履歴レコードを作成可能（偽装防止のためsent_by = auth.uid()を検証）';
