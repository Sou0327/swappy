/**
 * ERC-20 (USDT等) 入金検知システム
 * eth_getLogs を使用してTransferイベントを監視
 */

import { supabase } from '@/integrations/supabase/client';

export interface TransferLog {
  address: string;           // コントラクトアドレス
  topics: string[];          // [Transfer(...), from, to]
  data: string;             // amount (uint256)
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string;
  logIndex: string;
  removed: boolean;
}

export interface ERC20DepositResult {
  userId: string;
  tokenAddress: string;
  tokenSymbol: string;
  depositAddress: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
  confirmations: number;
}

export class ERC20DepositDetector {
  private rpcUrl: string;
  private network: 'mainnet' | 'sepolia';
  private minConfirmations: number;
  
  // ERC-20 Transfer event signature: Transfer(address,address,uint256)
  private readonly TRANSFER_EVENT_SIGNATURE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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
   * サポートするERC-20トークンの設定を取得
   */
  async getSupportedTokens(): Promise<Array<{
    contractAddress: string;
    symbol: string;
    decimals: number;
  }>> {
    const { data, error } = await supabase
      .from('chain_configs')
      .select('asset, config')
      .eq('chain', 'evm')
      .eq('network', this.network === 'mainnet' ? 'ethereum' : 'sepolia')
      .neq('asset', 'ETH') // ETH以外のトークン
      .eq('active', true);

    if (error) {
      console.error('Failed to fetch supported tokens:', error);
      return [];
    }

    const tokens = [];
    
    // 環境変数からUSDTコントラクトアドレスを取得
    const usdtAddress = this.network === 'mainnet'
      ? import.meta.env.VITE_USDT_CONTRACT_ADDRESS_MAINNET
      : import.meta.env.VITE_USDT_CONTRACT_ADDRESS_SEPOLIA;

    if (usdtAddress && data.some(item => item.asset === 'USDT')) {
      tokens.push({
        contractAddress: usdtAddress.toLowerCase(),
        symbol: 'USDT',
        decimals: 6 // USDTは6 decimals
      });
    }

    return tokens;
  }

  /**
   * 管理対象の入金アドレス一覧を取得
   */
  async getDepositAddresses(tokenSymbol: string): Promise<Array<{
    address: string;
    userId: string;
    addressId: string;
  }>> {
    const { data, error } = await supabase
      .from('deposit_addresses')
      .select('id, user_id, address')
      .eq('chain', 'evm')
      .eq('network', this.network === 'mainnet' ? 'ethereum' : 'sepolia')
      .eq('asset', tokenSymbol)
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
   * アドレスをログフィルター用にパディング
   */
  private padAddress(address: string): string {
    return '0x' + '0'.repeat(24) + address.slice(2).toLowerCase();
  }

  /**
   * hex値を10進数に変換（大きな数値対応）
   */
  private hexToBigInt(hex: string): bigint {
    return BigInt(hex);
  }

  /**
   * トークン量を可読形式に変換
   */
  private formatTokenAmount(amountHex: string, decimals: number): string {
    const amount = this.hexToBigInt(amountHex);
    const divisor = BigInt(Math.pow(10, decimals));
    const result = Number(amount) / Number(divisor);
    return result.toFixed(decimals);
  }

  /**
   * ERC-20 Transfer ログを取得
   */
  async getTransferLogs(
    contractAddress: string,
    toAddresses: string[],
    fromBlock: number,
    toBlock: number
  ): Promise<TransferLog[]> {
    const fromBlockHex = '0x' + fromBlock.toString(16);
    const toBlockHex = '0x' + toBlock.toString(16);

    // 複数のtoアドレスに対するログを並列取得
    const logPromises = toAddresses.map(async (toAddress) => {
      const filter = {
        fromBlock: fromBlockHex,
        toBlock: toBlockHex,
        address: contractAddress,
        topics: [
          this.TRANSFER_EVENT_SIGNATURE,
          null, // from (任意のアドレス)
          this.padAddress(toAddress) // to (特定の入金アドレス)
        ]
      };

      try {
        return await this.rpcRequest('eth_getLogs', [filter]) as TransferLog[];
      } catch (error) {
        console.error(`Error getting logs for address ${toAddress}:`, error);
        return [];
      }
    });

    const allLogs = await Promise.all(logPromises);
    return allLogs.flat();
  }

  /**
   * 入金をデータベースに記録
   */
  async recordTokenDeposit(
    userId: string,
    addressId: string,
    tokenSymbol: string,
    amount: string,
    transactionHash: string,
    blockNumber: number,
    walletAddress: string,
    tokenAddress: string
  ): Promise<void> {
    try {
      // 重複チェック
      const { data: existing } = await supabase
        .from('deposits')
        .select('id')
        .eq('transaction_hash', transactionHash)
        .eq('wallet_address', walletAddress)
        .eq('asset', tokenSymbol)
        .single();

      if (existing) {
        console.log(`Token deposit ${transactionHash} already recorded`);
        return;
      }

      // 新しい入金レコードを作成
      const { error } = await supabase
        .from('deposits')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          currency: tokenSymbol,
          chain: 'evm',
          network: this.network === 'mainnet' ? 'ethereum' : 'sepolia',
          asset: tokenSymbol,
          status: 'pending',
          transaction_hash: transactionHash,
          wallet_address: walletAddress,
          confirmations_required: this.minConfirmations,
          confirmations_observed: 0,
          memo_tag: tokenAddress // トークンアドレスをメモに保存
        });

      if (error) {
        console.error('Failed to record token deposit:', error);
        throw error;
      }

      console.log(`Recorded ${tokenSymbol} deposit: ${amount} ${tokenSymbol} from ${transactionHash}`);
    } catch (error) {
      console.error('Error recording token deposit:', error);
      throw error;
    }
  }

  /**
   * 既存入金の確認数を更新
   */
  async updateTokenConfirmations(latestBlockNumber: number, tokenSymbol: string): Promise<void> {
    try {
      const { data: pendingDeposits } = await supabase
        .from('deposits')
        .select('id, transaction_hash, confirmations_required, user_id, amount, asset')
        .eq('chain', 'evm')
        .eq('network', this.network === 'mainnet' ? 'ethereum' : 'sepolia')
        .eq('asset', tokenSymbol)
        .eq('status', 'pending');

      if (!pendingDeposits?.length) return;

      for (const deposit of pendingDeposits) {
        try {
          // トランザクションレシートを取得
          const txReceipt = await this.rpcRequest('eth_getTransactionReceipt', [deposit.transaction_hash]) as {
            blockNumber?: string;
            status?: string;
          } | null;
          
          if (txReceipt && txReceipt.blockNumber && txReceipt.status === '0x1') { // 成功したトランザクション
            const txBlockNumber = parseInt(txReceipt.blockNumber, 16);
            const confirmations = Math.max(0, latestBlockNumber - txBlockNumber);
            
            const isConfirmed = confirmations >= deposit.confirmations_required;
            
            // 確認数を更新
            const { error: updateError } = await supabase
              .from('deposits')
              .update({
                confirmations_observed: confirmations,
                ...(isConfirmed && {
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
          } else if (txReceipt && txReceipt.status === '0x0') {
            // 失敗したトランザクション
            const { error: rejectError } = await supabase
              .from('deposits')
              .update({ status: 'rejected' })
              .eq('id', deposit.id);

            if (rejectError) {
              console.error(`Failed to update deposit status to rejected for ${deposit.id}:`, rejectError);
              throw rejectError;
            }
          }
        } catch (error) {
          console.error(`Error updating confirmations for ${deposit.transaction_hash}:`, error);
        }
      }
    } catch (error) {
      console.error('Error updating token confirmations:', error);
    }
  }

  // updateUserTokenAssets関数は削除しました
  // 理由: 二重計上防止のため、残高更新はDepositConfirmationManagerで一元管理

  /**
   * ERC-20 トークンの入金をスキャン
   */
  async scanTokenDeposits(
    contractAddress: string,
    tokenSymbol: string,
    decimals: number,
    fromBlock: number,
    toBlock: number
  ): Promise<ERC20DepositResult[]> {
    const results: ERC20DepositResult[] = [];
    const depositAddresses = await this.getDepositAddresses(tokenSymbol);

    if (depositAddresses.length === 0) {
      return results;
    }

    const addressList = depositAddresses.map(addr => addr.address);
    const logs = await this.getTransferLogs(contractAddress, addressList, fromBlock, toBlock);

    for (const log of logs) {
      try {
        const blockNumber = parseInt(log.blockNumber, 16);
        const toAddress = '0x' + log.topics[2].slice(26); // topics[2]の最後の20バイトがtoアドレス
        const amount = this.formatTokenAmount(log.data, decimals);
        
        const matchedAddress = depositAddresses.find(addr => 
          addr.address === toAddress.toLowerCase()
        );

        if (matchedAddress && parseFloat(amount) > 0) {
          // データベースに記録
          await this.recordTokenDeposit(
            matchedAddress.userId,
            matchedAddress.addressId,
            tokenSymbol,
            amount,
            log.transactionHash,
            blockNumber,
            toAddress,
            contractAddress
          );

          results.push({
            userId: matchedAddress.userId,
            tokenAddress: contractAddress,
            tokenSymbol,
            depositAddress: toAddress,
            amount,
            transactionHash: log.transactionHash,
            blockNumber,
            confirmations: toBlock - blockNumber
          });

          console.log(`Found ${tokenSymbol} deposit: ${amount} ${tokenSymbol} to ${toAddress} (${log.transactionHash})`);
        }
      } catch (error) {
        console.error('Error processing transfer log:', error);
      }
    }

    return results;
  }

  /**
   * すべてのサポートトークンの入金をスキャン
   */
  async scanAllTokenDeposits(fromBlock?: number, toBlock?: number): Promise<ERC20DepositResult[]> {
    const latestBlock = await this.getLatestBlockNumber();
    const scanFromBlock = fromBlock ?? Math.max(1, latestBlock - 4);
    const scanToBlock = toBlock ?? latestBlock;

    console.log(`Scanning blocks ${scanFromBlock} to ${scanToBlock} for ERC-20 deposits...`);

    const supportedTokens = await this.getSupportedTokens();
    const results: ERC20DepositResult[] = [];

    for (const token of supportedTokens) {
      try {
        const tokenResults = await this.scanTokenDeposits(
          token.contractAddress,
          token.symbol,
          token.decimals,
          scanFromBlock,
          scanToBlock
        );
        
        results.push(...tokenResults);
        
        // 確認数を更新
        await this.updateTokenConfirmations(latestBlock, token.symbol);
        
      } catch (error) {
        console.error(`Error scanning ${token.symbol} deposits:`, error);
      }
    }

    return results;
  }
}