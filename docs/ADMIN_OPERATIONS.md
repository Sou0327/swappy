# 管理運用ガイド（Admin Operations Runbook）

本書は運用チーム向けに、入金検知・確認反映・ウォレット設定・スイープ（集約）・緊急対応の手順をまとめたものです。対象は本番/ステージング/ローカルすべてですが、本番は必ず権限管理と監査ログを前提にしてください。

## 概要
- 入金検知: Edge Function `deposit-detector` が各チェーンの入金を検知。`deposits`/`deposit_transactions` を更新。
- 確定反映: Edge Function `confirmations-updater` が `pending` を確定判定し、`deposits`/`user_assets` を更新。
- アドレス割当: Edge Function `address-allocator` が xpub からユーザーの受取アドレスを割当（EVM/ETH/USDT, BTC）。
- 集約（スイープ）: Edge Function `sweep-planner` が未署名Txを生成（EVM/ETH）。署名/放送は運用ウォレットが実施。
- 管理UI: `/admin/wallets` で「管理ウォレット」「ウォレットルート（xpub）」「スイープ計画一覧」を管理。

## 前提・権限
- 管理者ロール（`user_roles.role=admin`）を付与されたアカウントのみ、本書の作業を実施可能。
- Supabaseの `Service role key` は機密情報。Edge Functions の Secrets にのみ登録し、VCSやフロントの `.env` に保存しないこと。

## Secrets 設定手順
### 取得
- 本番/ステージング: Supabase ダッシュボード → Project → Settings → API → Keys
  - `Anon key`（公開可）/ `Service role`（機密）の2種
- ローカル: `npx supabase status` で表示

### 登録（CLI）
- 事前にログイン/リンク
  ```bash
  supabase login
  supabase link --project-ref <project_ref>
  ```
- 代表的なKeys
  ```bash
  # Supabase
  supabase secrets set SUPABASE_URL="https://<project>.supabase.co"
  supabase secrets set SUPABASE_ANON_KEY="<anon_key>"
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"

  # Ethereum/EVM
  supabase secrets set ETHEREUM_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<key>"
  supabase secrets set ETHEREUM_SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/<key>"
  supabase secrets set USDT_ERC20_CONTRACT="0xdAC17F958D2ee523a2206206994597C13D831ec7"
  supabase secrets set USDT_SEPOLIA_CONTRACT="<sepolia_usdt_contract>"

  # Tron
  supabase secrets set TRON_RPC_URL="https://api.trongrid.io"
  supabase secrets set TRONGRID_API_KEY="<trongrid_api_key>"

  # XRP
  supabase secrets set XRP_RPC_URL="wss://xrplcluster.com"

  # Cardano
  supabase secrets set BLOCKFROST_PROJECT_ID="<blockfrost_project_id>"
  ```

## ウォレット設定
### ウォレットルート（xpub）
- 画面: `/admin/wallets` → 「ウォレットルート（xpub）」
- 登録項目:
  - `chain/network/asset`: 例）`evm/ethereum/ETH`, `evm/sepolia/USDT`, `btc/mainnet/BTC`
  - `xpub`: 拡張公開鍵（非機密）。xprv/seedは絶対に登録しない
  - `derivation_template`: xpub基準の相対パス。既定 `0/{index}`
  - `address_type`: `default`（EVM）/ `p2wpkh` など（BTCは現状 bech32 P2WPKH）
- 注意:
  - 派生は「非ハードン」前提 (`0/{index}` など)。ハードン（`{index}'`）はxpubから導出不可
  - BTCは bech32(P2WPKH) で `bc1...`/`tb1...` のアドレスを払い出し

### 管理ウォレット（集約先）
- 画面: `/admin/wallets` → 「管理側ウォレット（集約先）」
- 登録項目: `chain/network/asset/address/active`
- 用途: スイープ時の送金先

## 入金アドレス割当（ユーザー側）
- EVM/ETH/USDT, BTC は UIから自動割当
  - フロントが Edge Function `address-allocator` を呼び出し、`deposit_addresses` にUPSERT
- XRP は固定アドレス＋ユーザー固有の Destination Tag（UIに表示）。

## 入金検知・確認反映の運用
### 関数のデプロイ
```bash
supabase functions deploy deposit-detector address-allocator confirmations-updater sweep-planner
```

### 手動実行
```bash
# 入金検知（全チェーン）
curl -X POST "https://<project>.supabase.co/functions/v1/deposit-detector" \
  -H "Authorization: Bearer <anon_key>"

# 確認数更新（EVM/USDT, BTC, TRON, ADA）
curl -X POST "https://<project>.supabase.co/functions/v1/confirmations-updater" \
  -H "Authorization: Bearer <anon_key>"
```

### スケジューラ（本番推奨）
- Supabase ダッシュボード → Edge Functions → Scheduler
  - `deposit-detector`: 30〜60秒間隔
  - `confirmations-updater`: 60〜120秒間隔
  - メソッド: POST / Auth: `Authorization: Bearer <anon_key>`

### スキャン進捗（chain_progress）
- ETH/USDTは最後に処理したブロックから再開
- 取りこぼし発生時は `chain_progress` の `last_block` を調整して再走査可

## XRP 運用
- 方式: 固定アドレス＋ユーザー固有の Destination Tag
- 一意制約: `deposit_addresses` に `network+destination_tag` の部分ユニークインデックス（`uniq_xrp_destination_tag`）
- 誤Tag/未入力の救済:
  1) トランザクションをエクスプローラーで確認（txhash, tag, 金額）
  2) 管理者が対象ユーザーに手動アサイン（運用手順/承認フローを社内定義）
  3) `deposits`/`user_assets` を補正し、`audit_logs` に記録

## スイープ（集約）運用
- 集約対象: EVM/ETH（現時点）。USDT/BTC/他チェーンは将来拡張
- 前提: 管理ウォレット（集約先）を `/admin/wallets` に登録
- 手順:
  1) 実行: `sweep-planner` を呼び出し、`sweep_jobs` を作成
     ```bash
     curl -X POST "https://<project>.supabase.co/functions/v1/sweep-planner" \
       -H "Authorization: Bearer <anon_key>" \
       -H "Content-Type: application/json" \
       -d '{"chain":"evm","network":"ethereum","asset":"ETH"}'
     ```
  2) 生成: `unsigned_tx`（from/to/value/gas/gasPrice/nonce/chainId）を取得
  3) 署名: 運用ウォレット（入金アドレスの鍵保持側）で署名
  4) 放送: ネットワークへブロードキャスト（Gnosis Safe 等の運用も可）
  5) 記録: `sweep_jobs` に `signed_tx`/`tx_hash` を記録（将来、専用関数を追加予定）
- 注意: サーバに秘密鍵を保存しない。ガス不足時はdepositアドレスにETH補充が必要な場合あり

## 緊急停止・有効化
- 画面: `/admin/deposits/settings`
  - チェーン別に `deposit_enabled` / `min_confirmations` / `min_deposit` を制御
  - 全体停止（Emergency Stop）ボタンで一括切替 → 監査ログ記録

## 監査・モニタリング
- 監査ログ: `audit_logs` に重要操作（設定変更・停止/再開）を記録（UI/SQL）
- 監視観点:
  - Edge Functions 実行結果（ダッシュボードのLogs）
  - `deposit_transactions(status=pending)` の滞留
  - `chain_progress` の停滞
  - RPC/APIレート制限（TronGrid/Blockfrost/Alchemy）

## トラブルシューティング
- USDTが反映されない: `USDT_ERC20_CONTRACT/USDT_SEPOLIA_CONTRACT` が未設定 / `eth_getLogs` の期間不足 → `chain_progress` を調整
- BTCの確認数が進まない: Blockstream API到達性 / tx詳細の `block_height` 未確定
- TRON/ADAがpendingのまま: APIキー未設定 / confirmations-updaterが未実行
- XRPのユーザー紐付け: `destination_tag` の一致確認 / 管理者による手動補正

## バックアップ/リカバリ
- DBバックアップ（ローカル）
  ```bash
  npx supabase db dump --local > backup_$(date +%Y%m%d).sql
  ```
- マイグレーション適用/リセット（ローカル）
  ```bash
  npx supabase db push --local
  npx supabase db reset --local # 破壊的。実データ注意
  ```

## 運用コマンド チートシート
```bash
# 状態確認
npx supabase status

# 関数のローカル起動（個別検証用）
supabase functions serve deposit-detector --env-file ./supabase/functions/.env --no-verify-jwt

# 関数デプロイ
supabase functions deploy deposit-detector address-allocator confirmations-updater sweep-planner

# Secrets一覧
supabase secrets list
```

## 変更履歴
- 2025-09: xpub割当（EVM/BTC）、USDT検知、TRON/ADA確定反映、スイープ計画、緊急停止、運用UI追加

