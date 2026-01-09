/**
 * Ethereum ネイティブ入金検知システム
 * eth_getBlockByNumber を使用してトランザクションをスキャン
 */

import { supabase } from '@/integrations/supabase/client';

export interface EthTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed?: string;
  status?: string;
}

export interface EthBlock {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  transactions: EthTransaction[];
}

export interface DepositDetectionResult {
  userId: string;
  depositAddress: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
  confirmations: number;
}

export class EthDepositDetector {
  private rpcUrl: string;
  private network: 'mainnet' | 'sepolia';
  private minConfirmations: number;

  constructor(
    rpcUrl: string,
    network: 'mainnet' | 'sepolia' = 'mainnet',
    minConfirmations: number = 12
  ) {
    this.rpcUrl = rpcUrl;
    this.network = network;
    this.minConfirmations = minConfirmations;
  }

  /**
   * JSON-RPC リクエストを送信
   */
  private async rpcRequest(method: string, params: unknown[]): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * 最新ブロック番号を取得
   */
  async getLatestBlockNumber(): Promise<number> {
    const blockNumber = await this.rpcRequest('eth_blockNumber', []);
    return parseInt(blockNumber as string, 16);
  }

  /**
   * 指定ブロックの詳細を取得（トランザクション含む）
   */
  async getBlockWithTransactions(blockNumber: number): Promise<EthBlock> {
    const blockHex = '0x' + blockNumber.toString(16);
    const block = await this.rpcRequest('eth_getBlockByNumber', [blockHex, true]) as {
      number: string;
      hash: string;
      parentHash: string;
      timestamp: string;
      transactions: EthTransaction[];
    };

    return {
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      transactions: block.transactions || [],
    };
  }

  /**
   * 管理対象の入金アドレス一覧を取得
   */
  async getDepositAddresses(): Promise<Array<{ address: string; userId: string; addressId: string }>> {
    const { data, error } = await supabase
      .from('deposit_addresses')
      .select('id, user_id, address')
      .eq('chain', 'evm')
      .eq('network', this.network === 'mainnet' ? 'ethereum' : 'sepolia')
      .eq('asset', 'ETH')
      .eq('active', true);

    if (error) {
      console.error('Failed to fetch deposit addresses:', error);
      return [];
    }

    return data.map(item => ({
      address: item.address.toLowerCase(),
      userId: item.user_id,
      addressId: item.id
    }));
  }

  /**
   * トランザクションが入金アドレス宛てかチェック
   */
  private isDepositTransaction(
    tx: EthTransaction,
    depositAddresses: Array<{ address: string; userId: string; addressId: string }>
  ): { userId: string; addressId: string } | null {
    if (!tx.to) return null;
    
    const toAddress = tx.to.toLowerCase();
    const matchedAddress = depositAddresses.find(addr => addr.address === toAddress);
    
    if (matchedAddress && tx.value && tx.value !== '0x0') {
      return { userId: matchedAddress.userId, addressId: matchedAddress.addressId };
    }
    
    return null;
  }

  /**
   * Wei を ETH に変換
   */
  private weiToEth(weiHex: string): string {
    const wei = BigInt(weiHex);
    const eth = Number(wei) / Math.pow(10, 18);
    return eth.toFixed(18);
  }

  /**
   * 入金をデータベースに記録
   */
  async recordDeposit(
    userId: string,
    addressId: string,
    amount: string,
    transactionHash: string,
    blockNumber: number,
    walletAddress: string
  ): Promise<void> {
    try {
      // 重複チェック
      const { data: existing } = await supabase
        .from('deposits')
        .select('id')
        .eq('transaction_hash', transactionHash)
        .single();

      if (existing) {
        console.log(`Transaction ${transactionHash} already recorded`);
        return;
      }

      // 新しい入金レコードを作成
      const { error } = await supabase
        .from('deposits')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          currency: 'ETH',
          chain: 'evm',
          network: this.network === 'mainnet' ? 'ethereum' : 'sepolia',
          asset: 'ETH',
          status: 'pending',
          transaction_hash: transactionHash,
          wallet_address: walletAddress,
          confirmations_required: this.minConfirmations,
          confirmations_observed: 0,
        });

      if (error) {
        console.error('Failed to record deposit:', error);
        throw error;
      }

      console.log(`Recorded ETH deposit: ${amount} ETH from ${transactionHash}`);
    } catch (error) {
      console.error('Error recording deposit:', error);
      throw error;
    }
  }

  /**
   * 既存入金の確認数を更新
   */
  async updateConfirmations(latestBlockNumber: number): Promise<void> {
    try {
      const { data: pendingDeposits } = await supabase
        .from('deposits')
        .select('id, transaction_hash, confirmations_required')
        .eq('chain', 'evm')
        .eq('network', this.network === 'mainnet' ? 'ethereum' : 'sepolia')
        .eq('asset', 'ETH')
        .eq('status', 'pending');

      if (!pendingDeposits?.length) return;

      for (const deposit of pendingDeposits) {
        try {
          // トランザクションの詳細を取得
          const txReceipt = await this.rpcRequest('eth_getTransactionReceipt', [deposit.transaction_hash]) as {
            blockNumber?: string;
            status?: string;
          } | null;
          
          if (txReceipt && txReceipt.blockNumber) {
            const txBlockNumber = parseInt(txReceipt.blockNumber as string, 16);
            const confirmations = Math.max(0, latestBlockNumber - txBlockNumber);
            
            // 確認数を更新
            const { error: updateError } = await supabase
              .from('deposits')
              .update({
                confirmations_observed: confirmations,
                ...(confirmations >= deposit.confirmations_required && {
                  status: 'confirmed',
                  confirmed_at: new Date().toISOString()
                })
              })
              .eq('id', deposit.id);

            if (updateError) {
              console.error(`Failed to update deposit confirmations for ${deposit.id}:`, updateError);
              throw updateError;
            }

            // 確認数が満たされた場合、depositステータスをconfirmedに更新
            // ユーザー資産への反映はDepositConfirmationManagerが一元管理
            // (二重計上防止のため、検出器側では残高更新を行わない)
          }
        } catch (error) {
          console.error(`Error updating confirmations for ${deposit.transaction_hash}:`, error);
        }
      }
    } catch (error) {
      console.error('Error updating confirmations:', error);
    }
  }

  // updateUserAssets関数は削除しました
  // 理由: 二重計上防止のため、残高更新はDepositConfirmationManagerで一元管理

  /**
   * 指定ブロックレンジの入金をスキャン
   */
  async scanBlockRange(fromBlock: number, toBlock: number): Promise<DepositDetectionResult[]> {
    const results: DepositDetectionResult[] = [];
    const depositAddresses = await this.getDepositAddresses();

    if (depositAddresses.length === 0) {
      console.log('No deposit addresses found');
      return results;
    }

    console.log(`Scanning blocks ${fromBlock} to ${toBlock} for ETH deposits...`);

    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      try {
        const block = await this.getBlockWithTransactions(blockNum);
        
        for (const tx of block.transactions) {
          const depositMatch = this.isDepositTransaction(tx, depositAddresses);
          
          if (depositMatch) {
            const amount = this.weiToEth(tx.value);
            const confirmations = toBlock - blockNum;
            
            // データベースに記録
            await this.recordDeposit(
              depositMatch.userId,
              depositMatch.addressId,
              amount,
              tx.hash,
              blockNum,
              tx.to!
            );

            results.push({
              userId: depositMatch.userId,
              depositAddress: tx.to!,
              amount,
              transactionHash: tx.hash,
              blockNumber: blockNum,
              confirmations
            });

            console.log(`Found ETH deposit: ${amount} ETH to ${tx.to} (${tx.hash})`);
          }
        }
      } catch (error) {
        console.error(`Error scanning block ${blockNum}:`, error);
      }
    }

    return results;
  }

  /**
   * 最新ブロックの入金をスキャン（メインループ用）
   */
  async scanLatestDeposits(): Promise<DepositDetectionResult[]> {
    try {
      const latestBlock = await this.getLatestBlockNumber();
      
      // 最新の5ブロックをスキャン（調整可能）
      const fromBlock = Math.max(1, latestBlock - 4);
      const results = await this.scanBlockRange(fromBlock, latestBlock);
      
      // 既存入金の確認数を更新
      await this.updateConfirmations(latestBlock);

      return results;
    } catch (error) {
      console.error('Error scanning latest deposits:', error);
      return [];
    }
  }
}