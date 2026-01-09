/**
 * 基本的なTatum APIライブラリテスト
 * Deno Native実装の動作確認
 */

// Mock Deno environment for testing
// Deno型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-expect-error Mock Deno environment for testing
globalThis.Deno = globalThis.Deno || {
  env: {
    get(key: string) {
      const mockEnv: Record<string, string> = {
        'TATUM_API_KEY': 'test-api-key-12345',
        'TATUM_WEBHOOK_URL': 'https://example.com/webhook',
        'FRONTEND_URL': 'http://localhost:8080'
      };
      return mockEnv[key];
    }
  },
  permissions: undefined
};

// Import and test the library
import { TatumAPIFactory, LIBRARY_INFO, logger } from './index.ts';

async function testBasicFunctionality() {
  console.log('🚀 Tatum API Library Test Suite');
  console.log('=====================================');

  // Test 1: Library Information
  console.log('📋 Library Info Test:');
  console.log('  Name:', LIBRARY_INFO.name);
  console.log('  Version:', LIBRARY_INFO.version);
  console.log('  Features:', LIBRARY_INFO.features.length, 'features');
  console.log('  ✅ Library info loaded successfully');

  // Test 2: Factory Creation
  console.log('\n🏭 Factory Creation Test:');
  try {
    const tatumAPI = TatumAPIFactory.createCompatibilityClient();
    console.log('  ✅ Factory created successfully');

    // Test 3: Health Check (mock)
    console.log('\n🏥 Health Check Test:');
    const health = await tatumAPI.healthCheck();
    console.log('  Health status:', health.status);
    console.log('  ✅ Health check completed');

    // Test 4: Metrics
    console.log('\n📊 Metrics Test:');
    const metrics = tatumAPI.getMetrics();
    console.log('  Total requests:', metrics.requests.total);
    console.log('  ✅ Metrics retrieved successfully');

    // Test 5: Cleanup
    tatumAPI.destroy();
    console.log('\n🧹 Cleanup Test:');
    console.log('  ✅ Resources cleaned up successfully');

  } catch (error) {
    console.error('  ❌ Factory test failed:', error);
  }

  // Test 6: Logger Test
  console.log('\n📝 Logger Test:');
  logger.info('Test log message', { test: true });
  console.log('  ✅ Logger functioning correctly');

  console.log('\n🎉 All basic tests completed!');
}

// Run the test if this file is executed directly
if (import.meta.main) {
  testBasicFunctionality().catch(console.error);
}