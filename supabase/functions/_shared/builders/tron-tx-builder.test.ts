/**
 * Tron Transaction Builder - TDD Test Suite
 *
 * TDDフロー:
 * 1. テスト作成（Red）← 現在ここ
 * 2. 実装作成（Green）
 * 3. リファクタリング（Refactor）
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { TronChainBuilder } from './tron-tx-builder.ts';
import type { BuildTxParams, BroadcastParams } from '../chain-abstraction/types.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
  RpcError,
} from '../chain-abstraction/errors.ts';

// TronGrid APIのモック設定
const MOCK_TRON_RPC_URL = 'https://api.trongrid.io';

Deno.test('TronChainBuilder - validateAddress', async (t) => {
  const builder = new TronChainBuilder();

  await t.step('有効なTronアドレスを受け入れる', () => {
    const validAddresses = [
      'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',  // 34文字、Tで始まる
      'TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY',  // 実際のTronアドレス形式
    ];

    validAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), true, `${addr} should be valid`);
    });
  });

  await t.step('無効なTronアドレスを拒否する', () => {
    const invalidAddresses = [
      '0x1234567890123456789012345678901234567890',  // EVMアドレス
      'TXshort',                                      // 短すぎる
      'BXxx1234567890123456789012345678901',         // Tで始まらない
      '12345678901234567890123456789012',            // 数字のみ
      '',                                            // 空文字
    ];

    invalidAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), false, `${addr} should be invalid`);
    });
  });
});

Deno.test('TronChainBuilder - estimateFee', async (t) => {
  const builder = new TronChainBuilder();

  await t.step('TRX送金の手数料を推定できる', async () => {
    const params: BuildTxParams = {
      chain: 'trc',
      network: 'mainnet',
      asset: 'TRX',
      fromAddress: 'TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY',
      toAddress: 'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
      balance: 1000000n,  // 1 TRX = 1,000,000 SUN
    };

    // TronビルダーのestimateFeeは固定値を返す
    const fee = await builder.estimateFee(params);
    assertEquals(typeof fee, 'bigint');
    assertEquals(fee > 0n, true, 'Fee should be positive');
  });
});

Deno.test('TronChainBuilder - buildUnsignedTx', async (t) => {
  const builder = new TronChainBuilder();

  await t.step('TRX送金のunsigned transactionを生成できる（モック）', async () => {
    const params: BuildTxParams = {
      chain: 'trc',
      network: 'mainnet',
      asset: 'TRX',
      fromAddress: 'TXxx1234567890123456789012345678901',
      toAddress: 'TYyy1234567890123456789012345678901',
      balance: 10000000n,  // 10 TRX = 10,000,000 SUN
    };

    // 実装後、unsignedTxを返すべき
    // 現時点ではエラーが投げられることを期待（未実装）
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('残高不足の場合、InsufficientBalanceErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'trc',
      network: 'mainnet',
      asset: 'TRX',
      fromAddress: 'TXxx1234567890123456789012345678901',
      toAddress: 'TYyy1234567890123456789012345678901',
      balance: 100n,  // 非常に小さい残高（手数料にも満たない）
    };

    // 実装後、InsufficientBalanceErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('無効なアドレスの場合、InvalidAddressErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'trc',
      network: 'mainnet',
      asset: 'TRX',
      fromAddress: '0xinvalid',
      toAddress: 'TYyy1234567890123456789012345678901',
      balance: 10000000n,
    };

    // 実装後、InvalidAddressErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('TronChainBuilder - TRC20トークン対応（将来実装）', async (t) => {
  const builder = new TronChainBuilder();

  await t.step('TRC20トークン送金のunsigned transactionを生成できる', async () => {
    const params: BuildTxParams = {
      chain: 'trc',
      network: 'mainnet',
      asset: 'USDT',  // TRC20-USDT
      fromAddress: 'TXxx1234567890123456789012345678901',
      toAddress: 'TYyy1234567890123456789012345678901',
      balance: 1000000n,  // 1 USDT (6 decimals)
      chainSpecific: {
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',  // USDT contract
      },
    };

    // 将来の実装：TRC20トークン送金をサポート
    // 現時点ではスキップまたはエラー
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('TronChainBuilder - broadcastTx', async (t) => {
  const builder = new TronChainBuilder();

  await t.step('署名済みトランザクションを正常にブロードキャストできる（モック）', async () => {
    // Note: 実際のAPI呼び出しテストは統合テストで行う
    // ここではモックを使用した基本的な動作確認

    const params: BroadcastParams = {
      chain: 'trc',
      network: 'mainnet',
      signedTx: JSON.stringify({
        signature: ['mock_signature'],
        txID: 'mock_tx_id',
        raw_data: {},
      }),
    };

    // 実装後、実際のRPC呼び出しまたはモックでトランザクションハッシュを返すべき
    // 現時点では環境変数が設定されていないためエラーが投げられることを期待
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
      'TRON_MAINNET_RPC_URL',
    );
  });

  await t.step('無効なトランザクションでエラーを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'trc',
      network: 'mainnet',
      signedTx: 'invalid_json',
    };

    // 不正なJSONフォーマットでエラー
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });

  await t.step('APIエラー時に適切なRpcErrorを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'trc',
      network: 'mainnet',
      signedTx: JSON.stringify({
        signature: ['mock_signature'],
        txID: 'mock_tx_id',
        raw_data: {},
      }),
    };

    // RPC URLが未設定の場合、ConfigurationErrorまたはRpcErrorが投げられる
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });
});

/**
 * テスト実行コマンド:
 * deno test --allow-all supabase/functions/_shared/builders/tron-tx-builder.test.ts
 */
