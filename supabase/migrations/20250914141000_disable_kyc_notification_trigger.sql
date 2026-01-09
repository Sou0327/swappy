-- 一時的にKYC通知トリガーを無効化（通知システムが完全に設定されるまで）
DROP TRIGGER IF EXISTS trigger_kyc_status_notification ON profiles;
DROP FUNCTION IF EXISTS notify_kyc_status_change();