# Limit Order Monitor

指値注文を自動監視・約定するSupabase Edge Function

## 概要

このEdge Functionは、データベースに登録されている指値注文（limit order）を定期的に監視し、Binanceの市場価格が約定条件を満たした際に自動的に注文を執行します。

### 主な機能

- ✅ アクティブな指値注文の自動監視
- ✅ **リアルタイムハイブリッド監視**:
  - WebSocket: 20秒間接続維持、イベント駆動価格更新処理
  - REST API: 1秒間隔ポーリングフォールバック（20秒継続）
  - 重複実行防止機構
- ✅ 約定条件の自動判定（買い/売り）
- ✅ `execute_market_order` RPCによる約定実行
- ✅ **テンプレートシステム**: `limit_order_executed`テンプレート使用
- ✅ ユーザーへの通知作成（成功/失敗）
- ✅ 並列市場監視でスケーラブルな処理
- ✅ エラーハンドリングとログ記録
- ✅ **10秒間隔監視**: GitHub Actions統合による実質的な継続監視

## アーキテクチャ

```
┌─────────────────┐         ┌───────────────────┐
│  Supabase Cron  │ 毎分    │ GitHub Actions    │ 毎分（6回呼び出し=10秒間隔）
└────────┬────────┘         └─────────┬─────────┘
         │                            │
         └────────────────┬───────────┘
                          │
                          ▼
         ┌─────────────────────────────────────┐
         │  limit-order-monitor Edge Function  │
         └────────┬────────────────────────────┘
                  │
                  ├─► 1. 指値注文取得 (orders table)
                  │
                  ├─► 2. 市場ごとにグループ化
                  │
                  ├─► 3. リアルタイム監視（ハイブリッド方式）
                  │      ┌──────────────────────────────┐
                  │      │ WebSocket (優先)              │
                  │      │  ├─ 長時間接続（20秒維持）     │
                  │      │  ├─ イベント駆動価格更新処理   │
                  │      │  ├─ 各更新で全注文チェック     │
                  │      │  └─ 失敗時フォールバック↓     │
                  │      │ REST API ポーリング           │
                  │      │  ├─ 1秒間隔で20秒間継続       │
                  │      │  └─ 各ポーリングで全注文チェック│
                  │      └──────────────────────────────┘
                  │      ※ 10秒間隔Cron + 20秒監視ウィンドウ
                  │        = 実質的な継続監視を実現
                  │
                  ├─► 4. 約定条件判定
                  │      ├─ 買い: currentPrice <= limitPrice
                  │      └─ 売り: currentPrice >= limitPrice
                  │
                  ├─► 5. execute_market_order RPC呼び出し
                  │
                  └─► 6. テンプレート通知作成
                         ┌──────────────────────┐
                         │ limit_order_executed │
                         │  テンプレート取得     │
                         │  ↓                   │
                         │ replace_template_    │
                         │  variables RPC       │
                         │  ↓                   │
                         │ notifications挿入    │
                         └──────────────────────┘
```

## セットアップ

### 1. 環境変数の設定

以下の環境変数が必要です：

```bash
# Supabase設定（自動設定済み）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ハイブリッド監視設定
PREFER_WEBSOCKET=true  # WebSocket優先（デフォルト: true）

# オプション: Binance API設定（カスタマイズする場合）
BINANCE_API_URL=https://api.binance.com
BINANCE_WS_URL=wss://stream.binance.com:9443

# オプション: リトライ設定
BINANCE_REST_MAX_RETRIES=3
BINANCE_REST_TIMEOUT_MS=10000
```

### 2. Functionのデプロイ

```bash
# ローカルでのテスト
npx supabase functions serve limit-order-monitor

# 本番環境へのデプロイ
npx supabase functions deploy limit-order-monitor
```

### 3. Cronスケジュールの確認

`supabase/config.toml`にスケジュール設定が含まれています：

```toml
[functions.limit-order-monitor]
schedule = "* * * * *" # 毎分実行
```

デプロイ後、Supabaseダッシュボードの「Edge Functions」→「Cron Jobs」で設定を確認できます。

## 使用方法

### 手動実行（テスト用）

```bash
# ローカル環境で実行
curl -X POST http://localhost:54321/functions/v1/limit-order-monitor \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# 本番環境で実行
curl -X POST https://your-project.supabase.co/functions/v1/limit-order-monitor \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### レスポンス例

**成功時：**

```json
{
  "success": true,
  "ordersChecked": 5,
  "marketsMonitored": 3,
  "executed": 2,
  "failed": 0,
  "duration": 1523,
  "timestamp": "2025-01-15T12:34:56.789Z",
  "results": [
    {
      "orderId": "order-123",
      "success": true
    },
    {
      "orderId": "order-456",
      "success": true
    }
  ]
}
```

**注文がない場合：**

```json
{
  "success": true,
  "message": "No active limit orders to monitor",
  "duration": 145,
  "timestamp": "2025-01-15T12:34:56.789Z"
}
```

## 監視対象の注文

以下の条件を満たす注文が監視対象となります：

- `type = 'limit'`
- `status IN ('open', 'partially_filled')`

## 約定条件

### 買い注文
現在価格が指値価格以下になった場合に約定
```
currentPrice <= limitPrice
```

### 売り注文
現在価格が指値価格以上になった場合に約定
```
currentPrice >= limitPrice
```

## ログとモニタリング

### ログの確認

Supabaseダッシュボード：
1. 「Edge Functions」→「limit-order-monitor」
2. 「Logs」タブで実行ログを確認

主なログメッセージ：
```
[Monitor] Starting limit order monitor cycle...
[Monitor] Found 5 active limit orders
[Monitor] Monitoring 3 markets: BTC/USDT, ETH/USDT, BNB/USDT
[Monitor] Current price for BTC/USDT: 43250.50
[Monitor] Order order-123 triggered: buy @ 43000, current: 43250.50
[Monitor] Successfully executed order order-123
[Monitor] Cycle completed in 1523ms: 2 executed, 0 failed
```

### パフォーマンスメトリクス

- **処理時間**: 通常1-3秒（市場数による）
- **API呼び出し**: 市場数分のBinance REST APIリクエスト
- **並列処理**: 市場ごとに並列監視（`Promise.allSettled`使用）

## エラーハンドリング

### 自動リトライ

Binance API呼び出しは自動的にリトライされます：
- 最大リトライ回数: 3回（環境変数で変更可能）
- 指数バックオフ: 1秒 → 2秒 → 4秒
- タイムアウト: 10秒

### エラー通知

約定実行に失敗した場合、ユーザーにエラー通知が作成されます：
- タイトル: "指値注文の約定に失敗しました"
- タイプ: `error`
- 内容: エラーメッセージと注文情報

## トラブルシューティング

### 注文が約定されない

**確認事項：**
1. 注文のステータスが`open`または`partially_filled`か確認
2. 現在価格が約定条件を満たしているか確認（ログで価格を確認）
3. Binance APIが正常に応答しているか確認

**デバッグ方法：**
```sql
-- アクティブな指値注文を確認
SELECT id, market, side, price, qty, status
FROM orders
WHERE type = 'limit'
  AND status IN ('open', 'partially_filled');
```

### Binance APIエラー

**よくあるエラー：**
- `Request timeout`: ネットワークの問題。自動リトライで解決することが多い
- `Rate limit exceeded (429)`: APIレート制限。自動的に待機してリトライ
- `Invalid symbol`: 市場名が正しくない（BTC/USDT形式を確認）

**対処方法：**
1. ログでエラー詳細を確認
2. Binance APIの稼働状況を確認: https://www.binance.com/en/support/announcement
3. 環境変数の設定を確認

### 通知が作成されない

**確認事項：**
1. `notifications`テーブルのRLSポリシーが正しく設定されているか
2. Edge Functionが`SUPABASE_SERVICE_ROLE_KEY`を使用しているか（RLSバイパス）

## 高頻度監視（10秒間隔）の実装

Supabase Cronは最小間隔が1分のため、より高頻度の監視が必要な場合はGitHub Actionsを使用します：

### GitHub Actions ワークフロー

既に実装済みのワークフローファイル: `.github/workflows/limit-order-monitor.yml`

#### セットアップ手順

1. **GitHubリポジトリのシークレット設定**

   Settings > Secrets and variables > Actions で以下を追加：

   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

2. **ワークフローの有効化**

   - ワークフローファイルをmainブランチにプッシュ
   - GitHub Actionsが自動的に毎分実行を開始
   - 1回の実行で6回Edge Functionを呼び出し（10秒間隔）

3. **手動実行（テスト用）**

   ```bash
   # GitHubリポジトリの Actions タブから手動実行可能
   # パラメータ:
   #   - call_count: 呼び出し回数（デフォルト: 6）
   #   - interval_seconds: 間隔（デフォルト: 10秒）
   ```

#### コスト考慮

- **GitHub Actions無料枠**: 月2000分
- **1回の実行時間**: 約60秒（6回呼び出し）
- **月間実行回数**: 60分 × 24時間 × 30日 = 43,200回
- **月間使用時間**: 約720分（無料枠を超過する可能性あり）

**推奨**: 本番環境では実行頻度を調整するか、有料プランを検討してください。

### Supabase Cron との併用

両方を有効化することで冗長性を確保できます：

- **GitHub Actions**: 10秒間隔の高頻度監視
- **Supabase Cron**: バックアップとして1分間隔で実行

GitHub Actionsが何らかの理由で停止しても、Supabase Cronが継続して監視を実行します。

## 関連ファイル

### Core Implementation
- **Edge Function**: `supabase/functions/limit-order-monitor/index.ts`
  - メイン監視ロジック
  - ハイブリッド価格取得（WebSocket + REST）
  - テンプレート通知作成

### Binance Integration
- **REST API**: `src/lib/binance/rest.ts`
  - REST API価格取得
  - リトライロジック
- **WebSocket**: `src/lib/binance/websocket.ts`
  - 短期接続WebSocket（`fetchPriceViaWebSocket`）
  - 長時間接続クライアント（`BinanceWebSocketClient`）
- **Symbol Mapping**: `src/lib/binance/symbol.ts`
  - 市場名変換（BTC/USDT ↔ BTCUSDT）

### Notification System
- **通知ヘルパー**: `src/lib/notifications/createLimitOrderExecuted.ts`
  - テンプレートベース通知作成
  - `replace_template_variables` RPC使用
- **マイグレーション**: `supabase/migrations/20251010000011_add_limit_order_executed_template.sql`
  - `limit_order_executed`テンプレート定義

### Configuration
- **Trading Config**: `src/config/trading.ts`
  - グローバル設定
- **Supabase Config**: `supabase/config.toml`
  - Cron スケジュール設定
- **GitHub Actions**: `.github/workflows/limit-order-monitor.yml`
  - 10秒間隔監視ワークフロー

## ライセンス

このプロジェクトのライセンスに従います。
