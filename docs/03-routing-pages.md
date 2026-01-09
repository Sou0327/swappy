# ルーティングとページ仕様

## ルート構成 (`src/App.tsx`)

### パブリックページ
| パス | コンポーネント | 説明 |
|------|-------------|------|
| `/` | `Index.tsx` | ランディングページ |
| `/auth` | `Auth.tsx` | ログイン・新規登録 |
| `/redirect` | `AuthRedirect.tsx` | 認証後のロール別リダイレクト |
| `/features` | `Features.tsx` | 機能紹介 |
| `/about` | `About.tsx` | 会社概要 |
| `/markets` | `Markets.tsx` | マーケット情報 |
| `/trade` | `Trade.tsx` | 取引画面 |
| `*` | `NotFound.tsx` | 404エラーページ |

### 認証が必要なページ
| パス | コンポーネント | 説明 |
|------|-------------|------|
| `/dashboard` | `Dashboard.tsx` | ユーザーダッシュボード |
| `/wallet` | `WalletOverview.tsx` | ウォレット概要 |
| `/deposit` | `Deposit.tsx` | 入金（フェーズ1: 検知のみ。BTC/ETH/TRC/XRP/USDT/ADA 対応） |
| `/withdraw` | `Withdraw.tsx` | 出金 |
| `/convert` | `Convert.tsx` | 両替 |
| `/history` | `FinancialHistory.tsx` | 取引履歴 |
| `/security` | `SecuritySettings.tsx` | セキュリティ設定（2FA/フィッシング/回復キーは非表示。パスワード変更・凍結のみ） |
| `/kyc` | `KYC.tsx` | 本人確認（KYC） |
| `/my-account` | `MyAccount.tsx` | アカウント設定 |
| `/support` | `Support.tsx` | サポート |
| `/my-page` | `MyPage.tsx` | マイページ（→`/dashboard`にリダイレクト） |

### 管理者限定ページ
| パス | コンポーネント | 説明 | 保護 |
|------|-------------|------|------|
| `/admin` | `AdminDashboard.tsx` | 管理ダッシュボード | `AdminRoute`で保護 |
| `/admin/deposits/settings` | `AdminDepositSettings.tsx` | チェーン別受付スイッチ・確認数設定 | `AdminRoute` |

## 認証フロー

### 認証状態管理
- `AuthContext` でユーザー状態とロール情報を管理
- `onAuthStateChange` でSupabase認証状態を監視
- ロール情報は `user_roles` テーブルから取得

### リダイレクト処理 (`/redirect`)
1. **管理者 (`admin`)**: `/admin` へ
2. **一般ユーザー**: `/dashboard` へ
3. **未認証**: `/auth` へ

### ルート保護
- `AdminRoute`: 管理者以外は `/dashboard` にリダイレクト
- 未認証の場合は `/auth` にリダイレクト

## ページ詳細仕様

### ランディングページ (`/`)
- **コンポーネント**: `Header`, `HeroSection`, `MarketTable`, `HowItWorks`, `Footer`
- **機能**: 製品紹介、市場データ表示、使い方説明

### 認証ページ (`/auth`)
- **認証方式**: Email + Password（Supabase Auth）
- **機能**: ログイン、新規登録、バリデーション
- **登録時**: `full_name` をメタデータに保存
- **成功後**: `/redirect` に遷移

### ダッシュボード (`/dashboard`)
- **機能**: 
  - ユーザー情報表示
  - 総資産表示（`user_assets` 集計）
  - 主要機能への導線（入金、取引等）
  - チェーン受付状況バッジ（例: ETH: 有効 / BTC: 準備中）

### 管理画面 (`/admin`)
- **タブ構成**:
  - ユーザー管理（`profiles` + `user_roles`）
  - 入金管理（`deposits`）
  - 出金管理（`withdrawals`）
  - 資産管理（`user_assets`）
  - チェーン設定（`/admin/deposits/settings`）
- **機能**: 
  - 入出金の承認・拒否
  - 残高のインライン編集
  - ユーザーロール管理

## レイアウトコンポーネント

### 共通ヘッダー (`Header.tsx`)
- ナビゲーションメニュー
- ユーザー認証状態表示
- レスポンシブデザイン

### ダッシュボードレイアウト (`DashboardLayout.tsx`)
- サイドバーナビゲーション
- トップバー
- サインアウト機能
- モバイル対応（サイドバー折りたたみ）

### フッター (`Footer.tsx`)
- リンク集
- 会社情報
- ソーシャルメディアリンク

## 入金ページ詳細 (`/deposit`)

- チェーン/アセット選択: `BTC`, `ETH`, `USDT(ERC-20/TRC-20)`, `TRX`, `XRP`, `ADA` を表示。
- 受取先表示: ユーザー専用アドレス（EVM/TRON/ADA は HD 由来、BTC は xpub 派生、XRP は固定アドレス+Destination Tag）と QR コード。
- 確認数表示: `.env` の `VITE_DEPOSIT_MIN_CONFIRMATIONS_*` を反映（例: ETH=12, BTC=3, XRP=1, TRON=19, ADA=15）。
- 注意/FAQ: 誤チェーン送付の警告、XRP の Tag 必須、TRON/ADA の最終性、入金反映の目安時間。
- 履歴: `deposits` から自分の入金履歴を取得し表示。

## アカウント設定 (`/my-account`)

- 基本情報: フルネームのみ編集可能（生年月日・自己紹介は廃止）。
- アバター: 画像アップロードなし（静的表示）。

## セキュリティ設定 (`/security`)

- 2FA/フィッシング対策コード/回復キー: 本フェーズ対象外（UI非表示）。
- パスワード: ログインパスワードの変更に対応。
- アカウント凍結: 凍結操作のUIを提供。

最小入金額の目安（推奨下限）
- BTC: 0.0001〜0.001 BTC（下限 0.0001）
- ETH: 0.01〜0.05 ETH（下限 0.01）
- XRP: 20〜50 XRP（下限 20、Destination Tag 必須）
- TRON(TRX): 10〜100 TRX（下限 10、確定目安 19 ブロック）
- ADA: 1〜10 ADA（下限 1、UTXO の都合で集計反映に差が出る場合あり）
