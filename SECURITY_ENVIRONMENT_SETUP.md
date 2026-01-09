# セキュリティ強化済み環境変数設定ガイド

## 🚨 重要な変更

このプロジェクトでは**ハードコードされたAPIキーとシークレットを完全除去**しました。
本番環境では必ず以下の手順に従って環境変数を設定してください。

## 🔒 除去されたシークレット

以下のハードコードされたシークレットが除去され、環境変数での管理に変更されました：

- **Alchemy API Key** (`VITE_ALCHEMY_API_KEY`)
- **Blockfrost API Key** (`VITE_BLOCKFROST_API_KEY`)
- **TronGrid API Key** (`VITE_TRONGRID_API_KEY`)
- **Wallet Encryption Key** (`WALLET_ENCRYPTION_KEY`)

## 🔧 環境変数設定手順

### 1. 開発環境

```bash
# Alchemy API Key (Ethereum, Bitcoin)
export VITE_ALCHEMY_API_KEY="your_alchemy_api_key_here"

# Blockfrost API Key (Cardano)
export VITE_BLOCKFROST_API_KEY="your_blockfrost_project_id_here"

# TronGrid API Key (Tron/TRC20)
export VITE_TRONGRID_API_KEY="your_trongrid_api_key_here"

# ウォレット暗号化キー（開発用）
export WALLET_ENCRYPTION_KEY="dev-strong-encryption-key-$(openssl rand -hex 32)"
```

### 2. 本番環境

```bash
# ⚠️ CRITICAL: 本番環境では強力なキーを使用
export WALLET_ENCRYPTION_KEY="$(openssl rand -hex 64)"

# 本番API キー
export VITE_ALCHEMY_API_KEY="prod_alchemy_key"
export VITE_BLOCKFROST_API_KEY="mainnet_blockfrost_key"
export VITE_TRONGRID_API_KEY="prod_trongrid_key"
```

### 3. Docker環境

```dockerfile
# Dockerfile内での設定例
ENV VITE_ALCHEMY_API_KEY=""
ENV VITE_BLOCKFROST_API_KEY=""
ENV VITE_TRONGRID_API_KEY=""
ENV WALLET_ENCRYPTION_KEY=""

# docker-compose.yml内での設定例
environment:
  - VITE_ALCHEMY_API_KEY=${VITE_ALCHEMY_API_KEY}
  - VITE_BLOCKFROST_API_KEY=${VITE_BLOCKFROST_API_KEY}
  - VITE_TRONGRID_API_KEY=${VITE_TRONGRID_API_KEY}
  - WALLET_ENCRYPTION_KEY=${WALLET_ENCRYPTION_KEY}
```

## 🛡️ セキュリティベストプラクティス

### APIキーの取得

1. **Alchemy**: [dashboard.alchemy.com](https://dashboard.alchemy.com) でプロジェクト作成
2. **Blockfrost**: [blockfrost.io](https://blockfrost.io) でプロジェクト作成
3. **TronGrid**: [developers.tron.network](https://developers.tron.network) でAPIキー取得

### キー管理の原則

- **分離**: 開発/ステージング/本番で異なるキーを使用
- **ローテーション**: 定期的なAPIキーローテーション
- **最小権限**: 必要最小限の権限のみ付与
- **監査**: APIキー使用状況の定期監査

### 暗号化キーの生成

```bash
# 強力な暗号化キー生成
openssl rand -hex 64

# または
python3 -c "import secrets; print(secrets.token_hex(64))"
```

## 🔍 設定確認

環境変数が正しく設定されているか確認：

```bash
# 必須環境変数のチェック
echo "Alchemy: ${VITE_ALCHEMY_API_KEY:0:10}..."
echo "Blockfrost: ${VITE_BLOCKFROST_API_KEY:0:10}..."
echo "TronGrid: ${VITE_TRONGRID_API_KEY:0:10}..."
echo "Encryption: ${WALLET_ENCRYPTION_KEY:0:10}..."
```

## ⚠️ 注意事項

1. **`.env` ファイルは開発用テンプレート**として使用し、本番シークレットは含めない
2. **環境変数を使用した設定**を優先する
3. **CI/CD パイプライン**では秘匿化された環境変数を使用
4. **コードレビュー**でシークレットが混入していないか確認

## 🔧 トラブルシューティング

### 設定が反映されない場合

```bash
# 環境変数の確認
printenv | grep VITE_

# アプリケーション再起動
npm run dev
```

### API接続エラーの場合

1. APIキーの有効性確認
2. APIエンドポイントの接続確認
3. レート制限の確認
4. 権限設定の確認

---

**🔒 セキュリティは継続的なプロセスです。定期的な設定見直しと監査を実施してください。**