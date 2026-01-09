/**
 * Ripple/XRP Chain Builder - ChainTxBuilderインターフェース実装
 *
 * TDD フロー:
 * 1. テスト作成（Red）✅
 * 2. 実装作成（Green）← 現在ここ
 * 3. リファクタリング（Refactor）
 *
 * Note: この実装はXRPL REST APIを使用した簡易版です。
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
 * Ripple/XRP Transaction型定義
 */
interface RippleTransaction {
  TransactionType: 'Payment';
  Account: string;
  Destination: string;
  Amount: string;  // drops (1 XRP = 1,000,000 drops)
  Fee: string;  // drops
  Sequence: number;
  DestinationTag?: number;
  LastLedgerSequence?: number;
}

/**
 * Ripple/XRP Account Info
 */
interface RippleAccountInfo {
  account_data: {
    Account: string;
    Balance: string;  // drops
    Sequence: number;
    OwnerCount: number;
  };
}

/**
 * Ripple/XRP Chain Builder実装
 */
export class RippleChainBuilder implements ChainTxBuilder {
  private readonly BASE_RESERVE = 10000000n;  // 10 XRP in drops
  private readonly OWNER_RESERVE = 2000000n;  // 2 XRP per owned object

  /**
   * Unsigned Transactionを構築
   */
  async buildUnsignedTx(params: BuildTxParams): Promise<UnsignedTx> {
    const { chain, fromAddress, toAddress, balance } = params;

    // アドレス検証
    if (!this.validateAddress(fromAddress)) {
      throw new InvalidAddressError('xrp', fromAddress);
    }
    if (!this.validateAddress(toAddress)) {
      throw new InvalidAddressError('xrp', toAddress);
    }

    try {
      // アカウント情報を取得
      const accountInfo = await this.getAccountInfo(fromAddress);

      // Sequence番号を取得
      const sequence = accountInfo.account_data.Sequence;

      // 手数料を推定（XRPL では通常 10-12 drops、最大20 drops）
      const fee = 12n;  // 12 drops

      // Reserve要件を計算
      // Base Reserve (10 XRP) + Owner Reserve (2 XRP × OwnerCount)
      const reserveRequired = this.BASE_RESERVE +
        BigInt(accountInfo.account_data.OwnerCount) * this.OWNER_RESERVE;

      // 残高チェック
      if (balance <= fee + reserveRequired) {
        throw new InsufficientBalanceError('xrp', fee + reserveRequired, balance);
      }

      // 送金額計算（全残高 - 手数料 - Reserve）
      const sendAmount = balance - fee - reserveRequired;

      // 最小送金額チェック（1 drop = 0.000001 XRP）
      if (sendAmount < 1n) {
        throw new InsufficientBalanceError('xrp', 1n, sendAmount);
      }

      // トランザクション構築
      const tx = this.buildTransaction(
        fromAddress,
        toAddress,
        sendAmount,
        fee,
        sequence,
        params.chainSpecific?.destinationTag as number | undefined,
      );

      return {
        chain,
        data: tx,
        estimatedFee: fee.toString(),
        metadata: {
          amount: balance.toString(),
          amountAfterFee: sendAmount.toString(),
          sequence,
          reserveRequired: reserveRequired.toString(),
        },
      };
    } catch (error) {
      if (
        error instanceof InsufficientBalanceError ||
        error instanceof InvalidAddressError ||
        error instanceof TxBuildError
      ) {
        throw error;
      }
      if (error instanceof Error) {
        throw new RpcError('xrp', this.getRpcUrl(), error);
      }
      throw error;
    }
  }

  /**
   * トランザクション手数料を推定
   */
  async estimateFee(params: BuildTxParams): Promise<bigint> {
    // XRPLの標準手数料は10-20 drops
    // 通常のトランザクションでは12 dropsを使用
    return 12n;
  }

  /**
   * アドレスの妥当性を検証
   */
  validateAddress(address: string): boolean {
    // Ripple アドレスは 'r' で始まる25-35文字のBase58エンコード文字列

    if (!address || address.length < 25 || address.length > 35) {
      return false;
    }

    // 'r' で始まることを確認
    if (!address.startsWith('r')) {
      return false;
    }

    // Base58文字セットチェック（0, O, I, lを除く英数字）
    const base58Regex = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
    return base58Regex.test(address);
  }

  /**
   * 署名済みトランザクションをブロードキャスト
   */
  async broadcastTx(params: BroadcastParams): Promise<BroadcastResult> {
    const { chain, network, signedTx } = params;

    const rpcUrl = this.getRpcUrl();

    try {
      // XRPL JSON-RPC APIのsubmitメソッドで署名済みトランザクションを送信
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'submit',
          params: [{
            tx_blob: signedTx,  // 署名済みトランザクションのhex文字列
          }],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // XRPL APIのエラーチェック
      if (data.result?.error) {
        throw new Error(`XRPL API error: ${data.result.error_message || data.result.error}`);
      }

      // 成功結果の検証
      if (!data.result?.tx_json?.hash) {
        throw new Error('Broadcast failed: no transaction hash in response');
      }

      return {
        transactionHash: data.result.tx_json.hash,
        chain,
        network,
        metadata: {
          engine_result: data.result.engine_result,
          engine_result_message: data.result.engine_result_message,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcError('xrp', rpcUrl, error);
      }
      throw error;
    }
  }

  /**
   * アカウント情報を取得
   */
  private async getAccountInfo(address: string): Promise<RippleAccountInfo> {
    const rpcUrl = this.getRpcUrl();

    // XRPL JSON-RPC API使用
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{
          account: address,
          ledger_index: 'current',
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.result?.error) {
      throw new Error(`XRPL API error: ${data.result.error_message || data.result.error}`);
    }

    if (!data.result?.account_data) {
      throw new TxBuildError('xrp', 'Account not found or not activated');
    }

    return data.result as RippleAccountInfo;
  }

  /**
   * トランザクションを構築
   */
  private buildTransaction(
    fromAddress: string,
    toAddress: string,
    amount: bigint,
    fee: bigint,
    sequence: number,
    destinationTag?: number,
  ): RippleTransaction {
    const tx: RippleTransaction = {
      TransactionType: 'Payment',
      Account: fromAddress,
      Destination: toAddress,
      Amount: amount.toString(),
      Fee: fee.toString(),
      Sequence: sequence,
    };

    // Destination Tagがあれば追加
    if (destinationTag !== undefined) {
      tx.DestinationTag = destinationTag;
    }

    return tx;
  }

  /**
   * RPC URLを取得
   */
  private getRpcUrl(): string {
    const rpcUrl = Deno.env.get('RIPPLE_MAINNET_RPC_URL');

    if (!rpcUrl) {
      throw new ConfigurationError('xrp', 'RIPPLE_MAINNET_RPC_URL');
    }

    return rpcUrl;
  }

  /**
   * WebSocket URLを取得（オプション）
   */
  private getWsUrl(): string | undefined {
    return Deno.env.get('RIPPLE_MAINNET_WS_URL');
  }
}
