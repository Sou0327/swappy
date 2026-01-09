import { createClient, SupabaseClient as SupabaseJSClient } from '@supabase/supabase-js';

export interface DepositAddress {
  id: string;
  user_id: string;
  chain: string;
  network: string;
  asset: string | null;
  address: string;
  memo_tag: string | null;
  derivation_path: string | null;
  address_index: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChainConfig {
  id: string;
  chain: string;
  network: string;
  asset: string;
  deposit_enabled: boolean;
  min_confirmations: number;
  min_deposit: number;
  created_at: string;
  updated_at: string;
}

/**
 * Supabase クライアントラッパー
 */
export class SupabaseClient {
  private client: SupabaseJSClient | null = null;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || '';
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!this.supabaseUrl) {
      throw new Error('SUPABASE_URL 環境変数が設定されていません');
    }

    if (!this.supabaseKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY 環境変数が設定されていません');
    }
  }

  async initialize(): Promise<void> {
    console.log('🗄️ Supabase クライアント初期化中...');

    try {
      this.client = createClient(this.supabaseUrl, this.supabaseKey);
      console.log('✅ Supabase クライアント初期化完了');
    } catch (error) {
      console.error('❌ Supabase クライアント初期化失敗:', error);
      throw error;
    }
  }

  /**
   * アクティブな deposit_addresses を全て取得
   */
  async getActiveDepositAddresses(): Promise<DepositAddress[]> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      console.log('📍 アクティブな deposit_addresses を取得中...');

      const { data, error } = await this.client
        .from('deposit_addresses')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      console.log(`✅ ${data?.length || 0} 件のアクティブなアドレスを取得`);
      return data || [];
    } catch (error) {
      console.error('❌ deposit_addresses 取得失敗:', error);
      throw error;
    }
  }

  /**
   * 特定ユーザーの deposit_addresses を取得
   */
  async getDepositAddressesByUser(userId: string): Promise<DepositAddress[]> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      const { data, error } = await this.client
        .from('deposit_addresses')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(`❌ ユーザー (${userId}) の deposit_addresses 取得失敗:`, error);
      throw error;
    }
  }

  /**
   * チェーン/ネットワーク別の deposit_addresses を取得
   */
  async getDepositAddressesByChain(chain: string, network?: string): Promise<DepositAddress[]> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      let query = this.client
        .from('deposit_addresses')
        .select('*')
        .eq('chain', chain)
        .eq('active', true);

      if (network) {
        query = query.eq('network', network);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error(`❌ チェーン (${chain}${network ? `/${network}` : ''}) の deposit_addresses 取得失敗:`, error);
      throw error;
    }
  }

  /**
   * 有効なチェーン設定を取得
   */
  async getActiveChainConfigs(): Promise<ChainConfig[]> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      console.log('⚙️ アクティブなチェーン設定を取得中...');

      const { data, error } = await this.client
        .from('chain_configs')
        .select('*')
        .eq('deposit_enabled', true)
        .order('chain', { ascending: true });

      if (error) {
        throw error;
      }

      console.log(`✅ ${data?.length || 0} 件のアクティブなチェーン設定を取得`);
      return data || [];
    } catch (error) {
      console.error('❌ chain_configs 取得失敗:', error);
      throw error;
    }
  }

  /**
   * 特定のチェーン設定を取得
   */
  async getChainConfig(chain: string, network: string, asset: string): Promise<ChainConfig | null> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      const { data, error } = await this.client
        .from('chain_configs')
        .select('*')
        .eq('chain', chain)
        .eq('network', network)
        .eq('asset', asset)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error(`❌ チェーン設定 (${chain}/${network}/${asset}) 取得失敗:`, error);
      throw error;
    }
  }

  /**
   * アドレスの存在確認
   */
  async checkAddressExists(address: string, chain: string, network: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      // ⚠️ 重大修正: EVMアドレスの大文字小文字問題を根本解決
      // 既存データがチェックサム表記でも小文字でも、ilike でケースインセンシティブ比較
      const { data, error } = await this.client
        .from('deposit_addresses')
        .select('id')
        .ilike('address', address)
        .eq('chain', chain)
        .eq('network', network)
        .limit(1);

      if (error) {
        throw error;
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      console.error(`❌ アドレス存在確認失敗 (${address}):`, error);
      throw error;
    }
  }

  /**
   * deposit_addresses テーブルの統計情報を取得
   */
  async getDepositAddressStats(): Promise<{
    total: number;
    active: number;
    byChain: { [key: string]: number };
    byNetwork: { [key: string]: number };
  }> {
    if (!this.client) {
      throw new Error('Supabase クライアントが初期化されていません');
    }

    try {
      // 総数
      const { count: total, error: totalError } = await this.client
        .from('deposit_addresses')
        .select('*', { count: 'exact', head: true });

      if (totalError) throw totalError;

      // アクティブ数
      const { count: active, error: activeError } = await this.client
        .from('deposit_addresses')
        .select('*', { count: 'exact', head: true })
        .eq('active', true);

      if (activeError) throw activeError;

      // チェーン別・ネットワーク別集計（O(1)最適化済み）
      const byChain: { [key: string]: number } = {};
      const byNetwork: { [key: string]: number } = {};

      // PostgreSQL RPC関数を使用したO(1)集約クエリ
      try {
        // チェーン別統計を一括取得
        const { data: chainStats, error: chainError } = await this.client
          .rpc('get_deposit_stats_by_chain');

        if (chainError) {
          console.warn('⚠️ RPCクエリ失敗、フォールバック個別クエリを使用:', chainError.message);

          // フォールバック: 個別クエリで集計
          const { data: allActiveAddresses, error: fetchError } = await this.client
            .from('deposit_addresses')
            .select('chain, network')
            .eq('active', true);

          if (fetchError) throw fetchError;

          // データを手動で集計
          if (allActiveAddresses && allActiveAddresses.length > 0) {
            allActiveAddresses.forEach((row: Record<string, unknown>) => {
              const chain = String(row.chain);
              const network = String(row.network);

              // チェーン別集計
              byChain[chain] = (byChain[chain] || 0) + 1;

              // ネットワーク別集計
              byNetwork[network] = (byNetwork[network] || 0) + 1;
            });
          }
        } else if (chainStats) {
          // RPC成功時の処理
          chainStats.forEach((row: Record<string, unknown>) => {
            const count = Number(row.count) || 0;
            byChain[String(row.chain)] = (byChain[String(row.chain)] || 0) + count;
            byNetwork[String(row.network)] = (byNetwork[String(row.network)] || 0) + count;
          });
        }
      } catch (rpcError) {
        console.warn('⚠️ 集約クエリ失敗、最終フォールバック集計を使用:', rpcError);

        // 最終フォールバック: 全データを取得して手動集計
        try {
          const { data: allActiveAddresses, error: fetchError } = await this.client
            .from('deposit_addresses')
            .select('chain, network')
            .eq('active', true);

          if (fetchError) {
            console.warn('⚠️ フォールバック集計も失敗:', fetchError.message);
          } else if (allActiveAddresses) {
            allActiveAddresses.forEach((row: Record<string, unknown>) => {
              const chain = String(row.chain);
              const network = String(row.network);

              // チェーン別集計
              byChain[chain] = (byChain[chain] || 0) + 1;

              // ネットワーク別集計
              byNetwork[network] = (byNetwork[network] || 0) + 1;
            });
          }

        } catch (finalError) {
          console.error('❌ 最終フォールバック集計失敗:', finalError);
          // 集計データが取得できない場合は空のオブジェクトを返す
        }
      }

      return {
        total: total || 0,
        active: active || 0,
        byChain,
        byNetwork
      };
    } catch (error) {
      console.error('❌ deposit_addresses 統計取得失敗:', error);
      throw error;
    }
  }
}