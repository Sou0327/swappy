/**
 * Bitcoin Chain Builder - ChainTxBuilderインターフェース実装
 *
 * TDD フロー:
 * 1. テスト作成（Red）✅
 * 2. 実装作成（Green）← 現在ここ
 * 3. リファクタリング（Refactor）
 *
 * Note: この実装はBlockstream APIを使用した簡易版です。
 * 本番環境では、Bitcoin Core RPCまたはより堅牢なライブラリの使用を推奨します。
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
  UtxoSelectionError,
} from '../chain-abstraction/errors.ts';

/**
 * UTXO型定義
 */
interface UTXO {
  txid: string;
  vout: number;
  value: number;  // satoshi
  status?: {
    confirmed: boolean;
    block_height?: number;
  };
}

/**
 * Bitcoin PSBT（部分署名トランザクション）型定義
 */
interface BitcoinPsbt {
  psbtBase64: string;
  inputs: Array<{
    txid: string;
    vout: number;
    value: number;
  }>;
  outputs: Array<{
    address: string;
    value: number;
  }>;
  fee: number;
}

/**
 * Bitcoin Chain Builder実装
 */
export class BitcoinChainBuilder implements ChainTxBuilder {
  /**
   * Unsigned Transactionを構築（PSBT形式）
   */
  async buildUnsignedTx(params: BuildTxParams): Promise<UnsignedTx> {
    const { chain, fromAddress, toAddress, balance } = params;

    // アドレス検証
    if (!this.validateAddress(fromAddress)) {
      throw new InvalidAddressError('btc', fromAddress);
    }
    if (!this.validateAddress(toAddress)) {
      throw new InvalidAddressError('btc', toAddress);
    }

    try {
      // UTXOを取得
      const utxos = await this.getUtxos(fromAddress);

      if (utxos.length === 0) {
        throw new UtxoSelectionError('btc', 'No UTXOs available');
      }

      // 手数料を推定（簡易版: 固定レート）
      const feeRate = await this.getFeeRate();
      const estimatedFee = this.estimateTransactionFee(utxos.length, 2, feeRate);

      // 残高チェック
      if (balance <= estimatedFee) {
        throw new InsufficientBalanceError('btc', estimatedFee, balance);
      }

      // 送金額計算
      const sendAmount = balance - estimatedFee;

      // Dust limitチェック（546 satoshi）
      if (sendAmount < 546n) {
        throw new InsufficientBalanceError('btc', 546n, sendAmount);
      }

      // PSBTを構築
      const psbt = await this.buildPsbt(utxos, toAddress, sendAmount, fromAddress);

      return {
        chain,
        data: psbt,
        estimatedFee: estimatedFee.toString(),
        metadata: {
          amount: balance.toString(),
          amountAfterFee: sendAmount.toString(),
          utxosUsed: utxos.length,
        },
      };
    } catch (error) {
      if (
        error instanceof InsufficientBalanceError ||
        error instanceof InvalidAddressError ||
        error instanceof UtxoSelectionError
      ) {
        throw error;
      }
      if (error instanceof Error) {
        throw new RpcError('btc', this.getApiUrl(), error);
      }
      throw error;
    }
  }

  /**
   * トランザクション手数料を推定
   */
  async estimateFee(params: BuildTxParams): Promise<bigint> {
    try {
      const feeRate = await this.getFeeRate();

      // 標準的なトランザクションサイズを想定
      // 1 input + 2 outputs ≈ 250 vBytes
      const estimatedVBytes = 250;
      const fee = feeRate * estimatedVBytes;

      return BigInt(fee);
    } catch (error) {
      // フォールバック: 固定手数料（約10 sat/vByte × 250 vBytes = 2,500 satoshi）
      return 2500n;
    }
  }

  /**
   * アドレスの妥当性を検証
   */
  validateAddress(address: string): boolean {
    // Bitcoin アドレスの基本検証
    // - bech32 (bc1...): SegWit v0/v1
    // - P2PKH (1...): Legacy
    // - P2SH (3...): Legacy Script

    if (!address || address.length < 26 || address.length > 90) {
      return false;
    }

    // bech32 (SegWit)
    if (address.startsWith('bc1')) {
      return /^bc1[a-z0-9]{39,87}$/i.test(address);
    }

    // P2PKH (legacy)
    if (address.startsWith('1')) {
      return /^1[a-zA-HJ-NP-Z0-9]{25,34}$/.test(address);
    }

    // P2SH (legacy)
    if (address.startsWith('3')) {
      return /^3[a-zA-HJ-NP-Z0-9]{25,34}$/.test(address);
    }

    return false;
  }

  /**
   * 署名済みトランザクションをブロードキャスト
   */
  async broadcastTx(params: BroadcastParams): Promise<BroadcastResult> {
    const { chain, network, signedTx } = params;

    const apiUrl = this.getApiUrl();

    try {
      // Blockstream APIでは署名済みトランザクション（hex string）をPOSTで送信
      const response = await fetch(`${apiUrl}/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: signedTx,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // レスポンスはトランザクションハッシュ（hex string）
      const transactionHash = await response.text();

      return {
        transactionHash: transactionHash.trim(),
        chain,
        network,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcError('btc', apiUrl, error);
      }
      throw error;
    }
  }

  /**
   * Blockstream APIからUTXOを取得
   */
  private async getUtxos(address: string): Promise<UTXO[]> {
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/address/${address}/utxo`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const utxos: UTXO[] = await response.json();

    // 確認済みUTXOのみを使用
    return utxos.filter((utxo) => utxo.status?.confirmed);
  }

  /**
   * 手数料レートを取得（sat/vByte）
   */
  private async getFeeRate(): Promise<number> {
    const apiUrl = this.getApiUrl();

    try {
      const response = await fetch(`${apiUrl}/fee-estimates`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const feeEstimates = await response.json();

      // 次のブロック（最速）の手数料を使用
      // fallback: 10 sat/vByte
      return feeEstimates['1'] || 10;
    } catch {
      // API呼び出し失敗時はデフォルト値
      return 10;
    }
  }

  /**
   * トランザクション手数料を推定（vByteベース）
   */
  private estimateTransactionFee(
    inputCount: number,
    outputCount: number,
    feeRate: number,
  ): bigint {
    // 簡易計算:
    // - 各input: ~148 vBytes (P2WPKH)
    // - 各output: ~34 vBytes
    // - トランザクションオーバーヘッド: ~10 vBytes

    const vBytes = inputCount * 148 + outputCount * 34 + 10;
    const fee = vBytes * feeRate;

    return BigInt(Math.ceil(fee));
  }

  /**
   * PSBT（部分署名トランザクション）を構築
   *
   * Note: 完全な実装にはbitcoinjs-libなどのライブラリが必要です。
   * ここでは、ウォレット（Leather等）が署名可能な基本的な構造のみを返します。
   */
  private async buildPsbt(
    utxos: UTXO[],
    toAddress: string,
    amount: bigint,
    changeAddress: string,
  ): Promise<BitcoinPsbt> {
    // UTXOを選択（簡易版: 全てのUTXOを使用）
    const selectedUtxos = utxos;

    const totalInput = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const sendAmount = Number(amount);

    // お釣りの計算
    const change = totalInput - sendAmount;

    // Outputs構築
    const outputs: Array<{ address: string; value: number }> = [
      { address: toAddress, value: sendAmount },
    ];

    // お釣りがDust limit以上ならお釣り用outputを追加
    if (change >= 546) {
      outputs.push({ address: changeAddress, value: change });
    }

    // PSBT構築（簡易版）
    // 実際のPSBT形式への変換はウォレット側で行う
    const psbt: BitcoinPsbt = {
      psbtBase64: '',  // 実装時にBase64エンコードされたPSBTを設定
      inputs: selectedUtxos.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
      })),
      outputs,
      fee: totalInput - outputs.reduce((sum, o) => sum + o.value, 0),
    };

    return psbt;
  }

  /**
   * API URLを取得
   */
  private getApiUrl(): string {
    const apiUrl = Deno.env.get('BITCOIN_MAINNET_API_URL');

    if (!apiUrl) {
      throw new ConfigurationError('btc', 'BITCOIN_MAINNET_API_URL');
    }

    return apiUrl;
  }
}
