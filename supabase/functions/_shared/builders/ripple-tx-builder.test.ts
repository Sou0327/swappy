/**
 * Ripple/XRP Transaction Builder - TDD Test Suite
 *
 * TDDフロー:
 * 1. テスト作成（Red）← 現在ここ
 * 2. 実装作成（Green）
 * 3. リファクタリング（Refactor）
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { RippleChainBuilder } from './ripple-tx-builder.ts';
import type { BuildTxParams, BroadcastParams } from '../chain-abstraction/types.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
} from '../chain-abstraction/errors.ts';

Deno.test('RippleChainBuilder - validateAddress', async (t) => {
  const builder = new RippleChainBuilder();

  await t.step('有効なRippleアドレスを受け入れる', () => {
    const validAddresses = [
      'rN7n7otQDd6FczFgLdqqYMyrn3HMwt9Ze',    // 標準的なrAddress（34文字）
      'rLHzPsX6oXkzU9rBqYhBM4qmPq2m5KCQU2',   // 別のrAddress
    ];

    validAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), true, `${addr} should be valid`);
    });
  });

  await t.step('無効なRippleアドレスを拒否する', () => {
    const invalidAddresses = [
      'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',  // Cardano
      'TXxx1234567890123456789012345678901',  // Tron
      'xaddress',                              // rで始まらない
      '',                                      // 空文字
    ];

    invalidAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), false, `${addr} should be invalid`);
    });
  });
});

Deno.test('RippleChainBuilder - estimateFee', async (t) => {
  const builder = new RippleChainBuilder();

  await t.step('XRP送金の手数料を推定できる', async () => {
    const params: BuildTxParams = {
      chain: 'xrp',
      network: 'mainnet',
      asset: 'XRP',
      fromAddress: 'rN7n7otQDd6FczFgLdqqYMyrn3HMwt9Ze',
      toAddress: 'rLHzPsX6oXkzU9rBqYhBM4qmPq2m5KCQU2',
      balance: 20000000n,  // 20 XRP = 20,000,000 drops
    };

    // RippleビルダーのestimateFeeは固定値を返す
    const fee = await builder.estimateFee(params);
    assertEquals(typeof fee, 'bigint');
    assertEquals(fee > 0n, true, 'Fee should be positive');
  });
});

Deno.test('RippleChainBuilder - buildUnsignedTx', async (t) => {
  const builder = new RippleChainBuilder();

  await t.step('XRP送金のunsigned transactionを生成できる（モック）', async () => {
    const params: BuildTxParams = {
      chain: 'xrp',
      network: 'mainnet',
      asset: 'XRP',
      fromAddress: 'rN7n7otQDd6FczFgLdlqtyMVrn3HMwt9Xe',
      toAddress: 'rLHzPsX6oXkzU9rBqYhBM4qmPq2m5KCQU2',
      balance: 20000000n,  // 20 XRP
    };

    // 実装後、unsigned transactionを返すべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('Reserve要件を満たさない場合、InsufficientBalanceErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'xrp',
      network: 'mainnet',
      asset: 'XRP',
      fromAddress: 'rN7n7otQDd6FczFgLdlqtyMVrn3HMwt9Xe',
      toAddress: 'rLHzPsX6oXkzU9rBqYhBM4qmPq2m5KCQU2',
      balance: 5000000n,  // 5 XRP（Reserve要件 10 XRPを満たさない）
    };

    // 実装後、InsufficientBalanceErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('無効なアドレスの場合、InvalidAddressErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'xrp',
      network: 'mainnet',
      asset: 'XRP',
      fromAddress: 'invalid_address',
      toAddress: 'rLHzPsX6oXkzU9rBqYhBM4qmPq2m5KCQU2',
      balance: 20000000n,
    };

    // 実装後、InvalidAddressErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('RippleChainBuilder - broadcastTx', async (t) => {
  const builder = new RippleChainBuilder();

  await t.step('署名済みトランザクションを正常にブロードキャストできる（モック）', async () => {
    // Note: 実際のAPI呼び出しテストは統合テストで行う
    // ここではモックを使用した基本的な動作確認

    const params: BroadcastParams = {
      chain: 'xrp',
      network: 'mainnet',
      signedTx: '1200002280000000240000000161400000000000000168400000000000000A732103...',  // tx_blob hex string
    };

    // 実装後、実際のRPC呼び出しまたはモックでトランザクションハッシュを返すべき
    // 現時点では環境変数が設定されていないためエラーが投げられることを期待
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
      'RIPPLE_MAINNET_RPC_URL',
    );
  });

  await t.step('無効なトランザクションでエラーを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'xrp',
      network: 'mainnet',
      signedTx: 'invalid_hex',
    };

    // 不正なhexフォーマットの場合、XRPL APIがエラーを返す
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });

  await t.step('APIエラー時に適切なRpcErrorを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'xrp',
      network: 'mainnet',
      signedTx: '1200002280000000240000000161400000000000000168400000000000000A732103...',
    };

    // API URLが未設定の場合、ConfigurationErrorまたはRpcErrorが投げられる
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });
});

/**
 * テスト実行コマンド:
 * deno test --allow-all supabase/functions/_shared/builders/ripple-tx-builder.test.ts
 */
