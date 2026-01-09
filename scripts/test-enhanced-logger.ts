/**
 * 強化されたロガーの動作確認テスト
 */

import { logger } from './lib/enhanced-logger.js';

async function testEnhancedLogger(): Promise<boolean> {
  console.log('🧪 Enhanced Logger テスト開始...\n');

  try {
    // 1. 基本的なログ出力テスト
    console.log('📝 1. 基本的なログ出力テスト');
    logger.log('info', 'テスト情報ログ', { test: true });
    logger.log('warn', 'テスト警告ログ', { warning: 'sample' });
    logger.log('error', 'テストエラーログ', { error: 'sample' });

    // 2. 操作開始・成功のテスト
    console.log('\n📝 2. 操作ログテスト');
    const operationId = logger.startOperation('test_operation', 'evm', 'ethereum', { test: 'data' });

    // 少し待機
    await new Promise(resolve => setTimeout(resolve, 100));

    logger.success('test_operation', operationId, 100, 'evm', 'ethereum', { result: 'success' });

    // 3. エラーログテスト
    console.log('\n📝 3. エラーログテスト');
    const errorOperationId = logger.startOperation('error_operation', 'btc', 'mainnet');
    const testError = new Error('Test error message');
    logger.error('error_operation', testError, errorOperationId, 'btc', 'mainnet', 1);

    // 4. メトリクス取得テスト
    console.log('\n📝 4. メトリクス取得テスト');
    const metrics = logger.getSystemMetrics();
    console.log('📊 システムメトリクス:', JSON.stringify(metrics, null, 2));

    // 5. メトリクス履歴テスト
    console.log('\n📝 5. メトリクス履歴テスト');
    const history = logger.getMetricsHistory();
    console.log('📋 メトリクス履歴件数:', history.length);

    if (history.length > 0) {
      console.log('📋 最新のメトリクス:', JSON.stringify(history[0], null, 2));
    }

    // 6. ヘルスチェックテスト（簡単なもの）
    console.log('\n📝 6. ヘルスチェックテスト');
    const healthResult = await logger.performHealthCheck();
    console.log('💚 ヘルスチェック結果:', JSON.stringify(healthResult, null, 2));

    console.log('\n✅ Enhanced Logger テスト完了！');
    return true;

  } catch (error) {
    console.error('❌ Enhanced Logger テスト失敗:', error);
    return false;
  }
}

// テスト実行
testEnhancedLogger()
  .then(success => {
    console.log(success ? '\n🎉 テスト成功！' : '\n💥 テスト失敗...');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n💥 テスト実行エラー:', error);
    process.exit(1);
  });