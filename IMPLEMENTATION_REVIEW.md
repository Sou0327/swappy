# 指値注文監視システム実装レビュー資料

## 🔄 修正対応（2025-10-03）

レビューフィードバックに基づき、以下の重大・重要な問題を修正しました：

### ✅ 修正1: 通知テンプレートシステムの統合（重要）

**問題**: `limit_order_executed`テンプレートを参照せず、通知メッセージをハードコードしていた

**影響**: 既存通知フローとの整合性が取れず、テンプレート管理が破綻する懸念

**修正内容**:
1. **新規マイグレーション作成**: `supabase/migrations/20251010000011_add_limit_order_executed_template.sql`
   - `limit_order_executed`テンプレートをnotification_templatesテーブルに追加
   - 変数: `market`, `side`, `quantity`, `executed_price`, `limit_price`, `order_id`

2. **通知ヘルパー修正**: `src/lib/notifications/createLimitOrderExecuted.ts`
   - テンプレートを`notification_templates`から取得
   - `replace_template_variables` RPC で変数置換
   - フォールバックメカニズム追加（テンプレート取得失敗時）

3. **Edge Function修正**: `supabase/functions/limit-order-monitor/index.ts`
   - `createSuccessNotification`関数をテンプレートシステム対応に変更
   - テンプレート取得 → 変数置換 → 通知挿入の流れを実装

**検証方法**:
```sql
-- テンプレート確認
SELECT * FROM notification_templates WHERE template_key = 'limit_order_executed';
```

---

### ✅ 修正2: リアルタイムWebSocket監視の実装（重大）

**初回問題**: RESTの単発価格取得のみで、WebSocketによるリアルタイム監視が未実装

**レビュー後の追加問題**: 初回修正では短期接続（5秒）で価格を1回取得するのみで、真のリアルタイム監視になっていなかった。Cron（10秒ポーリング）に依存したままで、仕様で求められている「アクティブ注文がある間はWebSocketを維持し、リアルタイムな価格更新を利用する」ハイブリッド構成が未実装

**影響**: WebSocket本来の利点（リアルタイム性、再接続ロジック）が活かせず、ポーリングと同等の挙動に留まっていた

**最終修正内容**:
1. **長時間接続WebSocket監視**: `supabase/functions/limit-order-monitor/index.ts`
   - `monitorMarketWithWebSocket()`: 20秒間接続を維持し、イベント駆動で価格更新を処理
   - WebSocketの`onmessage`イベントごとに全注文を即座にチェック
   - 価格更新が来るたびにリアルタイムで約定判定を実行
   - Edge Function 25秒制限内で最大限の監視時間を確保

2. **RESTポーリングフォールバック**: `supabase/functions/limit-order-monitor/index.ts`
   - `monitorMarketWithRestPolling()`: 1秒間隔で20秒間継続的にポーリング
   - WebSocket失敗時の真のフォールバック（単発取得ではなく継続監視）
   - 各ポーリングで全注文をチェック

3. **ハイブリッドオーケストレーション**: `monitorMarketRealtime()`
   - WebSocket優先で実行、失敗時は自動的にRESTポーリングにフォールバック
   - 環境変数`PREFER_WEBSOCKET`で制御（デフォルト: true）
   - 重複実行防止用の`executedOrderIds` Setを全市場で共有

4. **フォールバック機構の実装** (2025-10-04追加修正):
   - **初回問題**: `monitorMarketWithWebSocket`が常に`resolve`を呼び、接続失敗時にRESTフォールバックが機能しない
   - **初回修正**: Promise `reject`を適切に実装
     - 接続確立前の失敗（onerror, onclose, timeout, 生成失敗）→ `reject`
     - 接続確立後の失敗 → `resolve`（部分的成功、取得済みの結果を返す）
     - `settled`フラグで二重処理を防止

   - **2回目問題**: 接続確立後でも価格更新を受信する前に切断された場合、空の結果で`resolve`されてRESTフォールバックに入らず監視が停止
     - **具体例**: WebSocket瞬断、Binance側の即座の接続拒否、ネットワーク遅延
     - **影響**: その市場の監視が20秒間完全に停止し、ハイブリッド監視が機能しない

   - **最終修正**: `priceUpdateReceived`フラグを追加
     - 価格更新を受信したことを明示的に追跡
     - 判定条件: `!connectionEstablished || !priceUpdateReceived` → `reject`
     - 価格更新受信済みの失敗のみ → `resolve`（真の部分的成功）

   - **結果**:
     - 接続確立だけでなく、実際の価格データ受信を確認
     - WebSocket瞬断時も確実にRESTポーリングにフォールバック
     - 真のハイブリッド監視を実現

5. **アーキテクチャ特性**:
   - **10秒Cron + 20秒監視ウィンドウ = 実質的な継続監視**
   - 監視ウィンドウが重複することで、価格更新を見逃すリスクを最小化
   - Edge Function制約内でリアルタイム性を最大化
   - 堅牢なフォールバック機構で高可用性を実現

**動作フロー**:
```
Cron（10秒間隔）
  ↓
Edge Function起動（最大25秒）
  ├─ WebSocket接続試行
  │   ├─ 【接続成功 & 価格更新受信】→ 20秒間監視
  │   │   ├─ onmessage → priceUpdateReceived=true
  │   │   ├─ onmessage → 価格更新 → 全注文チェック → 約定実行
  │   │   ├─ onmessage → 価格更新 → 全注文チェック → 約定実行
  │   │   └─ ... (イベント駆動で継続)
  │   │       └─ エラー発生 → resolve（部分的成功）✅
  │   │
  │   └─ 【失敗】→ reject → catch → RESTフォールバック
  │       ├─ onerror（接続確立前）→ reject
  │       ├─ onerror（接続後/価格更新前）→ reject ★NEW
  │       ├─ onclose（接続確立前）→ reject
  │       ├─ onclose（接続後/価格更新前）→ reject ★NEW
  │       ├─ timeout（接続確立前）→ reject
  │       ├─ timeout（接続後/価格更新前）→ reject ★NEW
  │       └─ WebSocket生成失敗 → reject
  │
  └─ catch: RESTポーリングにフォールバック
      └─ RESTポーリング（1秒×20回）
          ├─ 価格取得 → 全注文チェック → 約定実行
          ├─ 1秒待機 → 価格取得 → 全注文チェック
          └─ ... (20秒間継続)

★ 重要: 価格更新を1回でも受信していれば部分的成功、受信していなければ完全な失敗
```

**検証方法**:

1. **WebSocket成功ケース**:
```bash
[Monitor] 🚀 Starting realtime monitoring for BTC/USDT: 5 orders, 20000ms duration
[WS Realtime] ✅ Connected to BTC/USDT for 20000ms monitoring
[WS Realtime] 📊 Price update for BTC/USDT: 43250.50
[WS Realtime] 📊 Price update for BTC/USDT: 43251.20
[WS Realtime] 🎯 Order abc123 triggered: buy @ 43300, current: 43251.20
[Monitor] Successfully executed order abc123
[WS Realtime] 📊 Price update for BTC/USDT: 43252.00
...
[Monitor] ✅ WebSocket monitoring completed for BTC/USDT: 1 executions
```

2. **WebSocket失敗 → RESTフォールバックケース（接続確立前）**:
```bash
[Monitor] 🚀 Starting realtime monitoring for ETH/USDT: 3 orders, 20000ms duration
[WS Realtime] ❌ Connection timeout for ETH/USDT (20000ms)
[Monitor] ⚠️ WebSocket monitoring failed for ETH/USDT, falling back to REST polling: WebSocket connection timeout for ETH/USDT
[REST Polling] ⚠️ Starting REST polling for ETH/USDT (20000ms, 1000ms interval)
[REST Polling] 📊 Price update for ETH/USDT: 2250.30
[REST Polling] 📊 Price update for ETH/USDT: 2250.50
[REST Polling] 🎯 Order xyz789 triggered: sell @ 2250, current: 2250.50
[Monitor] Successfully executed order xyz789
...
[REST Polling] ✅ Polling completed for ETH/USDT: 1 executions
```

3. **WebSocket瞬断 → RESTフォールバックケース（接続確立後/価格更新前）**:
```bash
[Monitor] 🚀 Starting realtime monitoring for BNB/USDT: 2 orders, 20000ms duration
[WS Realtime] ✅ Connected to BNB/USDT for 20000ms monitoring
[WS Realtime] ❌ Connection closed prematurely for BNB/USDT: code=1006, reason=, connection=true, priceUpdate=false
[Monitor] ⚠️ WebSocket monitoring failed for BNB/USDT, falling back to REST polling: WebSocket closed prematurely for BNB/USDT (no price updates received)
[REST Polling] ⚠️ Starting REST polling for BNB/USDT (20000ms, 1000ms interval)
[REST Polling] 📊 Price update for BNB/USDT: 315.20
[REST Polling] 📊 Price update for BNB/USDT: 315.30
...
[REST Polling] ✅ Polling completed for BNB/USDT: 0 executions
```

---

### ✅ 修正3: 10秒間隔Cron実行の実装（重大）

**問題**: Supabase Cron設定が`* * * * *`（毎分）で、要求仕様の10秒間隔を満たしていない

**影響**: リアルタイム性の要求を満たせず、価格変動への即応性が低下

**技術的制約の理解**:
- Supabase Cronは最小間隔が1分（秒単位指定不可）
- Cron標準構文`*/10 * * * *`は「10分ごと」を意味（10秒ではない）

**修正内容**:
1. **GitHub Actionsワークフロー作成**: `.github/workflows/limit-order-monitor.yml`
   - 毎分実行（`cron: '*/1 * * * *'`）
   - 1回の実行で6回Edge Functionを呼び出し（10秒間隔）
   - 手動実行パラメータ対応（呼び出し回数、間隔調整可能）

2. **Config.toml更新**: `supabase/config.toml`
   - コメント追加: 10秒間隔が必要な場合はGitHub Actions使用
   - Supabase Cronはバックアップ用途として維持
   - 併用による冗長性確保の説明

3. **README更新**: コスト考慮、セットアップ手順追加
   - GitHub Actions無料枠: 月2000分
   - 月間使用時間: 約720分（無料枠超過の可能性）
   - GitHubシークレット設定手順

**実装選択肢と採用理由**:
| 方式 | 利点 | 欠点 | 採用理由 |
|------|------|------|----------|
| GitHub Actions | 10秒間隔可能 | 無料枠制限 | ✅ 採用（柔軟性高） |
| Supabase Cron | 追加コストなし | 最小1分 | △ バックアップ用 |
| 外部Cron | 細かい制御 | 追加インフラ | ❌ 複雑性増 |

**検証方法**:
```bash
# GitHub Actionsログで6回呼び出しと10秒間隔を確認
🔄 Call 1/6 at 12:34:00
  ⏳ Waiting 10s until next call...
🔄 Call 2/6 at 12:34:10
  ⏳ Waiting 10s until next call...
...
```

---

### 📊 修正後のアーキテクチャ

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
                  ├─► 1. 指値注文取得
                  │
                  ├─► 2. 市場ごとにグループ化
                  │
                  ├─► 3. 【修正】ハイブリッド価格取得
                  │      WebSocket（5秒） → 失敗時REST（10秒）
                  │
                  ├─► 4. 約定条件判定
                  │
                  ├─► 5. execute_market_order RPC
                  │
                  └─► 6. 【修正】テンプレート通知作成
                         limit_order_executed template使用
```

---

### 📝 修正ファイル一覧

| ファイル | 修正内容 | 行数変更 |
|---------|---------|---------|
| `supabase/migrations/20251010000011_add_limit_order_executed_template.sql` | 新規作成 | +60 |
| `src/lib/notifications/createLimitOrderExecuted.ts` | テンプレート統合 | +80, -30 |
| `supabase/functions/limit-order-monitor/index.ts` | WebSocket統合、テンプレート統合 | +150, -20 |
| `src/lib/binance/websocket.ts` | 短期接続関数追加 | +120 |
| `.github/workflows/limit-order-monitor.yml` | 新規作成 | +100 |
| `supabase/config.toml` | コメント更新 | +8, -3 |
| `supabase/functions/limit-order-monitor/README.md` | 全面更新 | +100, -50 |
| `IMPLEMENTATION_REVIEW.md` | このセクション追加 | +200 |

---

## 📋 実装概要

**目的**: 指値注文を自動的に監視し、Binance市場価格が約定条件を満たした際に自動執行するシステム

**実装方式**: Supabase Edge Function + Cron + 既存execute_market_order RPC活用

**実装期間**: 2025年（実装計画に基づく一括実装）

**新規作成ファイル数**: 8ファイル

---

## 🏗️ システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Cron Scheduler                  │
│                     (毎分実行: * * * * *)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          Edge Function: limit-order-monitor                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. アクティブ指値注文取得                            │  │
│  │    SELECT * FROM orders                              │  │
│  │    WHERE type='limit' AND status IN (...)            │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. 市場別グループ化                                  │  │
│  │    groupOrdersByMarket()                             │  │
│  │    → [BTC/USDT: [order1, order2], ...]              │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 3. 並列市場監視 (Promise.allSettled)                │  │
│  │    ├─ BTC/USDT → Binance REST API                   │  │
│  │    ├─ ETH/USDT → Binance REST API                   │  │
│  │    └─ ...                                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 4. 約定条件判定                                      │  │
│  │    買い: currentPrice <= limitPrice                  │  │
│  │    売り: currentPrice >= limitPrice                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 5. 約定実行                                          │  │
│  │    CALL execute_market_order(...)                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                    │
│                         ▼                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 6. 通知作成                                          │  │
│  │    INSERT INTO notifications (...)                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Binance REST API                          │
│    https://api.binance.com/api/v3/ticker/price             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 ファイル構成と実装詳細

### 1. Binanceシンボルマッピング (`src/lib/binance/symbol.ts`)

**配置理由**: Binance統合の基礎となる変換ロジックを独立したユーティリティとして配置

**実装目的**:
- システム内部の市場表記（`BTC/USDT`）とBinance API形式（`BTCUSDT`）の相互変換
- 型安全性の確保とサポート市場の明示的な定義

**主要機能**:
```typescript
// 1. 市場名 → Binanceシンボル変換
marketToBinanceSymbol("BTC/USDT") → "BTCUSDT"

// 2. Binanceシンボル → 市場名変換
binanceSymbolToMarket("BTCUSDT") → "BTC/USDT"

// 3. 市場名の検証
validateMarket("BTC/USDT") → true

// 4. サポート市場確認
isSupportedMarket("BTC/USDT") → true

// 5. 市場名パース
parseMarket("BTC/USDT") → { base: "BTC", quote: "USDT" }
```

**設計判断**:
- **TypeScript型定義**: `SupportedMarket`型で10市場を明示的に定義
- **バリデーション**: 正規表現による形式検証で不正な入力を排除
- **エラーハンドリング**: 例外スローによる明示的なエラー通知
- **拡張性**: 新規市場追加は`SUPPORTED_MARKETS`配列に追加するだけ

**技術的特徴**:
- 完全な型安全性（`as const`によるリテラル型）
- 双方向変換をサポート
- バッチ処理対応（`marketsToBinanceSymbols`）

---

### 2. Binance RESTクライアント (`src/lib/binance/rest.ts`)

**配置理由**: WebSocketフォールバック用の価格取得レイヤーとして独立実装

**実装目的**:
- Binance REST APIからの価格取得
- フォールトトレラントな通信（リトライ・タイムアウト）
- レート制限への対応

**主要機能**:
```typescript
// 1. シンプルな価格取得
await fetchTickerPrice("BTCUSDT") → 43250.50

// 2. 24時間ティッカー情報取得（詳細版）
await fetch24hrTicker("BTCUSDT") → { lastPrice, priceChange, ... }

// 3. 複数シンボル一括取得
await fetchMultiplePrices(["BTCUSDT", "ETHUSDT"]) → Map<symbol, price>

// 4. APIヘルスチェック
await checkApiHealth() → true/false
```

**設計判断**:
- **指数バックオフリトライ**: `1秒 → 2秒 → 4秒` の遅延でリトライ
- **タイムアウト制御**: デフォルト10秒、AbortControllerによる確実な中断
- **レート制限対応**: 429エラー時に`Retry-After`ヘッダーを尊重
- **エラー分類**: ネットワークエラー、APIエラー、タイムアウトを区別

**技術的特徴**:
```typescript
// リトライ設定のカスタマイズ
const customConfig: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  timeoutMs: 15000,
};
await fetchTickerPrice("BTCUSDT", customConfig);
```

**フォールトトレランス**:
- 最大3回のリトライ（デフォルト）
- 指数バックオフによる負荷分散
- 詳細なエラーログ
- Promise rejectionによる明示的なエラー伝播

---

### 3. Binance WebSocketクライアント (`src/lib/binance/websocket.ts`)

**配置理由**: 将来的なリアルタイム監視のための基盤として実装

**実装目的**:
- リアルタイム価格ストリーミング（現在は未使用、将来の拡張用）
- Deno環境での動作（既存のブラウザ版とは別実装）
- 自動再接続とフォールトトレラント設計

**主要機能**:
```typescript
// 1. 単一シンボル監視
const client = new BinanceWebSocketClient(
  "btcusdt",
  {
    onPriceUpdate: (event) => console.log(event.price),
    onStateChange: (state) => console.log(state),
    onError: (error) => console.error(error),
  }
);
await client.connect();

// 2. 複数シンボル並列監視
const monitor = new MultiSymbolWebSocketMonitor({
  onPriceUpdate: handlePriceUpdate,
});
await monitor.addSymbols(["btcusdt", "ethusdt"]);
```

**設計判断**:
- **自動再接続**: 最大5回の再接続試行（指数バックオフ）
- **Ping/Pong監視**: 60秒間データがない場合に自動再接続
- **状態管理**: `connecting` → `connected` → `reconnecting` → `failed`
- **イベント駆動**: コールバックベースの設計で柔軟な統合

**技術的特徴**:
- Deno環境対応（既存のブラウザ版`binance-ws.ts`とは独立）
- miniTickerストリーム使用（最軽量）
- Promise.allSettledによる並列監視
- 手動再接続とクローズの制御

**現在の使用状況**:
- Edge Functionではまだ使用していない（REST APIを使用）
- 将来的により高頻度の監視が必要になった際の拡張ポイント

---

### 4. トレーディング設定 (`src/config/trading.ts`)

**配置理由**: 環境変数管理と設定の一元化

**実装目的**:
- すべてのトレーディング関連設定を1箇所で管理
- 環境変数からの動的設定読み込み
- Deno/Node.js/Browser環境の自動判別

**主要設定**:
```typescript
// 1. 指値注文監視設定
DEFAULT_LIMIT_ORDER_MONITOR_CONFIG = {
  monitorCycleMs: 10000,        // 監視サイクル: 10秒
  priceCheckIntervalMs: 1000,   // 価格チェック: 1秒
  monitorTimeoutMs: 120000,     // タイムアウト: 2分
  preferWebSocket: true,        // WebSocket優先
  enableRestFallback: true,     // RESTフォールバック有効
  executionMaxRetries: 3,       // 約定リトライ: 3回
  maxConcurrentMarkets: 20,     // 最大並列市場: 20
}

// 2. Binance API設定
DEFAULT_BINANCE_API_CONFIG = {
  wsUrl: "wss://stream.binance.com:9443",
  restApiUrl: "https://api.binance.com",
  apiKey: undefined,    // オプション
  apiSecret: undefined, // オプション
}

// 3. WebSocket設定
WEBSOCKET_CONFIG = {
  maxReconnectAttempts: 5,
  initialReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  connectionTimeoutMs: 10000,
  pingTimeoutMs: 60000,
}

// 4. REST API設定
REST_API_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 10000,
}
```

**設計判断**:
- **環境自動判別**: Deno/Node.js/Browserを自動検出
- **デフォルト値**: すべての設定にフォールバック値を定義
- **型安全性**: すべての設定にTypeScript型定義
- **検証機能**: `validateConfig()`で設定の妥当性をチェック

**環境変数サポート**:
```bash
# 監視設定
LIMIT_ORDER_MONITOR_CYCLE_MS=10000
LIMIT_ORDER_PREFER_WEBSOCKET=true

# Binance API
BINANCE_API_URL=https://api.binance.com
BINANCE_WS_URL=wss://stream.binance.com:9443

# リトライ設定
BINANCE_REST_MAX_RETRIES=3
BINANCE_WS_MAX_RECONNECT=5
```

**ユーティリティ関数**:
```typescript
// 設定ログ出力（シークレット除外）
logConfig();

// 設定検証
const { valid, errors } = validateConfig();
if (!valid) {
  console.error("Configuration errors:", errors);
}
```

---

### 5. 通知作成ヘルパー (`src/lib/notifications/createLimitOrderExecuted.ts`)

**配置理由**: 通知ロジックを再利用可能なヘルパーとして独立

**実装目的**:
- 指値注文約定時のユーザー通知作成
- 成功・エラー両方の通知に対応
- バッチ処理のサポート

**主要機能**:
```typescript
// 1. 約定成功通知
await createLimitOrderExecutedNotification(supabase, {
  userId: "user-123",
  orderId: "order-456",
  market: "BTC/USDT",
  side: "buy",
  price: 43250.50,
  qty: 0.01,
});

// 2. バッチ通知作成
await createBatchLimitOrderNotifications(supabase, [
  order1, order2, order3
]);

// 3. エラー通知
await createLimitOrderErrorNotification(
  supabase,
  userId,
  orderId,
  market,
  "残高不足"
);
```

**通知フォーマット**:
```
【成功通知】
タイトル: "指値注文が約定しました"
メッセージ:
  市場: BTC/USDT
  種類: 買い注文
  数量: 0.01
  価格: 43,250
  注文ID: order-456
タイプ: success

【エラー通知】
タイトル: "指値注文の約定に失敗しました"
メッセージ:
  市場: BTC/USDT
  注文ID: order-456
  エラー: 残高不足

  注文は引き続き監視されます。
タイプ: error
```

**設計判断**:
- **日本語メッセージ**: ユーザー向けに分かりやすい日本語表示
- **詳細情報**: 市場、価格、数量などの重要情報を含む
- **エラーハンドリング**: 通知作成失敗時もシステムを停止しない
- **Supabaseクライアント注入**: テスタビリティとDI対応

**既存システム統合**:
- `notifications`テーブルを使用（既存のスキーマを活用）
- RLSポリシーに準拠
- 既存の通知UI（フロントエンド）と互換性あり

---

### 6. Edge Function (`supabase/functions/limit-order-monitor/index.ts`)

**配置理由**: Supabase Edge Functionsの標準ディレクトリ構造

**実装目的**:
- 指値注文監視のメインロジック
- 定期実行（Cron）とAPI呼び出し両方に対応
- すべてのコンポーネントを統合

**処理フロー**:
```typescript
async function main() {
  // 1. Supabaseクライアント初期化
  const supabase = createClient(url, serviceRoleKey);

  // 2. アクティブ指値注文取得
  const orders = await fetchActiveLimitOrders(supabase);
  // → SELECT * FROM orders WHERE type='limit' AND status IN (...)

  // 3. 市場ごとにグループ化
  const marketGroups = groupOrdersByMarket(orders);
  // → [{ market: "BTC/USDT", orders: [...] }, ...]

  // 4. 並列市場監視
  const results = await Promise.allSettled(
    marketGroups.map(market => monitorMarket(supabase, market))
  );

  // 5. 結果集計とレスポンス
  return {
    ordersChecked: orders.length,
    executed: successCount,
    failed: failureCount,
  };
}
```

**市場監視ロジック**:
```typescript
async function monitorMarket(supabase, marketData) {
  // 1. Binance価格取得（REST API）
  const currentPrice = await fetchPriceViaRest(marketData.binanceSymbol);

  // 2. 各注文をチェック
  for (const order of marketData.orders) {
    // 3. 約定条件判定
    if (shouldExecuteOrder(order, currentPrice)) {
      // 4. execute_market_order RPC呼び出し
      const result = await executeOrder(supabase, order, currentPrice);

      // 5. 通知作成
      if (result.success) {
        await createSuccessNotification(supabase, order, currentPrice);
      } else {
        await createErrorNotification(supabase, order, result.error);
      }
    }
  }
}
```

**約定条件判定**:
```typescript
function shouldExecuteOrder(order, currentPrice) {
  if (order.side === 'buy') {
    // 買い注文: 現在価格が指値以下
    return currentPrice <= order.price;
  } else {
    // 売り注文: 現在価格が指値以上
    return currentPrice >= order.price;
  }
}
```

**設計判断**:

1. **並列処理**: `Promise.allSettled`で市場ごとに並列実行
   - 理由: 1市場の失敗が他の市場に影響しない
   - メリット: スケーラビリティ、高速化

2. **SERVICE_ROLE_KEY使用**: RLSバイパスで管理者権限実行
   - 理由: システム処理としてすべてのユーザーの注文にアクセス
   - セキュリティ: Edge Function内部でのみ使用、外部に露出しない

3. **エラーハンドリング戦略**:
   - 市場レベル: 価格取得失敗時は該当市場の全注文をスキップ
   - 注文レベル: 個別の約定失敗は他の注文に影響せず
   - システムレベル: 致命的エラーは500エラーで返却

4. **ログ戦略**:
   ```typescript
   console.log('[Monitor] Starting...'); // 開始
   console.log('[Monitor] Found N orders'); // 注文数
   console.log('[Monitor] Current price for BTC/USDT: 43250'); // 価格
   console.log('[Monitor] Order triggered...'); // トリガー
   console.error('[Monitor] Error...'); // エラー
   ```

**パフォーマンス考慮**:
- 並列処理によるスループット向上
- 早期リターン（注文がない場合）
- タイムアウト設定（10秒）で無限待機を防止

**CORSヘッダー**:
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```
理由: 手動API呼び出しやフロントエンドからの呼び出しに対応

---

### 7. Cron設定 (`supabase/config.toml`)

**配置理由**: Supabaseプロジェクト設定の標準ファイル

**実装内容**:
```toml
[functions.limit-order-monitor]
schedule = "* * * * *"  # 毎分実行
```

**設計判断**:
- **実行間隔**: 毎分（Supabase Cronの最小間隔）
- **10秒間隔の実現**: 外部サービス（GitHub Actions等）を使用する拡張パス

**制限事項**:
- Supabase Cronは秒単位の指定をサポートしていない
- より高頻度が必要な場合は、READMEに記載の代替案を使用

**代替案（README記載）**:
```yaml
# GitHub Actions (.github/workflows/limit-order-monitor.yml)
on:
  schedule:
    - cron: '*/1 * * * *'  # 毎分実行
jobs:
  monitor:
    steps:
      - run: |
          for i in {1..6}; do
            curl -X POST "$FUNCTION_URL"
            sleep 10
          done
```
これにより10秒間隔を実現可能

---

### 8. READMEドキュメント (`supabase/functions/limit-order-monitor/README.md`)

**配置理由**: Edge Functionと同じディレクトリに運用ガイドを配置

**実装目的**:
- セットアップ手順の提供
- 運用方法の説明
- トラブルシューティングガイド

**構成内容**:

1. **概要とアーキテクチャ図**
   - システム全体のフロー
   - 各コンポーネントの関係

2. **セットアップ手順**
   - 環境変数設定
   - デプロイ方法
   - Cron設定確認

3. **使用方法**
   - 手動実行（テスト用）
   - レスポンス例
   - 監視対象の説明

4. **ログとモニタリング**
   - ログの確認方法
   - パフォーマンスメトリクス

5. **エラーハンドリング**
   - 自動リトライの説明
   - エラー通知の仕組み

6. **トラブルシューティング**
   - よくある問題と解決方法
   - デバッグ手順

7. **高頻度監視の実装方法**
   - GitHub Actionsを使った10秒間隔監視

8. **関連ファイル一覧**
   - 全実装ファイルへのリンク

**設計判断**:
- **包括的**: セットアップから運用まで全てカバー
- **実践的**: コピペで使えるコマンド例
- **保守性**: トラブルシューティングを充実

---

## 🔄 データフロー詳細

### 1. 注文取得フロー
```
Cron Trigger
    ↓
Edge Function起動
    ↓
fetchActiveLimitOrders()
    ↓
SELECT * FROM orders
WHERE type = 'limit'
  AND status IN ('open', 'partially_filled')
ORDER BY created_at ASC
    ↓
LimitOrder[] (TypeScript型)
```

### 2. 市場監視フロー
```
LimitOrder[]
    ↓
groupOrdersByMarket()
    ↓
MarketOrders[] = [
  { market: "BTC/USDT", binanceSymbol: "BTCUSDT", orders: [...] },
  { market: "ETH/USDT", binanceSymbol: "ETHUSDT", orders: [...] },
]
    ↓
Promise.allSettled([
  monitorMarket(BTC/USDT),
  monitorMarket(ETH/USDT),
])
```

### 3. 価格取得フロー
```
monitorMarket(marketData)
    ↓
fetchPriceViaRest("BTCUSDT")
    ↓
fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT")
    ↓
リトライロジック（最大3回、指数バックオフ）
    ↓
{ symbol: "BTCUSDT", price: "43250.50" }
    ↓
parseFloat("43250.50") → 43250.50 (number)
```

### 4. 約定実行フロー
```
shouldExecuteOrder(order, 43250.50) → true
    ↓
executeOrder(supabase, order, 43250.50)
    ↓
supabase.rpc('execute_market_order', {
  p_market: "BTC/USDT",
  p_side: "buy",
  p_qty: 0.01,
  p_price: 43250.50
})
    ↓
execute_market_order RPC実行
  ├─ orders テーブル更新 (status='filled')
  ├─ trades テーブル挿入
  ├─ ledger_entries テーブル挿入
  └─ user_assets テーブル更新
    ↓
成功/失敗の結果
```

### 5. 通知作成フロー
```
約定成功
    ↓
createSuccessNotification(supabase, order, price)
    ↓
INSERT INTO notifications (
  user_id,
  title: "指値注文が約定しました",
  message: "市場: BTC/USDT\n...",
  type: "success",
  read: false
)
    ↓
ユーザーのUIに通知が表示
```

---

## 🛡️ エラーハンドリング戦略

### レイヤー別エラー処理

**1. Binance APIレイヤー (rest.ts)**
```typescript
try {
  // API呼び出し
} catch (error) {
  if (error.name === 'AbortError') {
    // タイムアウト → リトライ
  } else if (response.status === 429) {
    // レート制限 → Retry-After待機 → リトライ
  } else {
    // その他のエラー → ログ記録 → 例外スロー
  }
}
```

**2. Edge Functionレイヤー (index.ts)**
```typescript
// 市場レベル
try {
  const price = await fetchPriceViaRest(symbol);
} catch (error) {
  // 価格取得失敗 → 該当市場の全注文をスキップ
  // 他の市場は継続処理
}

// 注文レベル
try {
  await executeOrder(order, price);
} catch (error) {
  // 約定失敗 → エラー通知作成
  // 他の注文は継続処理
}

// システムレベル
try {
  // メイン処理
} catch (error) {
  // 致命的エラー → 500レスポンス
  return new Response(JSON.stringify({ error }), { status: 500 });
}
```

**3. 通知レイヤー (createLimitOrderExecuted.ts)**
```typescript
try {
  await supabase.from('notifications').insert(...);
} catch (error) {
  // 通知作成失敗 → ログ記録
  // システム処理は継続（通知は重要だが、約定は完了している）
}
```

### エラー復旧戦略

| エラータイプ | 復旧方法 | リトライ | ユーザー通知 |
|-------------|---------|---------|------------|
| ネットワークタイムアウト | 自動リトライ | ✅ 3回 | ❌ |
| Binanceレート制限 | 待機後リトライ | ✅ 3回 | ❌ |
| Binance APIエラー | ログ記録、スキップ | ❌ | ❌ |
| 残高不足 | ログ記録、エラー通知 | ❌ | ✅ |
| RPC実行失敗 | ログ記録、エラー通知 | ❌ | ✅ |
| 通知作成失敗 | ログ記録のみ | ❌ | ❌ |

---

## 🔧 技術的な設計判断

### 1. なぜREST APIを使用？（WebSocketではなく）

**判断**: 現在はREST APIのみ使用、WebSocketは実装済みだが未使用

**理由**:
- ✅ **シンプル**: Edge Functionの実行モデルに適合（短時間実行）
- ✅ **信頼性**: 1回のリクエストで価格取得完了
- ✅ **デバッグ**: ログとトレーシングが容易
- ✅ **コスト**: WebSocket接続維持のコスト不要

**WebSocket実装の意図**:
- 将来的に10秒以下の高頻度監視が必要になった場合の拡張ポイント
- 長時間実行のワーカープロセスで使用可能

### 2. なぜPromise.allSettled？（Promise.allではなく）

**判断**: 市場並列監視に`Promise.allSettled`を使用

**理由**:
- ✅ **フォールトトレラント**: 1市場の失敗が他に波及しない
- ✅ **部分成功**: 一部の市場で成功すれば価値がある
- ✅ **詳細な結果**: 各市場の成功/失敗を個別に把握

**コード例**:
```typescript
// Promise.all → 1つでも失敗すると全て失敗
// Promise.allSettled → 各結果を個別に取得
const results = await Promise.allSettled([
  monitorMarket(btcUsdt),  // 成功
  monitorMarket(ethUsdt),  // 失敗
  monitorMarket(bnbUsdt),  // 成功
]);
// → [fulfilled, rejected, fulfilled]
```

### 3. なぜSERVICE_ROLE_KEYを使用？

**判断**: Edge FunctionでSERVICE_ROLE_KEYを使用

**理由**:
- ✅ **RLSバイパス**: 全ユーザーの注文にアクセスが必要
- ✅ **システム処理**: ユーザー認証とは無関係のバックグラウンドジョブ
- ✅ **セキュリティ**: Edge Function内部でのみ使用、外部に露出しない

**セキュリティ考慮**:
```typescript
// 環境変数から取得（コードにハードコードしない）
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// 用途を限定（注文監視のみ）
// 他の用途では使用しない設計
```

### 4. なぜ指数バックオフ？

**判断**: リトライに指数バックオフを採用

**理由**:
- ✅ **負荷分散**: 同時リトライによるサーバー過負荷を防止
- ✅ **成功率向上**: 一時的な障害からの回復時間を確保
- ✅ **ベストプラクティス**: API通信の標準的なパターン

**実装**:
```typescript
// 1回目: 1秒待機
// 2回目: 2秒待機
// 3回目: 4秒待機
const delay = initialDelay * Math.pow(2, attempt);
```

### 5. なぜ型安全性を重視？

**判断**: TypeScriptの型システムを最大限活用

**理由**:
- ✅ **バグ予防**: コンパイル時にエラー検出
- ✅ **保守性**: リファクタリングの安全性
- ✅ **ドキュメント**: 型定義が仕様を表現

**例**:
```typescript
// サポート市場を型で制限
type SupportedMarket = "BTC/USDT" | "ETH/USDT" | ...;

// 関数の引数と戻り値を明示
function marketToBinanceSymbol(market: string): string { ... }

// インターフェースで構造を定義
interface LimitOrder {
  id: string;
  market: string;
  side: 'buy' | 'sell';
  // ...
}
```

---

## 📊 パフォーマンス特性

### 実行時間の内訳（推定）

| フェーズ | 処理内容 | 時間（市場数=3） |
|---------|---------|----------------|
| 1. 注文取得 | DB SELECT | 50-100ms |
| 2. グループ化 | メモリ処理 | <10ms |
| 3. 価格取得（並列） | Binance API × 3 | 200-500ms |
| 4. 条件判定 | メモリ処理 | <10ms |
| 5. 約定実行 | RPC呼び出し | 100-300ms/件 |
| 6. 通知作成 | DB INSERT | 50-100ms/件 |
| **合計** | | **1-3秒** |

### スケーラビリティ

**市場数による影響**:
- 1-10市場: 1-2秒
- 10-20市場: 2-4秒
- 20-50市場: 4-10秒（並列処理による）

**ボトルネック**:
- Binance API呼び出し（並列化済み）
- 約定実行（直列処理、市場あたり数件程度）

**最適化の余地**:
- WebSocket使用で価格取得を高速化
- 約定実行のバッチ化（将来）

---

## 🧪 テスト戦略

### 単体テストの推奨

**1. symbol.ts**
```typescript
describe('marketToBinanceSymbol', () => {
  it('should convert BTC/USDT to BTCUSDT', () => {
    expect(marketToBinanceSymbol('BTC/USDT')).toBe('BTCUSDT');
  });

  it('should throw on invalid format', () => {
    expect(() => marketToBinanceSymbol('INVALID')).toThrow();
  });
});
```

**2. rest.ts**
```typescript
describe('fetchTickerPrice', () => {
  it('should retry on timeout', async () => {
    // モックでタイムアウトを再現
    // リトライ動作を検証
  });

  it('should respect rate limit', async () => {
    // 429エラーを再現
    // Retry-After待機を検証
  });
});
```

**3. Edge Function**
```typescript
describe('shouldExecuteOrder', () => {
  it('should trigger buy order when price drops', () => {
    const order = { side: 'buy', price: 43000 };
    expect(shouldExecuteOrder(order, 42900)).toBe(true);
    expect(shouldExecuteOrder(order, 43100)).toBe(false);
  });
});
```

### 統合テスト

**手動テスト手順**:
```bash
# 1. テスト用指値注文を作成
psql -c "INSERT INTO orders (user_id, market, side, type, price, qty, status)
         VALUES ('test-user', 'BTC/USDT', 'buy', 'limit', 40000, 0.01, 'open');"

# 2. Edge Functionを手動実行
curl -X POST http://localhost:54321/functions/v1/limit-order-monitor

# 3. ログを確認
# → 価格取得、条件判定、約定実行のログを確認

# 4. 結果を検証
psql -c "SELECT * FROM orders WHERE id='...';"
psql -c "SELECT * FROM notifications WHERE user_id='test-user';"
```

---

## 🚀 デプロイと運用

### デプロイ手順

```bash
# 1. コードの確認
git status
git diff

# 2. Lintチェック
npm run lint

# 3. 型チェック
npx tsc --noEmit

# 4. ローカルテスト
npx supabase functions serve limit-order-monitor
# → 別ターミナルでcurlテスト

# 5. 本番デプロイ
npx supabase functions deploy limit-order-monitor

# 6. Cron設定確認
# Supabaseダッシュボード → Edge Functions → Cron Jobs

# 7. 動作監視
# ダッシュボード → Edge Functions → limit-order-monitor → Logs
```

### モニタリングポイント

**成功の指標**:
- ✅ Cron実行が毎分正常に完了
- ✅ エラーログがない（または許容範囲内）
- ✅ 指値注文が適切に約定
- ✅ ユーザー通知が正しく作成

**アラート設定**:
- ❌ 5分以上実行なし → Cronが停止
- ❌ エラー率 > 50% → システム異常
- ❌ 実行時間 > 30秒 → パフォーマンス劣化

---

## 📝 今後の拡張ポイント

### 1. WebSocketへの移行
**目的**: より高頻度の価格監視
**実装**: 既に`websocket.ts`が完成済み
**手順**:
```typescript
// Edge Functionで使用
const monitor = new MultiSymbolWebSocketMonitor({
  onPriceUpdate: (event) => {
    // リアルタイムで約定判定
    checkAndExecuteOrders(event.symbol, event.price);
  }
});
await monitor.addSymbols(activeSymbols);
```

### 2. パフォーマンス最適化
- 約定実行のバッチ化
- 価格キャッシュ（短時間）
- データベースインデックス最適化

### 3. 高度な注文タイプ
- ストップロス注文
- トレーリングストップ
- OCO注文（One Cancels the Other）

### 4. リスク管理
- 市場ボラティリティ監視
- 異常価格の検出とスキップ
- 注文実行量の制限

---

## ✅ 実装完了チェックリスト

- [x] Binanceシンボルマッピング実装
- [x] REST APIクライアント実装（リトライ・タイムアウト）
- [x] WebSocketクライアント実装（将来の拡張用）
- [x] 設定管理システム実装
- [x] 通知作成ヘルパー実装
- [x] Edge Function実装（メインロジック）
- [x] Cron設定追加
- [x] READMEドキュメント作成
- [x] エラーハンドリング実装
- [x] ログ記録実装
- [x] 型定義完備
- [x] CORS対応
- [x] 環境変数サポート

---

## 📚 参考資料

### 使用技術
- **Supabase Edge Functions**: Deno環境のサーバーレス関数
- **Binance REST API**: https://binance-docs.github.io/apidocs/spot/en/
- **TypeScript**: 型安全な開発
- **PostgreSQL**: データベース（Supabase提供）

### 関連ドキュメント
- Supabase Edge Functions: https://supabase.com/docs/guides/functions
- Binance API: https://binance-docs.github.io/apidocs/
- Deno Deploy: https://deno.com/deploy

---

**実装日**: 2025年
**実装者**: Claude Code + SuperClaude Framework
**レビュー準備完了**: 本資料をもってレビュー可能
