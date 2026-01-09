/**
 * TRON (TRX・TRC20) 入金検知システム
 * TronGrid API を使用してトランザクションを監視
 */

import { supabase } from '@/integrations/supabase/client';

export interface TronTransaction {
  txID: string;
  blockNumber: number;
  blockTimeStamp: number;
  energyFee: number;
  energyUsage: number;
  energyUsageTotal: number;
  netFee: number;
  netUsage: number;
  netUsageTotal: number;
  packingFee: number;
  result: string;
  signature: string[];
  raw_data: {
    contract: Array<{
      parameter: {
        value: {
          amount?: number;
          asset_name?: string;
          owner_address: string;
          to_address: string;
        };
        type_url: string;
      };
      type: string;
    }>;
    expiration: number;
    ref_block_bytes: string;
    ref_block_hash: string;
    timestamp: number;
  };
}

export interface TRC20Transaction {
  block_number: number;
  block_timestamp: number;
  contract_address: string;
  from: string;
  to: string;
  value: string;
  token_info: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  transaction_id: string;
}

export interface TronDepositResult {
  userId: string;
  tokenAddress: string;
  tokenSymbol: string;
  depositAddress: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

export interface TronBlockInfo {
  block_header: {
    raw_data: {
      number: number;
      timestamp: number;
    };
  };
}

export interface TronTransactionInfo {
  blockNumber?: number;
  blockTimeStamp?: number;
}

export interface TronGridResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ChainConfig {
  contractAddress?: string;
  [key: string]: unknown;
}

export class TronDepositDetector {
  private apiKey: string;
  private network: 'mainnet' | 'shasta' | 'nile';
  private baseUrl: string;
  private minConfirmations: number;

  constructor(
    apiKey: string,
    network: 'mainnet' | 'shasta' | 'nile' = 'mainnet',
    minConfirmations: number = 19
  ) {
    this.apiKey = apiKey;
    this.network = network;
    this.minConfirmations = minConfirmations;
    
    // TronGrid APIのベースURL設定
    switch (network) {
      case 'mainnet':
        this.baseUrl = 'https://api.trongrid.io';
        break;
      case 'shasta':
        this.baseUrl = 'https://api.shasta.trongrid.io';
        break;
      case 'nile':
        this.baseUrl = 'https://nile.trongrid.io';
        break;
    }
  }

  /**
   * TronGrid API リクエストを送信
   */
  private async apiRequest(endpoint: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.keys(params).forEach(key => {
      if (params[key] !== undefined && params[key] !== null) {
        url.searchParams.append(key, params[key].toString());
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'TRON-PRO-API-KEY': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TronGrid API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 一部のAPIエンドポイントはsuccessフィールドを持たない場合があります
    if (data.success === false) {
      throw new Error(`TronGrid API Error: ${data.error || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * 最新ブロック情報を取得
   */
  async getLatestBlock(): Promise<{ blockNumber: number; timestamp: number }> {
    const response = await this.apiRequest('/walletsolidity/getnowblock') as TronBlockInfo;
    
    if (!response.block_header?.raw_data) {
      throw new Error('Invalid block response format');
    }
    
    return {
      blockNumber: response.block_header.raw_data.number,
      timestamp: response.block_header.raw_data.timestamp
    };
  }

  /**
   * サポートするTRON/TRC20トークンの設定を取得
   */
  async getSupportedTokens(): Promise<Array<{
    contractAddress?: string;
    symbol: string;
    decimals: number;
    type: 'native' | 'trc20';
  }>> {
    const { data, error } = await supabase
      .from('chain_configs')
      .select('asset, config')
      .eq('chain', 'trc')
      .eq('network', this.network)
      .eq('active', true);

    if (error) {
      console.error('Failed to fetch supported tokens:', error);
      return [];
    }

    const tokens = [];

    // TRXネイティブトークン
    if (data.some(item => item.asset === 'TRX')) {
      tokens.push({
        symbol: 'TRX',
        decimals: 6,
        type: 'native' as const
      });
    }

    // TRC20トークン（USDT）
    const usdtConfig = data.find(item => item.asset === 'USDT');
    const config = usdtConfig?.config as ChainConfig | undefined;
    if (config?.contractAddress) {
      tokens.push({
        contractAddress: config.contractAddress,
        symbol: 'USDT',
        decimals: 6,
        type: 'trc20' as const
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
      .eq('chain', 'trc')
      .eq('network', this.network)
      .eq('asset', tokenSymbol)
      .eq('active', true);

    if (error) {
      console.error('Failed to fetch deposit addresses:', error);
      return [];
    }

    return data.map(item => ({
      address: item.address,
      userId: item.user_id,
      addressId: item.id
    }));
  }

  /**
   * TRXネイティブトランザクションを取得
   */
  async getTrxTransactions(
    address: string,
    fromTimestamp: number,
    toTimestamp: number
  ): Promise<TronTransaction[]> {
    const response = await this.apiRequest('/v1/accounts/' + address + '/transactions', {
      only_to: true,
      min_timestamp: fromTimestamp,
      max_timestamp: toTimestamp,
      limit: 200
    }) as { data?: TronTransaction[] };

    return response.data || [];
  }

  /**
   * TRC20トークントランザクションを取得
   */
  async getTrc20Transactions(
    contractAddress: string,
    toAddress: string,
    fromTimestamp: number,
    toTimestamp: number
  ): Promise<TRC20Transaction[]> {
    const response = await this.apiRequest('/v1/accounts/' + toAddress + '/transactions/trc20', {
      contract_address: contractAddress,
      min_timestamp: fromTimestamp,
      max_timestamp: toTimestamp,
      limit: 200
    }) as { data?: TRC20Transaction[] };

    return response.data || [];
  }

  /**
   * Sun単位をTRXに変換
   */
  private sunToTrx(sun: number): string {
    return (sun / Math.pow(10, 6)).toFixed(6);
  }

  /**
   * TRC20の最小単位を可読形式に変換
   */
  private formatTrc20Amount(amount: string, decimals: number): string {
    const value = BigInt(amount);
    const divisor = BigInt(Math.pow(10, decimals));
    const result = Number(value) / Number(divisor);
    return result.toFixed(decimals);
  }

  /**
   * 入金をデータベースに記録
   */
  async recordDeposit(
    userId: string,
    addressId: string,
    tokenSymbol: string,
    amount: string,
    transactionHash: string,
    blockNumber: number,
    walletAddress: string,
    tokenAddress?: string
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
        console.log(`TRON deposit ${transactionHash} already recorded`);
        return;
      }

      // 新しい入金レコードを作成
      const { error } = await supabase
        .from('deposits')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          currency: tokenSymbol,
          chain: 'trc',
          network: this.network,
          asset: tokenSymbol,
          status: 'pending',
          transaction_hash: transactionHash,
          wallet_address: walletAddress,
          confirmations_required: this.minConfirmations,
          confirmations_observed: 0,
          memo_tag: tokenAddress || null
        });

      if (error) {
        console.error('Failed to record TRON deposit:', error);
        throw error;
      }

      console.log(`Recorded ${tokenSymbol} deposit: ${amount} ${tokenSymbol} from ${transactionHash}`);
    } catch (error) {
      console.error('Error recording TRON deposit:', error);
      throw error;
    }
  }

  /**
   * 既存入金の確認数を更新
   */
  async updateConfirmations(latestBlockNumber: number, tokenSymbol: string): Promise<void> {
    try {
      const { data: pendingDeposits } = await supabase
        .from('deposits')
        .select('id, transaction_hash, confirmations_required, user_id, amount, asset')
        .eq('chain', 'trc')
        .eq('network', this.network)
        .eq('asset', tokenSymbol)
        .eq('status', 'pending');

      if (!pendingDeposits?.length) return;

      for (const deposit of pendingDeposits) {
        try {
          // トランザクション情報を取得して確認数を計算
          const response = await this.apiRequest(`/walletsolidity/gettransactionbyid?value=${deposit.transaction_hash}`) as TronTransactionInfo;
          
          if (response && response.blockNumber) {
            const confirmations = Math.max(0, latestBlockNumber - response.blockNumber);
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
          }
        } catch (error) {
          console.error(`Error updating confirmations for ${deposit.transaction_hash}:`, error);
        }
      }
    } catch (error) {
      console.error('Error updating TRON confirmations:', error);
    }
  }

  // updateUserAssets関数は削除しました
  // 理由: 二重計上防止のため、残高更新はDepositConfirmationManagerで一元管理

  /**
   * TRXネイティブ入金をスキャン
   */
  async scanTrxDeposits(
    fromTimestamp: number,
    toTimestamp: number
  ): Promise<TronDepositResult[]> {
    const results: TronDepositResult[] = [];
    const depositAddresses = await this.getDepositAddresses('TRX');

    if (depositAddresses.length === 0) {
      console.log('No TRX deposit addresses found');
      return results;
    }

    for (const addressInfo of depositAddresses) {
      try {
        const transactions = await this.getTrxTransactions(
          addressInfo.address,
          fromTimestamp,
          toTimestamp
        );

        for (const tx of transactions) {
          // TRXネイティブ送金かチェック
          if (tx.raw_data.contract[0]?.type === 'TransferContract') {
            const contractData = tx.raw_data.contract[0].parameter.value;
            
            if (contractData.to_address === addressInfo.address && contractData.amount) {
              const amount = this.sunToTrx(contractData.amount);
              
              if (parseFloat(amount) > 0) {
                // データベースに記録
                await this.recordDeposit(
                  addressInfo.userId,
                  addressInfo.addressId,
                  'TRX',
                  amount,
                  tx.txID,
                  tx.blockNumber,
                  addressInfo.address
                );

                results.push({
                  userId: addressInfo.userId,
                  tokenAddress: '',
                  tokenSymbol: 'TRX',
                  depositAddress: addressInfo.address,
                  amount,
                  transactionHash: tx.txID,
                  blockNumber: tx.blockNumber,
                  timestamp: tx.blockTimeStamp
                });

                console.log(`Found TRX deposit: ${amount} TRX to ${addressInfo.address} (${tx.txID})`);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning TRX deposits for ${addressInfo.address}:`, error);
      }
    }

    return results;
  }

  /**
   * TRC20トークン入金をスキャン
   */
  async scanTrc20Deposits(
    contractAddress: string,
    tokenSymbol: string,
    decimals: number,
    fromTimestamp: number,
    toTimestamp: number
  ): Promise<TronDepositResult[]> {
    const results: TronDepositResult[] = [];
    const depositAddresses = await this.getDepositAddresses(tokenSymbol);

    if (depositAddresses.length === 0) {
      console.log(`No ${tokenSymbol} deposit addresses found`);
      return results;
    }

    for (const addressInfo of depositAddresses) {
      try {
        const transactions = await this.getTrc20Transactions(
          contractAddress,
          addressInfo.address,
          fromTimestamp,
          toTimestamp
        );

        for (const tx of transactions) {
          if (tx.to === addressInfo.address && tx.value) {
            const amount = this.formatTrc20Amount(tx.value, decimals);
            
            if (parseFloat(amount) > 0) {
              // データベースに記録
              await this.recordDeposit(
                addressInfo.userId,
                addressInfo.addressId,
                tokenSymbol,
                amount,
                tx.transaction_id,
                tx.block_number,
                addressInfo.address,
                contractAddress
              );

              results.push({
                userId: addressInfo.userId,
                tokenAddress: contractAddress,
                tokenSymbol,
                depositAddress: addressInfo.address,
                amount,
                transactionHash: tx.transaction_id,
                blockNumber: tx.block_number,
                timestamp: tx.block_timestamp
              });

              console.log(`Found ${tokenSymbol} deposit: ${amount} ${tokenSymbol} to ${addressInfo.address} (${tx.transaction_id})`);
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning ${tokenSymbol} deposits for ${addressInfo.address}:`, error);
      }
    }

    return results;
  }

  /**
   * すべてのサポートトークンの入金をスキャン
   */
  async scanAllDeposits(fromTimestamp?: number, toTimestamp?: number): Promise<TronDepositResult[]> {
    const latestBlock = await this.getLatestBlock();
    const scanFromTimestamp = fromTimestamp ?? (latestBlock.timestamp - 300000); // 5分前
    const scanToTimestamp = toTimestamp ?? latestBlock.timestamp;

    console.log(`Scanning TRON deposits from ${new Date(scanFromTimestamp).toISOString()} to ${new Date(scanToTimestamp).toISOString()}...`);

    const supportedTokens = await this.getSupportedTokens();
    const results: TronDepositResult[] = [];

    for (const token of supportedTokens) {
      try {
        let tokenResults: TronDepositResult[];
        
        if (token.type === 'native') {
          tokenResults = await this.scanTrxDeposits(scanFromTimestamp, scanToTimestamp);
        } else {
          tokenResults = await this.scanTrc20Deposits(
            token.contractAddress!,
            token.symbol,
            token.decimals,
            scanFromTimestamp,
            scanToTimestamp
          );
        }
        
        results.push(...tokenResults);
        
        // 確認数を更新
        await this.updateConfirmations(latestBlock.blockNumber, token.symbol);
        
      } catch (error) {
        console.error(`Error scanning ${token.symbol} deposits:`, error);
      }
    }

    return results;
  }
}
