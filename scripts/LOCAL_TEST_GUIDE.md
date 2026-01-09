# ウェルカムメールシステム - ローカルテスト手順書

本番デプロイ前にローカル環境でウェルカムメールシステムの動作を確認する手順です。

## 📋 前提条件

- Supabase CLIがインストール済み（`supabase --version`で確認）
- Dockerがインストール済みで起動中
- プロジェクトのルートディレクトリにいること

## 🎯 ローカルテストの目的

✅ メールキュー処理ロジックの動作確認
✅ トリガーによる自動キュー登録の確認
✅ エラーハンドリングとリトライの動作確認
✅ 本番デプロイ前の最終検証

## 🚀 テスト手順

### ステップ1: ローカルSupabase環境の起動

```bash
# Supabaseローカル環境を起動（初回は時間がかかります）
supabase start

# 起動完了後、以下の情報が表示されます
# API URL: http://localhost:54321
# DB URL: postgresql://postgres:postgres@localhost:54322/postgres
# Studio URL: http://localhost:54323
# anon key: eyJhbGci...
# service_role key: eyJhbGci...
```

✅ Studio URL（http://localhost:54323）にアクセスしてダッシュボードが表示されればOK

### ステップ2: 環境変数の設定

ローカル環境用の`.env`ファイルを作成します。

```bash
# supabase/functions/.env.local ファイルを作成（既にあれば編集）
cat > supabase/functions/.env.local << 'EOF'
# 開発環境フラグ（メール送信をコンソールログのみに）
ENVIRONMENT=development

# ⚠️ ローカルでも実際にメールを送信する場合は以下をtrueに設定
# デフォルト（未設定またはfalse）: ログのみでメール送信しない
# true: 実際にResend APIでメールを送信する
ENABLE_ACTUAL_EMAIL_SENDING=false

# Supabase設定（ローカル）
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# メール設定（開発環境ではダミーでOK）
FROM_EMAIL=noreply@localhost.dev
PLATFORM_NAME=Test Platform
PLATFORM_URL=http://localhost:8080

# Resend APIキー（実際にメール送信する場合は必須）
# ENABLE_ACTUAL_EMAIL_SENDING=true の場合は以下のコメントを外して実際のAPIキーを設定
# RESEND_API_KEY=re_your_actual_api_key_here
EOF
```

⚠️ `SUPABASE_SERVICE_ROLE_KEY`は`supabase start`で表示された実際の値を使用してください

### 💡 実際のメール送信をテストする場合（オプション）

ローカル環境から実際にメールを送信してテストしたい場合は、以下の設定を追加します。

⚠️ **注意**: 実際のメールが送信されるため、テスト用のメールアドレスを使用してください。

```bash
# supabase/functions/.env.local を編集
ENABLE_ACTUAL_EMAIL_SENDING=true
RESEND_API_KEY=re_your_actual_api_key_here  # ← 実際のAPIキーに置き換え
FROM_EMAIL=noreply@yourdomain.com  # ← Resendで認証済みのドメイン
```

**確認方法**：
- `ENVIRONMENT=development` のまま（開発モード維持）
- `ENABLE_ACTUAL_EMAIL_SENDING=true` で実際のメール送信が有効化
- email-senderのログに `[DEV MODE - ACTUAL SENDING]` と表示される

### ステップ3: マイグレーションの適用

```bash
# ローカルDBにマイグレーションを適用
supabase db reset

# または、既存のDBに追加適用する場合
# supabase migration up
```

✅ エラーなく完了すればOK

### ステップ4: Edge Functionsのローカル実行

**ターミナル1（email-sender）:**

```bash
# email-sender Edge Functionを起動
supabase functions serve email-sender --env-file supabase/functions/.env.local

# 起動すると以下のように表示されます
# Serving functions on http://localhost:54321/functions/v1/
```

**ターミナル2（email-queue-processor）:**

```bash
# 別のターミナルウィンドウで email-queue-processor を起動
supabase functions serve email-queue-processor --env-file supabase/functions/.env.local
```

✅ 両方とも`Serving functions...`と表示されればOK

### ステップ5: テストデータの作成

**ターミナル3（SQLクエリ実行用）:**

```bash
# ローカルDBに接続
psql postgresql://postgres:postgres@localhost:54322/postgres
```

PostgreSQLプロンプトで以下を実行:

```sql
-- 1. テストユーザーを作成（auth.users）
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
)
VALUES (
  gen_random_uuid(),
  'test@example.com',
  crypt('testpassword123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  'authenticated'
)
RETURNING id, email;

-- ↑ 表示されたidをメモしておく（次のステップで使用）
```

```sql
-- 2. プロフィールを作成（ウェルカムメールトリガーが発火）
-- ⚠️ <USER_ID> を上で取得したidに置き換えてください
INSERT INTO public.profiles (
  id,
  full_name,
  user_handle,
  created_at,
  updated_at
)
VALUES (
  '<USER_ID>',  -- ← ここを置き換え
  'テストユーザー',
  'testuser',
  now(),
  now()
);

-- トリガーが発火してメールがキューに追加されたか確認
SELECT
  id,
  email_type,
  recipient_email,
  status,
  template_data
FROM public.email_queue
ORDER BY created_at DESC
LIMIT 1;
```

✅ `email_type='welcome'`, `status='pending'`のレコードが表示されればOK

### ステップ6: キュー処理の手動実行

ローカル環境ではpg_cronが動かないため、手動でemail-queue-processorを呼び出します。

**方法1: curlコマンド（推奨）**

```bash
# email-queue-processor を手動実行
curl -X POST http://localhost:54321/functions/v1/email-queue-processor \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Content-Type: application/json"
```

**方法2: SQLからHTTPリクエスト**

```sql
-- psqlプロンプトから実行
SELECT net.http_post(
  url := 'http://localhost:54321/functions/v1/email-queue-processor',
  headers := jsonb_build_object(
    'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
    'Content-Type', 'application/json'
  )
) AS request_id;
```

### ステップ7: 結果の確認

#### 7-1. ターミナルのログを確認

**email-queue-processorのターミナル**で以下のようなログが表示されます:

```
[email-queue-processor] Starting queue processing...
[email-queue-processor] Found 1 pending emails
[email-queue-processor] Processing email abc-123 (type: welcome)
[email-queue-processor] Email abc-123 sent successfully: dev-test-id
[email-queue-processor] Completed: 1 success, 0 failed
```

**email-senderのターミナル**のログは、設定によって異なります：

**📝 実際のメール送信が無効な場合（デフォルト）：**
```
📧 [DEV MODE - LOG ONLY] Email would be sent:
{
  to: 'test@example.com',
  subject: 'Test Platformへようこそ！',
  html: '<!DOCTYPE html>...'
}
```

**📧 実際のメール送信が有効な場合（`ENABLE_ACTUAL_EMAIL_SENDING=true`）：**
```
📧 [DEV MODE - ACTUAL SENDING] Sending email via Resend:
{
  to: 'test@example.com',
  subject: 'Test Platformへようこそ！'
}
[email-sender] Email sent successfully: re_abc123xyz456
```

✅ 両方のログが正常に表示されればOK

💡 **実際のメール送信を有効にした場合**：
- Resendのダッシュボード（https://resend.com/emails）で送信履歴を確認できます
- 指定したメールアドレスに実際にメールが届きます
- `email_logs.resend_message_id` に実際のメッセージID（`re_`で始まる文字列）が記録されます

#### 7-2. データベースを確認

```sql
-- キューのステータスを確認（status='sent'になっているはず）
SELECT
  id,
  email_type,
  recipient_email,
  status,
  retry_count,
  processed_at
FROM public.email_queue
ORDER BY created_at DESC
LIMIT 5;

-- 送信ログを確認
SELECT
  id,
  email_type,
  recipient_email,
  subject,
  status,
  sent_at,
  resend_message_id
FROM public.email_logs
ORDER BY created_at DESC
LIMIT 5;
```

✅ 期待される結果:
- `email_queue.status` = `'sent'`
- `email_queue.processed_at` = 現在時刻
- `email_logs.status` = `'sent'`
- `email_logs.resend_message_id` = `'dev-test-id'`

### ステップ8: エラーケースのテスト

#### 8-1. リトライロジックのテスト

意図的にエラーを発生させてリトライを確認:

```bash
# email-sender Edge Functionを停止（Ctrl+C）
# この状態でキュー処理を実行
curl -X POST http://localhost:54321/functions/v1/email-queue-processor \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Content-Type: application/json"
```

```sql
-- リトライカウントが増えていることを確認
SELECT
  id,
  status,
  retry_count,
  max_retries,
  error_message,
  scheduled_at
FROM public.email_queue
ORDER BY created_at DESC
LIMIT 1;
```

✅ 期待される結果:
- `status` = `'pending'`（リトライ待ち）
- `retry_count` = `1`
- `scheduled_at` = 5分後の時刻
- `error_message` にエラー内容が記録

```bash
# email-senderを再起動して、再度実行すれば成功するはず
supabase functions serve email-sender --env-file supabase/functions/.env.local
```

#### 8-2. 最大リトライ超過のテスト

```sql
-- リトライ回数を手動で最大値に設定
UPDATE public.email_queue
SET retry_count = 3  -- max_retries と同じ値
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 1;
```

```bash
# この状態でキュー処理を実行（email-senderは停止しておく）
curl -X POST http://localhost:54321/functions/v1/email-queue-processor \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Content-Type: application/json"
```

✅ 期待される結果:
- `status` = `'failed'`（最終失敗）
- `retry_count` = `3`
- `processed_at` = 現在時刻

## 🧪 その他のテストケース

### テスト1: 複数メールの同時処理

```sql
-- 複数のテストメールをキューに追加
SELECT public.queue_email(
  (SELECT id FROM auth.users LIMIT 1),
  'welcome',
  'test' || i || '@example.com',
  jsonb_build_object('user_name', 'User ' || i)
)
FROM generate_series(1, 5) AS i;

-- キュー処理を実行
-- curl コマンド...
```

### テスト2: ユーザー設定によるメール送信制御

```sql
-- メール受信を拒否したユーザー
UPDATE public.email_preferences
SET welcome_emails = false
WHERE user_id = (SELECT id FROM auth.users LIMIT 1);

-- この状態でプロフィール作成してもメールは送信されない
-- （queue_email関数がNULLを返す）
```

## 🛑 テスト終了後のクリーンアップ

```bash
# 1. Edge Functionsを停止（Ctrl+C）

# 2. ローカルSupabaseを停止
supabase stop

# 3. データベースをリセット（次回のテストのため）
supabase db reset
```

## 📊 テストチェックリスト

ローカルテストで確認すべき項目:

- [ ] マイグレーションがエラーなく適用される
- [ ] Edge Functionsがローカルで起動する
- [ ] プロフィール作成時にキューにメールが追加される
- [ ] email-queue-processorがキューからメールを取得する
- [ ] email-senderが呼び出されてログが出力される
- [ ] ステータスが`pending` → `sent`に更新される
- [ ] email_logsにレコードが追加される
- [ ] リトライロジックが正常に動作する
- [ ] 最大リトライ超過で`failed`になる
- [ ] 複数メールのバッチ処理が動作する

## 🚀 本番デプロイへの移行

ローカルテストで全て問題なければ、`scripts/DEPLOY_WELCOME_EMAIL.md`の手順に従って本番環境にデプロイします。

主な違い:
- **ローカル**: 手動でキュー処理を実行、メールは送信されずログのみ
- **本番**: pg_cronが自動実行、実際にメールが送信される

## 💡 トラブルシューティング

### Edge Functionが起動しない

```bash
# Dockerが起動しているか確認
docker ps

# Supabaseを再起動
supabase stop
supabase start
```

### マイグレーションでエラー

```bash
# マイグレーション履歴を確認
supabase migration list

# 特定のマイグレーションをロールバック
supabase migration down <timestamp>
```

### psqlで接続できない

```bash
# 接続情報を再確認
supabase status

# 表示されたDB URLを使用
psql <DB_URL>
```

---

**作成日**: 2025-10-02
**最終更新**: 2025-10-02
