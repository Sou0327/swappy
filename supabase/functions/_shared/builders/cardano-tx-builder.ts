/**
 * Cardano Chain Builder - ChainTxBuilderインターフェース実装
 *
 * TDD フロー:
 * 1. テスト作成（Red）✅
 * 2. 実装作成（Green）← 現在ここ
 * 3. リファクタリング（Refactor）
 *
 * Note: この実装はBlockfrost APIを使用した簡易版です。
 * 完全な実装にはCardano Serialization Libraryが必要です。
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
 * Cardano UTxO型定義
 */
interface CardanoUTxO {
  tx_hash: string;
  tx_index: number;
  output_index: number;
  amount: Array<{
    unit: string;  // 'lovelace' or asset ID
    quantity: string;
  }>;
  block: string;
  data_hash: string | null;
}

/**
 * Cardano Transaction型定義（簡易版）
 */
interface CardanoTransaction {
  cborHex: string;
  inputs: Array<{
    tx_hash: string;
    output_index: number;
  }>;
  outputs: Array<{
    address: string;
    amount: Array<{
      unit: string;
      quantity: string;
    }>;
  }>;
  fee: string;
  ttl?: number;
}

/**
 * Cardano Chain Builder実装
 */
export class CardanoChainBuilder implements ChainTxBuilder {
  private readonly MIN_UTXO_ADA = 1000000n;  // 最小UTXO: 1 ADA（lovelace）

  /**
   * Unsigned Transactionを構築
   */
  async buildUnsignedTx(params: BuildTxParams): Promise<UnsignedTx> {
    const { chain, fromAddress, toAddress, balance } = params;

    // アドレス検証
    if (!this.validateAddress(fromAddress)) {
      throw new InvalidAddressError('ada', fromAddress);
    }
    if (!this.validateAddress(toAddress)) {
      throw new InvalidAddressError('ada', toAddress);
    }

    try {
      // UTxOを取得
      const utxos = await this.getUtxos(fromAddress);

      if (utxos.length === 0) {
        throw new TxBuildError('ada', 'No UTxOs available');
      }

      // 手数料を推定（Cardanoの最小手数料は約0.17 ADA）
      const estimatedFee = 170000n;  // 0.17 ADA in lovelace

      // 残高チェック
      if (balance <= estimatedFee + this.MIN_UTXO_ADA) {
        throw new InsufficientBalanceError('ada', estimatedFee + this.MIN_UTXO_ADA, balance);
      }

      // 送金額計算
      const sendAmount = balance - estimatedFee;

      // Min UTXO要件チェック
      if (sendAmount < this.MIN_UTXO_ADA) {
        throw new InsufficientBalanceError('ada', this.MIN_UTXO_ADA, sendAmount);
      }

      // トランザクションを構築
      const tx = await this.buildTransaction(utxos, toAddress, sendAmount, fromAddress);

      return {
        chain,
        data: tx,
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
        error instanceof TxBuildError
      ) {
        throw error;
      }
      if (error instanceof Error) {
        throw new RpcError('ada', this.getApiUrl(), error);
      }
      throw error;
    }
  }

  /**
   * トランザクション手数料を推定
   */
  async estimateFee(params: BuildTxParams): Promise<bigint> {
    // Cardanoの基本手数料
    // 実際の計算: minFeeA * txSize + minFeeB
    // minFeeA = 44 lovelace/byte
    // minFeeB = 155381 lovelace

    // 標準的なトランザクションサイズを想定: 約300 bytes
    const txSize = 300;
    const minFeeA = 44;
    const minFeeB = 155381;

    const fee = minFeeA * txSize + minFeeB;

    return BigInt(fee);
  }

  /**
   * アドレスの妥当性を検証
   */
  validateAddress(address: string): boolean {
    // Cardano メインネットアドレスは "addr1" で始まる bech32
    // テストネットは "addr_test1" で始まる

    if (!address || address.length < 58) {
      return false;
    }

    // メインネット bech32アドレス
    if (address.startsWith('addr1')) {
      return /^addr1[a-z0-9]{98,}$/i.test(address);
    }

    // テストネット bech32アドレス（将来対応）
    if (address.startsWith('addr_test1')) {
      return /^addr_test1[a-z0-9]{98,}$/i.test(address);
    }

    return false;
  }

  /**
   * 署名済みトランザクションをブロードキャスト
   */
  async broadcastTx(params: BroadcastParams): Promise<BroadcastResult> {
    const { chain, network, signedTx } = params;

    const apiUrl = this.getApiUrl();
    const projectId = this.getProjectId();

    try {
      // Blockfrost APIでは署名済みCBORトランザクションをPOSTで送信
      const response = await fetch(`${apiUrl}/tx/submit`, {
        method: 'POST',
        headers: {
          'project_id': projectId,
          'Content-Type': 'application/cbor',
        },
        body: signedTx,  // CBOR形式の署名済みトランザクション
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
      }

      // レスポンスはトランザクションハッシュ（hex string）
      const transactionHash = await response.text();

      return {
        transactionHash: transactionHash.replace(/"/g, '').trim(),
        chain,
        network,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new RpcError('ada', apiUrl, error);
      }
      throw error;
    }
  }

  /**
   * Blockfrost APIからUTxOを取得
   */
  private async getUtxos(address: string): Promise<CardanoUTxO[]> {
    const apiUrl = this.getApiUrl();
    const projectId = this.getProjectId();

    const response = await fetch(`${apiUrl}/addresses/${address}/utxos`, {
      headers: {
        'project_id': projectId,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const utxos: CardanoUTxO[] = await response.json();

    // ADAのみを含むUTxOをフィルタ（Native Assetsは後で対応）
    return utxos.filter((utxo) => {
      return utxo.amount.length === 1 && utxo.amount[0].unit === 'lovelace';
    });
  }

  /**
   * トランザクションを構築
   *
   * Note: 完全な実装にはCardano Serialization Libraryが必要です。
   * ここでは、ウォレット（Nami等）が署名可能な基本的な構造のみを返します。
   */
  private async buildTransaction(
    utxos: CardanoUTxO[],
    toAddress: string,
    amount: bigint,
    changeAddress: string,
  ): Promise<CardanoTransaction> {
    // UTxOを選択（簡易版: 全てのUTxOを使用）
    const selectedUtxos = utxos;

    const totalInput = selectedUtxos.reduce((sum, utxo) => {
      const lovelace = utxo.amount.find((a) => a.unit === 'lovelace');
      return sum + BigInt(lovelace?.quantity || '0');
    }, 0n);

    // 手数料計算
    const fee = await this.estimateFee({
      chain: 'ada',
      network: 'mainnet',
      asset: 'ADA',
      fromAddress: changeAddress,
      toAddress,
      balance: amount,
    });

    // お釣り計算
    const change = totalInput - amount - fee;

    // トランザクション構築
    const tx: CardanoTransaction = {
      cborHex: '',  // 実装時にCBORエンコードされたトランザクションを設定
      inputs: selectedUtxos.map((utxo) => ({
        tx_hash: utxo.tx_hash,
        output_index: utxo.output_index,
      })),
      outputs: [
        {
          address: toAddress,
          amount: [{ unit: 'lovelace', quantity: amount.toString() }],
        },
      ],
      fee: fee.toString(),
    };

    // お釣りがMin UTXO以上ならお釣り用outputを追加
    if (change >= this.MIN_UTXO_ADA) {
      tx.outputs.push({
        address: changeAddress,
        amount: [{ unit: 'lovelace', quantity: change.toString() }],
      });
    }

    return tx;
  }

  /**
   * Blockfrost API URLを取得
   */
  private getApiUrl(): string {
    const apiUrl = Deno.env.get('CARDANO_BLOCKFROST_URL');

    if (!apiUrl) {
      throw new ConfigurationError('ada', 'CARDANO_BLOCKFROST_URL');
    }

    return apiUrl;
  }

  /**
   * Blockfrost Project IDを取得
   */
  private getProjectId(): string {
    const projectId = Deno.env.get('CARDANO_BLOCKFROST_PROJECT_ID');

    if (!projectId) {
      throw new ConfigurationError('ada', 'CARDANO_BLOCKFROST_PROJECT_ID');
    }

    return projectId;
  }
}
