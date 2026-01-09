# ウェルカムメール自動送信システム - デプロイ手順書

このドキュメントでは、新規ユーザー登録時にウェルカムメールが自動送信されるシステムをデプロイする手順を説明します。

## 📋 前提条件

- Supabaseプロジェクトが作成済み
- Resend APIキーを取得済み（https://resend.com）
- Supabase CLIがインストール済み（`supabase --version`で確認）
- psqlがインストール済み（マイグレーション確認用、オプション）

## 🎯 システム概要

```
新規ユーザー登録
    ↓
profiles テーブルに INSERT
    ↓
queue_welcome_email() トリガーが発火
    ↓
email_queue テーブルに追加
    ↓
pg_cron が1分ごとに実行
    ↓
email-queue-processor Edge Function が起動
    ↓
email-sender Edge Function を呼び出し
    ↓
Resend API でメール送信
    ↓
email_logs に記録
```

## 🚀 デプロイ手順

### ステップ1: 環境変数の設定

Supabaseプロジェクトに必要な環境変数（Secrets）を設定します。

```bash
# Resend APIキーを設定
supabase secrets set RESEND_API_KEY=re_your_api_key_here

# 送信元メールアドレスを設定（Resendで認証済みドメインのアドレス）
supabase secrets set FROM_EMAIL=noreply@yourdomain.com

# プラットフォーム名を設定
supabase secrets set PLATFORM_NAME="Your Platform Name"

# プラットフォームURLを設定
supabase secrets set PLATFORM_URL=https://yourdomain.com

# 環境識別（本番環境の場合）
supabase secrets set ENVIRONMENT=production
```

設定確認:
```bash
supabase secrets list
```

### ステップ2: Edge Functionのデプロイ

email-queue-processor Edge Functionをデプロイします。

```bash
# email-queue-processor をデプロイ
supabase functions deploy email-queue-processor

# デプロイ確認
supabase functions list
```

✅ `email-queue-processor` が一覧に表示されればOK

### ステップ3: Vaultにサービスロールキーを保存（セキュリティ重要）

🔒 **セキュリティ向上**: サービスロールキーをマイグレーションファイルにハードコードせず、Supabase Vaultに安全に保存します。

#### 3-1. サービスロールキーの確認

Supabase Dashboardから確認:
1. Settings > API
2. Project API keys > `service_role` の `secret` をコピー（⚠️ 絶対に公開しないこと）

#### 3-2. Vaultにサービスロールキーを保存

```bash
# psqlでデータベースに接続
supabase db remote psql

# または、Supabase DashboardのSQL Editorで以下を実行:
```

```sql
-- Vaultにサービスロールキーを保存（安全な方法）
SELECT vault.create_secret(
  'eyJhbGci...[実際のサービスロールキー]...',  -- ← 実際のキーに置き換え
  'supabase_service_role_key'  -- シークレット名（変更しない）
);

-- 保存確認
SELECT name, description, created_at
FROM vault.secrets
WHERE name = 'supabase_service_role_key';
```

✅ 1行の結果が返ればOK

⚠️ **重要**: この操作は一度だけ実行してください。既に存在する場合はエラーになります。

#### 3-3. プロジェクトURLの設定

`supabase/migrations/20251010000011_email_queue_cron.sql` を開き、プロジェクトURLのみ置き換えます:

```sql
-- 修正前（54行目付近）:
project_url := 'https://[PROJECT_REF].supabase.co';

-- 修正後（例）:
project_url := 'https://abcdefghijklmnop.supabase.co';
```

プロジェクトリファレンスIDの確認方法:

Supabase Dashboardから:
1. https://supabase.com/dashboard にアクセス
2. プロジェクトを選択
3. Settings > General > Reference ID をコピー

またはCLIから:

```bash
supabase projects list
```

✅ **セキュリティメリット**:
- サービスロールキーがGit履歴に残らない
- Vaultで暗号化されて保存される
- 万が一マイグレーションファイルが漏洩してもキーは安全

### ステップ4: マイグレーションの適用

編集したマイグレーションファイルをデータベースに適用します。

```bash
# ローカルでマイグレーションをテスト（オプション、推奨）
supabase db reset

# リモート（本番）にマイグレーションを適用
supabase db push
```

エラーが出た場合は、プレースホルダーの置き換えが正しいか確認してください。

### ステップ5: cronジョブの確認

cronジョブが正しく設定されたか確認します。

```bash
# psqlでデータベースに接続
supabase db remote psql

# または、Supabase DashboardのSQL Editorで以下を実行:
```

```sql
-- cronジョブの確認
SELECT * FROM cron.job WHERE jobname = 'process-email-queue';
```

以下のような結果が表示されればOK:
```
jobid | schedule    | command                | active
------|-------------|------------------------|-------
1     | * * * * *   | SELECT net.http_post...| t
```

## ✅ 動作確認

### テスト1: 手動でメールをキューに追加

`scripts/test_welcome_email.sql` を実行します。

```bash
# psqlで実行
supabase db remote psql < scripts/test_welcome_email.sql

# または、Supabase DashboardのSQL Editorにコピペ
```

### テスト2: キューの状態を確認

1分待ってから、以下のクエリで確認:

```sql
-- 最新のキュー状態
SELECT
  status,
  recipient_email,
  created_at,
  processed_at
FROM email_queue
ORDER BY created_at DESC
LIMIT 5;
```

`status` が `sent` になっていればOK！

### テスト3: 送信ログを確認

```sql
-- 最新の送信ログ
SELECT
  email_type,
  recipient_email,
  status,
  sent_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 5;
```

### テスト4: 実際にメールを受信

設定したメールアドレスの受信箱を確認し、ウェルカムメールが届いているか確認します。

📧 **届かない場合**:
- 迷惑メールフォルダを確認
- Resendのダッシュボードで送信ログを確認（https://resend.com/emails）
- `email_logs`テーブルの`error_message`を確認

### テスト5: 新規ユーザー登録フロー

実際に新しいアカウントを作成し、ウェルカムメールが自動送信されるか確認します。

## 🐛 トラブルシューティング

### メールが送信されない

#### 原因1: cronジョブが実行されていない

```sql
-- cronジョブの実行履歴を確認
SELECT
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-email-queue')
ORDER BY start_time DESC
LIMIT 10;
```

エラーがあれば`return_message`を確認。

#### 原因2: Edge Functionがエラーを出している

Supabase Dashboard > Edge Functions > email-queue-processor > Logs を確認。

#### 原因3: Resend APIキーが正しくない

```bash
# 環境変数を再設定
supabase secrets set RESEND_API_KEY=re_correct_key_here
```

Edge Functionを再デプロイ:
```bash
supabase functions deploy email-queue-processor
```

#### 原因4: キューにメールが追加されていない

```sql
-- プロフィール作成トリガーの確認
SELECT * FROM pg_trigger WHERE tgname = 'queue_welcome_email_trigger';

-- 手動でキューに追加
SELECT public.queue_email(
  (SELECT id FROM auth.users LIMIT 1),
  'welcome',
  'test@example.com',
  '{"user_name": "Test"}'::jsonb
);
```

### 手動でキュー処理を実行

cronを待たずに即座にテストしたい場合:

```sql
-- Edge Functionを手動で呼び出し
SELECT net.http_post(
  url := 'https://[PROJECT_REF].supabase.co/functions/v1/email-queue-processor',
  headers := jsonb_build_object(
    'Authorization', 'Bearer [SERVICE_ROLE_KEY]',
    'Content-Type', 'application/json'
  )
) AS request_id;
```

## 📊 監視とメンテナンス

### 定期的に確認すべき項目

1. **失敗したメールの確認**（週1回）
```sql
SELECT * FROM email_queue WHERE status = 'failed' ORDER BY processed_at DESC;
```

2. **キューの滞留確認**（日次）
```sql
SELECT COUNT(*) FROM email_queue WHERE status = 'pending' AND scheduled_at < NOW();
```

3. **送信統計**（月次）
```sql
SELECT
  email_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as success,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
FROM email_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY email_type;
```

### クリーンアップ（オプション）

古いレコードを削除してデータベースを軽量化:

```sql
-- 送信済みメール（7日以上前）
DELETE FROM email_queue WHERE status = 'sent' AND processed_at < NOW() - INTERVAL '7 days';

-- 失敗メール（30日以上前）
DELETE FROM email_queue WHERE status = 'failed' AND processed_at < NOW() - INTERVAL '30 days';

-- 古いログ（90日以上前）
DELETE FROM email_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

## 🔒 セキュリティ上の注意

1. **サービスロールキーの管理**
   - 絶対にGitにコミットしない
   - `.gitignore`に`*_email_queue_cron.sql`を追加
   - チーム内で安全に共有（1Password等）

2. **環境変数の保護**
   - Supabase SecretsはSupabaseのダッシュボードからのみアクセス可能
   - ログに出力しない

3. **RLS（Row Level Security）の確認**
   - `email_queue`と`email_logs`テーブルにRLSが設定済み
   - 一般ユーザーは自分のメールしか見えない

## 📚 関連ドキュメント

- [Resend API Documentation](https://resend.com/docs)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [pg_cron Documentation](https://github.com/citusdata/pg_cron)

## 🎉 完了

おめでとうございます！ウェルカムメール自動送信システムのデプロイが完了しました。

新規ユーザーが登録すると、1分以内にウェルカムメールが自動送信されます。

---

**作成日**: 2025-10-02
**最終更新**: 2025-10-02
