/**
 * EVM Chain Builder - ChainTxBuilderインターフェース実装
 *
 * 既存のevm-tx-builder.tsをChainTxBuilderインターフェースに適合させるラッパー
 */

import type {
  ChainTxBuilder,
  BuildTxParams,
  UnsignedTx,
  BroadcastParams,
  BroadcastResult,
} from '../chain-abstraction/types.ts';
import {
  buildEvmUnsignedTx,
  type EvmUnsignedTx,
} from '../evm-tx-builder.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
  RpcError,
  ConfigurationError,
} from '../chain-abstraction/errors.ts';

/**
 * EVMチェーンID マッピング
 */
const EVM_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  sepolia: 11155111,
  polygon: 137,
  arbitrum: 42161,
};

/**
 * EVM Chain Builder実装
 */
export class EvmChainBuilder implements ChainTxBuilder {
  /**
   * Unsigned Transactionを構築
   */
  async buildUnsignedTx(params: BuildTxParams): Promise<UnsignedTx> {
    const { chain, network, fromAddress, toAddress, balance } = params;

    // Chain IDの取得
    const chainId = EVM_CHAIN_IDS[network];
    if (!chainId) {
      throw new ConfigurationError('evm', `Unknown network: ${network}`);
    }

    // RPC URLの取得
    const rpcUrl = this.getRpcUrl(network);

    try {
      // Nonce取得
      const nonce = await this.getNonce(rpcUrl, fromAddress);

      // Gas Price取得
      const gasPrice = await this.getGasPrice(rpcUrl);

      // Unsigned Transaction構築
      const unsignedTxData = buildEvmUnsignedTx({
        from: fromAddress,
        to: toAddress,
        balance,
        gasPrice,
        nonce,
        chainId,
      });

      // 手数料計算
      const gasLimit = BigInt(unsignedTxData.gas);
      const estimatedFee = gasPrice * gasLimit;
      const value = balance - estimatedFee;

      return {
        chain,
        data: unsignedTxData,
        estimatedFee: estimatedFee.toString(),
        metadata: {
          amount: balance.toString(),
          amountAfterFee: value.toString(),
          chainId,
          network,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Insufficient balance')) {
          // buildEvmUnsignedTxから投げられたエラーを変換
          throw new InsufficientBalanceError('evm', 0n, balance);
        }
        throw new RpcError('evm', rpcUrl, error);
      }
      throw error;
    }
  }

  /**
   * トランザクション手数料を推定
   */
  async estimateFee(params: BuildTxParams): Promise<bigint> {
    const { network } = params;

    const rpcUrl = this.getRpcUrl(network);

    try {
      const gasPrice = await this.getGasPrice(rpcUrl);
      const gasLimit = BigInt(21000); // 標準送金のgas limit

      return gasPrice * gasLimit;
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcError('evm', rpcUrl, error);
      }
      throw error;
    }
  }

  /**
   * アドレスの妥当性を検証
   */
  validateAddress(address: string): boolean {
    // EVMアドレスは "0x" で始まる42文字の16進数文字列
    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    return evmAddressRegex.test(address);
  }

  /**
   * 署名済みトランザクションをブロードキャスト
   */
  async broadcastTx(params: BroadcastParams): Promise<BroadcastResult> {
    const { chain, network, signedTx } = params;

    const rpcUrl = this.getRpcUrl(network);

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendRawTransaction',
          params: [signedTx],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`Failed to broadcast transaction: ${data.error.message}`);
      }

      return {
        transactionHash: data.result,
        chain,
        network,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcError('evm', rpcUrl, error);
      }
      throw error;
    }
  }

  /**
   * RPC URLを取得
   */
  private getRpcUrl(network: string): string {
    const envKey = `ETHEREUM_${network.toUpperCase()}_RPC_URL`;
    const rpcUrl = Deno.env.get(envKey);

    if (!rpcUrl) {
      throw new ConfigurationError('evm', envKey);
    }

    return rpcUrl;
  }

  /**
   * Nonceを取得
   */
  private async getNonce(rpcUrl: string, address: string): Promise<number> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionCount',
        params: [address, 'latest'],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return parseInt(data.result, 16);
  }

  /**
   * Gas Priceを取得
   */
  private async getGasPrice(rpcUrl: string): Promise<bigint> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_gasPrice',
        params: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    return BigInt(data.result);
  }
}
