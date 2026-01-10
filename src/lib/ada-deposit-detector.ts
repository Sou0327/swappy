/**
 * Cardano (ADA) 入金検知システム
 * Blockfrost API を使用してトランザクションを監視
 */

import { supabase } from '@/integrations/supabase/client';

export interface CardanoTransaction {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  slot: number;
  index: number;
  output_amount: Array<{
    unit: string;
    quantity: string;
  }>;
  fees: string;
  deposit: string;
  size: number;
  invalid_before?: string;
  invalid_hereafter?: string;
  utxo_count: number;
  withdrawal_count: number;
  mir_cert_count: number;
  delegation_count: number;
  stake_cert_count: number;
  pool_update_count: number;
  pool_retire_count: number;
  asset_mint_or_burn_count: number;
  redeemer_count: number;
  valid_contract: boolean;
}

export interface CardanoUtxo {
  tx_hash: string;
  output_index: number;
  amount: Array<{
    unit: string;
    quantity: string;
  }>;
  block: string;
  data_hash?: string;
}

export interface CardanoAddressUtxos {
  address: string;
  utxos: CardanoUtxo[];
}

export interface AdaDepositResult {
  userId: string;
  tokenAddress: string;
  tokenSymbol: string;
  depositAddress: string;
  amount: string;
  transactionHash: string;
  blockHeight: number;
  blockTime: number;
}

export interface BlockfrostLatestBlock {
  height: number;
  time: number;
  slot: number;
  hash: string;
  epoch: number;
  epoch_slot: number;
  slot_leader: string;
  size: number;
  tx_count: number;
  output?: string;
  fees?: string;
  block_vrf?: string;
  previous_block?: string;
  next_block?: string;
  confirmations: number;
}

export interface ChainConfig {
  policyId?: string;
  assetName?: string;
  decimals?: number;
  [key: string]: unknown;
}

export class AdaDepositDetector {
  private apiKey: string;
  private network: 'mainnet' | 'testnet';
  private baseUrl: string;
  private minConfirmations: number;

  constructor(
    apiKey: string,
    network: 'mainnet' | 'testnet' = 'mainnet',
    minConfirmations: number = 15
  ) {
    this.apiKey = apiKey;
    this.network = network;
    this.minConfirmations = minConfirmations;
    
    // Blockfrost APIのベースURL設定
    this.baseUrl = network === 'mainnet' 
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-testnet.blockfrost.io/api/v0';
  }

  /**
   * Blockfrost API リクエストを送信
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
        'project_id': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Blockfrost API Error: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * 最新ブロック情報を取得
   */
  async getLatestBlock(): Promise<{ height: number; time: number; slot: number }> {
    const response = await this.apiRequest('/blocks/latest') as BlockfrostLatestBlock;
    return {
      height: response.height,
      time: response.time,
      slot: response.slot
    };
  }

  /**
   * サポートするCardanoトークンの設定を取得
   */
  async getSupportedTokens(): Promise<Array<{
    policyId?: string;
    assetName?: string;
    symbol: string;
    decimals: number;
    type: 'native' | 'token';
  }>> {
    const { data, error } = await supabase
      .from('chain_configs')
      .select('asset, config')
      .eq('chain', 'cardano')
      .eq('network', this.network)
      .eq('active', true);

    if (error) {
      console.error('Failed to fetch supported tokens:', error);
      return [];
    }

    const tokens = [];

    // ADAネイティブトークン
    if (data.some(item => item.asset === 'ADA')) {
      tokens.push({
        symbol: 'ADA',
        decimals: 6,
        type: 'native' as const
      });
    }

    // カスタムトークン（将来の拡張用）
    for (const item of data) {
      const config = item.config as ChainConfig;
      if (item.asset !== 'ADA' && config?.policyId && config?.assetName) {
        tokens.push({
          policyId: config.policyId,
          assetName: config.assetName,
          symbol: item.asset,
          decimals: config.decimals || 6,
          type: 'token' as const
        });
      }
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
      .eq('chain', 'cardano')
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
   * アドレスのトランザクション履歴を取得
   */
  async getAddressTransactions(
    address: string,
    count: number = 100,
    page: number = 1
  ): Promise<CardanoTransaction[]> {
    const response = await this.apiRequest(`/addresses/${address}/transactions`, {
      count,
      page,
      order: 'desc'
    });

    return response as CardanoTransaction[];
  }

  /**
   * 特定トランザクションの詳細を取得
   */
  async getTransactionDetails(txHash: string): Promise<CardanoTransaction> {
    const response = await this.apiRequest(`/txs/${txHash}`);
    return response as CardanoTransaction;
  }

  /**
   * アドレスの現在のUTXOsを取得
   */
  async getAddressUtxos(address: string): Promise<CardanoUtxo[]> {
    const response = await this.apiRequest(`/addresses/${address}/utxos`);
    return response as CardanoUtxo[];
  }

  /**
   * Lovelaceを ADA に変換
   */
  private lovelaceToAda(lovelace: string): string {
    const value = BigInt(lovelace);
    const divisor = BigInt(1000000); // 1 ADA = 1,000,000 Lovelace
    const result = Number(value) / Number(divisor);
    return result.toFixed(6);
  }

  /**
   * カスタムトークンの最小単位を可読形式に変換
   */
  private formatTokenAmount(amount: string, decimals: number): string {
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
    blockHeight: number,
    walletAddress: string,
    tokenId?: string
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
        return;
      }

      // 新しい入金レコードを作成
      const { error } = await supabase
        .from('deposits')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          currency: tokenSymbol,
          chain: 'cardano',
          network: this.network,
          asset: tokenSymbol,
          status: 'pending',
          transaction_hash: transactionHash,
          wallet_address: walletAddress,
          confirmations_required: this.minConfirmations,
          confirmations_observed: 0,
          memo_tag: tokenId || null
        });

      if (error) {
        console.error('Failed to record ADA deposit:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error recording ADA deposit:', error);
      throw error;
    }
  }

  /**
   * 既存入金の確認数を更新
   */
  async updateConfirmations(latestBlockHeight: number, tokenSymbol: string): Promise<void> {
    try {
      const { data: pendingDeposits } = await supabase
        .from('deposits')
        .select('id, transaction_hash, confirmations_required, user_id, amount, asset')
        .eq('chain', 'cardano')
        .eq('network', this.network)
        .eq('asset', tokenSymbol)
        .eq('status', 'pending');

      if (!pendingDeposits?.length) return;

      for (const deposit of pendingDeposits) {
        try {
          // トランザクション詳細を取得
          const txDetails = await this.getTransactionDetails(deposit.transaction_hash);
          
          if (txDetails && txDetails.block_height) {
            const confirmations = Math.max(0, latestBlockHeight - txDetails.block_height);
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
      console.error('Error updating ADA confirmations:', error);
    }
  }

  // updateUserAssets関数は削除しました
  // 理由: 二重計上防止のため、残高更新はDepositConfirmationManagerで一元管理

  /**
   * ADAネイティブ入金をスキャン
   */
  async scanAdaDeposits(
    fromSlot?: number,
    maxTransactions: number = 100
  ): Promise<AdaDepositResult[]> {
    const results: AdaDepositResult[] = [];
    const depositAddresses = await this.getDepositAddresses('ADA');

    if (depositAddresses.length === 0) {
      return results;
    }

    const latestBlock = await this.getLatestBlock();
    const cutoffTime = fromSlot ? null : Date.now() - (5 * 60 * 1000); // 5分前

    for (const addressInfo of depositAddresses) {
      try {
        const transactions = await this.getAddressTransactions(addressInfo.address, maxTransactions);

        for (const tx of transactions) {
          // 時間フィルタリング（fromSlotが指定されていない場合）
          if (cutoffTime && tx.block_time * 1000 < cutoffTime) {
            continue;
          }

          // スロットフィルタリング（fromSlotが指定されている場合）
          if (fromSlot && tx.slot < fromSlot) {
            continue;
          }

          // このトランザクションでADAが受信されているかチェック
          const txDetails = await this.getTransactionDetails(tx.hash);
          
          // ADA（lovelace）の受信をチェック
          const adaOutput = txDetails.output_amount.find(output => output.unit === 'lovelace');
          
          if (adaOutput && BigInt(adaOutput.quantity) > 0) {
            const amount = this.lovelaceToAda(adaOutput.quantity);
            
            if (parseFloat(amount) > 0) {
              // データベースに記録
              await this.recordDeposit(
                addressInfo.userId,
                addressInfo.addressId,
                'ADA',
                amount,
                tx.hash,
                tx.block_height,
                addressInfo.address
              );

              results.push({
                userId: addressInfo.userId,
                tokenAddress: '',
                tokenSymbol: 'ADA',
                depositAddress: addressInfo.address,
                amount,
                transactionHash: tx.hash,
                blockHeight: tx.block_height,
                blockTime: tx.block_time
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error scanning ADA deposits for ${addressInfo.address}:`, error);
      }
    }

    return results;
  }

  /**
   * カスタムトークン入金をスキャン
   */
  async scanTokenDeposits(
    policyId: string,
    assetName: string,
    tokenSymbol: string,
    decimals: number,
    fromSlot?: number,
    maxTransactions: number = 100
  ): Promise<AdaDepositResult[]> {
    const results: AdaDepositResult[] = [];
    const depositAddresses = await this.getDepositAddresses(tokenSymbol);
    const assetId = policyId + assetName;

    if (depositAddresses.length === 0) {
      return results;
    }

    const cutoffTime = fromSlot ? null : Date.now() - (5 * 60 * 1000); // 5分前

    for (const addressInfo of depositAddresses) {
      try {
        const transactions = await this.getAddressTransactions(addressInfo.address, maxTransactions);

        for (const tx of transactions) {
          // 時間フィルタリング
          if (cutoffTime && tx.block_time * 1000 < cutoffTime) {
            continue;
          }

          // スロットフィルタリング
          if (fromSlot && tx.slot < fromSlot) {
            continue;
          }

          // このトランザクションで対象トークンが受信されているかチェック
          const txDetails = await this.getTransactionDetails(tx.hash);
          const tokenOutput = txDetails.output_amount.find(output => output.unit === assetId);
          
          if (tokenOutput && BigInt(tokenOutput.quantity) > 0) {
            const amount = this.formatTokenAmount(tokenOutput.quantity, decimals);
            
            if (parseFloat(amount) > 0) {
              // データベースに記録
              await this.recordDeposit(
                addressInfo.userId,
                addressInfo.addressId,
                tokenSymbol,
                amount,
                tx.hash,
                tx.block_height,
                addressInfo.address,
                assetId
              );

              results.push({
                userId: addressInfo.userId,
                tokenAddress: assetId,
                tokenSymbol,
                depositAddress: addressInfo.address,
                amount,
                transactionHash: tx.hash,
                blockHeight: tx.block_height,
                blockTime: tx.block_time
              });
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
  async scanAllDeposits(fromSlot?: number): Promise<AdaDepositResult[]> {
    const latestBlock = await this.getLatestBlock();
    
    const supportedTokens = await this.getSupportedTokens();
    const results: AdaDepositResult[] = [];

    for (const token of supportedTokens) {
      try {
        let tokenResults: AdaDepositResult[];
        
        if (token.type === 'native') {
          tokenResults = await this.scanAdaDeposits(fromSlot);
        } else {
          tokenResults = await this.scanTokenDeposits(
            token.policyId!,
            token.assetName!,
            token.symbol,
            token.decimals,
            fromSlot
          );
        }
        
        results.push(...tokenResults);
        
        // 確認数を更新
        await this.updateConfirmations(latestBlock.height, token.symbol);
        
      } catch (error) {
        console.error(`Error scanning ${token.symbol} deposits:`, error);
      }
    }

    return results;
  }
}