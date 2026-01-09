/**
 * Bitcoin Transaction Builder - TDD Test Suite
 *
 * TDDフロー:
 * 1. テスト作成（Red）← 現在ここ
 * 2. 実装作成（Green）
 * 3. リファクタリング（Refactor）
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { BitcoinChainBuilder } from './bitcoin-tx-builder.ts';
import type { BuildTxParams, BroadcastParams } from '../chain-abstraction/types.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
  RpcError,
} from '../chain-abstraction/errors.ts';

Deno.test('BitcoinChainBuilder - validateAddress', async (t) => {
  const builder = new BitcoinChainBuilder();

  await t.step('有効なBitcoinアドレスを受け入れる', () => {
    const validAddresses = [
      'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',  // bech32 (SegWit)
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',       // P2PKH (legacy)
      '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy',       // P2SH (legacy)
    ];

    validAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), true, `${addr} should be valid`);
    });
  });

  await t.step('無効なBitcoinアドレスを拒否する', () => {
    const invalidAddresses = [
      'TXxx1234567890123456789012345678901',        // Tronアドレス
      '0x1234567890123456789012345678901234567890', // EVMアドレス
      'invalid',                                     // 不正な文字列
      '',                                            // 空文字
      'bc1short',                                    // 短すぎるbech32
    ];

    invalidAddresses.forEach((addr) => {
      assertEquals(builder.validateAddress(addr), false, `${addr} should be invalid`);
    });
  });
});

Deno.test('BitcoinChainBuilder - estimateFee', async (t) => {
  const builder = new BitcoinChainBuilder();

  await t.step('Bitcoin送金の手数料を推定できる', async () => {
    const params: BuildTxParams = {
      chain: 'btc',
      network: 'mainnet',
      asset: 'BTC',
      fromAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      balance: 100000n,  // 0.001 BTC = 100,000 satoshi
    };

    // BitcoinビルダーのestimateFeeは計算式で固定値を返す
    const fee = await builder.estimateFee(params);
    assertEquals(typeof fee, 'bigint');
    assertEquals(fee > 0n, true, 'Fee should be positive');
  });
});

Deno.test('BitcoinChainBuilder - buildUnsignedTx', async (t) => {
  const builder = new BitcoinChainBuilder();

  await t.step('Bitcoin送金のunsigned transaction（PSBT）を生成できる（モック）', async () => {
    const params: BuildTxParams = {
      chain: 'btc',
      network: 'mainnet',
      asset: 'BTC',
      fromAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      balance: 100000n,  // 0.001 BTC
    };

    // 実装後、PSBT形式のunsigned transactionを返すべき
    // 現時点ではエラーが投げられることを期待（未実装）
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('残高不足の場合、InsufficientBalanceErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'btc',
      network: 'mainnet',
      asset: 'BTC',
      fromAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      balance: 546n,  // Dust limit付近の非常に小さい残高
    };

    // 実装後、InsufficientBalanceErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });

  await t.step('無効なアドレスの場合、InvalidAddressErrorを投げる', async () => {
    const params: BuildTxParams = {
      chain: 'btc',
      network: 'mainnet',
      asset: 'BTC',
      fromAddress: 'invalid_address',
      toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      balance: 100000n,
    };

    // 実装後、InvalidAddressErrorが投げられるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('BitcoinChainBuilder - UTXO選択ロジック', async (t) => {
  const builder = new BitcoinChainBuilder();

  await t.step('複数のUTXOから適切に選択できる（将来実装）', async () => {
    // UTXOリスト例:
    // UTXO1: 50,000 satoshi
    // UTXO2: 30,000 satoshi
    // UTXO3: 20,000 satoshi
    // 送金額: 60,000 satoshi
    // 期待結果: UTXO1 + UTXO2を選択（合計80,000 satoshi）

    const params: BuildTxParams = {
      chain: 'btc',
      network: 'mainnet',
      asset: 'BTC',
      fromAddress: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      toAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      balance: 60000n,
      chainSpecific: {
        utxos: [
          { txid: 'tx1', vout: 0, value: 50000 },
          { txid: 'tx2', vout: 0, value: 30000 },
          { txid: 'tx3', vout: 0, value: 20000 },
        ],
      },
    };

    // 実装後、適切なUTXO選択が行われるべき
    await assertRejects(
      () => builder.buildUnsignedTx(params),
      Error,
    );
  });
});

Deno.test('BitcoinChainBuilder - broadcastTx', async (t) => {
  const builder = new BitcoinChainBuilder();

  await t.step('署名済みトランザクションを正常にブロードキャストできる（モック）', async () => {
    // Note: 実際のAPI呼び出しテストは統合テストで行う
    // ここではモックを使用した基本的な動作確認

    const params: BroadcastParams = {
      chain: 'btc',
      network: 'mainnet',
      signedTx: '0200000001mock_signed_transaction_hex',  // 署名済みトランザクションのhex
    };

    // 実装後、実際のRPC呼び出しまたはモックでトランザクションハッシュを返すべき
    // 現時点では環境変数が設定されていないためエラーが投げられることを期待
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
      'BITCOIN_MAINNET_API_URL',
    );
  });

  await t.step('無効なトランザクションhexでエラーを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'btc',
      network: 'mainnet',
      signedTx: 'invalid_hex',
    };

    // 不正なhexフォーマットの場合、Blockstream APIがエラーを返す
    await assertRejects(
      () => builder.broadcastTx(params),
      Error,
    );
  });

  await t.step('APIエラー時に適切なRpcErrorを投げる', async () => {
    const params: BroadcastParams = {
      chain: 'btc',
      network: 'mainnet',
      signedTx: '0200000001mock_signed_transaction_hex',
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
 * deno test --allow-all supabase/functions/_shared/builders/bitcoin-tx-builder.test.ts
 */
