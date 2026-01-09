import { analyzeBTCAddress, validateBTCAddress } from './btc-address-validator';
import { AuditLogger, AuditAction } from './security/audit-logger';
import { FinancialEncryption } from './security/encryption';

/**
 * UTXO（未使用トランザクション出力）の詳細情報
 */
export interface UTXO {
  txid: string;
  vout: number;
  amount: number; // satoshi単位
  scriptPubKey: string;
  address: string;
  confirmations: number;
  spent: boolean;
  spentTxid?: string;
  blockHeight?: number;
  timestamp?: number;
}

/**
 * トランザクション入力
 */
export interface TransactionInput {
  txid: string;
  vout: number;
  amount: number;
  scriptPubKey: string;
  address: string;
  sequence?: number;
  witnessScript?: string;
}

/**
 * トランザクション出力
 */
export interface TransactionOutput {
  address: string;
  amount: number; // satoshi単位
  scriptPubKey?: string;
}

/**
 * 構築されたトランザクション
 */
export interface ConstructedTransaction {
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  fee: number;
  estimatedSize: number;
  feeRate: number; // sat/vB
  rawTransaction?: string;
  txid?: string;
  totalInput: number;
  totalOutput: number;
  changeAmount?: number;
  changeAddress?: string;
}

/**
 * UTXOの選択戦略
 */
export enum UTXOSelectionStrategy {
  LARGEST_FIRST = 'largest_first',
  SMALLEST_FIRST = 'smallest_first',
  OPTIMAL = 'optimal',
  BRANCH_AND_BOUND = 'branch_and_bound'
}

/**
 * 手数料推定レベル
 */
export enum FeeEstimationLevel {
  LOW = 'low',        // 遅い確認（1時間+）
  MEDIUM = 'medium',  // 標準確認（30分）
  HIGH = 'high',      // 高速確認（10分）
  URGENT = 'urgent'   // 緊急確認（次ブロック）
}

/**
 * 包括的UTXO管理システム
 */
export class UTXOManager {
  private utxoSet: Map<string, UTXO> = new Map();
  private lockedUTXOs: Set<string> = new Set();
  private network: 'mainnet' | 'testnet';

  constructor(network: 'mainnet' | 'testnet' = 'mainnet') {
    this.network = network;
  }

  /**
   * UTXOキー生成（txid:vout形式）
   */
  private getUTXOKey(txid: string, vout: number): string {
    return `${txid}:${vout}`;
  }

  /**
   * UTXOを追加
   */
  async addUTXO(utxo: UTXO, userId?: string): Promise<void> {
    const key = this.getUTXOKey(utxo.txid, utxo.vout);
    
    // アドレス妥当性チェック
    const addressInfo = analyzeBTCAddress(utxo.address, this.network);
    if (!addressInfo.isValid) {
      throw new Error(`無効なアドレス: ${utxo.address}`);
    }

    // 重複チェック
    if (this.utxoSet.has(key)) {
      throw new Error(`UTXO ${key} は既に存在します`);
    }

    // 金額妥当性チェック
    if (utxo.amount <= 0) {
      throw new Error('UTXO金額は正の値である必要があります');
    }

    this.utxoSet.set(key, { ...utxo });

    // 監査ログ記録
    if (userId) {
      await AuditLogger.log(
        AuditAction.UTXO_ADD,
        'utxo_manager',
        {
          utxoKey: key,
          amount: utxo.amount,
          address: utxo.address,
          confirmations: utxo.confirmations
        },
        { userId, riskLevel: 'low' }
      );
    }
  }

  /**
   * UTXOを使用済みとしてマーク
   */
  async spendUTXO(txid: string, vout: number, spentTxid: string, userId?: string): Promise<void> {
    const key = this.getUTXOKey(txid, vout);
    const utxo = this.utxoSet.get(key);

    if (!utxo) {
      throw new Error(`UTXO ${key} が見つかりません`);
    }

    if (utxo.spent) {
      throw new Error(`UTXO ${key} は既に使用済みです`);
    }

    utxo.spent = true;
    utxo.spentTxid = spentTxid;

    // 監査ログ記録
    if (userId) {
      await AuditLogger.log(
        AuditAction.UTXO_SPEND,
        'utxo_manager',
        {
          utxoKey: key,
          spentTxid,
          amount: utxo.amount
        },
        { userId, riskLevel: 'medium' }
      );
    }
  }

  /**
   * 利用可能なUTXOリストを取得
   */
  getAvailableUTXOs(minConfirmations: number = 1): UTXO[] {
    return Array.from(this.utxoSet.values())
      .filter(utxo => 
        !utxo.spent && 
        utxo.confirmations >= minConfirmations &&
        !this.lockedUTXOs.has(this.getUTXOKey(utxo.txid, utxo.vout))
      );
  }

  /**
   * 特定アドレスのUTXOを取得
   */
  getUTXOsByAddress(address: string, minConfirmations: number = 1): UTXO[] {
    return this.getAvailableUTXOs(minConfirmations)
      .filter(utxo => utxo.address === address);
  }

  /**
   * 総残高計算
   */
  getTotalBalance(minConfirmations: number = 1): number {
    return this.getAvailableUTXOs(minConfirmations)
      .reduce((total, utxo) => total + utxo.amount, 0);
  }

  /**
   * アドレス別残高計算
   */
  getBalanceByAddress(address: string, minConfirmations: number = 1): number {
    return this.getUTXOsByAddress(address, minConfirmations)
      .reduce((total, utxo) => total + utxo.amount, 0);
  }

  /**
   * 手数料レート推定
   */
  estimateFeeRate(level: FeeEstimationLevel): number {
    // 実際の実装では外部APIやノードから動的に取得
    const feeRates = {
      [FeeEstimationLevel.LOW]: 1,
      [FeeEstimationLevel.MEDIUM]: 10,
      [FeeEstimationLevel.HIGH]: 20,
      [FeeEstimationLevel.URGENT]: 50
    };

    return feeRates[level];
  }

  /**
   * UTXO選択アルゴリズム（Branch and Bound）
   */
  private selectUTXOsBranchAndBound(
    availableUTXOs: UTXO[],
    targetAmount: number,
    feeRate: number
  ): UTXO[] | null {
    // 簡易版Branch and Bound実装
    const sortedUTXOs = [...availableUTXOs].sort((a, b) => b.amount - a.amount);
    
    function findCombination(
      utxos: UTXO[],
      target: number,
      current: UTXO[] = [],
      index: number = 0
    ): UTXO[] | null {
      const currentSum = current.reduce((sum, utxo) => sum + utxo.amount, 0);
      
      // 目標額に到達
      if (currentSum >= target) {
        return current;
      }
      
      // インデックス範囲外
      if (index >= utxos.length) {
        return null;
      }
      
      // 現在のUTXOを含める場合
      const withCurrent = findCombination(
        utxos,
        target,
        [...current, utxos[index]],
        index + 1
      );
      
      if (withCurrent) return withCurrent;
      
      // 現在のUTXOを含めない場合
      return findCombination(utxos, target, current, index + 1);
    }
    
    return findCombination(sortedUTXOs, targetAmount);
  }

  /**
   * 最適なUTXO選択
   */
  selectUTXOs(
    targetAmount: number,
    strategy: UTXOSelectionStrategy = UTXOSelectionStrategy.OPTIMAL,
    feeRate: number = 10,
    minConfirmations: number = 1
  ): UTXO[] {
    const availableUTXOs = this.getAvailableUTXOs(minConfirmations);
    
    if (availableUTXOs.length === 0) {
      throw new Error('利用可能なUTXOがありません');
    }

    let selectedUTXOs: UTXO[] = [];

    switch (strategy) {
      case UTXOSelectionStrategy.LARGEST_FIRST:
        selectedUTXOs = this.selectLargestFirst(availableUTXOs, targetAmount);
        break;
        
      case UTXOSelectionStrategy.SMALLEST_FIRST:
        selectedUTXOs = this.selectSmallestFirst(availableUTXOs, targetAmount);
        break;
        
      case UTXOSelectionStrategy.BRANCH_AND_BOUND:
        selectedUTXOs = this.selectUTXOsBranchAndBound(availableUTXOs, targetAmount, feeRate) || [];
        break;
        
      case UTXOSelectionStrategy.OPTIMAL:
      default:
        // まずBranch and Boundを試し、失敗したらLargest Firstにフォールバック
        selectedUTXOs = this.selectUTXOsBranchAndBound(availableUTXOs, targetAmount, feeRate) 
          || this.selectLargestFirst(availableUTXOs, targetAmount);
        break;
    }

    if (selectedUTXOs.length === 0) {
      throw new Error('十分なUTXOを選択できませんでした');
    }

    const totalSelected = selectedUTXOs.reduce((sum, utxo) => sum + utxo.amount, 0);
    if (totalSelected < targetAmount) {
      throw new Error('選択されたUTXOの合計額が不足しています');
    }

    return selectedUTXOs;
  }

  /**
   * 最大額優先選択
   */
  private selectLargestFirst(utxos: UTXO[], targetAmount: number): UTXO[] {
    const sorted = [...utxos].sort((a, b) => b.amount - a.amount);
    const selected: UTXO[] = [];
    let total = 0;

    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.amount;
      if (total >= targetAmount) break;
    }

    return selected;
  }

  /**
   * 最小額優先選択
   */
  private selectSmallestFirst(utxos: UTXO[], targetAmount: number): UTXO[] {
    const sorted = [...utxos].sort((a, b) => a.amount - b.amount);
    const selected: UTXO[] = [];
    let total = 0;

    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.amount;
      if (total >= targetAmount) break;
    }

    return selected;
  }

  /**
   * トランザクション構築
   */
  async constructTransaction(
    outputs: TransactionOutput[],
    changeAddress?: string,
    feeLevel: FeeEstimationLevel = FeeEstimationLevel.MEDIUM,
    strategy: UTXOSelectionStrategy = UTXOSelectionStrategy.OPTIMAL,
    userId?: string
  ): Promise<ConstructedTransaction> {
    // 出力金額の合計計算
    const totalOutputAmount = outputs.reduce((sum, output) => sum + output.amount, 0);
    
    if (totalOutputAmount <= 0) {
      throw new Error('出力金額は正の値である必要があります');
    }

    // 手数料レート取得
    const feeRate = this.estimateFeeRate(feeLevel);

    // 初期手数料推定（入力数が確定していないため概算）
    const estimatedInputCount = Math.ceil(totalOutputAmount / 100000); // 平均的なUTXO額を仮定
    const estimatedSize = this.estimateTransactionSize(estimatedInputCount, outputs.length + 1); // +1 for change
    const estimatedFee = estimatedSize * feeRate;

    // 必要な総額計算
    const requiredAmount = totalOutputAmount + estimatedFee;

    // UTXO選択
    const selectedUTXOs = this.selectUTXOs(requiredAmount, strategy, feeRate);
    const totalInput = selectedUTXOs.reduce((sum, utxo) => sum + utxo.amount, 0);

    // 正確な手数料計算
    const actualSize = this.estimateTransactionSize(selectedUTXOs.length, outputs.length + 1);
    const actualFee = actualSize * feeRate;

    // お釣り計算
    const changeAmount = totalInput - totalOutputAmount - actualFee;
    const minChangeAmount = 546; // Dust limit

    // トランザクション入力構築
    const inputs: TransactionInput[] = selectedUTXOs.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      amount: utxo.amount,
      scriptPubKey: utxo.scriptPubKey,
      address: utxo.address,
      sequence: 0xffffffff
    }));

    // トランザクション出力構築
    const transactionOutputs = [...outputs];

    // お釣り出力追加（Dust limitを超える場合のみ）
    if (changeAmount >= minChangeAmount && changeAddress) {
      transactionOutputs.push({
        address: changeAddress,
        amount: changeAmount
      });
    }

    const constructedTx: ConstructedTransaction = {
      inputs,
      outputs: transactionOutputs,
      fee: actualFee,
      estimatedSize: actualSize,
      feeRate,
      totalInput,
      totalOutput: totalOutputAmount,
      changeAmount: changeAmount >= minChangeAmount ? changeAmount : 0,
      changeAddress: changeAmount >= minChangeAmount ? changeAddress : undefined
    };

    // 監査ログ記録
    if (userId) {
      await AuditLogger.log(
        AuditAction.TRANSACTION_CREATE,
        'utxo_manager',
        {
          inputCount: inputs.length,
          outputCount: transactionOutputs.length,
          totalInput,
          totalOutput: totalOutputAmount,
          fee: actualFee,
          feeRate
        },
        { userId, riskLevel: 'medium' }
      );
    }

    return constructedTx;
  }

  /**
   * トランザクションサイズ推定
   */
  private estimateTransactionSize(inputCount: number, outputCount: number): number {
    // 基本トランザクションサイズ
    const baseTxSize = 10; // version(4) + input_count(1) + output_count(1) + locktime(4)
    
    // P2WPKH入力サイズ（Witnessデータ含む）
    const inputSize = inputCount * 68; // 平均的なP2WPKH入力サイズ
    
    // 標準出力サイズ
    const outputSize = outputCount * 34; // P2PKH/P2SH出力サイズ
    
    return baseTxSize + inputSize + outputSize;
  }

  /**
   * UTXOロック（トランザクション構築時の競合防止）
   */
  lockUTXOs(utxos: UTXO[]): void {
    for (const utxo of utxos) {
      const key = this.getUTXOKey(utxo.txid, utxo.vout);
      this.lockedUTXOs.add(key);
    }
  }

  /**
   * UTXOロック解除
   */
  unlockUTXOs(utxos: UTXO[]): void {
    for (const utxo of utxos) {
      const key = this.getUTXOKey(utxo.txid, utxo.vout);
      this.lockedUTXOs.delete(key);
    }
  }

  /**
   * UTXO統計情報取得
   */
  getUTXOStatistics(): {
    total: number;
    available: number;
    spent: number;
    locked: number;
    totalValue: number;
    averageValue: number;
    largestUTXO: number;
    smallestUTXO: number;
  } {
    const allUTXOs = Array.from(this.utxoSet.values());
    const availableUTXOs = this.getAvailableUTXOs(0);
    const spentUTXOs = allUTXOs.filter(utxo => utxo.spent);
    
    const totalValue = availableUTXOs.reduce((sum, utxo) => sum + utxo.amount, 0);
    const amounts = availableUTXOs.map(utxo => utxo.amount);

    return {
      total: allUTXOs.length,
      available: availableUTXOs.length,
      spent: spentUTXOs.length,
      locked: this.lockedUTXOs.size,
      totalValue,
      averageValue: availableUTXOs.length > 0 ? totalValue / availableUTXOs.length : 0,
      largestUTXO: amounts.length > 0 ? Math.max(...amounts) : 0,
      smallestUTXO: amounts.length > 0 ? Math.min(...amounts) : 0
    };
  }

  /**
   * UTXO最適化（小額UTXOの統合）
   */
  async optimizeUTXOs(
    targetOutputCount: number = 10,
    feeLevel: FeeEstimationLevel = FeeEstimationLevel.LOW,
    userId?: string
  ): Promise<ConstructedTransaction | null> {
    const availableUTXOs = this.getAvailableUTXOs(1);
    const dustLimit = 1000; // 1000 satoshi
    
    // 小額UTXOを特定
    const smallUTXOs = availableUTXOs.filter(utxo => utxo.amount < dustLimit * 10);
    
    if (smallUTXOs.length < 2) {
      return null; // 最適化の必要なし
    }

    // 統合先アドレス（最初のUTXOのアドレスを使用）
    const consolidationAddress = smallUTXOs[0].address;
    
    // 手数料計算
    const feeRate = this.estimateFeeRate(feeLevel);
    const estimatedSize = this.estimateTransactionSize(smallUTXOs.length, 1);
    const fee = estimatedSize * feeRate;
    
    const totalInput = smallUTXOs.reduce((sum, utxo) => sum + utxo.amount, 0);
    const outputAmount = totalInput - fee;
    
    if (outputAmount <= dustLimit) {
      throw new Error('統合後の金額がDust limitを下回ります');
    }

    const optimizationTx = await this.constructTransaction(
      [{ address: consolidationAddress, amount: outputAmount }],
      undefined,
      feeLevel,
      UTXOSelectionStrategy.SMALLEST_FIRST,
      userId
    );

    return optimizationTx;
  }

  /**
   * UTXOセットをクリア
   */
  clear(): void {
    this.utxoSet.clear();
    this.lockedUTXOs.clear();
  }

  /**
   * UTXOセットをJSONエクスポート
   */
  exportUTXOSet(): string {
    const data = {
      network: this.network,
      utxos: Array.from(this.utxoSet.values()),
      lockedUTXOs: Array.from(this.lockedUTXOs),
      timestamp: Date.now()
    };
    
    return JSON.stringify(data, null, 2);
  }

  /**
   * UTXOセットをJSONからインポート
   */
  importUTXOSet(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.network !== this.network) {
        throw new Error(`ネットワークが一致しません: ${data.network} vs ${this.network}`);
      }

      this.clear();
      
      for (const utxo of data.utxos) {
        const key = this.getUTXOKey(utxo.txid, utxo.vout);
        this.utxoSet.set(key, utxo);
      }
      
      for (const lockedKey of data.lockedUTXOs) {
        this.lockedUTXOs.add(lockedKey);
      }
      
    } catch (error) {
      throw new Error(`UTXOセットのインポートに失敗: ${error.message}`);
    }
  }
}