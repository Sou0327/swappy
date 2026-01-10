# 開発環境とセットアップ

## 必要な環境
- Node.js (推奨: 18以上)
- npm または yarn

## 開発コマンド

### 基本コマンド
```bash
# 依存関係のインストール
npm install

# 開発サーバー起動（http://localhost:8080）
npm run dev

# 本番用ビルド
npm run build

# 開発モードでビルド
npm run build:dev

# 本番ビルドのプレビュー
npm run preview

# ESLintによるコードチェック
npm run lint
```

## 開発設定

### Vite設定 (`vite.config.ts`)
- 開発サーバーポート: 8080
- パスエイリアス: `@` → `./src`
- プラグイン: React SWC, Lovable Tagger（開発モードのみ）

### ESLint設定 (`eslint.config.js`)
- TypeScript ESLint
- React Hooks ルール
- React Refresh プラグイン
- `@typescript-eslint/no-unused-vars` 無効化

### TypeScript設定
- 厳密度: 中程度（`noImplicitAny: false`, `strictNullChecks: false`）
- パスエイリアス: `@/*` → `./src/*`

### Tailwind CSS設定 (`tailwind.config.ts`)
- shadcn/ui拡張テーマ
- カスタムカラー変数
- アニメーション拡張
- レスポンシブブレークポイント

## 環境変数

### 設定ファイル (`.env`)
```
# Supabase（必須）
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="[公開キー]"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"

# フェーズ1: 全チェーン入金検知（検知のみ）
# EVM（どちらか片方でOK）
VITE_ALCHEMY_API_KEY="[任意]"
VITE_INFURA_PROJECT_ID="[任意]"

# ネットワーク/確認数/機能トグル（フロント表示制御用）
VITE_ETHEREUM_NETWORK="mainnet"   # 例: sepolia, mainnet
VITE_DEPOSIT_MIN_CONFIRMATIONS_ETH=12
VITE_DEPOSIT_MIN_CONFIRMATIONS_BTC=3
VITE_DEPOSIT_MIN_CONFIRMATIONS_XRP=1
VITE_DEPOSIT_MIN_CONFIRMATIONS_TRON=19
VITE_DEPOSIT_MIN_CONFIRMATIONS_ADA=15

VITE_DEPOSIT_ENABLED_ETH=true
VITE_DEPOSIT_ENABLED_BTC=true
VITE_DEPOSIT_ENABLED_XRP=true
VITE_DEPOSIT_ENABLED_TRON=true
VITE_DEPOSIT_ENABLED_ADA=true

# KYC 任意フラグ（UI/ルート制御用）
VITE_FEATURE_KYC_OPTIONAL=true
```

### 注意事項
✅ Supabaseクライアントは `.env` の `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` を使用します。テンプレートは `.env.example` を参照してください。

## ディレクトリ構造
```
src/
├── components/          # 共通コンポーネント
│   └── ui/             # shadcn/ui プリミティブ
├── pages/              # ページコンポーネント
├── hooks/              # カスタムフック
├── contexts/           # React Context
├── integrations/       # 外部サービス統合
│   └── supabase/      # Supabase関連
├── lib/               # ユーティリティ関数
└── ...
```

## 入金検知（フェーズ1想定：全チェーン）

- 実装方針: 「入金検知のみ」を最短で提供。集約送金（スイープ）や出金は手動/別フェーズ。
- 監視実装の置き場: Supabase Edge Functions もしくは軽量 Node ワーカー（本リポジトリ外）を想定。
- 連携方法: 入金検知→Supabase の `deposits` に `pending` で記録→所定の確認数に達したら `confirmed` に更新。
- フロントエンド: `VITE_DEPOSIT_ENABLED_*` と `VITE_DEPOSIT_MIN_CONFIRMATIONS_*` を参照して UI 表示/警告を切替。

## UIの簡素化（本リリース構成）

- ナビゲーション: 「稼ぐ」「紹介」はルーティングごと廃止。
- ダッシュボード: セキュリティレベル表示・アクセス履歴を非表示。
- マイアカウント: 生年月日・自己紹介・画像アップロードなし（フルネームのみ）。
- セキュリティ設定: 2FA/フィッシング対策コード/回復キーは非表示。パスワード変更・凍結のみ提供。

## 開発ワークフロー
1. 機能要求の確認
2. 型定義の作成/更新
3. コンポーネント開発（shadcn/ui使用）
4. テスト（手動）
5. ESLintチェック
6. ビルド確認
