#!/usr/bin/env node

/**
 * Tatum Webhook HMAC署名生成スクリプト
 *
 * 使用方法:
 *   node scripts/generate-hmac.js
 *
 * 環境変数:
 *   TATUM_WEBHOOK_HMAC_SECRET - HMAC署名用シークレットキー
 *
 * 機能:
 *   - payload.jsonからWebhookペイロードを読み込み
 *   - HMAC-SHA512署名を生成
 *   - curlテスト用のコマンドを出力
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 設定
const PAYLOAD_FILE = path.join(__dirname, '..', 'payload.json');
const DEFAULT_SECRET = 'test-secret-key-for-development';
const WEBHOOK_URL = process.env.VITE_TEST_WEBHOOK_URL || 'http://localhost:54321/functions/v1/tatum-webhook';

function main() {
  console.log('🔐 Tatum Webhook HMAC署名生成ツール\n');

  // 環境変数確認
  const secret = process.env.TATUM_WEBHOOK_HMAC_SECRET || DEFAULT_SECRET;
  if (secret === DEFAULT_SECRET) {
    console.log('⚠️  環境変数 TATUM_WEBHOOK_HMAC_SECRET が設定されていません');
    console.log('   デフォルトのテスト用キーを使用します: ' + DEFAULT_SECRET);
    console.log('   本番環境では必ず環境変数を設定してください\n');
  } else {
    console.log('✅ HMAC Secret: ' + secret.slice(0, 8) + '...\n');
  }

  // ペイロードファイル確認
  if (!fs.existsSync(PAYLOAD_FILE)) {
    console.error('❌ エラー: payload.json が見つかりません');
    console.error('   場所: ' + PAYLOAD_FILE);
    console.error('   サンプルペイロードを作成してください\n');

    // サンプルペイロード作成
    createSamplePayload();
    return;
  }

  try {
    // ペイロード読み込み
    const payload = fs.readFileSync(PAYLOAD_FILE, 'utf8');
    console.log('📄 ペイロード読み込み完了 (' + payload.length + ' bytes)');

    // JSON妥当性チェック
    try {
      const parsedPayload = JSON.parse(payload);
      console.log('✅ JSON形式: 有効');
      console.log('📊 内容: ' + parsedPayload.type || 'N/A' + ' イベント\n');
    } catch (parseError) {
      console.log('⚠️  JSON形式: 無効 (文字列として処理)\n');
    }

    // HMAC-SHA512 署名生成
    const signature = crypto
      .createHmac('sha512', secret)
      .update(payload)
      .digest('hex');

    // 結果出力
    console.log('🔑 HMAC-SHA512 署名生成結果:');
    console.log('─'.repeat(80));
    console.log('Signature: ' + signature);
    console.log('Header:    sha512=' + signature);
    console.log('─'.repeat(80));

    // curlテストコマンド生成
    console.log('\n🧪 curlテストコマンド:');
    console.log('─'.repeat(80));

    // 正常なリクエスト
    console.log('\n✅ 正常な署名でのテスト:');
    console.log(`curl -X POST "${WEBHOOK_URL}" \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log(`  -H "X-Tatum-Signature: sha512=${signature}" \\`);
    console.log('  -d @payload.json');

    // 無効なリクエスト
    console.log('\n❌ 無効な署名でのテスト:');
    console.log(`curl -X POST "${WEBHOOK_URL}" \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "X-Tatum-Signature: sha512=invalid_signature" \\');
    console.log('  -d @payload.json');

    console.log('\n📝 使用方法:');
    console.log('1. 上記のcurlコマンドをコピー&ペーストして実行');
    console.log('2. Supabase Functionsのログを確認');
    console.log('3. データベースで処理結果を確認');

    console.log('\n🔍 ログ確認コマンド:');
    console.log('npx supabase functions serve --env-file .env');

  } catch (error) {
    console.error('❌ エラー: ' + error.message);
    process.exit(1);
  }
}

function createSamplePayload() {
  console.log('📝 サンプルペイロード作成中...\n');

  const samplePayload = {
    "subscriptionType": "INCOMING_NATIVE_TX",
    "address": "TYour...SampleAddress",
    "txId": "a1b2c3d4e5f6...sample_transaction_hash",
    "blockNumber": 45123456,
    "chain": "TRON",
    "network": "mainnet",
    "amount": "100.000000",
    "asset": "TRX",
    "timestamp": new Date().toISOString(),
    "confirmations": 20
  };

  try {
    fs.writeFileSync(PAYLOAD_FILE, JSON.stringify(samplePayload, null, 2));
    console.log('✅ サンプルペイロード作成完了: ' + PAYLOAD_FILE);
    console.log('   内容を確認してから再実行してください\n');
    console.log('確認コマンド: cat payload.json');
  } catch (error) {
    console.error('❌ サンプルペイロード作成失敗: ' + error.message);
  }
}

// CLI引数処理
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Tatum Webhook HMAC署名生成ツール\n');
    console.log('使用方法:');
    console.log('  node scripts/generate-hmac.js');
    console.log('');
    console.log('環境変数:');
    console.log('  TATUM_WEBHOOK_HMAC_SECRET  - HMAC署名用シークレットキー');
    console.log('  VITE_TEST_WEBHOOK_URL      - テスト用WebhookエンドポイントURL');
    console.log('');
    console.log('ファイル:');
    console.log('  payload.json               - Webhookペイロードファイル');
    process.exit(0);
  }

  main();
}

module.exports = { main };