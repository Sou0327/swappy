# 保留中のマイグレーション

このディレクトリには、現時点では適用できないマイグレーションファイルを保管しています。

## 📁 email_queue_system/

**保留理由**: Resendでのドメイン認証が未完了のため

**現状**:
- ウェルカムメールシステムの実装は完了済み
- クライアントからドメインが提供されていないため、Resendでのドメイン認証ができない
- そのため、メール送信機能を有効化できず、マイグレーション適用も保留

**前提条件**（再開時に必要）:
- ✅ Resend APIキー取得済み
- ❌ メール送信用ドメインの認証完了 ← **現在これが未完了**
- ❌ FROM_EMAIL設定（認証済みドメイン）

**再開手順**:
1. クライアントからドメインを取得
2. Resendダッシュボードでドメイン認証を完了
3. `email_queue_system/20251010000011_email_queue_cron.sql` を `supabase/migrations/` に移動
4. `scripts/DEPLOY_WELCOME_EMAIL.md` の手順に従ってデプロイ
5. 環境変数を設定（RESEND_API_KEY, FROM_EMAIL, PLATFORM_NAME, PLATFORM_URL）
6. Edge Functionsをデプロイ
7. マイグレーションを適用
8. テストを実行

## ⚠️ 注意事項

- このディレクトリのファイルは `.gitignore` に含まれていません
- 開発履歴として保持されます
- マイグレーションファイル名のタイムスタンプは変更不要です
- 再開時は必ず `MIGRATION_INFO.md` を確認してください

## 関連ドキュメント

- デプロイ手順: `scripts/DEPLOY_WELCOME_EMAIL.md`
- ローカルテスト: `scripts/LOCAL_TEST_GUIDE.md`
- テストSQL: `scripts/test_welcome_email.sql`
