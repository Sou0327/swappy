# Swappy - Multi-Chain Cryptocurrency Trading Platform

> 📖 **Note**: The English [README.md](README.md) is the primary documentation and always reflects the latest features and updates. This Japanese version focuses on detailed setup instructions.

Swappyは日本語対応のマルチチェーン暗号通貨取引プラットフォームです。

**🌐 [English README](README.md)** | **🔗 [Live Demo](https://swappy.tokyo/)**

---

## ⚖️ 法的注意事項・規制に関する警告

> **重要: 暗号資産交換所の運営は、ほとんどの国・地域で規制対象となる事業です。**
>
> ### 本ソフトウェアを使用する前に
>
> 本ソフトウェアは、暗号資産交換所を運営するための完全なインフラストラクチャを提供します：
> - ユーザー入金アドレスの割当・管理
> - リアルタイム入金検知・処理
> - 資金集約（スイープ）機能
> - 取引・通貨変換機能
> - ユーザー資産の保管
>
> **これらの機能は、ほとんどの国において金融規制の対象となります。**
>
> ### 各国・地域の規制要件
>
> | 地域 | 規制法令 | 必要な登録・免許 |
> |------|---------|-----------------|
> | **日本** | 資金決済法 | 暗号資産交換業者登録（金融庁） |
> | **アメリカ** | FinCEN、各州法 | MSB登録、州マネートランスミッターライセンス |
> | **EU** | MiCA規則 | 暗号資産サービスプロバイダー（CASP）認可 |
> | **イギリス** | FCA | 暗号資産事業者登録 |
> | **シンガポール** | 決済サービス法 | 主要決済機関ライセンス |
>
> ### あなたの責任
>
> 1. **コンプライアンス**: 本ソフトウェアを使用してサービスを運営する前に、あなたの管轄地域で適用されるすべての法令・規制を遵守する責任は、あなた自身にあります。
>
> 2. **法的助言の取得**: 本ソフトウェアをデプロイする前に、金融規制に精通した弁護士・法律専門家への相談を強くお勧めします。
>
> 3. **法的助言ではありません**: この注意事項および本ソフトウェアは法的助言を構成するものではありません。本ソフトウェアの使用に起因する規制違反や法的責任について、著者および貢献者は一切の責任を負いません。
>
> ### 「配布」と「運営」の違い
>
> - **本オープンソースソフトウェアを配布すること**自体には、規制上の免許は必要ありません。
> - **本ソフトウェアを使用してサービスを運営すること**には、通常、適切な免許・登録が必要です。
>
> **本ソフトウェアを使用することにより、あなたはこの注意事項を読み、理解したこと、および規制遵守に関する全責任を負うことに同意したものとみなされます。**

---

## 🚀 主要機能

### 基本機能
- **ダッシュボード** - 資産残高、取引履歴の表示
- **入金・出金** - マルチチェーン対応の暗号通貨送受金
- **取引** - スポット取引、変換機能
- **アカウント管理** - プロフィール設定、セキュリティ設定

### 対応チェーン・アセット
- **Bitcoin (BTC)** - ビットコインメインネット/テストネット
- **Ethereum (ETH)** - イーサリアムメインネット/セポリア + ERC-20トークン (USDT)
- **XRP (Ripple)** - XRP Ledger メインネット/テストネット
- **TRON (TRX)** - TRONメインネット + TRC-20トークン (USDT)
- **Cardano (ADA)** - Cardanoメインネット/テストネット

### 技術機能
- **マルチチェーン入金検知** - リアルタイム入金監視システム
- **KYC統合** - Sumsub外部KYCプロバイダー対応（実装中）
- **管理者機能** - チェーン設定、入金設定管理
- **監査ログ** - 全操作のログ記録

## 🛠 技術スタック

### フロントエンド
- **React 18** - UIフレームワーク
- **TypeScript** - 型安全性
- **Vite** - ビルドツール・開発サーバー
- **Tailwind CSS** - CSSフレームワーク
- **shadcn/ui** - UIコンポーネントライブラリ
- **React Router** - クライアントサイドルーティング
- **TanStack Query** - サーバー状態管理

### バックエンド・インフラ
- **Supabase** - Backend as a Service
  - PostgreSQL データベース
  - 認証システム
  - Row Level Security (RLS)
  - Edge Functions
  - Storage
- **Docker** - ローカル開発環境

### 入金検知システム
- **ETH/ERC-20** - `eth_getBlockByNumber`, `eth_getLogs`
- **TRON/TRC-20** - TronGrid API
- **Cardano** - Blockfrost API
- **Bitcoin** - Bitcoin Core RPC
- **XRP** - XRPL WebSocket API

## 📋 セットアップ・起動方法

### 必要要件
- **Node.js 18以上** - アプリケーション実行環境
- **npm または yarn** - パッケージ管理
- **Docker Desktop** - Supabaseローカル環境（PostgreSQL、PostgREST等）
- **Supabase CLI** - データベース管理・マイグレーション

### 1. リポジトリのクローン
```bash
git clone <YOUR_GIT_URL>
cd swappy
```

### 2. 🔒 セキュリティ設定（重要）
**⚠️ セキュリティ強化されています**: ハードコードされたAPIキーは除去されています。

本番環境では必ず環境変数を設定してください：
```bash
# 必須APIキーの設定
export VITE_ALCHEMY_API_KEY="your_alchemy_api_key"
export VITE_BLOCKFROST_API_KEY="your_blockfrost_project_id"
export VITE_TRONGRID_API_KEY="your_trongrid_api_key"
export WALLET_ENCRYPTION_KEY="$(openssl rand -hex 64)"
```

📖 **詳細設定**: [SECURITY_ENVIRONMENT_SETUP.md](./SECURITY_ENVIRONMENT_SETUP.md) を必ずお読みください。

### 3. Supabase CLIのインストール
```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux/その他
npm install -g supabase

# インストール確認
supabase --version
```

### 3. 依存関係のインストール
```bash
npm i
```

### 4. Supabaseローカル環境の起動

#### 🐳 Dockerとの関係性
Supabaseローカル環境は以下のDockerコンテナ群で構成されます：
- **PostgreSQL** - メインデータベース
- **PostgREST** - REST API自動生成
- **GoTrue** - 認証サービス  
- **Realtime** - リアルタイム通信
- **Storage** - ファイルストレージ
- **Edge Functions** - サーバーレス関数実行環境

```bash
# 初回起動: Dockerイメージのダウンロードとコンテナ作成
npx supabase start

# 起動完了時の出力例:
# Started supabase local development setup.
#
#          API URL: http://127.0.0.1:54321
#      GraphQL URL: http://127.0.0.1:54321/graphql/v1
#           DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
#       Studio URL: http://127.0.0.1:54323
#     Inbucket URL: http://127.0.0.1:54324
#       JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
#        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
#service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 📊 データベースマイグレーション実行
```bash
# 初回起動時: 全マイグレーションを適用
npx supabase db push --local

# 新しいマイグレーションファイルが追加された場合
npx supabase db reset --local  # データベースリセット + 全マイグレーション適用
```

### 5. 環境変数の設定
`.env.example`を参考に`.env`ファイルを作成：

```bash
# ファイルコピー
cp .env.example .env
```

**ローカル開発用の主要設定：**
```env
# Supabase設定（supabase start出力から取得）
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# チェーン別API設定（開発・テスト用）
VITE_ETHEREUM_NETWORK=sepolia
VITE_ALCHEMY_API_KEY=your_alchemy_api_key
VITE_TRONGRID_API_KEY=your_trongrid_api_key
VITE_BLOCKFROST_PROJECT_ID=your_blockfrost_project_id

# 機能フラグ
VITE_FEATURE_KYC_OPTIONAL=true
VITE_LOG_LEVEL=debug
```

### 6. 開発サーバーの起動
```bash
npm run dev
```

**アクセスURL:**
- **フロントエンド**: http://localhost:8080
- **Supabaseダッシュボード**: http://127.0.0.1:54323
- **メール受信箱（Inbucket）**: http://127.0.0.1:54324

### 7. データベース直接接続（PostgreSQL）

#### TablePlus・DBeaverなどのGUIクライアント設定
```
ホスト: 127.0.0.1
ポート: 54322  ← 重要！（標準の5432ではない）
ユーザー名: postgres
パスワード: postgres
データベース: postgres
SSL: 無効
```

#### psqlコマンドラインでの接続
```bash
# PostgreSQLクライアントがインストール済みの場合
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Dockerコンテナ経由でのアクセス
docker exec -it supabase_db_YOUR_PROJECT_ID psql -U postgres -d postgres
```

#### 🗂️ 作成されるテーブル一覧
接続後、以下のテーブル・ビューが確認できます：
- **認証・ユーザー管理**: `profiles`, `user_roles`, `user_assets`
- **入金・出金**: `deposits`, `withdrawals`, `deposit_addresses`, `deposit_transactions`
- **取引**: `markets`, `orders`, `trades`, `ledger_entries`
- **管理**: `chain_configs`, `audit_logs`, `support_tickets`, `support_replies`
- **KYC**: `kyc_applications`, `kyc_documents`, `kyc_settings`
- **ビュー**: `user_balances_view`, `v_deposit_summary`, `v_user_kyc_status`

### 7. 起動確認・トラブルシューティング

#### ✅ 正常起動の確認
```bash
# Supabaseサービス状態確認
npx supabase status

# データベース接続確認
npx supabase db ping --local

# Dockerコンテナ状態確認
docker ps | grep supabase
```

#### 🔧 よくある問題と解決方法

**Dockerが起動しない場合:**
```bash
# Docker Desktopが起動していることを確認
docker --version

# 既存コンテナの強制停止・削除
npx supabase stop --no-backup
docker system prune -f
```

**マイグレーション失敗の場合:**
```bash
# データベース完全リセット
npx supabase db reset --local

# 特定マイグレーションまで実行
npx supabase db push --local --include-all
```

**ポート競合エラーの場合:**
```bash
# 使用中のポートを確認
lsof -i :54321  # API
lsof -i :54322  # DB
lsof -i :54323  # Studio

# プロセス終了後、再起動
npx supabase stop
npx supabase start
```

**Supabase Studio（http://127.0.0.1:54323）にアクセスできない場合:**
```bash
# サービス状態確認
npx supabase status

# "Stopped services" にstudioが含まれている場合は完全再起動
npx supabase stop
docker system prune -f  # 残存コンテナの削除
npx supabase start
```

**テーブルプラス・DBeaverでデータが見えない場合:**
```bash
# 1. ポート番号を確認（5432ではなく54322）
npx supabase status  # DB URLを確認

# 2. テーブルは作成されているがデータが空の可能性
docker exec supabase_db_YOUR_PROJECT_ID psql -U postgres -d postgres -c "\dt"

# 3. シードデータを実行
npx supabase db reset --local  # シードファイル含む再作成

# 4. 管理者権限が付与されていない場合
docker exec supabase_db_YOUR_PROJECT_ID psql -U postgres -d postgres -c "
  INSERT INTO user_roles (user_id, role) 
  VALUES ((SELECT id FROM auth.users LIMIT 1), 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
"
```

**コンテナ名競合エラーの場合:**
```bash
# 競合コンテナの強制削除
docker rm -f $(docker ps -aq --filter "name=supabase") 2>/dev/null || true
docker system prune -f
npx supabase start
```

## 🔧 開発コマンド

### ビルド
```bash
npm run build        # 本番用ビルド
npm run build:dev    # 開発用ビルド
npm run preview      # ビルド済みファイルのプレビュー
```

### コード品質
```bash
npm run lint         # ESLintでコードチェック
```

## ⏱ 入金監視の起動（Edge Function）

- エッジ関数: `supabase/functions/deposit-detector` が全チェーンの入金検知を実行します。
- 実行方法:
  - 手動実行: Supabase ローカル起動後に HTTP で呼び出し
    ```bash
    curl -X POST "http://127.0.0.1:54321/functions/v1/deposit-detector" \
      -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY"
    ```
  - スケジュール実行（本番）: Supabase ダッシュボードの Edge Functions Scheduler で `POST /functions/v1/deposit-detector` を30〜60秒間隔で設定

### Edge Function 環境変数（Secrets）

以下をプロジェクトの Secrets に設定してください（ダッシュボードまたはCLI）。

```bash
supabase secrets set \
  SUPABASE_URL="https://<project>.supabase.co" \
  SUPABASE_ANON_KEY="<anon_key>" \
  ETHEREUM_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/<key>" \
  ETHEREUM_SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/<key>" \
  BITCOIN_RPC_URL="http://<user>:<pass>@127.0.0.1:8332" \
  XRP_RPC_URL="wss://xrplcluster.com" \
  TRON_RPC_URL="https://api.trongrid.io" \
  TRONGRID_API_KEY="<trongrid_api_key>" \
  TRC20_USDT_CONTRACT="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" \
  BLOCKFROST_PROJECT_ID="<blockfrost_project_id>"
```

注意: Edge Functions の環境変数は `.env` ではなく Supabase の Secrets に登録します。

#### Secretsの取得/登録方法

- 取得（本番/ステージング）:
  - Supabaseダッシュボード → Project → Settings → API → keys
  - `Anon key`（公開）と `Service role`（機密）を確認。`SUPABASE_SERVICE_ROLE_KEY` はここから取得します。
- 取得（ローカル開発）:
  - `npx supabase status` を実行すると、ローカルの anon/service_role キーが表示されます。
- 登録（CLI）:
  - プロジェクトにリンク済みの場合（`supabase link --project-ref <ref>`）
    ```bash
    supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
    supabase secrets set USDT_ERC20_CONTRACT="0xdAC17F...1ec7" USDT_SEPOLIA_CONTRACT="<sepolia_usdt>"
    ```
  - 未リンクの場合は `supabase login` → `supabase link` を実施してください。

### アドレス割当（address-allocator）

- 関数: `supabase/functions/address-allocator`
- 前提: 管理者が `wallet_roots` に xpub を登録（GUI: `/admin/wallets`）
- 使い方（フロントから自動呼び出し済み）:
  - EVM: `chain='evm'`, `network='ethereum'|'sepolia'`, `asset='ETH'|'USDT'`
  - 成功時に `deposit_addresses` にUPSERTされ、アドレスが返る

追加Secrets例:
```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
  USDT_ERC20_CONTRACT="0xdAC17F958D2ee523a2206206994597C13D831ec7" \
 USDT_SEPOLIA_CONTRACT="<sepolia_usdt_contract>"
```

### 確認数更新（confirmations-updater）

- 関数: `supabase/functions/confirmations-updater`
- 対象: EVM(ETH/USDT), BTC の `deposit_transactions(status=pending)` を再検査し、確認数に応じて `deposits/user_assets` を更新
- 実行例:
```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/confirmations-updater" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY"
```
本番ではEdge Functions Schedulerで1〜2分間隔の実行を推奨。

## 🔁 入金資産の集約（スイープ）

本リポジトリの方針は「鍵はサーバに置かない」ため、自動送金は行いません。代わりに、Edge Function で「未署名トランザクション（計画）」を生成し、運用ウォレットで手動署名→ブロードキャストする運用に対応しました（まずは EVM/ETH のみ）。

### 構成
- 管理側ウォレット: `admin_wallets`（新規）にチェーン/ネットワーク/資産ごとの集約先アドレスを登録
- スイープ計画: `sweep_jobs`（新規）に未署名Tx（またはPSBT）と進捗を保存
- Edge Function: `supabase/functions/sweep-planner` が `deposits(confirmed)` を元に計画を作成（EVM/ETH）

### 管理ウォレットの登録例
```sql
-- EVM / Ethereum Mainnet のETH集約先
INSERT INTO admin_wallets (chain, network, asset, address, active)
VALUES ('evm', 'ethereum', 'ETH', '0xYourAdminTreasuryAddress', true)
ON CONFLICT (chain, network, asset, address) DO UPDATE SET active = EXCLUDED.active;
```

### スイープ計画の作成（EVM/ETH）
```bash
curl -X POST "http://127.0.0.1:54321/functions/v1/sweep-planner" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "chain":"evm",
        "network":"ethereum",
        "asset":"ETH"
      }'

# レスポンス例
# {
#   "success": true,
#   "count": 1,
#   "planned": [
#     {
#       "deposit_id": "…",
#       "job_id": "…",
#       "unsigned_tx": {
#         "from": "0x…", "to": "0xAdmin…",
#         "value": "0x…", "gas": "0x5208", "gasPrice": "0x…", "nonce": "0x…", "chainId": 1
#       }
#     }
#   ]
# }
```

生成された `unsigned_tx` を運用ウォレット（当該入金アドレスの鍵を保持）で署名し、ブロードキャストしてください。署名済みRawTxやTxHashは `sweep_jobs` に後追いで保存可能です（将来: 署名登録用のEdge Functionを追加予定）。

注意:
- XRP は固定アドレス＋Destination Tag方式のため、入金時点で管理口座に集約済みです（追加スイープ不要）。
- BTC / TRON / ADA のスイープは将来対応（PSBT/未署名Txの生成）を予定しています。
- セキュリティ上、サーバに秘密鍵は保存しない運用を推奨します。

## 👑 管理UI

- ウォレット管理: `/admin/wallets`
  - 管理ウォレット（集約先）: `admin_wallets` のCRUD
  - ウォレットルート（xpub）: `wallet_roots` のCRUD、next_index確認
  - スイープ計画一覧: `sweep_jobs` の最新を参照


### 📊 データベース・マイグレーション管理

#### 基本マイグレーション操作
```bash
# 全マイグレーション適用（初回セットアップ）
npx supabase db push --local

# データベース完全リセット + 全マイグレーション適用
npx supabase db reset --local

# 特定のマイグレーションまで適用
npx supabase db push --local --include-all

# データベース状態・接続確認
npx supabase status
npx supabase db ping --local
```

#### 🔍 マイグレーション詳細管理
```bash
# マイグレーション履歴確認
npx supabase migration list --local

# 新しいマイグレーションファイル作成
npx supabase migration new migration_name

# スキーマ差分からマイグレーション生成
npx supabase db diff --local --schema public

# ロールバック（注意: データ消失の可能性）
npx supabase db reset --local
```

#### 📁 マイグレーションファイル管理
プロジェクトには以下の重要なマイグレーションが含まれています：

**基盤システム（Phase 1）:**
- `20250905140000_phase1_deposit_schema.sql` - 入金システム基盤
- `20250905134500_user_deposit_addresses.sql` - ユーザー入金アドレス管理
- `20250905151000_fix_chain_configs.sql` - チェーン設定修正

**マルチチェーン対応（Phase 2）:**
- `20250905152000_phase2_tables.sql` - フェーズ2テーブル群
- `20250905160000_deposits_multichain_support.sql` - マルチチェーン入金対応

**KYC・認証システム:**
- `20250905162000_kyc_system.sql` - KYCシステム基盤
- `20250905175000_enable_kyc.sql` - KYC機能有効化
- `20250905185000_sumsub_kyc_integration.sql` - Sumsub統合

**監査・セキュリティ:**
- `20250905161000_audit_logs_table.sql` - 監査ログテーブル
- `20250905170000_storage_kyc_documents.sql` - KYC書類ストレージ

#### ⚠️ マイグレーション注意事項
```bash
# 本番環境への適用前に必ずローカルでテスト
npx supabase db reset --local

# バックアップ作成（重要データがある場合）
npx supabase db dump --local > backup_$(date +%Y%m%d).sql

# 段階的な適用（大規模変更の場合）
npx supabase migration new pre_change_backup
npx supabase migration new main_changes  
npx supabase migration new post_change_cleanup
```

#### 🌱 シードデータ（初期データ）管理

**シードファイル**: `supabase/seed.sql`
```bash
# シードデータを含む完全リセット
npx supabase db reset --local

# シードファイルのみ実行
docker exec supabase_db_YOUR_PROJECT_ID psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/seed.sql
```

**シードデータに含まれる内容:**
- **管理者権限**: 最初のユーザーに自動的に `admin` + `moderator` ロール付与
- **サンプルマーケット**: BTC-USDT, ETH-USDT, BTC-ETH
- **チェーン設定**: 各ブロックチェーンのテスト用設定
- **サンプル資産**: 開発用テスト資産（USDT 10,000、BTC 0.1、ETH 1.0）

#### 👑 管理者アカウントの作成

**新規ユーザーのデフォルトロール**: `user` （自動付与）

**既存ユーザーに管理者権限を付与:**
```sql
-- admin権限の付与
INSERT INTO user_roles (user_id, role) 
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your-email@example.com'), 
  'admin'::app_role
);

-- moderator権限も付与する場合
INSERT INTO user_roles (user_id, role) 
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your-email@example.com'), 
  'moderator'::app_role
);
```

**ロール権限について:**
- **user**: 基本的な取引・入出金機能
- **moderator**: ユーザーサポート、KYC審査
- **admin**: 全システム管理機能、設定変更、監査ログ

## 📁 プロジェクト構造

```
src/
├── components/          # 再利用可能コンポーネント
│   ├── ui/             # shadcn/uiコンポーネント
│   └── DashboardLayout.tsx
├── contexts/           # React Context
│   └── AuthContext.tsx
├── hooks/              # カスタムフック
│   ├── use-kyc.ts
│   └── use-*.ts
├── integrations/       # 外部サービス統合
│   └── supabase/
├── lib/                # ユーティリティ・ライブラリ
│   ├── *-deposit-detector.ts  # チェーン別入金検知
│   └── deposit-detection-manager.ts
├── pages/              # ページコンポーネント
│   ├── Dashboard.tsx
│   ├── Deposit.tsx
│   ├── MyAccount.tsx
│   └── *.tsx
└── App.tsx             # メインアプリケーション

supabase/
├── migrations/         # データベースマイグレーション
├── functions/          # Edge Functions
└── config.toml         # Supabase設定
```

## 🔒 セキュリティ

### Row Level Security (RLS)
- 全テーブルでRLS有効
- ユーザーは自身のデータのみアクセス可能
- 管理者権限による例外的アクセス

### 認証・認可
- Supabase Auth による認証
- ロールベースアクセス制御 (admin, moderator, user)
- JWT トークンベースのセッション管理

### 監査ログ
- 全データベース操作を `audit_logs` テーブルに記録
- 変更前後の値を保存

## 🚦 本番環境デプロイ

### Supabaseプロジェクト作成
1. [Supabase Console](https://app.supabase.com) でプロジェクト作成
2. データベースパスワード設定
3. API Keys取得

### 環境変数設定
本番環境用の環境変数を設定：
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

### デプロイ
```bash
# 本番用ビルド
npm run build

# Supabaseにデプロイ（要supabase link）
npx supabase db push
npx supabase functions deploy
```

## 🧪 テスト・検証手順

### Tatum Webhook テスト手順

#### 1. 環境変数設定
Webhookテストに必要な環境変数を設定：

```bash
# .env ファイルに以下を追加
TATUM_API_KEY="your_tatum_api_key"
TATUM_WEBHOOK_URL="http://localhost:54321/functions/v1/tatum-webhook"
TATUM_WEBHOOK_HMAC_SECRET="your_hmac_secret_key"
SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

# テスト用設定
VITE_TEST_WEBHOOK_URL="http://localhost:54321/functions/v1/tatum-webhook"
VITE_SKIP_SIGNATURE_VERIFICATION=false
VITE_LOG_WEBHOOK_PAYLOADS=true  # デバッグ時のみ
```

#### 2. HMAC署名検証テスト（generate-hmac.jsスクリプト使用）

**📝 概要：**
`scripts/generate-hmac.js`は包括的なHMAC署名生成・テストツールです。ペイロード検証、署名生成、curlコマンド自動生成を行います。

**🔧 事前準備：**
```bash
# 1. 環境変数設定（.env または .env.local）
TATUM_WEBHOOK_HMAC_SECRET="your-webhook-hmac-secret-key"
VITE_TEST_WEBHOOK_URL="http://localhost:54321/functions/v1/tatum-webhook"

# 2. payload.jsonの確認・編集（必要に応じて）
cat payload.json  # サンプルTRONトランザクションペイロード
```

**🚀 HMAC署名生成実行：**
```bash
# 基本実行（環境変数のシークレットキーを使用）
node scripts/generate-hmac.js

# または環境変数を直接指定して実行
TATUM_WEBHOOK_HMAC_SECRET="custom-secret-key" node scripts/generate-hmac.js
```

**📋 出力例：**
```bash
🔐 Tatum Webhook HMAC署名生成ツール

✅ HMAC Secret: test-secr...
📄 ペイロード読み込み完了 (450 bytes)
✅ JSON形式: 有効
📊 内容: INCOMING_NATIVE_TX イベント

🔑 HMAC-SHA512 署名生成結果:
────────────────────────────────────────────────────────────────────────────────
Signature: a1b2c3d4e5f67890abcdef1234567890...
Header:    sha512=a1b2c3d4e5f67890abcdef1234567890...
────────────────────────────────────────────────────────────────────────────────

🧪 curlテストコマンド:
────────────────────────────────────────────────────────────────────────────────

✅ 正常な署名でのテスト:
curl -X POST "http://localhost:54321/functions/v1/tatum-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Tatum-Signature: sha512=a1b2c3d4e5f67890..." \
  -d @payload.json

❌ 無効な署名でのテスト:
curl -X POST "http://localhost:54321/functions/v1/tatum-webhook" \
  -H "Content-Type: application/json" \
  -H "X-Tatum-Signature: sha512=invalid_signature" \
  -d @payload.json
```

**⚙️ スクリプト機能：**
- ✅ payload.json自動検証（存在チェック、JSON形式確認）
- ✅ 環境変数・デフォルトシークレット自動切り替え
- ✅ HMAC-SHA512署名生成
- ✅ curlテストコマンド自動生成（正常・異常両パターン）
- ✅ サンプルペイロード自動作成（ファイル不在時）
- ✅ エラーハンドリング・ヘルプ表示

**🔧 トラブルシューティング：**

```bash
# ヘルプ表示
node scripts/generate-hmac.js --help

# payload.jsonが存在しない場合 → 自動でサンプル作成
# "❌ エラー: payload.json が見つかりません" → サンプルペイロード自動生成

# 環境変数が未設定の場合 → デフォルトキー使用
# "⚠️ 環境変数 TATUM_WEBHOOK_HMAC_SECRET が設定されていません"

# JSON形式エラーの場合 → 文字列として処理継続
# "⚠️ JSON形式: 無効 (文字列として処理)"
```

**💡 使用例・応用：**

```bash
# 1. 開発環境での署名検証テスト
TATUM_WEBHOOK_HMAC_SECRET="dev-secret-123" node scripts/generate-hmac.js

# 2. カスタムペイロードでのテスト
# payload.jsonを編集してから実行
echo '{"type":"INCOMING_FUNGIBLE_TX","address":"0x123..."}' > payload.json
node scripts/generate-hmac.js

# 3. 本番環境シークレットでの検証
TATUM_WEBHOOK_HMAC_SECRET="$PRODUCTION_SECRET" node scripts/generate-hmac.js

# 4. 継続的インテグレーション(CI)での使用
npm test && node scripts/generate-hmac.js && curl [生成されたコマンド]
```

**🔒 セキュリティ考慮事項：**
- ⚠️ HMAC秘密鍵は環境変数で管理（ハードコーディング禁止）
- ⚠️ 本番環境では強力なランダムキーを使用
- ⚠️ ログファイルに秘密鍵が出力されないよう注意
- ✅ テスト後は一時的な秘密鍵を削除・ローテーション

#### 3. Webhook手動テスト

**curlでのテスト実行：**
```bash
# 正常な署名でのテスト
curl -X POST http://localhost:54321/functions/v1/tatum-webhook \
  -H "Content-Type: application/json" \
  -H "X-Tatum-Signature: sha512=<generated_signature>" \
  -d @payload.json

# 期待される応答: {"success": true, "processed": true}
```

**不正な署名でのテスト：**
```bash
# 無効な署名でのテスト
curl -X POST http://localhost:54321/functions/v1/tatum-webhook \
  -H "Content-Type: application/json" \
  -H "X-Tatum-Signature: sha512=invalid_signature" \
  -d @payload.json

# 期待される応答: {"error": "Invalid signature"} (403)
```

#### 4. Edge Function ログ確認

**Supabase ローカルログ監視：**
```bash
# ターミナル1: ログ監視
npx supabase functions serve --env-file .env

# ターミナル2: テスト実行
curl -X POST http://localhost:54321/functions/v1/tatum-webhook \
  -H "Content-Type: application/json" \
  -H "X-Tatum-Signature: sha512=<signature>" \
  -d @payload.json
```

**ログ出力例（正常な場合）：**
```
[tatum-webhook] 🔔 Webhook受信: TRON/mainnet
[tatum-webhook] ✅ 署名検証成功
[tatum-webhook] 📊 トランザクション処理開始: TYour...hash
[tatum-webhook] ✅ 入金処理完了: 100.000000 USDT
```

**ログ出力例（署名エラー）：**
```
[tatum-webhook] ❌ 署名検証失敗: Expected sha512=abc123..., got sha512=invalid...
[tatum-webhook] 🚫 リクエスト拒否: Invalid signature
```

#### 5. データベース検証

**処理結果の確認：**
```sql
-- Supabase Studio (http://localhost:54323) で実行
-- または psql で接続

-- 入金トランザクション確認
SELECT * FROM deposit_transactions
WHERE tx_hash = 'your_test_tx_hash'
ORDER BY created_at DESC;

-- ユーザー残高確認
SELECT * FROM user_assets
WHERE user_id = 'test_user_id'
AND asset = 'USDT';

-- 監査ログ確認
SELECT * FROM audit_logs
WHERE operation = 'INSERT'
AND table_name = 'deposit_transactions'
ORDER BY created_at DESC;
```

### Subscription Manager CLI テスト

**CLIコマンドテスト：**
```bash
# 依存関係インストール
cd scripts && npm install

# サブスクリプション同期テスト
npm run tatum:sync

# 特定アドレスのサブスクリプション作成
npm run tatum:create 0x1234567890123456789012345678901234567890 evm ethereum ETH

# 状況確認
npm run tatum:status

# サブスクリプション一覧
npm run tatum:list
```

### トラブルシューティング

#### よくあるWebhookエラー

**1. 署名検証失敗**
```bash
# 原因: HMAC_SECRET の不一致
# 解決: 環境変数を確認
echo $TATUM_WEBHOOK_HMAC_SECRET

# テスト用シークレットキーでの検証
export TATUM_WEBHOOK_HMAC_SECRET="test-secret-key"
node scripts/generate-hmac.js
```

**2. Edge Function 起動失敗**
```bash
# 原因: Supabase サービス未起動
npx supabase status

# 解決: サービス再起動
npx supabase stop
npx supabase start
```

**3. データベース接続エラー**
```bash
# 原因: 環境変数設定ミス
# 解決: Supabase URL・キー確認
npx supabase status | grep "service_role key"
```

**4. Webhook タイムアウト**
```bash
# 原因: 処理時間超過
# 解決: ログ確認とタイムアウト値調整
TATUM_WEBHOOK_TIMEOUT_SECONDS=60
```

## 📞 サポート・貢献

### 課題・バグ報告
GitHubのIssuesで報告してください。

### 開発への貢献
1. このリポジトリをフォーク
2. フィーチャーブランチを作成
3. 変更をコミット
4. プルリクエストを送信

### ライセンス
このプロジェクトはMITライセンスの下で公開されています。

---

**Swappy Development Team**
