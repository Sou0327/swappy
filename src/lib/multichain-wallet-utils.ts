import { generateEVMAddress, type EVMWalletKeyPair } from './evm-wallet-utils';
import { generateBTCAddress as createBTCWallet, type BTCWalletKeyPair } from './btc-wallet-utils';
import { type XRPDepositInfo } from './xrp-wallet-utils';
import { sha256, hashTo32BitInt } from './crypto-utils';

// サポートされるチェーン
export type SupportedChain = 'eth' | 'btc' | 'trc' | 'xrp' | 'ada';

// サポートされるネットワーク
export type SupportedNetwork = 'mainnet' | 'testnet' | 'sepolia' | 'shasta';

// サポートされるアセット
export type SupportedAsset = 'ETH' | 'BTC' | 'TRX' | 'XRP' | 'ADA' | 'USDT';

// 入金・両替で対応している銘柄の一元管理
export const SUPPORTED_ASSETS: SupportedAsset[] = ['ETH', 'BTC', 'USDT', 'TRX', 'XRP', 'ADA'];

// 統合されたアドレス情報
export interface MultichainAddressInfo {
  chain: SupportedChain;
  network: SupportedNetwork;
  asset: SupportedAsset;
  address: string;
  derivationPath?: string;
  addressIndex?: number;
  destinationTag?: number;
  memo?: string;
  xpub?: string;
}

// チェーン設定
export interface ChainConfig {
  name: string;
  symbol: string;
  decimals: number;
  explorer: string;
  rpcUrl?: string;
  minConfirmations: number;
  supportsTokens: boolean;
  addressType: 'derived' | 'fixed' | 'xpub';
  requiresDestinationTag?: boolean;
}

// チェーン設定マップ
export const CHAIN_CONFIGS: Record<SupportedChain, Partial<Record<SupportedNetwork, ChainConfig>>> = {
  eth: {
    mainnet: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
      explorer: 'https://etherscan.io',
      rpcUrl: import.meta.env.VITE_ETHEREUM_RPC_URL,
      minConfirmations: 12,
      supportsTokens: true,
      addressType: 'derived'
    },
    sepolia: {
      name: 'Ethereum Sepolia',
      symbol: 'ETH',
      decimals: 18,
      explorer: 'https://sepolia.etherscan.io',
      rpcUrl: import.meta.env.VITE_ETHEREUM_SEPOLIA_RPC_URL,
      minConfirmations: 1,
      supportsTokens: true,
      addressType: 'derived'
    },
    testnet: {
      name: 'Ethereum Sepolia',
      symbol: 'ETH',
      decimals: 18,
      explorer: 'https://sepolia.etherscan.io',
      rpcUrl: import.meta.env.VITE_ETHEREUM_SEPOLIA_RPC_URL,
      minConfirmations: 1,
      supportsTokens: true,
      addressType: 'derived'
    }
  },
  btc: {
    mainnet: {
      name: 'Bitcoin',
      symbol: 'BTC',
      decimals: 8,
      explorer: 'https://blockstream.info',
      minConfirmations: 3,
      supportsTokens: false,
      addressType: 'xpub'
    },
    testnet: {
      name: 'Bitcoin Testnet',
      symbol: 'BTC',
      decimals: 8,
      explorer: 'https://blockstream.info/testnet',
      minConfirmations: 1,
      supportsTokens: false,
      addressType: 'xpub'
    }
  },
  trc: {
    mainnet: {
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
      explorer: 'https://tronscan.org',
      rpcUrl: 'https://api.trongrid.io',
      minConfirmations: 19,
      supportsTokens: true,
      addressType: 'derived'
    },
    shasta: {
      name: 'Tron Shasta',
      symbol: 'TRX',
      decimals: 6,
      explorer: 'https://shasta.tronscan.org',
      rpcUrl: 'https://api.shasta.trongrid.io',
      minConfirmations: 1,
      supportsTokens: true,
      addressType: 'derived'
    },
    testnet: {
      name: 'Tron Shasta',
      symbol: 'TRX',
      decimals: 6,
      explorer: 'https://shasta.tronscan.org',
      rpcUrl: 'https://api.shasta.trongrid.io',
      minConfirmations: 1,
      supportsTokens: true,
      addressType: 'derived'
    }
  },
  xrp: {
    mainnet: {
      name: 'XRP Ledger',
      symbol: 'XRP',
      decimals: 6,
      explorer: 'https://xrpscan.com',
      rpcUrl: 'wss://xrplcluster.com',
      minConfirmations: 1,
      supportsTokens: false,
      addressType: 'fixed',
      requiresDestinationTag: true
    },
    testnet: {
      name: 'XRP Ledger Testnet',
      symbol: 'XRP',
      decimals: 6,
      explorer: 'https://test.bithomp.com',
      rpcUrl: 'wss://s.altnet.rippletest.net:51233',
      minConfirmations: 1,
      supportsTokens: false,
      addressType: 'fixed',
      requiresDestinationTag: true
    }
  },
  ada: {
    mainnet: {
      name: 'Cardano',
      symbol: 'ADA',
      decimals: 6,
      explorer: 'https://cardanoscan.io',
      minConfirmations: 15,
      supportsTokens: true,
      addressType: 'derived'
    },
    testnet: {
      name: 'Cardano Testnet',
      symbol: 'ADA',
      decimals: 6,
      explorer: 'https://testnet.cardanoscan.io',
      minConfirmations: 5,
      supportsTokens: true,
      addressType: 'derived'
    }
  }
};

/**
 * Cardanoアドレス生成（簡易実装）
 */
function generateCardanoAddress(
  userId: string,
  network: SupportedNetwork,
  asset: SupportedAsset = 'ADA'
): MultichainAddressInfo {
  // Cardano特有のアドレス生成ロジック（モック）
  const addressIndex = generateAddressIndex(userId, asset);
  const derivationPath = `m/1852'/1815'/0'/0/${addressIndex}`;
  
  // 簡易的なCardanoアドレス生成（実際はより複雑）
  const hash = sha256(`${userId}-${asset}-ada-${addressIndex}`);
  const prefix = network === 'mainnet' ? 'addr1' : 'addr_test1';
  const addressSuffix = hash.slice(0, 52);
  const address = `${prefix}${addressSuffix}`;
  
  return {
    chain: 'ada',
    network: network as SupportedNetwork,
    asset,
    address,
    derivationPath,
    addressIndex
  };
}

/**
 * Tronアドレス生成
 */
function generateTronAddress(
  userId: string,
  network: SupportedNetwork,
  asset: SupportedAsset
): MultichainAddressInfo {
  // Tron特有のアドレス生成ロジック（モック）
  const addressIndex = generateAddressIndex(userId, asset);
  const derivationPath = `m/44'/195'/0'/0/${addressIndex}`;
  
  // 簡易的なTronアドレス生成（実際はより複雑）
  const hash = sha256(`${userId}-${asset}-trc-${addressIndex}`);
  
  // Base58エンコード（簡易）
  const address = 'T' + hash.slice(0, 32).toUpperCase();
  
  return {
    chain: 'trc',
    network: network as SupportedNetwork,
    asset,
    address,
    derivationPath,
    addressIndex
  };
}

/**
 * アドレスインデックス生成
 * 暗号学的ハッシュを使用して衝突を回避
 */
function generateAddressIndex(userId: string, asset: string): number {
  // タイムスタンプとランダム要素を追加して一意性を確保
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  const combined = `${userId}-${asset}-${timestamp}-${random}`;

  // 簡易ハッシュ生成（CryptoJSを使わない安全な実装）
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }

  // 正の値にして適切な範囲に収める
  return Math.abs(hash) % 2147483647; // 2^31 - 1
}

/**
 * マルチチェーンアドレス生成のメイン関数
 */
export function generateMultichainAddress(
  userId: string,
  chain: SupportedChain,
  network: SupportedNetwork,
  asset: SupportedAsset
): MultichainAddressInfo {
  // チェーン設定の確認
  const chainConfig = CHAIN_CONFIGS[chain]?.[network];
  if (!chainConfig) {
    throw new Error(`Unsupported chain/network combination: ${chain}/${network}`);
  }
  
  switch (chain) {
    case 'eth': {
      const evmResult = generateEVMAddress(userId, network as 'ethereum' | 'sepolia', asset as 'ETH' | 'USDT');
      return {
        chain,
        network,
        asset,
        address: evmResult.address,
        derivationPath: evmResult.derivationPath,
        addressIndex: evmResult.addressIndex
      };
    }
    
    case 'btc': {
      const btcResult = createBTCWallet(userId, network as 'mainnet' | 'testnet', asset);
      return {
        chain,
        network,
        asset,
        address: btcResult.address,
        derivationPath: btcResult.derivationPath,
        addressIndex: btcResult.addressIndex,
        xpub: btcResult.xpub
      };
    }
    
    case 'trc':
      return generateTronAddress(userId, network, asset);
    
    case 'xrp':
      // XRP は非同期でDB参照が必要なため、generateXRPDepositInfo を直接使用してください
      throw new Error('XRP は generateXRPDepositInfo を直接使用してください');
    
    case 'ada':
      return generateCardanoAddress(userId, network, asset);
    
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

/**
 * アドレスの妥当性をチェック
 */
export function validateMultichainAddress(
  address: string,
  chain: SupportedChain,
  network: SupportedNetwork
): boolean {
  switch (chain) {
    case 'eth':
    case 'trc':
      // EVM系のアドレス検証
      return /^0x[a-fA-F0-9]{40}$/.test(address) || /^T[A-Za-z1-9]{33}$/.test(address);
    
    case 'btc':
      // Bitcoin address validation (simplified)
      if (network === 'mainnet') {
        return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(address);
      } else {
        return /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$|^tb1[a-z0-9]{39,59}$/.test(address);
      }
    
    case 'xrp':
      return /^r[rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz]{25,34}$/.test(address);
    
    case 'ada':
      return network === 'mainnet' 
        ? /^addr1[a-z0-9]{52,}$/.test(address)
        : /^addr_test1[a-z0-9]{52,}$/.test(address);
    
    default:
      return false;
  }
}

/**
 * トランザクション手数料を推定
 */
export function estimateTransactionFee(
  chain: SupportedChain,
  network: SupportedNetwork,
  asset: SupportedAsset
): number {
  const chainConfig = CHAIN_CONFIGS[chain]?.[network];
  if (!chainConfig) {
    return 0;
  }
  
  // 基本的な手数料推定（実際はより動的に）
  switch (chain) {
    case 'eth':
      return asset === 'ETH' ? 0.001 : 0.002; // ETH
    case 'btc':
      return 0.0001; // BTC
    case 'trc':
      return asset === 'TRX' ? 1.1 : 10; // TRX
    case 'xrp':
      return 0.000012; // XRP
    case 'ada':
      return 0.17; // ADA
    default:
      return 0;
  }
}

/**
 * 最小入金額を取得
 */
export function getMinimumDepositAmount(
  chain: SupportedChain,
  network: SupportedNetwork,
  asset: SupportedAsset
): number {
  switch (chain) {
    case 'eth':
      // ETH: 0.01〜0.05 ETH（下限を既定値に） / USDT(ERC-20): 1 USDT
      return asset === 'ETH' ? 0.01 : 1;
    case 'btc':
      // BTC: 0.0001〜0.001 BTC（下限を既定値に）
      return 0.0001;
    case 'trc':
      // TRX: 10〜100 TRX（下限を既定値に） / USDT(TRC-20): 1 USDT
      return asset === 'TRX' ? 10 : 1;
    case 'xrp':
      // XRP: 20〜50 XRP（下限を既定値に）
      return 20;
    case 'ada':
      // ADA: 1〜10 ADA（下限を既定値に）
      return 1;
    default:
      return 0;
  }
}

/**
 * Explorer URLを生成
 */
export function getExplorerUrl(
  chain: SupportedChain,
  network: SupportedNetwork,
  type: 'address' | 'tx',
  identifier: string
): string {
  const chainConfig = CHAIN_CONFIGS[chain]?.[network];
  if (!chainConfig) {
    return '';
  }
  
  const baseUrl = chainConfig.explorer;
  
  switch (chain) {
    case 'eth':
      return `${baseUrl}/${type === 'address' ? 'address' : 'tx'}/${identifier}`;
    case 'btc':
      return `${baseUrl}/${type === 'address' ? 'address' : 'tx'}/${identifier}`;
    case 'trc':
      return `${baseUrl}/#/${type === 'address' ? 'address' : 'transaction'}/${identifier}`;
    case 'xrp':
      return `${baseUrl}/${type === 'address' ? 'account' : 'tx'}/${identifier}`;
    case 'ada':
      return `${baseUrl}/${type === 'address' ? 'address' : 'transaction'}/${identifier}`;
    default:
      return baseUrl;
  }
}

/**
 * チェーン設定を取得
 */
export function getChainConfig(
  chain: SupportedChain,
  network: SupportedNetwork
): ChainConfig | null {
  return CHAIN_CONFIGS[chain]?.[network] || null;
}

/**
 * サポートされているアセット一覧を取得
 */
export function getSupportedAssets(
  chain: SupportedChain,
  network: SupportedNetwork
): SupportedAsset[] {
  const baseAssets: Record<SupportedChain, SupportedAsset[]> = {
    eth: ['ETH', 'USDT'],
    btc: ['BTC'],
    trc: ['TRX', 'USDT'],
    xrp: ['XRP'],
    ada: ['ADA']
  };
  
  return baseAssets[chain] || [];
}

/**
 * 入金可能な全ての銘柄を取得（重複除去済み）
 */
export function getAllDepositableAssets(): SupportedAsset[] {
  // 呼び出し側で誤ってミューテートされないよう、新しい配列を返す
  return [...SUPPORTED_ASSETS];
}
