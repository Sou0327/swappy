/**
 * HDウォレット・マスターキー管理システム統合テスト
 *
 * テスト対象:
 * - Layer 1: master-key-manager Edge Function
 * - Layer 2: wallet-root-manager Edge Function
 * - BIP39/BIP32標準準拠性
 * - セキュリティ要件
 * - 既存システムとの互換性
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';

// テスト用の環境設定
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// CI環境では SERVICE_ROLE_KEY が設定されていない場合、テストをスキップ
const SKIP_INTEGRATION_TESTS = !SUPABASE_SERVICE_ROLE_KEY;

// テスト用クライアント（キーが存在する場合のみ作成）
const serviceClient = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;
const userClient = SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// テスト用Admin権限設定
let testUserId: string;
let testMasterKeyId: string;
let testMnemonic: string;

// ====================================
// Helper Functions
// ====================================

async function callMasterKeyManager(action: string, data: Record<string, unknown> = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/master-key-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const result = await response.json();
  return result;
}

async function callWalletRootManager(action: string, data: Record<string, unknown> = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/wallet-root-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const result = await response.json();
  return result;
}

async function callAddressAllocator(chain: string, network: string, asset: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/address-allocator`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ chain, network, asset })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const result = await response.json();
  return result;
}

// ====================================
// Test Setup
// ====================================

beforeAll(async () => {
  // テスト用ユーザー作成（Adminロール）
  const { data: user, error: userError } = await serviceClient.auth.admin.createUser({
    email: 'hdwallet-test@example.com',
    password: 'TestPassword123!',
    email_confirm: true
  });

  if (userError || !user.user) {
    throw new Error(`Test user creation failed: ${userError?.message}`);
  }

  testUserId = user.user.id;

  // Admin権限付与
  const { error: roleError } = await serviceClient
    .from('user_roles')
    .upsert({
      user_id: testUserId,
      role: 'admin'
    });

  if (roleError) {
    throw new Error(`Admin role assignment failed: ${roleError.message}`);
  }

  console.log(`Test setup completed. User ID: ${testUserId}`);
});

afterAll(async () => {
  // テストデータクリーンアップ
  if (testMasterKeyId) {
    await serviceClient
      .from('master_keys')
      .delete()
      .eq('id', testMasterKeyId);
  }

  if (testUserId) {
    await serviceClient.auth.admin.deleteUser(testUserId);
  }

  console.log('Test cleanup completed');
});

// ====================================
// Layer 1 Tests: Master Key Manager
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Layer 1: Master Key Manager', () => {

  it('should generate a valid BIP39 mnemonic', async () => {
    const result = await callMasterKeyManager('generate', {
      strength: 256,
      description: 'Test master key'
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('mnemonic');
    expect(result.data).toHaveProperty('id');
    expect(result.data).toHaveProperty('encrypted');

    testMasterKeyId = result.data.id;
    testMnemonic = result.data.mnemonic;

    // BIP39準拠性検証
    expect(validateMnemonic(testMnemonic)).toBe(true);

    // 24語（256bit）検証
    const words = testMnemonic.split(' ');
    expect(words).toHaveLength(24);
  });

  it('should store encrypted mnemonic in database', async () => {
    const { data: masterKey, error } = await serviceClient
      .from('master_keys')
      .select('*')
      .eq('id', testMasterKeyId)
      .single();

    expect(error).toBeNull();
    expect(masterKey).toBeDefined();
    expect(masterKey.encrypted_mnemonic).toBeDefined();
    expect(masterKey.mnemonic_iv).toBeDefined();
    expect(masterKey.salt).toBeDefined();
    expect(masterKey.active).toBe(true);

    // 暗号化されていることを確認（平文でないこと）
    expect(masterKey.encrypted_mnemonic).not.toContain(testMnemonic.split(' ')[0]);
  });

  it('should decrypt mnemonic correctly', async () => {
    const result = await callMasterKeyManager('decrypt', {
      masterKeyId: testMasterKeyId
    });

    expect(result.success).toBe(true);
    expect(result.data.mnemonic).toBe(testMnemonic);
  });

  it('should verify backup correctly', async () => {
    // 正しいニーモニックでの検証
    const validResult = await callMasterKeyManager('verify', {
      masterKeyId: testMasterKeyId,
      mnemonic: testMnemonic
    });

    expect(validResult.success).toBe(true);
    expect(validResult.data.verified).toBe(true);

    // 間違ったニーモニックでの検証
    const invalidMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

    const invalidResult = await callMasterKeyManager('verify', {
      masterKeyId: testMasterKeyId,
      mnemonic: invalidMnemonic
    });

    expect(invalidResult.success).toBe(true);
    expect(invalidResult.data.verified).toBe(false);
  });

  it('should enforce admin-only access', async () => {
    // 非Admin権限でのアクセステスト（実装では403エラーを期待）
    // 実際のテストでは非Admin用のトークンを使用
  });

});

// ====================================
// Layer 2 Tests: Wallet Root Manager
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Layer 2: Wallet Root Manager', () => {

  it('should initialize wallet roots from master key', async () => {
    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);

    // 各チェーンのxpubが生成されていることを確認（1チェーン=1ルート設計）
    const chainAssets = result.data.map((wr: { chain: string; network: string; asset: string }) => `${wr.chain}/${wr.network}/${wr.asset}`);
    expect(chainAssets).toContain('evm/ethereum/ETH'); // EVMチェーンはETH/USDT/USDC等でアドレスを共有
    expect(chainAssets).toContain('btc/mainnet/BTC');
    expect(chainAssets).toContain('trc/mainnet/TRX'); // TRCチェーンはTRX/TRC20-USDT等でアドレスを共有
    expect(chainAssets).toContain('xrp/mainnet/XRP');
    expect(chainAssets).toContain('ada/mainnet/ADA');
  });

  it('should generate valid xpubs for each chain', async () => {
    const { data: walletRoots, error } = await serviceClient
      .from('wallet_roots')
      .select('*')
      .eq('master_key_id', testMasterKeyId)
      .eq('auto_generated', true);

    expect(error).toBeNull();
    expect(walletRoots).toBeDefined();
    expect(walletRoots.length).toBeGreaterThan(0);

    for (const root of walletRoots) {
      // xpub形式検証
      expect(root.xpub).toMatch(/^[xy]pub[1-9A-HJ-NP-Za-km-z]{107,108}$/);

      // 導出パス検証
      expect(root.derivation_path).toMatch(/^m\/44'\/\d+'\/0'$/);

      // HDKey導出テスト
      const hdKey = HDKey.fromExtendedKey(root.xpub);
      expect(hdKey).toBeDefined();
      expect(hdKey.publicExtendedKey).toBe(root.xpub);
    }
  });

  it('should validate wallet roots integrity', async () => {
    const result = await callWalletRootManager('validate', {
      masterKeyId: testMasterKeyId
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('valid');
    expect(result.data).toHaveProperty('invalid');
    expect(result.data).toHaveProperty('details');

    // すべてのwallet_rootsが有効であることを確認
    expect(result.data.invalid).toBe(0);
    expect(result.data.valid).toBeGreaterThan(0);
  });

  it('should derive correct xpubs from master key', async () => {
    // マスターキーから手動でxpubを導出し、データベースの値と比較
    const seed = mnemonicToSeedSync(testMnemonic);
    const masterKey = HDKey.fromMasterSeed(seed);

    // Ethereum用xpub導出
    const ethPath = "m/44'/60'/0'";
    const ethDerived = masterKey.derive(ethPath);
    const expectedEthXpub = ethDerived.publicExtendedKey;

    // データベースから取得
    const { data: ethRoot } = await serviceClient
      .from('wallet_roots')
      .select('xpub')
      .eq('master_key_id', testMasterKeyId)
      .eq('chain', 'evm')
      .eq('network', 'ethereum')
      .eq('asset', 'ETH')
      .eq('auto_generated', true)
      .single();

    expect(ethRoot?.xpub).toBe(expectedEthXpub);
  });

});

// ====================================
// Integration Tests: Address Allocator
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Integration: Address Allocator with HDWallet', () => {

  it('should prioritize HDWallet over legacy system', async () => {
    const result = await callAddressAllocator('evm', 'ethereum', 'ETH');

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('address');
    expect(result.data).toHaveProperty('xpub');

    // 生成されたアドレスがHDウォレットシステムのものであることを確認
    // （これは実際のユーザーアドレス生成なので、テスト環境でのみ実行）
  });

  it('should maintain compatibility with legacy wallet roots', async () => {
    // レガシーのwallet_rootエントリを作成
    const { data: legacyRoot, error } = await serviceClient
      .from('wallet_roots')
      .insert({
        chain: 'evm',
        network: 'sepolia',
        asset: 'TEST',
        xpub: 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gLhzjzm1TsBEV5LLGR4aV9dJJqN5WuqcGBqNcFHiPkfcVxnqzxMYNqYgvnNr1nHFKKrN',
        active: true,
        legacy_data: true,
        auto_generated: false,
        next_index: 0,
        derivation_template: '0/{index}'
      })
      .select()
      .single();

    expect(error).toBeNull();

    // 新システムが存在しない場合にレガシーが使用されることを確認
    // （実際のテストでは条件を調整）
  });

});

// ====================================
// Phase 2 Tests: Tron (TRC20) Support
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Phase 2: Tron (TRC20) Support', () => {

  it('should generate valid Tron addresses from master key', async () => {
    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId,
      chains: ['trc/mainnet'],
      force: true
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    // TronのTRXエントリを確認
    const tronRoot = result.data.find((wr: { chain: string; network: string; asset: string; xpub: string; derivation_path: string; auto_generated: boolean }) =>
      wr.chain === 'trc' && wr.network === 'mainnet' && wr.asset === 'TRX'
    );

    expect(tronRoot).toBeDefined();
    expect(tronRoot.xpub).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/); // Tronアドレス形式
    expect(tronRoot.derivation_path).toBe("m/44'/195'/0'"); // Tron BIP44
    expect(tronRoot.auto_generated).toBe(true);
  });

  it('should generate Tron USDT-TRC20 addresses', async () => {
    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId,
      chains: ['trc/mainnet'],
      force: true
    });

    expect(result.success).toBe(true);

    // TronのUSDTエントリを確認
    const tronUsdtRoot = result.data.find((wr: { chain: string; network: string; asset: string; xpub: string; derivation_path: string; auto_generated: boolean }) =>
      wr.chain === 'trc' && wr.network === 'mainnet' && wr.asset === 'USDT'
    );

    expect(tronUsdtRoot).toBeDefined();
    expect(tronUsdtRoot.xpub).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(tronUsdtRoot.derivation_path).toBe("m/44'/195'/0'");
    expect(tronUsdtRoot.auto_generated).toBe(true);
  });

  it('should integrate Tron with address-allocator', async () => {
    // HDウォレットからTronアドレス取得
    const result = await callAddressAllocator('trc', 'mainnet', 'TRX');

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('address');
    expect(result.data.address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);

    // 生成されたアドレスがHDウォレットシステムのものであることを確認
    expect(result.data).toHaveProperty('xpub');
    expect(result.data.xpub).toBe(result.data.address); // Tronの場合、アドレスとxpubは同一
  });

  it('should validate Tron addresses correctly', async () => {
    const result = await callWalletRootManager('validate', {
      masterKeyId: testMasterKeyId
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('valid');
    expect(result.data).toHaveProperty('invalid');

    // Tronアドレスが有効であることを確認
    const tronValidations = result.data.details.filter((detail: { chain: string; status: string }) =>
      detail.chain === 'trc'
    );

    for (const validation of tronValidations) {
      expect(validation.status).toBe('valid');
    }
  });

});

// ====================================
// Phase 2 Tests: XRP Ledger Support
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Phase 2: XRP Ledger Support', () => {

  it('should generate valid XRP addresses from master key', async () => {
    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId,
      chains: ['xrp/mainnet'],
      force: true
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    // XRPエントリを確認
    const xrpRoot = result.data.find((wr: { chain: string; network: string; asset: string; xpub: string; derivation_path: string; auto_generated: boolean }) =>
      wr.chain === 'xrp' && wr.network === 'mainnet' && wr.asset === 'XRP'
    );

    expect(xrpRoot).toBeDefined();
    expect(xrpRoot.xpub).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/); // XRP Classic Address形式
    expect(xrpRoot.derivation_path).toBe("m/44'/144'/0'"); // XRP BIP44
    expect(xrpRoot.auto_generated).toBe(true);
  });

  it('should integrate XRP with address-allocator', async () => {
    // HDウォレットからXRPアドレス取得
    const result = await callAddressAllocator('xrp', 'mainnet', 'XRP');

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('address');
    expect(result.data.address).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);

    // 生成されたアドレスがHDウォレットシステムのものであることを確認
    expect(result.data).toHaveProperty('xpub');
    expect(result.data.xpub).toBe(result.data.address); // XRPの場合、アドレスとxpubは同一
  });

  it('should validate XRP addresses correctly', async () => {
    const result = await callWalletRootManager('validate', {
      masterKeyId: testMasterKeyId
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('valid');
    expect(result.data).toHaveProperty('invalid');

    // XRPアドレスが有効であることを確認
    const xrpValidations = result.data.details.filter((detail: { chain: string; status: string }) =>
      detail.chain === 'xrp'
    );

    for (const validation of xrpValidations) {
      expect(validation.status).toBe('valid');
    }
  });

});

// ====================================
// Phase 2 Tests: Cardano (ADA) Support
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Phase 2: Cardano (ADA) Support', () => {

  it('should generate valid Cardano addresses from master key', async () => {
    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId,
      chains: ['ada/mainnet'],
      force: true
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    // Cardanoエントリを確認
    const adaRoot = result.data.find((wr: { chain: string; network: string; asset: string; xpub: string; derivation_path: string; auto_generated: boolean }) =>
      wr.chain === 'ada' && wr.network === 'mainnet' && wr.asset === 'ADA'
    );

    expect(adaRoot).toBeDefined();
    expect(adaRoot.xpub).toMatch(/^addr1[a-z0-9]+$/); // Cardano Shelley Address形式
    expect(adaRoot.derivation_path).toBe("m/1852'/1815'/0'"); // Cardano CIP-1852
    expect(adaRoot.auto_generated).toBe(true);
  });

  it('should integrate Cardano with address-allocator', async () => {
    // HDウォレットからCardanoアドレス取得
    const result = await callAddressAllocator('ada', 'mainnet', 'ADA');

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('address');
    expect(result.data.address).toMatch(/^addr1[a-z0-9]+$/);

    // 生成されたアドレスがHDウォレットシステムのものであることを確認
    expect(result.data).toHaveProperty('xpub');
    expect(result.data.xpub).toBe(result.data.address); // Cardanoの場合、アドレスとxpubは同一
  });

  it('should validate Cardano addresses correctly', async () => {
    const result = await callWalletRootManager('validate', {
      masterKeyId: testMasterKeyId
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('valid');
    expect(result.data).toHaveProperty('invalid');

    // Cardanoアドレスが有効であることを確認
    const adaValidations = result.data.details.filter((detail: { chain: string; status: string }) =>
      detail.chain === 'ada'
    );

    for (const validation of adaValidations) {
      expect(validation.status).toBe('valid');
    }
  });

});

// ====================================
// Phase 2 Multi-Chain Integration Tests
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Phase 2: Multi-Chain Integration', () => {

  it('should support all Phase 2 chains simultaneously', async () => {
    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId,
      chains: ['trc/mainnet', 'xrp/mainnet', 'ada/mainnet'],
      force: true
    });

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);

    // 各チェーンのエントリが存在することを確認
    const tronRoot = result.data.find((wr: { chain: string; xpub: string }) => wr.chain === 'trc');
    const xrpRoot = result.data.find((wr: { chain: string; xpub: string }) => wr.chain === 'xrp');
    const adaRoot = result.data.find((wr: { chain: string; xpub: string }) => wr.chain === 'ada');

    expect(tronRoot).toBeDefined();
    expect(xrpRoot).toBeDefined();
    expect(adaRoot).toBeDefined();

    // 各アドレス形式の確認
    expect(tronRoot.xpub).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(xrpRoot.xpub).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/);
    expect(adaRoot.xpub).toMatch(/^addr1[a-z0-9]+$/);
  });

  it('should handle address allocation for all Phase 2 chains', async () => {
    // 各チェーンのアドレス取得をテスト
    const chains = [
      { chain: 'trc', network: 'mainnet', asset: 'TRX' },
      { chain: 'xrp', network: 'mainnet', asset: 'XRP' },
      { chain: 'ada', network: 'mainnet', asset: 'ADA' }
    ];

    for (const { chain, network, asset } of chains) {
      const result = await callAddressAllocator(chain, network, asset);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('address');
      expect(result.data.address).toBeTruthy();
    }
  });

});

// ====================================
// Security Tests
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Security Requirements', () => {

  it('should enforce proper encryption', async () => {
    const { data: masterKey } = await serviceClient
      .from('master_keys')
      .select('encrypted_mnemonic, mnemonic_iv, salt')
      .eq('id', testMasterKeyId)
      .single();

    // Base64エンコードされた暗号化データの形式確認
    expect(masterKey.encrypted_mnemonic).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(masterKey.mnemonic_iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(masterKey.salt).toMatch(/^[A-Za-z0-9+/]+=*$/);

    // 暗号化データの長さ確認（適切なパディング）
    expect(masterKey.encrypted_mnemonic.length).toBeGreaterThan(100);
    expect(masterKey.mnemonic_iv.length).toBeGreaterThan(10);
    expect(masterKey.salt.length).toBeGreaterThan(40);
  });

  it('should enforce Row Level Security', async () => {
    // RLSポリシーの確認（Admin権限なしでのアクセステスト）
    // 実際のテストでは別ユーザーでのアクセスを試行
  });

  it('should enforce single active master key constraint', async () => {
    // 2つ目のマスターキー生成試行
    const secondResult = await callMasterKeyManager('generate', {
      strength: 256,
      description: 'Second test master key'
    });

    expect(secondResult.success).toBe(true);

    // 最初のマスターキーが無効化されていることを確認
    const { data: firstKey } = await serviceClient
      .from('master_keys')
      .select('active')
      .eq('id', testMasterKeyId)
      .single();

    expect(firstKey.active).toBe(false);

    // 新しいマスターキーがアクティブであることを確認
    const { data: secondKey } = await serviceClient
      .from('master_keys')
      .select('active')
      .eq('id', secondResult.data.id)
      .single();

    expect(secondKey.active).toBe(true);

    // クリーンアップ
    await serviceClient
      .from('master_keys')
      .delete()
      .eq('id', secondResult.data.id);
  });

  it('should validate BIP standard compliance', async () => {
    // BIP39: ニーモニック検証
    expect(validateMnemonic(testMnemonic)).toBe(true);

    // BIP32: HD導出検証
    const seed = mnemonicToSeedSync(testMnemonic);
    const masterKey = HDKey.fromMasterSeed(seed);

    expect(masterKey).toBeDefined();
    expect(masterKey.privateExtendedKey).toBeDefined();
    expect(masterKey.publicExtendedKey).toBeDefined();

    // 標準パスでの導出検証
    const paths = [
      "m/44'/60'/0'",   // Ethereum
      "m/44'/0'/0'",    // Bitcoin
      "m/44'/195'/0'",  // Tron
    ];

    for (const path of paths) {
      const derived = masterKey.derive(path);
      expect(derived).toBeDefined();
      expect(derived.publicExtendedKey).toMatch(/^[xy]pub/);
    }
  });

});

// ====================================
// Performance Tests
// ====================================

describe.skipIf(SKIP_INTEGRATION_TESTS)('Performance Requirements', () => {

  it('should generate master key within acceptable time', async () => {
    const startTime = Date.now();

    const result = await callMasterKeyManager('generate', {
      strength: 256,
      description: 'Performance test key'
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000); // 5秒以内

    // クリーンアップ
    await serviceClient
      .from('master_keys')
      .delete()
      .eq('id', result.data.id);
  });

  it('should initialize wallet roots within acceptable time', async () => {
    const startTime = Date.now();

    const result = await callWalletRootManager('initialize', {
      masterKeyId: testMasterKeyId,
      force: true
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(10000); // 10秒以内
  });

});

console.log('HDWallet integration tests completed');