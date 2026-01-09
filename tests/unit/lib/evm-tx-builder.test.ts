/**
 * EVM Unsigned Transaction Builder - Unit Test (TDD Red Phase)
 *
 * テスト対象: supabase/functions/_shared/evm-tx-builder.ts
 *
 * TDDフロー:
 * 1. このテストを作成（Red - 失敗することを確認）
 * 2. evm-tx-builder.tsを実装（Green - テスト通過）
 * 3. リファクタリング（Refactor - コード改善）
 */

import { describe, it, expect, beforeEach } from 'vitest';

// 型定義（実装前なので仮定）
interface EvmUnsignedTx {
  from: string;
  to: string;
  value: string;      // hex wei
  gas: string;        // hex
  gasPrice: string;   // hex
  nonce: string;      // hex
  chainId: number;
  type: number;
}

interface BuildEvmTxParams {
  from: string;
  to: string;
  balance: bigint;    // wei
  gasPrice: bigint;   // wei
  nonce: number;
  chainId: number;
  gasLimit?: bigint;
}

// 実装ファイルからインポート（まだ存在しないのでエラーになる）
// これがRedフェーズの目的：テストが失敗することを確認
import { buildEvmUnsignedTx } from '../../../supabase/functions/_shared/evm-tx-builder';

describe('buildEvmUnsignedTx', () => {
  const mockParams: BuildEvmTxParams = {
    from: '0x1234567890123456789012345678901234567890',
    to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    balance: BigInt('1000000000000000000'),  // 1 ETH in wei
    gasPrice: BigInt('20000000000'),          // 20 gwei
    nonce: 0,
    chainId: 11155111,  // Sepolia
    gasLimit: BigInt(21000)
  };

  it('should build a valid EVM unsigned transaction', () => {
    const result = buildEvmUnsignedTx(mockParams);

    // 基本的な型チェック
    expect(result).toBeDefined();
    expect(result.from).toBeDefined();
    expect(result.to).toBeDefined();
    expect(result.value).toBeDefined();
    expect(result.gasPrice).toBeDefined();
    expect(result.nonce).toBeDefined();
    expect(result.chainId).toBeDefined();
  });

  it('should set correct from and to addresses', () => {
    const result = buildEvmUnsignedTx(mockParams);

    expect(result.from).toBe(mockParams.from);
    expect(result.to).toBe(mockParams.to);
  });

  it('should calculate value correctly (balance - gas cost)', () => {
    const result = buildEvmUnsignedTx(mockParams);

    // Gas cost = gasPrice * gasLimit
    const gasCost = mockParams.gasPrice * mockParams.gasLimit!;
    const expectedValue = mockParams.balance - gasCost;

    // hex値を検証
    expect(result.value).toBe('0x' + expectedValue.toString(16));
  });

  it('should convert gasPrice to hex', () => {
    const result = buildEvmUnsignedTx(mockParams);

    const expectedGasPrice = '0x' + mockParams.gasPrice.toString(16);
    expect(result.gasPrice).toBe(expectedGasPrice);
  });

  it('should convert nonce to hex', () => {
    const result = buildEvmUnsignedTx(mockParams);

    const expectedNonce = '0x' + mockParams.nonce.toString(16);
    expect(result.nonce).toBe(expectedNonce);
  });

  it('should convert gas limit to hex', () => {
    const result = buildEvmUnsignedTx(mockParams);

    const expectedGas = '0x' + mockParams.gasLimit!.toString(16);
    expect(result.gas).toBe(expectedGas);
  });

  it('should set correct chainId', () => {
    const result = buildEvmUnsignedTx(mockParams);

    expect(result.chainId).toBe(mockParams.chainId);
  });

  it('should use default gas limit of 21000 if not provided', () => {
    const paramsWithoutGasLimit = { ...mockParams };
    delete paramsWithoutGasLimit.gasLimit;

    const result = buildEvmUnsignedTx(paramsWithoutGasLimit);

    // デフォルトのgas limit 21000（0x5208）
    expect(result.gas).toBe('0x5208');
  });

  it('should set transaction type to 0 (legacy)', () => {
    const result = buildEvmUnsignedTx(mockParams);

    expect(result.type).toBe(0);
  });

  it('should throw error if balance is less than gas cost', () => {
    const insufficientBalanceParams = {
      ...mockParams,
      balance: BigInt('100'),  // 非常に小さい残高
      gasPrice: BigInt('20000000000'),
      gasLimit: BigInt(21000)
    };

    expect(() => {
      buildEvmUnsignedTx(insufficientBalanceParams);
    }).toThrow('Insufficient balance');
  });

  it('should handle nonce = 0 correctly', () => {
    const result = buildEvmUnsignedTx({ ...mockParams, nonce: 0 });

    expect(result.nonce).toBe('0x0');
  });

  it('should handle large nonce values correctly', () => {
    const result = buildEvmUnsignedTx({ ...mockParams, nonce: 255 });

    expect(result.nonce).toBe('0xff');
  });

  describe('Ethereum Mainnet', () => {
    it('should set chainId to 1 for Ethereum mainnet', () => {
      const mainnetParams = { ...mockParams, chainId: 1 };
      const result = buildEvmUnsignedTx(mainnetParams);

      expect(result.chainId).toBe(1);
    });
  });

  describe('Sepolia Testnet', () => {
    it('should set chainId to 11155111 for Sepolia', () => {
      const sepoliaParams = { ...mockParams, chainId: 11155111 };
      const result = buildEvmUnsignedTx(sepoliaParams);

      expect(result.chainId).toBe(11155111);
    });
  });
});
