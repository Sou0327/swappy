/**
 * 統一入金検知マネージャー
 * 全チェーンの入金検知を統合管理
 */

import { EthDepositDetector, DepositDetectionResult } from './eth-deposit-detector';
import { ERC20DepositDetector, ERC20DepositResult } from './erc20-deposit-detector';
import { TronDepositDetector, TronDepositResult } from './tron-deposit-detector';
import { AdaDepositDetector, AdaDepositResult } from './ada-deposit-detector';
import { BTCDepositDetector, BTCDepositResult } from './btc-deposit-detector';
import { XRPDepositDetector, XRPDepositResult } from './xrp-deposit-detector';
import { supabase } from '@/integrations/supabase/client';

export interface ChainConfig {
  chain: string;
  network: string;
  rpcUrl?: string;
  apiKey?: string;
  minConfirmations: number;
  enabled: boolean;
  scanIntervalMs: number;
}

type DepositDetector = EthDepositDetector | ERC20DepositDetector | TronDepositDetector | AdaDepositDetector | BTCDepositDetector | XRPDepositDetector;

export interface UnifiedDepositResult {
  chain: string;
  network: string;
  userId: string;
  tokenAddress: string;
  tokenSymbol: string;
  depositAddress: string;
  amount: string;
  transactionHash: string;
  blockNumber?: number;
  blockHeight?: number;
  timestamp?: number;
  confirmations: number;
}

export class DepositDetectionManager {
  private detectors: Map<string, DepositDetector> = new Map();
  private isRunning: boolean = false;
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializeDetectors();
  }

  /**
   * 環境変数から検知器を初期化
   */
  private async initializeDetectors(): Promise<void> {
    const configs = await this.getChainConfigs();

    for (const config of configs) {
      const key = `${config.chain}-${config.network}`;
      
      try {
        switch (config.chain) {
          case 'evm':
            if (config.rpcUrl) {
              // ETHネイティブ検知器
              this.detectors.set(`${key}-eth`, new EthDepositDetector(
                config.rpcUrl,
                config.network as 'mainnet' | 'sepolia',
                config.minConfirmations
              ));
              
              // ERC-20検知器
              this.detectors.set(`${key}-erc20`, new ERC20DepositDetector(
                config.rpcUrl,
                config.network as 'mainnet' | 'sepolia',
                config.minConfirmations
              ));
            }
            break;
            
          case 'trc':
            if (config.apiKey) {
              this.detectors.set(key, new TronDepositDetector(
                config.apiKey,
                config.network as 'mainnet' | 'shasta' | 'nile',
                config.minConfirmations
              ));
            }
            break;
            
          case 'cardano':
            if (config.apiKey) {
              this.detectors.set(key, new AdaDepositDetector(
                config.apiKey,
                config.network as 'mainnet' | 'testnet',
                config.minConfirmations
              ));
            }
            break;
            
          case 'bitcoin':
            if (config.rpcUrl && config.apiKey) {
              // apiKeyをusername:password形式で解析
              const [username, password] = config.apiKey.split(':');
              this.detectors.set(key, new BTCDepositDetector(
                config.rpcUrl,
                username,
                password,
                config.network as 'mainnet' | 'testnet',
                config.minConfirmations
              ));
            }
            break;
            
          case 'xrp':
            this.detectors.set(key, new XRPDepositDetector(
              config.network as 'mainnet' | 'testnet'
            ));
            break;
        }
      } catch (error) {
        console.error(`Failed to initialize detector for ${key}:`, error);
      }
    }
  }

  /**
   * チェーン設定を取得
   */
  private async getChainConfigs(): Promise<ChainConfig[]> {
    const configs: ChainConfig[] = [];

    // EVMチェーン設定
    const ethRpcUrl = import.meta.env.VITE_ETHEREUM_RPC_URL || import.meta.env.VITE_SEPOLIA_RPC_URL;
    if (ethRpcUrl) {
      const network = ethRpcUrl.includes('sepolia') ? 'sepolia' : 'mainnet';
      configs.push({
        chain: 'evm',
        network,
        rpcUrl: ethRpcUrl,
        minConfirmations: parseInt(import.meta.env.VITE_ETH_MIN_CONFIRMATIONS) || 12,
        enabled: true,
        scanIntervalMs: parseInt(import.meta.env.VITE_ETH_SCAN_INTERVAL_MS) || 30000
      });
    }

    // TRONチェーン設定
    const tronApiKey = import.meta.env.VITE_TRONGRID_API_KEY;
    if (tronApiKey) {
      configs.push({
        chain: 'trc',
        network: import.meta.env.VITE_TRON_NETWORK || 'mainnet',
        apiKey: tronApiKey,
        minConfirmations: parseInt(import.meta.env.VITE_TRON_MIN_CONFIRMATIONS) || 19,
        enabled: true,
        scanIntervalMs: parseInt(import.meta.env.VITE_TRON_SCAN_INTERVAL_MS) || 30000
      });
    }

    // Cardanoチェーン設定
    const adaApiKey = import.meta.env.VITE_BLOCKFROST_API_KEY;
    if (adaApiKey) {
      configs.push({
        chain: 'cardano',
        network: import.meta.env.VITE_ADA_NETWORK || 'mainnet',
        apiKey: adaApiKey,
        minConfirmations: parseInt(import.meta.env.VITE_ADA_MIN_CONFIRMATIONS) || 15,
        enabled: true,
        scanIntervalMs: parseInt(import.meta.env.VITE_ADA_SCAN_INTERVAL_MS) || 60000
      });
    }

    // Bitcoinチェーン設定
    const btcRpcUrl = import.meta.env.VITE_BITCOIN_RPC_URL;
    const btcAuth = import.meta.env.VITE_BITCOIN_RPC_AUTH; // username:password形式
    if (btcRpcUrl && btcAuth) {
      configs.push({
        chain: 'bitcoin',
        network: import.meta.env.VITE_BITCOIN_NETWORK || 'mainnet',
        rpcUrl: btcRpcUrl,
        apiKey: btcAuth,
        minConfirmations: parseInt(import.meta.env.VITE_BITCOIN_MIN_CONFIRMATIONS) || 6,
        enabled: true,
        scanIntervalMs: parseInt(import.meta.env.VITE_BITCOIN_SCAN_INTERVAL_MS) || 60000
      });
    }

    // XRPチェーン設定
    const xrpNetwork = import.meta.env.VITE_XRP_NETWORK || 'mainnet';
    configs.push({
      chain: 'xrp',
      network: xrpNetwork,
      minConfirmations: 1, // XRPは即時確認
      enabled: true,
      scanIntervalMs: parseInt(import.meta.env.VITE_XRP_SCAN_INTERVAL_MS) || 30000
    });

    return configs;
  }

  /**
   * 単一チェーンの入金をスキャン
   */
  private async scanChainDeposits(chain: string, network: string): Promise<UnifiedDepositResult[]> {
    const key = `${chain}-${network}`;
    const results: UnifiedDepositResult[] = [];

    try {
      switch (chain) {
        case 'evm': {
          // ETHネイティブ
          const ethDetector = this.detectors.get(`${key}-eth`) as EthDepositDetector;
          if (ethDetector) {
            const ethResults = await ethDetector.scanLatestDeposits();
            results.push(...ethResults.map(r => ({
              chain,
              network,
              userId: r.userId,
              tokenAddress: '',
              tokenSymbol: 'ETH',
              depositAddress: r.depositAddress,
              amount: r.amount,
              transactionHash: r.transactionHash,
              blockNumber: r.blockNumber,
              confirmations: r.confirmations
            })));
          }
          
          // ERC-20トークン
          const erc20Detector = this.detectors.get(`${key}-erc20`) as ERC20DepositDetector;
          if (erc20Detector) {
            const erc20Results = await erc20Detector.scanAllTokenDeposits();
            results.push(...erc20Results.map(r => ({
              chain,
              network,
              userId: r.userId,
              tokenAddress: r.tokenAddress,
              tokenSymbol: r.tokenSymbol,
              depositAddress: r.depositAddress,
              amount: r.amount,
              transactionHash: r.transactionHash,
              blockNumber: r.blockNumber,
              confirmations: r.confirmations
            })));
          }
          break;
        }
          
        case 'trc': {
          const tronDetector = this.detectors.get(key) as TronDepositDetector;
          if (tronDetector) {
            const tronResults = await tronDetector.scanAllDeposits();
            results.push(...tronResults.map(r => ({
              chain,
              network,
              userId: r.userId,
              tokenAddress: r.tokenAddress,
              tokenSymbol: r.tokenSymbol,
              depositAddress: r.depositAddress,
              amount: r.amount,
              transactionHash: r.transactionHash,
              timestamp: r.timestamp,
              confirmations: 0 // TRONは確認数計算が異なる
            })));
          }
          break;
        }
          
        case 'cardano': {
          const adaDetector = this.detectors.get(key) as AdaDepositDetector;
          if (adaDetector) {
            const adaResults = await adaDetector.scanAllDeposits();
            results.push(...adaResults.map(r => ({
              chain,
              network,
              userId: r.userId,
              tokenAddress: r.tokenAddress,
              tokenSymbol: r.tokenSymbol,
              depositAddress: r.depositAddress,
              amount: r.amount,
              transactionHash: r.transactionHash,
              blockHeight: r.blockHeight,
              timestamp: r.blockTime,
              confirmations: 0 // ADAは確認数計算が異なる
            })));
          }
          break;
        }
          
        case 'bitcoin': {
          const btcDetector = this.detectors.get(key) as BTCDepositDetector;
          if (btcDetector) {
            const btcResults = await btcDetector.scanForDeposits();
            results.push(...btcResults.map(r => ({
              chain,
              network,
              userId: r.userId,
              tokenAddress: '',
              tokenSymbol: 'BTC',
              depositAddress: r.depositAddress,
              amount: r.amount,
              transactionHash: r.transactionHash,
              blockHeight: r.blockHeight,
              timestamp: r.timestamp,
              confirmations: r.confirmations
            })));
          }
          break;
        }
          
        case 'xrp': {
          const xrpDetector = this.detectors.get(key) as XRPDepositDetector;
          if (xrpDetector) {
            const xrpResults = await xrpDetector.scanForDeposits();
            results.push(...xrpResults.map(r => ({
              chain,
              network,
              userId: r.userId,
              tokenAddress: '',
              tokenSymbol: 'XRP',
              depositAddress: r.depositAddress,
              amount: r.amount,
              transactionHash: r.transactionHash,
              blockNumber: r.ledgerIndex,
              timestamp: r.timestamp,
              confirmations: 1 // XRPは即時確認
            })));
          }
          break;
        }
      }
    } catch (error) {
      console.error(`Error scanning ${chain}-${network} deposits:`, error);
      
      // エラーログをDBに記録
      await this.logScanError(chain, network, error);
    }

    return results;
  }

  /**
   * スキャンエラーをログに記録
   */
  private async logScanError(chain: string, network: string, error: Error | unknown): Promise<void> {
    try {
      await supabase.from('audit_logs').insert({
        action: 'scan_error',
        entity_type: 'deposits',
        resource: 'deposit_detection',
        details: {
          chain,
          network,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    } catch (logError) {
      console.error('Failed to log scan error:', logError);
    }
  }

  /**
   * 全チェーンの入金検知を開始
   */
  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    const configs = await this.getChainConfigs();
    
    for (const config of configs.filter(c => c.enabled)) {
      const key = `${config.chain}-${config.network}`;
      
      const interval = setInterval(async () => {
        if (!this.isRunning) return;

        await this.scanChainDeposits(config.chain, config.network);
      }, config.scanIntervalMs);

      this.intervals.set(key, interval);
    }
  }

  /**
   * 入金検知監視を停止
   */
  stopMonitoring(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // すべてのインターバルをクリア
    for (const [, interval] of this.intervals.entries()) {
      clearInterval(interval);
    }

    this.intervals.clear();
  }

  /**
   * 手動で全チェーンをスキャン
   */
  async scanAllChains(): Promise<UnifiedDepositResult[]> {
    const configs = await this.getChainConfigs();
    const allResults: UnifiedDepositResult[] = [];

    for (const config of configs.filter(c => c.enabled)) {
      const results = await this.scanChainDeposits(config.chain, config.network);
      allResults.push(...results);
    }

    return allResults;
  }

  /**
   * 検知器の状態を取得
   */
  getStatus(): { 
    isRunning: boolean; 
    activeChains: string[]; 
    detectors: string[] 
  } {
    return {
      isRunning: this.isRunning,
      activeChains: Array.from(this.intervals.keys()),
      detectors: Array.from(this.detectors.keys())
    };
  }

  /**
   * リソースをクリーンアップ
   */
  destroy(): void {
    this.stopMonitoring();
    this.detectors.clear();
  }
}
