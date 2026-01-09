#!/bin/bash

# ========================================
# 本番環境診断スクリプト実行ツール
# ========================================

set -e

echo "=========================================="
echo "本番環境の包括的診断を開始します"
echo "=========================================="
echo ""

# Supabaseプロジェクト情報を確認
if [ ! -f ".env" ]; then
    echo "❌ エラー: .envファイルが見つかりません"
    echo "💡 Supabaseの接続情報を.envファイルに設定してください"
    exit 1
fi

# Supabase CLIで接続情報を取得
echo "🔍 Supabase接続情報を取得中..."
DB_URL=$(supabase status | grep "DB URL" | awk '{print $3}')

if [ -z "$DB_URL" ]; then
    echo "❌ エラー: Supabase DB URLが取得できませんでした"
    echo "💡 supabase loginとsupabase link を実行してください"
    exit 1
fi

echo "✅ 接続情報を取得しました"
echo ""

# 診断スクリプトを実行
echo "=========================================="
echo "診断スクリプトを実行します..."
echo "=========================================="
echo ""

# psqlがインストールされているか確認
if ! command -v psql &> /dev/null; then
    echo "❌ エラー: psqlコマンドが見つかりません"
    echo "💡 PostgreSQLクライアントをインストールしてください:"
    echo "   brew install postgresql"
    exit 1
fi

# 診断実行
psql "$DB_URL" -f scripts/comprehensive_diagnosis.sql > diagnosis_result.txt 2>&1

echo ""
echo "=========================================="
echo "✅ 診断完了"
echo "=========================================="
echo ""
echo "📄 結果は diagnosis_result.txt に保存されました"
echo ""
echo "次のステップ:"
echo "1. diagnosis_result.txt を確認"
echo "2. 問題の原因を特定"
echo "3. 修正マイグレーションを適用"
echo ""