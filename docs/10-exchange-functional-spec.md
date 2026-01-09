# 取引所風ウォレット 機能仕様（公開デモ/ペーパートレード）

本書は、現行UIを「取引所の見え方をしたウォレット（少人数・手動運用）」として公開可能にするための機能仕様です。実取引（マッチング）は行わず、注文・約定はシミュレーション（ペーパートレード）とし、入金はチェーン別の最小方式で段階導入します。

## 0. フェーズ前提（今回決定事項）

- 実取引なし: マッチングエンジンは実装しない。注文/約定はUI表示用のシミュレーション。
- 入金のみ段階導入: まず EVM 系のみ実入金、その後 BTC → XRP を追加。その他チェーンは後段。
- 運用は手動前提: 集約送金（スイープ）や出金は運用時間帯に手動対応。サーバは秘密鍵を保持しない。
- KYC は任意: 管理画面から ON/OFF 可能（当面 OFF を想定）。
- モバイル対応: レスポンシブ/PWA。ネイティブアプリは対象外。
- セキュリティ: 最小限（環境変数管理/監査ログ/緊急停止）を優先。外部ペンテは後段。

チェーン別の入金仕様は「12-multichain-deposit-spec.md」を参照。

## 1. ドメイン定義（ペーパートレード前提）

- Market(取引ペア): 例 `BTC/USDT`。属性: `base`, `quote`, `price_tick`, `qty_step`, `min_notional`, `status`(active/paused/disabled)
- Order(注文): `id`, `user_id`, `market`, `side`(buy/sell), `type`(limit/market), `price`, `qty`, `filled_qty`, `status`, `time_in_force`(GTC/IOC/FOK), `post_only`, `created_at`, `updated_at`
- Trade(約定): `id`, `taker_order_id`, `maker_order_id`, `market`, `price`, `qty`, `taker_fee`, `maker_fee`, `created_at`
- LedgerEntry(仕訳): `id`, `user_id`, `currency`, `amount`, `locked_delta`, `kind`(order_lock, order_unlock, trade_fill, fee, deposit, withdrawal, adj), `ref_type`(order/trade/deposit/withdrawal), `ref_id`, `created_at`
- Balance: `total = SUM(amount)`, `locked = SUM(locked_delta)`, `available = total - locked`。

注: 今フェーズでは `orders/trades` はシミュレーテッドデータ。`ledger_entries` は入出金・調整のみを確定記録し、取引による資産移動は行わない。

## 2. DB(提案)

以下はSupabase(PostgreSQL)想定のDDLドラフトです。(実装時はRLS/索引/制約を調整)。チェーン固有の入金フィールドは「12-multichain-deposit-spec.md」の拡張案を参照。

```sql
-- markets
CREATE TABLE markets (
  id text PRIMARY KEY,          -- 例: 'BTC-USDT'
  base text NOT NULL,
  quote text NOT NULL,
  price_tick numeric(20,10) NOT NULL,
  qty_step numeric(20,10) NOT NULL,
  min_notional numeric(20,10) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- orders
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  market text NOT NULL REFERENCES markets(id),
  side text NOT NULL CHECK (side IN ('buy','sell')),
  type text NOT NULL CHECK (type IN ('limit','market')),
  price numeric(20,10),
  qty numeric(20,10) NOT NULL,
  filled_qty numeric(20,10) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','partially_filled','filled','canceled','rejected')),
  time_in_force text NOT NULL DEFAULT 'GTC' CHECK (time_in_force IN ('GTC','IOC','FOK')),
  post_only boolean NOT NULL DEFAULT false,
  client_id text,               -- 冪等性/外部ID
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- trades（今フェーズはシミュレーションで生成）
CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market text NOT NULL REFERENCES markets(id),
  taker_order_id uuid NOT NULL REFERENCES orders(id),
  maker_order_id uuid NOT NULL REFERENCES orders(id),
  price numeric(20,10) NOT NULL,
  qty numeric(20,10) NOT NULL,
  taker_fee numeric(20,10) NOT NULL DEFAULT 0,
  maker_fee numeric(20,10) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ledger_entries (不可変)
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  currency text NOT NULL,
  amount numeric(20,10) NOT NULL,           -- 正/負: 総残高に影響
  locked_delta numeric(20,10) NOT NULL DEFAULT 0, -- 拘束残高の変化
  kind text NOT NULL CHECK (kind IN ('order_lock','order_unlock','trade_fill','fee','deposit','withdrawal','adj')),
  ref_type text NOT NULL CHECK (ref_type IN ('order','trade','deposit','withdrawal','system')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_market ON orders(market);
CREATE INDEX idx_trades_market_time ON trades(market, created_at DESC);
CREATE INDEX idx_ledger_user_currency ON ledger_entries(user_id, currency);
```

RLSの基本方針:
- `orders`, `trades`, `ledger_entries`: 本人のみ参照可、作成は本人、更新は状態遷移を許す安全なRPC経由
- `markets`: 公開読み取り、更新は管理者のみ

## 3. 業務ロジック（今回フェーズの運用）

- 注文・約定はUI表現のためにシミュレーションとして生成する（板・歩み値・自己履歴）。
- 台帳は「入出金・調整」のみ確定記録する（取引による移動はしない）。
- 価格/数量/最小取引金額などの検証はUIで行い、バックエンドでは軽量チェックに留める。
- 取消/部分約定などの状態は擬似遷移で表現し、資産残高は変動させない。

## 4. API(雛形)

REST/RPC (認証必須):
- POST `/orders` {market, side, type, price?, qty, client_id?}
- DELETE `/orders/{id}`
- GET `/orders` (own, filter by status)
- GET `/trades` (own)
- GET `/balances` (集計ビュー)
RPC:
- `place_limit_order(market, side, price, qty, tif, client_id)`
- `cancel_order(order_id)` / `cancel_all_orders(market?)`
- `get_orderbook_levels(market, side, limit)`
- `get_my_trades(from?, to?, offset?, limit?)`

入金関連（詳細は「12-multichain-deposit-spec.md」）:
- GET `/deposit/address?chain=evm&asset=USDC`（受取先取得）
- GET `/deposit/history`（自分の入金履歴）
- POST `/withdrawals`（申請のみ。実送金は手動）

WebSocket(公開):
- `ticker:{market}` / `trades:{market}` / `orderbook:{market}`

WebSocket(認証):
- `orders` (自分の注文/約定更新)
- `balances` (自分の残高更新)

## 5. 精度/表示・ロックの意味

- 保存は `numeric(20,10)` 等の十分精度
- 表示用丸めはUI側（Tailwind+shadcn）で制御、内部は丸めない
- 今フェーズでは取引用のロックは用いない（`locked_delta=0` 運用）。入出金/調整時のみ `amount` が変化。

## 6. 冪等性/整合性

- `client_id` による重複防止
- 状態遷移は単一トランザクションで台帳仕訳と同時確定
- 再実行可能なイベント処理（注文投入/取消/擬似約定）

## 7. 監査/運用

- `audit_logs`: 管理操作/重要イベントの保管（入金検知/スイープ実行/出金承認など）
- メトリクス: 入金取り込み遅延、失敗率、WS接続数、APIエラー率
- 緊急停止: チェーン別の「入金受付スイッチ」を用意（準備中/受付停止を明示）

## 8. 非機能(抜粋)

- 可用性: 単一AZ障害に耐える（将来）
- 拡張性: マーケット増加/チェーン追加時のスケールを意識
- セキュリティ: 環境変数管理・最小権限・鍵非保持。2FA/出金保護は別フェーズ。

---

この仕様は「公開デモ/ペーパートレード」の骨格です。実取引への拡張やチェーン別入金の詳細は、段階導入時点で本書および「12-multichain-deposit-spec.md」に反映します。

