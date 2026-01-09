-- 通知システムのテーブル作成
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info', -- 'info', 'success', 'warning', 'error', 'kyc'
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS (Row Level Security) ポリシー設定
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の通知のみ参照可能
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- ユーザーは自分の通知を更新可能（既読状態など）
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 管理者は全ての通知を作成・更新・削除可能
CREATE POLICY "Admins can manage all notifications" ON notifications
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- システム関数は通知を作成可能（SECURITY DEFINER関数用）
CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- KYCステータス変更時の自動通知トリガー関数
CREATE OR REPLACE FUNCTION notify_kyc_status_change()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  -- KYCステータスが変更された場合のみ通知を作成
  IF OLD.kyc_status IS DISTINCT FROM NEW.kyc_status THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.id,
      CASE NEW.kyc_status
        WHEN 'pending' THEN 'KYC審査開始'
        WHEN 'verified' THEN 'KYC認証完了'
        WHEN 'rejected' THEN 'KYC審査不合格'
        ELSE 'KYC状況変更'
      END,
      CASE NEW.kyc_status
        WHEN 'pending' THEN 'KYC書類の審査を開始しました。結果をお待ちください。'
        WHEN 'verified' THEN 'KYC認証が完了しました。すべての機能をご利用いただけます。'
        WHEN 'rejected' THEN COALESCE('KYC審査の結果、書類に不備がありました。' || CASE WHEN NEW.kyc_notes IS NOT NULL THEN '理由: ' || NEW.kyc_notes ELSE '' END, 'KYC審査の結果、書類に不備がありました。')
        ELSE 'KYC状況が変更されました。'
      END,
      'kyc'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- KYCステータス変更時のトリガー設定（一時的に無効化）
-- DROP TRIGGER IF EXISTS trigger_kyc_status_notification ON profiles;
-- CREATE TRIGGER trigger_kyc_status_notification
--   AFTER UPDATE ON profiles
--   FOR EACH ROW
--   EXECUTE FUNCTION notify_kyc_status_change();

-- 既存通知の既読化関数
CREATE OR REPLACE FUNCTION mark_notification_as_read(notification_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notifications 
  SET read = TRUE, updated_at = NOW()
  WHERE id = notification_id AND user_id = auth.uid();
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 全通知の既読化関数
CREATE OR REPLACE FUNCTION mark_all_notifications_as_read()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE notifications 
  SET read = TRUE, updated_at = NOW()
  WHERE user_id = auth.uid() AND read = FALSE;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;