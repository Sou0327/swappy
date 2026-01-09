# Undefined ポートフォリオエクスポーター

Undefined金融取引プラットフォームの全画面をスクリーンショット撮影し、A4サイズのPDFに自動でまとめるツールです。

## 📋 機能

- ✅ **自動ログイン**: Supabase認証に対応し、テストアカウントで自動ログイン
- ✅ **マルチデバイス対応**: デスクトップ（1280x800）とモバイル（390x844）の2サイズで撮影
- ✅ **全画面網羅**: 公開ページ、認証ページ、ユーザーページ、法的ページを自動撮影
- ✅ **PDF自動生成**: 撮影したスクリーンショットをA4縦サイズのPDFに自動変換
- ✅ **ポートフォリオ向け**: ポートフォリオやプレゼンテーション資料として最適

## 📁 ディレクトリ構造

```
portfolio-exporter/
├── package.json        # 依存関係とスクリプト定義
├── .env.example        # 環境変数のサンプル（コピーして.envを作成）
├── routes.json         # 撮影対象のルート一覧
├── capture.js          # スクリーンショット撮影スクリプト
├── make-pdf.js         # PDF生成スクリプト
├── README.md           # このファイル
├── .auth/              # 認証状態の保存場所（自動生成）
│   └── state.json
└── out/                # 出力先（自動生成）
    ├── screenshots/    # スクリーンショット保存先
    │   ├── root_desktop.png
    │   ├── root_mobile.png
    │   ├── auth_desktop.png
    │   └── ...
    └── portfolio.pdf   # 生成されたPDF
```

## 🚀 使い方

### 1. 依存関係のインストール

```bash
cd portfolio-exporter
npm install
```

### 2. Playwrightブラウザのインストール

Playwrightが使用するブラウザ（Chromium）をダウンロードします。

```bash
npx playwright install chromium
```

このステップは初回のみ必要です。約140MBのダウンロードが発生します。

### 3. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、テストアカウントの認証情報を設定します。

```bash
cp .env.example .env
```

`.env` を編集：
```env
BASE_URL=http://localhost:8080
LOGIN_PATH=/auth
EMAIL=your_test_account@example.com
PASSWORD=your_test_password
```

⚠️ **重要**:
- 必ずテスト用アカウントを使用してください
- 本番環境の認証情報は絶対に使用しないでください
- `.env` ファイルは `.gitignore` に含まれているため、Gitにコミットされません

### 4. 開発サーバーの起動

別のターミナルで、Undefinedプロジェクトの開発サーバーを起動します。

```bash
# プロジェクトルートで実行
npm run dev
```

開発サーバーが `http://localhost:8080` で起動することを確認してください。

### 5. スクリーンショット撮影とPDF生成

#### ワンコマンドで実行（推奨）

```bash
npm run export
```

このコマンドは以下を自動で実行します：
1. スクリーンショット撮影（`npm run capture`）
2. PDF生成（`npm run pdf`）

#### 個別に実行する場合

```bash
# スクリーンショット撮影のみ
npm run capture

# PDF生成のみ（スクリーンショット撮影後）
npm run pdf
```

### 6. 生成されたPDFの確認

```bash
# macOSの場合
open out/portfolio.pdf

# Linuxの場合
xdg-open out/portfolio.pdf
```

## ⚙️ カスタマイズ

### 撮影対象のルートを変更

`routes.json` を編集して、撮影したいルートを追加・削除できます。

```json
[
  "/",
  "/dashboard",
  "/trade",
  ...
]
```

### 管理者ページの撮影

管理者ページ（`/admin/*`）を撮影する場合は、テストアカウントに管理者権限が必要です。

管理者権限がない場合は、`routes.json` から以下のルートをコメントアウト（削除）してください：
- `/admin`
- `/admin/wallets`
- `/admin/hdwallet`
- `/admin/announcements`
- `/admin/referrals`
- `/admin/tokens`
- `/admin/sweep-manager`

### デバイスサイズの変更

`capture.js` の `BREAKPOINTS` 配列を編集します。

```javascript
const BREAKPOINTS = [
  { label: 'desktop', width: 1280, height: 800 },
  { label: 'mobile',  width: 390,  height: 844 },
  // タブレットサイズを追加する場合：
  // { label: 'tablet',  width: 834,  height: 1112 }
];
```

## 📸 撮影の仕組み

1. **認証**:
   - Playwrightで `/auth` にアクセス
   - `.env` の `EMAIL` と `PASSWORD` で自動ログイン
   - 認証状態を `.auth/state.json` に保存

2. **スクリーンショット撮影**:
   - `routes.json` の各ルートにアクセス
   - デスクトップとモバイルの2サイズで撮影
   - フルページスクリーンショットとして保存

3. **PDF生成**:
   - 撮影したスクリーンショットを自然順でソート
   - A4縦サイズのページに1枚ずつ配置
   - ファイル名をキャプションとして追加

## 🛠️ トラブルシューティング

### Playwrightブラウザが見つからないエラー

```
browserType.launch: Executable doesn't exist at ...
Please run the following command to download new browsers:
    npx playwright install
```

**原因**: Playwrightのブラウザバイナリがインストールされていません。

**解決方法**:
```bash
npx playwright install chromium
```

このエラーは、`npm install` 後に初めて `npm run capture` を実行した時に発生します。上記コマンドでChromiumブラウザ（約140MB）をダウンロードしてください。

### ログインに失敗する

- `.env` のメールアドレスとパスワードが正しいか確認
- 開発サーバーが起動しているか確認（`http://localhost:8080`）
- テストアカウントが有効か確認

### スクリーンショットが撮影されない

- `routes.json` のルートが正しいか確認
- 開発サーバーが起動しているか確認
- ブラウザのコンソールエラーを確認（`npm run capture` の出力）

### PDF生成に失敗する

- `out/screenshots/` にスクリーンショットが存在するか確認
- 先に `npm run capture` を実行してから `npm run pdf` を実行

### 画像が見つからないエラー

```
スクリーンショットが見つかりません。先に `npm run capture` を実行してください。
```

→ 先に `npm run capture` を実行してください。

## 📝 技術スタック

- **Playwright**: ブラウザ自動化とスクリーンショット撮影
- **PDFKit**: PDF生成
- **dotenv**: 環境変数管理
- **globby**: ファイル検索

## 📄 ライセンス

このツールはUndefinedプロジェクトの一部として提供されています。

## 🙏 クレジット

スクリプトの基本構造は [元のサンプルコード](提供されたサンプル) を参考にし、Supabase認証とUndefinedプロジェクトに対応させたものです。
