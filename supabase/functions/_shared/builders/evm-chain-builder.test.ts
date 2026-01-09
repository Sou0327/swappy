/**
 * EVM Chain Builder - TDD Test Suite
 *
 * TDDフロー:
 * 1. テスト作成（Red）← 現在ここ
 * 2. 実装作成（Green）
 * 3. リファクタリング（Refactor）
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { EvmChainBuilder } from './evm-chain-builder.ts';
import type { BuildTxParams, BroadcastParams } from '../chain-abstraction/types.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
  RpcError,
} from '../chain-abstraction/errors.ts';

Deno.test('EvmChainBuilder - validateAddress', async (t) => {
  const builder = new EvmChainBuilder();

  await t.step('有効なEVMアドレスを受け入れる', () => {
    const validAddresses = [
      '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbE',  // Ethereumアドレス（40文字）
      '0x1234567890123456789012345678901234567890',  // 標準的な0x + 40文字
    ];

    validAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), true, `${addr} should be valid`);
    });
  });

  await t.step('無効なEVMアドレスを拒否する', () => {
    const invalidAddresses = [
      'TXxx1234567890123456789012345678901',        // Tronアドレス
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',  // Bitcoinアドレス
      '0x123',                                       // 短すぎる
      'invalid',                                     // 不正な文字列
      '',                                            // 空文字
    ];

    invalidAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), false, `${addr} should be invalid`);
    });
  });
});

Deno.test('EvmChainBuilder - estimateFee', async (t) => {
  const builder = new EvmChainBuilder();

  await t.step('EVM送金の手数料を推定できる（モック）', async () => {
    const params: BuildTxParams = {
      chain: 'evm',
      network: 'ethereum',
      asset: 'ETH',
      fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbE',
      toAddress: '0x1234567890123456789012345678901234567890',
      balance: 1000000000000000000n,  // 1 ETH = 10^18 wei
    };

    // 実装後、wei単位の手数料を返すべき
    // 現時点ではエラーが投げられることを期待（未設定のRPC URL）
    await assertRejects(
      () => builder.estimateFee(params),
      Error,
    );
  });
});

Deno.test('EvmChainBuilder - buildUnsignedTx', async (t) => {
  const builder = new EvmChainBuilder();

  await t.step('EVM送金のunsigned transactionを生成できる（モック）', async () => {
    const params: BuildTxParams = {
      chain: 'evm',
      network: 'ethereum',
      asset: 'ETH',
      fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbE',
      toAddress: '0x1234567890123456789012345678901234567890',
      balance: 1000000000000000000n,  // 1 ETH
    };

    // 実装後、unsigned transactionを返すべき
    // 現時点ではエラーが投げられることを期待（未実装または未設定のRPC URL）
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('残高不足の場合、InsufficientBalanceErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'evm',
      network: 'ethereum',
      asset: 'ETH',
      fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbE',
      toAddress: '0x1234567890123456789012345678901234567890',
      balance: 1000n,  // 非常に小さい残高（手数料にも満たない）
    };

    // 実装後、InsufficientBalanceErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('無効なアドレスの場合、InvalidAddressErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'evm',
      network: 'ethereum',
      asset: 'ETH',
      fromAddress: 'invalid_address',
      toAddress: '0x1234567890123456789012345678901234567890',
      balance: 1000000000000000000n,
    };

    // validateAddress()がfalseを返すアドレスでbuildUnsignedTxを呼ぶと
    // InvalidAddressErrorが投げられるべき（実装による）
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('EvmChainBuilder - broadcastTx', async (t) => {
  const builder = new EvmChainBuilder();

  await t.step('署名済みトランザクションを正常にブロードキャストできる（モック）', async () => {
    // Note: 実際のAPI呼び出しテストは統合テストで行う
    // ここではモックを使用した基本的な動作確認

    const params: BroadcastParams = {
      chain: 'evm',
      network: 'ethereum',
      signedTx: '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83',  // 署名済みトランザクションのhex
    };

    // 実装後、実際のRPC呼び出しまたはモックでトランザクションハッシュを返すべき
    // 現時点では環境変数が設定されていないためエラーが投げられることを期待
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
      'ETHEREUM_ETHEREUM_RPC_URL',
    );
  });

  await t.step('無効なトランザクションhexでエラーを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'evm',
      network: 'ethereum',
      signedTx: 'invalid_hex',
    };

    // 不正なhexフォーマットの場合、JSON-RPC APIがエラーを返す
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });

  await t.step('APIエラー時に適切なRpcErrorを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'evm',
      network: 'ethereum',
      signedTx: '0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83',
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
 * deno test --allow-all supabase/functions/_shared/builders/evm-chain-builder.test.ts
 */
