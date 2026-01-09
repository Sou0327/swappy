# 🚀 Tatum Webhook 本番デプロイメント完全ガイド
**Version**: 3.0.0 - 完全修正版
**Date**: 2024年9月17日
**Critical Fix**: XRP共有アドレス対応 + 完全入金処理フロー

## 🚨 **重要：本修正の必要性**

### 修正前の致命的問題
1. **入金が残高に反映されない**: `user_assets`テーブル未更新
2. **XRPで406エラー**: 複数ユーザー共有アドレス対応不備
3. **データ整合性問題**: `deposit_transactions`テーブル未使用

### 修正後の改善点
- ✅ 3段階完全入金処理フロー
- ✅ XRP Destination Tag完全対応
- ✅ 高度なエラーハンドリング
- ✅ 本番運用監視機能

---

## 🚨 **新着: Dead Letter Queue 重大機能不全の修正**
*2025年1月18日追加*

### 緊急修正内容
Dead Letter Queue システムに重大な機能不全が発見され、修正しました：

#### 修正前の致命的問題
1. **背景処理完全停止**: `startBackgroundProcessing()`がコメントアウト
2. **再処理ロジック未実装**: `reprocessWebhookEvent`が常にエラー発生
3. **外部トリガー機構欠如**: 手動再試行手段なし
4. **金融データの永久ロス**: 失敗した入金トランザクションが復旧不可能

#### 修正後の改善点
- ✅ **reprocessWebhookEvent完全実装**: 実際の入金処理ロジックを統合
- ✅ **手動リトライAPI**: `GET /retry-dead-letter`エンドポイント追加
- ✅ **統計監視API**: `GET /dead-letter-stats`エンドポイント追加
- ✅ **金融データ保護**: 失敗イベントの完全再処理対応
- ✅ **運用チーム対応**: 手動復旧手順と監視機能

### 新しいAPI エンドポイント

#### 1. 手動リトライエンドポイント
```bash
GET /retry-dead-letter
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

**レスポンス例**:
```json
{
  "success": true,
  "processed": 5,
  "errors": [],
  "correlationId": "uuid-xxx",
  "message": "5件のイベントを再処理しました"
}
```

#### 2. 統計監視エンドポイント
```bash
GET /dead-letter-stats
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
```

**レスポンス例**:
```json
{
  "success": true,
  "stats": {
    "totalEvents": 12,
    "pendingEvents": 3,
    "retryingEvents": 0,
    "failedEvents": 2,
    "successEvents": 7,
    "averageRetries": 1.5,
    "oldestEvent": "2025-01-18T10:30:00Z"
  }
}
```

### 日常運用手順（追加）

#### Dead Letter Queue 日次監視
```bash
# 1. 統計確認（1日1回推奨）
curl -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  "https://your-project.supabase.co/functions/v1/tatum-webhook/dead-letter-stats"

# 2. 問題検出指標
# - pendingEvents > 0 → 再処理が必要
# - failedEvents > 0 → 永続的失敗イベントあり
# - oldestEvent が24時間以上前 → 長時間滞留

# 3. 手動復旧実行（問題検出時）
curl -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  "https://your-project.supabase.co/functions/v1/tatum-webhook/retry-dead-letter"
```

#### 緊急時データベース操作
```sql
-- 1. 失敗イベントの詳細確認
SELECT id, webhook_id, error_message, error_type, retry_count, payload
FROM dead_letter_events
WHERE status = 'failed'
ORDER BY updated_at DESC;

-- 2. 強制的にpendingステータスに戻す（慎重に実行）
UPDATE dead_letter_events
SET status = 'pending', retry_count = 0, next_retry_at = NOW()
WHERE id = 'event-id-here' AND status = 'failed';

-- 3. 期限切れイベントの手動削除
DELETE FROM dead_letter_events
WHERE expires_at < NOW() - INTERVAL '7 days';
```

### アラート設定（追加推奨）
```yaml
dead_letter_queue_alerts:
  pending_events_alert:
    condition: "pendingEvents > 10 for 10 minutes"
    severity: "high"
    action: "immediate_manual_retry"

  failed_events_alert:
    condition: "failedEvents > 5 for 5 minutes"
    severity: "critical"
    action: "financial_team_escalation"

  old_events_alert:
    condition: "oldestEvent > 24h"
    severity: "warning"
    action: "investigate_processing_delays"
```

---

## 📋 **デプロイ前チェックリスト**

### Phase 1: 事前準備
- [ ] **データベースバックアップ**: 全テーブルの完全バックアップ
- [ ] **依存関係確認**: 必須RPC関数 `upsert_user_asset` の存在
- [ ] **テスト環境検証**: 修正版コードでの完全テスト
- [ ] **監視アラート設定**: 処理失敗時の通知設定

### Phase 2: デプロイ実行
- [ ] **メンテナンスモード**: 入金処理の一時停止
- [ ] **ファイル置換**: `index.ts` → `index-fixed.ts`
- [ ] **設定確認**: 環境変数とシークレット
- [ ] **ヘルスチェック**: `/health` エンドポイント確認

### Phase 3: 事後検証
- [ ] **処理フロー確認**: 3テーブル更新の動作確認
- [ ] **XRP処理確認**: Destination Tag付きテスト
- [ ] **エラー処理確認**: 意図的失敗テスト
- [ ] **監視ダッシュボード**: メトリクス正常表示

---

## 🔧 **デプロイ手順**

### Step 1: データベース準備確認
```sql
-- 必須テーブルの存在確認
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('deposits', 'deposit_transactions', 'user_assets', 'deposit_addresses');

-- 必須RPC関数の存在確認
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'upsert_user_asset';

-- XRP Destination Tag制約の確認
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
AND indexname = 'uniq_xrp_destination_tag';
```

### Step 2: 修正版ファイルのデプロイ

#### 方法A: 直接置換（推奨）
```bash
# 現在のファイルをバックアップ
cp supabase/functions/tatum-webhook/index.ts supabase/functions/tatum-webhook/index-backup-$(date +%Y%m%d-%H%M%S).ts

# 修正版で置換
cp supabase/functions/tatum-webhook/index-fixed.ts supabase/functions/tatum-webhook/index.ts

# エラーハンドリングモジュール追加
# enhanced-error-handling.ts は既に作成済み

# デプロイ実行
supabase functions deploy tatum-webhook --no-verify-jwt
```

#### 方法B: 段階的移行（安全重視）
```bash
# 新しいファンクション名で一時デプロイ
cp supabase/functions/tatum-webhook supabase/functions/tatum-webhook-v3 -r
cp supabase/functions/tatum-webhook/index-fixed.ts supabase/functions/tatum-webhook-v3/index.ts

# テスト用デプロイ
supabase functions deploy tatum-webhook-v3 --no-verify-jwt

# テスト完了後、本番切替
# Tatumダッシュボードでエンドポイント変更
```

### Step 3: 設定確認

#### 環境変数チェック
```typescript
// 必要な環境変数
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TATUM_WEBHOOK_SECRET=your_strong_random_secret_here  // 必須: 32文字以上のランダム値
LOG_LEVEL=INFO  // 本番: INFO, 開発: DEBUG
ENABLE_AUDIT_LOGGING=true
ENABLE_METRICS=true
ENABLE_RATE_LIMIT=true
```

#### 🚨 **重要：ローカル開発時のシークレット管理**

**セキュリティ修正**: ハードコードされたシークレットを削除しました。
ローカル開発時は必ず環境変数を設定してからコマンドを実行してください：

```bash
# 環境変数を設定（シェルセッション用）
export TATUM_WEBHOOK_SECRET=your_secure_webhook_secret_here

# または.envファイルを作成（推奨）
# 強力なランダムシークレットを生成して使用
echo "TATUM_WEBHOOK_SECRET=$(openssl rand -hex 32)" > .env
source .env

# その後Supabaseローカル開発サーバーを起動
supabase functions serve tatum-webhook
```

**注意事項**:
- `.env`ファイルは`.gitignore`に追加済み
- 本番環境では強力なシークレットキーを使用
- シークレットをコードやConfig fileにハードコード**厳禁**

---

## 🔍 **動作検証手順**

### 1. ヘルスチェック
```bash
# ヘルスチェックエンドポイント
curl https://your-project.supabase.co/functions/v1/tatum-webhook/health

# 期待されるレスポンス
{
  "status": "healthy",
  "version": "3.0.0",
  "timestamp": "2024-09-17T...",
  "checks": {
    "database": { "healthy": true },
    "rpc_functions": { "healthy": true }
  }
}
```

### 2. テストトランザクション送信
```bash
# サンプルWebhookペイロード
curl -X POST https://your-project.supabase.co/functions/v1/tatum-webhook \
  -H "Content-Type: application/json" \
  -H "x-tatum-signature: sha512=your_signature" \
  -d '{
    "type": "INCOMING_NATIVE_TX",
    "data": {
      "address": "test_address",
      "amount": "1.5",
      "txId": "test_tx_hash_001",
      "confirmations": 15,
      "chain": "ethereum",
      "destinationTag": "12345"
    }
  }'
```

### 3. データベース確認
```sql
-- 3段階処理の確認
SELECT
  dt.transaction_hash,
  dt.amount as dt_amount,
  dt.status as dt_status,
  d.amount as d_amount,
  d.status as d_status,
  ua.balance as user_balance
FROM deposit_transactions dt
LEFT JOIN deposits d ON dt.transaction_hash = d.transaction_hash
  AND dt.user_id = d.user_id
LEFT JOIN user_assets ua ON dt.user_id = ua.user_id
  AND dt.asset = ua.currency
WHERE dt.transaction_hash = 'test_tx_hash_001';
```

---

## 📊 **監視とアラート設定**

### 1. 重要メトリクス
```typescript
// 監視すべき主要指標
const criticalMetrics = {
  'webhook.processing_success_rate': '>95%',  // 成功率
  'webhook.processing_time_p95': '<5000ms',   // 95%ile処理時間
  'deposit.3stage_completion_rate': '>99%',   // 3段階処理完了率
  'xrp.destination_tag_resolution_rate': '>98%', // XRP処理成功率
  'database.connection_health': '100%'        // DB接続健全性
};
```

### 2. アラート条件
```yaml
alerts:
  high_error_rate:
    condition: "error_rate > 10% for 5 minutes"
    severity: "critical"
    action: "immediate_investigation"

  processing_delay:
    condition: "processing_time > 30s for 3 requests"
    severity: "warning"
    action: "performance_review"

  database_issues:
    condition: "database_health < 100%"
    severity: "critical"
    action: "database_team_escalation"

  xrp_processing_failure:
    condition: "xrp_destination_tag_errors > 5 in 10 minutes"
    severity: "high"
    action: "xrp_configuration_check"
```

### 3. ログ監視クエリ
```sql
-- エラー率監視
SELECT
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE level = 'ERROR') as error_count,
  ROUND(COUNT(*) FILTER (WHERE level = 'ERROR') * 100.0 / COUNT(*), 2) as error_rate
FROM audit_logs
WHERE event = 'webhook_processing'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;

-- XRP処理状況
SELECT
  COUNT(*) as xrp_transactions,
  COUNT(*) FILTER (WHERE details->>'memo' IS NOT NULL) as with_destination_tag,
  COUNT(*) FILTER (WHERE details->>'success' = 'true') as successful
FROM audit_logs
WHERE event = 'deposit_transaction_processed_v3'
  AND details->>'chain' = 'xrp'
  AND created_at > NOW() - INTERVAL '24 hours';
```

---

## 🆘 **トラブルシューティング**

### よくある問題と解決方法

#### 1. user_assets更新失敗
```sql
-- 原因調査
SELECT * FROM pg_stat_activity WHERE query LIKE '%upsert_user_asset%';

-- 手動修復
SELECT public.upsert_user_asset(
  'user_id_here'::uuid,
  'ETH',
  1.5::numeric
);
```

#### 2. XRP Destination Tag解決失敗
```sql
-- 原因調査: 重複するDestination Tag
SELECT network, destination_tag, COUNT(*)
FROM deposit_addresses
WHERE chain = 'xrp' AND destination_tag IS NOT NULL
GROUP BY network, destination_tag
HAVING COUNT(*) > 1;

-- 解決: 重複の解消（要注意：データ損失の可能性）
-- 運用チームと相談の上で実行
```

#### 3. 大量リクエストによるタイムアウト
```typescript
// レート制限確認
const rateLimitConfig = {
  maxRequestsPerMinute: 100,
  burstLimit: 20,
  timeWindowMs: 60000
};

// 必要に応じて調整
```

### エラー分類と対処法

| エラーカテゴリ | 重要度 | 対処法 | 例 |
|---|---|---|---|
| **Network** | Medium | リトライ | Connection timeout |
| **Database** | High | スキーマ確認 | Relation does not exist |
| **Validation** | Low | ログ記録 | Invalid transaction format |
| **Business** | Low | 続行 | Duplicate transaction |
| **System** | Critical | 即座対応 | Memory exhaustion |

---

## 📈 **パフォーマンス最適化**

### 1. データベースインデックス確認
```sql
-- 重要インデックスの存在確認
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('deposits', 'deposit_transactions', 'user_assets', 'deposit_addresses')
AND indexname IN (
  'idx_deposit_transactions_tx_hash',
  'idx_deposits_user_id',
  'idx_user_assets_user_id',
  'uniq_xrp_destination_tag'
);
```

### 2. クエリパフォーマンス監視
```sql
-- 長時間実行クエリの監視
SELECT
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%deposit%' OR query LIKE '%user_assets%'
ORDER BY total_time DESC
LIMIT 10;
```

---

## 🛡️ **セキュリティ考慮事項**

### 1. Webhook署名検証
```typescript
// 必須設定
TATUM_WEBHOOK_SECRET=your_strong_secret_key

// コードでの検証
private async verifyWebhookSignature(request, body) {
  // HMAC-SHA512による署名検証実装済み
}
```

### 2. レート制限
```typescript
// 現在の設定
const rateLimitConfig = {
  maxRequestsPerMinute: 100,
  distributedRateLimit: true,
  ipBasedThrottling: true
};
```

### 3. 機密データ保護
- ログに秘密鍵やトークン情報を出力しない
- エラーメッセージに機密情報を含めない
- 監査ログの適切な保護

---

## 📋 **運用チェックリスト**

### 毎日の確認項目
- [ ] エラー率: <5%
- [ ] 処理時間: 95%ile <5秒
- [ ] 3段階処理完了率: >99%
- [ ] XRP処理成功率: >98%

### 週次の確認項目
- [ ] データベース容量増加率
- [ ] パフォーマンストレンド分析
- [ ] セキュリティログ監査
- [ ] バックアップ整合性確認

### 月次の確認項目
- [ ] 全体システム診断実行
- [ ] アラート閾値の見直し
- [ ] パフォーマンス最適化検討
- [ ] セキュリティアップデート確認

---

## 📞 **緊急時連絡先**

### エスカレーション手順
1. **レベル1**: 自動アラート検知
2. **レベル2**: 開発チーム通知
3. **レベル3**: システム管理者エスカレーション
4. **レベル4**: 経営陣報告

### 緊急時コマンド
```bash
# 緊急停止
supabase functions delete tatum-webhook

# ロールバック
cp supabase/functions/tatum-webhook/index-backup-*.ts supabase/functions/tatum-webhook/index.ts
supabase functions deploy tatum-webhook --no-verify-jwt

# システム診断
curl https://your-project.supabase.co/functions/v1/tatum-webhook/health
```

---

## ✅ **デプロイ完了確認**

デプロイ完了後、以下を確認してチェック：

- [ ] ヘルスチェック: 正常
- [ ] テストトランザクション: 3段階処理完了
- [ ] XRPテスト: Destination Tag正常処理
- [ ] エラー処理: 適切なログ出力
- [ ] 監視: メトリクス正常表示
- [ ] アラート: 通知システム動作確認

**🎉 デプロイ成功！本番環境での安全な入金処理が開始されました。**

---

*このドキュメントは重要なシステム修正のガイドです。不明点がある場合は開発チームに相談してください。*