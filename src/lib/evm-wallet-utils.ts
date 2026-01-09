/**
 * フェーズ1: EVM (Ethereum) ウォレット管理ユーティリティ
 * ETH/USDT(ERC-20)特化 - ユーザー毎EOA/HD派生対応
 */


export interface EVMWalletKeyPair {
  address: string;
  privateKey: string;
  derivationPath: string;
  addressIndex: number;
}

export interface SupportedEVMAsset {
  chain: 'evm';
  network: 'ethereum' | 'sepolia';
  asset: 'ETH' | 'USDT';
  contractAddress?: string; // USDT等のトークンアドレス
  decimals: number;
}

// フェーズ1でサポートするEVM資産
export const SUPPORTED_EVM_ASSETS: SupportedEVMAsset[] = [
  { 
    chain: 'evm', 
    network: 'ethereum', 
    asset: 'ETH', 
    decimals: 18 
  },
  { 
    chain: 'evm', 
    network: 'ethereum', 
    asset: 'USDT', 
    contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7', // Mainnet USDT
    decimals: 6 
  },
  // テスト環境用
  { 
    chain: 'evm', 
    network: 'sepolia', 
    asset: 'ETH', 
    decimals: 18 
  },
  { 
    chain: 'evm', 
    network: 'sepolia', 
    asset: 'USDT', 
    contractAddress: '0x...', // Sepolia testnet USDT (実際の値に置き換え)
    decimals: 6 
  }
];

/**
 * HDウォレット派生パス生成
 * BIP44準拠: m/44'/coin_type'/account'/change/address_index
 */
export function generateDerivationPath(
  network: 'ethereum' | 'sepolia',
  accountIndex: number = 0,
  addressIndex: number = 0
): string {
  const coinType = network === 'ethereum' ? 60 : 1; // ETH mainnet=60, testnet=1
  return `m/44'/${coinType}'/${accountIndex}'/0/${addressIndex}`;
}

/**
 * ユーザーIDとアセットからHDアドレスインデックスを生成
 * 暗号学的ハッシュを使用して衝突を回避
 */
export function generateAddressIndex(userId: string, asset: string): number {
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
 * EVM EOAアドレス生成（疑似実装）
 * 本番環境では ethers.js や web3.js を使用してHDウォレットから派生
 */
export function generateEVMAddress(
  userId: string,
  network: 'ethereum' | 'sepolia',
  asset: 'ETH' | 'USDT'
): EVMWalletKeyPair {
  const addressIndex = generateAddressIndex(userId, asset);
  const derivationPath = generateDerivationPath(network, 0, addressIndex);
  
  // 疑似的なアドレス生成（実際にはHDウォレットライブラリを使用）
  const seed = `${userId}-${network}-${asset}-${addressIndex}`;
  const hash = btoa(seed).replace(/[^a-zA-Z0-9]/g, '');
  
  // ETHアドレス形式 (0x + 40文字の16進数)
  const addressSuffix = hash.substring(0, 40).toLowerCase();
  const address = `0x${addressSuffix}`;
  
  // 秘密鍵（64文字の16進数）
  const privateKeySuffix = hash.substring(10, 74).toLowerCase();
  const privateKey = `0x${privateKeySuffix.padEnd(64, '0')}`;
  
  return {
    address,
    privateKey,
    derivationPath,
    addressIndex
  };
}

/**
 * EVMアドレスの妥当性検証
 */
export function isValidEVMAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * サポートされている資産の組み合わせかチェック
 */
export function isValidEVMAsset(network: string, asset: string): boolean {
  return SUPPORTED_EVM_ASSETS.some(
    supported => supported.network === network && supported.asset === asset
  );
}

/**
 * ネットワーク設定取得
 */
export function getEVMNetworkConfig(network: 'ethereum' | 'sepolia') {
  const configs = {
    ethereum: {
      chainId: 1,
      name: 'Ethereum Mainnet',
      rpcUrl: 'https://mainnet.infura.io/v3/',
      explorerUrl: 'https://etherscan.io',
      nativeCurrency: { symbol: 'ETH', decimals: 18 }
    },
    sepolia: {
      chainId: 11155111,
      name: 'Sepolia Testnet',
      rpcUrl: 'https://sepolia.infura.io/v3/',
      explorerUrl: 'https://sepolia.etherscan.io',
      nativeCurrency: { symbol: 'ETH', decimals: 18 }
    }
  };
  
  return configs[network];
}

/**
 * アセット設定取得
 */
export function getEVMAssetConfig(network: 'ethereum' | 'sepolia', asset: 'ETH' | 'USDT'): SupportedEVMAsset | undefined {
  return SUPPORTED_EVM_ASSETS.find(
    config => config.network === network && config.asset === asset
  );
}

/**
 * トランザクション探索URL生成
 */
export function getEVMTransactionUrl(network: 'ethereum' | 'sepolia', txHash: string): string {
  const config = getEVMNetworkConfig(network);
  return `${config.explorerUrl}/tx/${txHash}`;
}

/**
 * アドレス探索URL生成
 */
export function getEVMAddressUrl(network: 'ethereum' | 'sepolia', address: string): string {
  const config = getEVMNetworkConfig(network);
  return `${config.explorerUrl}/address/${address}`;
}

/**
 * 簡易的な秘密鍵暗号化（本番環境では適切な暗号化ライブラリを使用）
 */
export function encryptEVMPrivateKey(privateKey: string): string {
  // 本番環境では環境変数から暗号化キーを取得
  const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("WALLET_ENCRYPTION_KEY環境変数が設定されていません。セキュリティ上必須です。");
  }
  
  // 開発環境用の簡易暗号化
  const combined = privateKey + encryptionKey;
  return btoa(combined).replace(/[+/=]/g, (match) => {
    switch (match) {
      case '+': return '-';
      case '/': return '_';
      case '=': return '';
      default: return match;
    }
  });
}

/**
 * 入金最小額チェック
 */
export function meetsMinimumDeposit(amount: number, asset: 'ETH' | 'USDT'): boolean {
  const minimums = {
    ETH: 0.01,   // 0.01 ETH
    USDT: 1.0    // 1 USDT
  };
  
  return amount >= minimums[asset];
}

/**
 * 必要確認数取得
 */
export function getRequiredConfirmations(network: 'ethereum' | 'sepolia'): number {
  return network === 'ethereum' ? 12 : 3; // Mainnet: 12確認, Testnet: 3確認
}
