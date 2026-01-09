/**
 * テストセットアップ（confirmations-updater用）
 */

// 環境変数設定
Deno.env.set('SUPABASE_URL', 'https://test.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
Deno.env.set('ETHEREUM_RPC_URL', 'https://ethereum.example.com');
Deno.env.set('ETHEREUM_SEPOLIA_RPC_URL', 'https://sepolia.example.com');
Deno.env.set('TRONGRID_API_KEY', 'test-trongrid-key');
Deno.env.set('BLOCKFROST_PROJECT_ID', 'test-blockfrost-key');

export const assert = {
  equal: (actual: any, expected: any, message?: string) => {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${expected}, got ${actual}`
      );
    }
  },

  isTrue: (value: any, message?: string) => {
    if (value !== true) {
      throw new Error(message || `Expected true, got ${value}`);
    }
  },

  isNotNull: (value: any, message?: string) => {
    if (value === null || value === undefined) {
      throw new Error(message || 'Expected non-null value');
    }
  },

  exists: (value: any, message?: string) => {
    if (value === null || value === undefined) {
      throw new Error(message || 'Expected value to exist');
    }
  },
};
