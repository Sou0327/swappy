# メールキュー処理システム - マイグレーション情報

## 📋 基本情報

| 項目 | 内容 |
|------|------|
| 元のファイル名 | `20251010000011_email_queue_cron.sql` |
| 保留日 | 2025-10-02 |
| 保留理由 | クライアントからドメインが提供されておらず、Resendでのドメイン認証ができないため |
| 再開条件 | ドメイン取得 + Resend認証完了 |

## 📝 このマイグレーションの内容

このマイグレーションは、ウェルカムメール自動送信システムの中核となるcronジョブを設定します。

**主な処理**:
1. **pg_cron拡張を有効化**
   - PostgreSQLでcronジョブを実行するための拡張機能

2. **cronジョブの作成**
   - ジョブ名: `process-email-queue`
   - 実行頻度: 1分ごと（`* * * * *`）
   - 処理内容: email-queue-processor Edge Functionを呼び出し

3. **Supabase Vault統合**
   - サービスロールキーをVaultから安全に取得
   - Gitにキーが残らないセキュアな実装

## 🔗 依存関係

### 前提条件（すでに満たされている）:
- ✅ `email_queue` テーブルが作成済み
- ✅ `email_logs` テーブルが作成済み
- ✅ `queue_welcome_email()` トリガー関数が作成済み
- ✅ `email-sender` Edge Functionが実装済み
- ✅ `email-queue-processor` Edge Functionが実装済み

### 必要な設定（再開時に実施）:
- ❌ Supabase Vaultにサービスロールキーを保存
- ❌ email-queue-processor Edge Functionをデプロイ
- ❌ email-sender Edge Functionをデプロイ
- ❌ 環境変数の設定（RESEND_API_KEY, FROM_EMAIL等）

## 🚀 再開時の手順

### ステップ1: ドメイン認証の完了

1. クライアントからドメインを取得（例: `example.com`）
2. Resendダッシュボード（https://resend.com/domains）でドメイン追加
3. DNSレコードを設定してドメイン認証を完了

### ステップ2: マイグレーションファイルの復元

```bash
# このファイルを元の場所に移動
cp scripts/pending_migrations/email_queue_system/20251010000011_email_queue_cron.sql \
   supabase/migrations/20251010000011_email_queue_cron.sql
```

### ステップ3: デプロイ

`scripts/DEPLOY_WELCOME_EMAIL.md` の手順に従ってデプロイを実行してください。

**重要なポイント**:
1. プロジェクトURL（`[PROJECT_REF]`）を実際の値に置き換える
2. Vaultにサービスロールキーを保存
3. 環境変数を正しく設定
4. Edge Functionsを先にデプロイ
5. その後マイグレーションを適用

### ステップ4: 動作確認

```bash
# テストSQLを実行
psql < scripts/test_welcome_email.sql

# cronジョブの確認
SELECT * FROM cron.job WHERE jobname = 'process-email-queue';

# キューの状態確認
SELECT * FROM email_queue ORDER BY created_at DESC LIMIT 5;
```

## ⚠️ 注意事項

1. **タイムスタンプの維持**
   - マイグレーションファイル名のタイムスタンプ（`20251010000011`）は変更しないでください
   - Supabaseは既に適用済みのマイグレーションを追跡しているため、同じタイムスタンプを使用する必要があります

2. **セキュリティ**
   - サービスロールキーは必ずVaultに保存してください
   - `.env`ファイルやマイグレーションファイルに直接記述しないでください

3. **テスト**
   - 本番環境に適用する前に、必ずローカル環境でテストしてください
   - `scripts/LOCAL_TEST_GUIDE.md` を参照

4. **順序**
   - Edge Functionsを先にデプロイ → その後マイグレーション適用
   - 逆の順序で実行するとcronジョブがエラーになります

## 📚 関連ファイル

- デプロイガイド: `scripts/DEPLOY_WELCOME_EMAIL.md`
- ローカルテストガイド: `scripts/LOCAL_TEST_GUIDE.md`
- テストSQL: `scripts/test_welcome_email.sql`
- email-sender: `supabase/functions/email-sender/index.ts`
- email-queue-processor: `supabase/functions/email-queue-processor/index.ts`

## 📞 サポート

再開時に問題が発生した場合は、以下を確認してください:

1. Resendダッシュボードでドメイン認証ステータス
2. Supabase Edge Functionsのデプロイステータス
3. Supabase Vaultのシークレット設定
4. 環境変数の設定（特にRESEND_API_KEY, FROM_EMAIL）
5. cronジョブの実行履歴（`cron.job_run_details`）
