# Undefined ドキュメント

このディレクトリには、Undefinedプロジェクトの詳細な技術仕様書が含まれています。

## 📚 ドキュメント構成

### [01-overview.md](./01-overview.md)
**プロジェクト概要**
- 技術スタック
- アーキテクチャ概要
- 開発原則

### [02-development-setup.md](./02-development-setup.md) 
**開発環境とセットアップ**
- 開発コマンド
- 設定ファイル詳細
- ディレクトリ構造

### [03-routing-pages.md](./03-routing-pages.md)
**ルーティングとページ仕様**
- 全ルート一覧
- 認証フロー
- ページ機能詳細

### [04-database-schema.md](./04-database-schema.md)
**データベーススキーマ**
- テーブル定義
- RLS設定
- ユーティリティ関数

### [05-authentication-authorization.md](./05-authentication-authorization.md)
**認証・認可システム**
- Supabase Auth設定
- ロール管理
- セキュリティ機能

### [06-ui-design-system.md](./06-ui-design-system.md)
**UIデザインシステム**
- コンポーネントライブラリ
- テーマシステム
- レスポンシブデザイン

### [07-feature-specifications.md](./07-feature-specifications.md)
**機能仕様書**
- 実装済み機能の詳細
- 実装レベル評価
- 開発優先度

### [09-product-roadmap.md](./09-product-roadmap.md)
**ロードマップ**
- 「取引所風ウォレット」公開デモまでの段階計画
- チェーン別入金の導入順と受入基準

### [08-known-issues.md](./08-known-issues.md)
**既知の問題点と制限事項**
- セキュリティ問題
- バグ・不整合
- 対応優先度

### 取引/入金の詳細仕様
- [10-exchange-functional-spec.md](./10-exchange-functional-spec.md): 取引所風ウォレットの機能仕様（ペーパートレード）
- [11-single-market-setup.md](./11-single-market-setup.md): 単一マーケット運用ガイド（参考）
- [12-multichain-deposit-spec.md](./12-multichain-deposit-spec.md): マルチチェーン入金仕様（段階導入・手動運用）

## 🎯 このドキュメント群の目的

### 開発者向け
- **新規参加者**: プロジェクト理解の迅速化
- **既存メンバー**: 仕様確認と開発指針
- **レビュアー**: コード品質とアーキテクチャ評価

### プロジェクト管理
- **機能要求**: 実装状況の把握
- **品質管理**: 既知問題の追跡
- **リリース計画**: 優先度と工数見積もり

## 📋 使用方法

### 新機能開発時
1. 関連する仕様書を確認
2. 既知問題との重複チェック  
3. アーキテクチャ原則に従った実装
4. 実装後は仕様書を更新

### バグ修正時
1. `08-known-issues.md` で既知問題を確認
2. 根本原因の特定
3. 修正後は該当問題をクローズ

### コードレビュー時
1. 仕様書との整合性確認
2. 設計原則への適合性チェック
3. セキュリティ要件の確認

## 🔄 ドキュメント更新ルール

### 更新タイミング
- 新機能実装完了後
- アーキテクチャ変更時
- 重大バグ発見・修正時
- 環境・設定変更時

### 更新責任
- **実装者**: 機能仕様の更新
- **アーキテクト**: 設計ドキュメントの保守
- **QA**: 既知問題の管理

## 🚀 クイックスタート

初回開発参加者は以下の順序で読むことを推奨：

1. **[01-overview.md](./01-overview.md)** - 全体像把握
2. **[02-development-setup.md](./02-development-setup.md)** - 環境構築
3. **[03-routing-pages.md](./03-routing-pages.md)** - 画面構成理解
4. **[05-authentication-authorization.md](./05-authentication-authorization.md)** - 認証システム
5. **[08-known-issues.md](./08-known-issues.md)** - 注意すべき問題

その他のドキュメントは担当分野に応じて参照してください。

---

**📅 最終更新**: 2025年9月5日  
**✍️ 更新者**: Codex  
**📝 バージョン**: v1.1（取引所風ウォレット方針を反映）
