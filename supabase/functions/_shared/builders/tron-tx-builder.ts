/**
 * Tron Chain Builder - ChainTxBuilderインターフェース実装
 *
 * TDD フロー:
 * 1. テスト作成（Red）✅
 * 2. 実装作成（Green）← 現在ここ
 * 3. リファクタリング（Refactor）
 */

import type {
  ChainTxBuilder,
  BuildTxParams,
  UnsignedTx,
  BroadcastParams,
  BroadcastResult,
} from '../chain-abstraction/types.ts';
import {
  InsufficientBalanceError,
  InvalidAddressError,
  RpcError,
  ConfigurationError,
  TxBuildError,
} from '../chain-abstraction/errors.ts';

/**
 * Tronトランザクションインターフェース
 */
interface TronTransaction {
  txID: string;
  visible: boolean;
  raw_data: {
    contract: Array<{
      parameter: {
        value: {
          amount: number;
          owner_address: string;
          to_address: string;
        };
        type_url: string;
      };
      type: string;
    }>;
    ref_block_bytes: string;
    ref_block_hash: string;
    expiration: number;
    fee_limit?: number;
    timestamp: number;
  };
  raw_data_hex: string;
}

/**
 * Tron Chain Builder実装
 */
export class TronChainBuilder implements ChainTxBuilder {
  /**
   * Unsigned Transactionを構築
   */
  async buildUnsignedTx(params: BuildTxParams): Promise<UnsignedTx> {
    const { chain, network, asset, fromAddress, toAddress, balance } = params;

    // アドレス検証
    if (!this.validateAddress(fromAddress)) {
      throw new InvalidAddressError('trc', fromAddress);
    }
    if (!this.validateAddress(toAddress)) {
      throw new InvalidAddressError('trc', toAddress);
    }

    // TRX送金の場合
    if (asset === 'TRX') {
      return await this.buildTrxTransfer(fromAddress, toAddress, balance);
    }

    // TRC20トークン送金の場合（将来実装）
    if (params.chainSpecific?.contractAddress) {
      throw new TxBuildError('trc', 'TRC20 token transfers are not yet implemented');
    }

    throw new TxBuildError('trc', `Unsupported asset: ${asset}`);
  }

  /**
   * TRX送金トランザクション構築
   */
  private async buildTrxTransfer(
    fromAddress: string,
    toAddress: string,
    balance: bigint,
  ): Promise<UnsignedTx> {
    const rpcUrl = this.getRpcUrl();

    try {
      // 手数料推定（TRXでは通常帯域幅ポイントで支払い、不足分をTRXで支払う）
      // 標準送金では約0.1 TRX（100,000 SUN）の帯域幅消費
      const bandwidthFee = 100000n;  // 0.1 TRX in SUN

      // 残高チェック
      if (balance <= bandwidthFee) {
        throw new InsufficientBalanceError('trc', bandwidthFee, balance);
      }

      // 送金額計算（全残高 - 手数料）
      const amount = balance - bandwidthFee;

      // TronGrid APIでトランザクション作成
      const unsignedTx = await this.createTransaction(fromAddress, toAddress, amount);

      return {
        chain: 'trc',
        data: unsignedTx,
        estimatedFee: bandwidthFee.toString(),
        metadata: {
          amount: balance.toString(),
          amountAfterFee: amount.toString(),
          network: 'mainnet',
        },
      };
    } catch (error) {
      if (error instanceof InsufficientBalanceError || error instanceof InvalidAddressError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new RpcError('trc', rpcUrl, error);
      }
      throw error;
    }
  }

  /**
   * トランザクション手数料を推定
   */
  async estimateFee(params: BuildTxParams): Promise<bigint> {
    // Tronでは標準送金の場合、帯域幅ポイントで約0.1 TRXの消費
    // スマートコントラクト呼び出しの場合はenergyも必要
    const { asset } = params;

    if (asset === 'TRX') {
      // 標準TRX送金: 約0.1 TRX（100,000 SUN）
      return 100000n;
    }

    if (params.chainSpecific?.contractAddress) {
      // TRC20トークン送金: 約1-5 TRX（スマートコントラクト実行）
      // 正確な推定には実際のenergyコストを計算する必要がある
      return 5000000n;  // 保守的な見積もり: 5 TRX
    }

    return 100000n;
  }

  /**
   * アドレスの妥当性を検証
   */
  validateAddress(address: string): boolean {
    // Tronアドレスは通常34文字のBase58エンコード文字列
    // メインネットは 'T' で始まる
    // テストネットは '27' で始まる（非推奨）

    if (!address || address.length !== 34) {
      return false;
    }

    // メインネットアドレスの基本検証（Tで始まる）
    if (!address.startsWith('T')) {
      return false;
    }

    // Base58文字セットチェック（0, O, I, lを除く英数字）
    // Tで始まり、その後33文字のBase58文字
    const base58Regex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    return base58Regex.test(address);
  }

  /**
   * 署名済みトランザクションをブロードキャスト
   */
  async broadcastTx(params: BroadcastParams): Promise<BroadcastResult> {
    const { chain, network, signedTx } = params;

    const rpcUrl = this.getRpcUrl();
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['TRON-PRO-API-KEY'] = apiKey;
    }

    try {
      const response = await fetch(`${rpcUrl}/wallet/broadcasttransaction`, {
        method: 'POST',
        headers,
        body: signedTx,  // Tronの署名済みトランザクションはJSON文字列
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // TronGrid APIのレスポンスチェック
      if (data.Error) {
        throw new Error(`Failed to broadcast transaction: ${data.Error}`);
      }

      if (!data.result || !data.txid) {
        throw new Error('Broadcast failed: invalid response from TronGrid');
      }

      return {
        transactionHash: data.txid,
        chain,
        network,
        metadata: {
          result: data.result,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcError('trc', rpcUrl, error);
      }
      throw error;
    }
  }

  /**
   * TronGrid APIでトランザクション作成
   */
  private async createTransaction(
    fromAddress: string,
    toAddress: string,
    amount: bigint,
  ): Promise<TronTransaction> {
    const rpcUrl = this.getRpcUrl();
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // APIキーが設定されている場合は追加
    if (apiKey) {
      headers['TRON-PRO-API-KEY'] = apiKey;
    }

    const response = await fetch(`${rpcUrl}/wallet/createtransaction`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        owner_address: fromAddress,
        to_address: toAddress,
        amount: Number(amount),  // SUN単位
        visible: true,  // Base58アドレス形式を使用
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // エラーチェック
    if (data.Error) {
      throw new Error(`TronGrid API error: ${data.Error}`);
    }

    return data as TronTransaction;
  }

  /**
   * RPC URLを取得
   */
  private getRpcUrl(): string {
    const rpcUrl = Deno.env.get('TRON_MAINNET_RPC_URL');

    if (!rpcUrl) {
      throw new ConfigurationError('trc', 'TRON_MAINNET_RPC_URL');
    }

    return rpcUrl;
  }

  /**
   * API Keyを取得（オプション）
   */
  private getApiKey(): string | undefined {
    return Deno.env.get('TRON_API_KEY');
  }
}
