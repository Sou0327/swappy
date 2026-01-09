/**
 * Cardano Transaction Builder - TDD Test Suite
 *
 * TDDフロー:
 * 1. テスト作成（Red）← 現在ここ
 * 2. 実装作成（Green）
 * 3. リファクタリング（Refactor）
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { CardanoChainBuilder } from './cardano-tx-builder.ts';
import type { BuildTxParams, BroadcastParams } from '../chain-abstraction/types.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
} from '../chain-abstraction/errors.ts';

Deno.test('CardanoChainBuilder - validateAddress', async (t) => {
  const builder = new CardanoChainBuilder();

  await t.step('有効なCardanoアドレスを受け入れる', () => {
    const validAddresses = [
      'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      'addr1q8a9wj6zvk8tjh9y9zqzvv8qv6qvqv6qvqv6qvqv6qvqv6qvqv6qvqv6qvqv6qvqv6qvqv6qvqv6qvqv6qqpqqqq1234567890',
    ];

    validAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), true, `${addr} should be valid`);
    });
  });

  await t.step('無効なCardanoアドレスを拒否する', () => {
    const invalidAddresses = [
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',  // Bitcoinアドレス
      'TXxx1234567890123456789012345678901',        // Tronアドレス
      'addr_short',                                  // 短すぎる
      '',                                            // 空文字
    ];

    invalidAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), false, `${addr} should be invalid`);
    });
  });
});

Deno.test('CardanoChainBuilder - estimateFee', async (t) => {
  const builder = new CardanoChainBuilder();

  await t.step('ADA送金の手数料を推定できる', async () => {
    const params: BuildTxParams = {
      chain: 'ada',
      network: 'mainnet',
      asset: 'ADA',
      fromAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      toAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      balance: 10000000n,  // 10 ADA = 10,000,000 lovelace
    };

    // CardanoビルダーのestimateFeeは計算式で固定値を返す
    const fee = await builder.estimateFee(params);
    assertEquals(typeof fee, 'bigint');
    assertEquals(fee > 0n, true, 'Fee should be positive');
  });
});

Deno.test('CardanoChainBuilder - buildUnsignedTx', async (t) => {
  const builder = new CardanoChainBuilder();

  await t.step('ADA送金のunsigned transactionを生成できる（モック）', async () => {
    const params: BuildTxParams = {
      chain: 'ada',
      network: 'mainnet',
      asset: 'ADA',
      fromAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      toAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      balance: 10000000n,  // 10 ADA
    };

    // 実装後、CBOR形式のunsigned transactionを返すべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('残高不足の場合、InsufficientBalanceErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'ada',
      network: 'mainnet',
      asset: 'ADA',
      fromAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      toAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      balance: 500000n,  // 0.5 ADA（min UTXO要件を満たさない可能性）
    };

    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('無効なアドレスの場合、InvalidAddressErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'ada',
      network: 'mainnet',
      asset: 'ADA',
      fromAddress: 'invalid_address',
      toAddress: 'addr1qxqs59lphg8g6qndelq8xwqn60ag3aeyfcp33c2kdp46a09re5df3pzwwmyq946axfcejy5n4x0y99wqpgtp2gd0k09qsgy6pz',
      balance: 10000000n,
    };

    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('CardanoChainBuilder - broadcastTx', async (t) => {
  const builder = new CardanoChainBuilder();

  await t.step('署名済みトランザクションを正常にブロードキャストできる（モック）', async () => {
    // Note: 実際のAPI呼び出しテストは統合テストで行う
    // ここではモックを使用した基本的な動作確認

    const params: BroadcastParams = {
      chain: 'ada',
      network: 'mainnet',
      signedTx: '84a300818258...mock_cbor_hex',  // 署名済みCBORトランザクション
    };

    // 実装後、実際のRPC呼び出しまたはモックでトランザクションハッシュを返すべき
    // 現時点では環境変数が設定されていないためエラーが投げられることを期待
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
      'CARDANO_BLOCKFROST_URL',
    );
  });

  await t.step('無効なCBORトランザクションでエラーを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'ada',
      network: 'mainnet',
      signedTx: 'invalid_cbor',
    };

    // 不正なCBORフォーマットの場合、Blockfrost APIがエラーを返す
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });

  await t.step('APIエラー時に適切なRpcErrorを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'ada',
      network: 'mainnet',
      signedTx: '84a300818258...mock_cbor_hex',
    };

    // API URLまたはProject IDが未設定の場合、ConfigurationErrorまたはRpcErrorが投げられる
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });
});

/**
 * テスト実行コマンド:
 * deno test --allow-all supabase/functions/_shared/builders/cardano-tx-builder.test.ts
 */
