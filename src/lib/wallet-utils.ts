/**
 * 個別ウォレットアドレス生成ユーティリティ
 * P1: EVM入金機能（個別アドレス生成）
 */

// 疑似的なウォレット生成（本番環境では ethers.js 等のライブラリを使用）
export interface WalletKeyPair {
  address: string;
  privateKey: string;
  derivationPath?: string;
}

export interface SupportedCurrency {
  currency: string;
  networks: string[];
  addressPrefix?: string;
}

// サポートされている通貨・ネットワーク定義
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { 
    currency: "USDT", 
    networks: ["ERC20", "TRC20", "BEP20", "Polygon"],
    addressPrefix: "0x"
  },
  { 
    currency: "BTC", 
    networks: ["Bitcoin"],
    addressPrefix: "bc1"
  },
  { 
    currency: "ETH", 
    networks: ["ERC20"],
    addressPrefix: "0x"
  },
  { 
    currency: "BNB", 
    networks: ["BEP20", "BEP2"],
    addressPrefix: "0x"
  },
  { 
    currency: "SOL", 
    networks: ["Solana"]
  },
  { 
    currency: "XRP", 
    networks: ["XRP Ledger"],
    addressPrefix: "r"
  },
  { 
    currency: "ADA", 
    networks: ["Cardano"],
    addressPrefix: "addr1"
  }
];

/**
 * 簡単な暗号化（本番環境では適切な暗号化ライブラリを使用）
 */
function simpleEncrypt(text: string, key: string): string {
  // 開発環境用の簡易暗号化（実際にはAES等を使用すべき）
  const combined = text + key;
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
 * 疑似的なランダムアドレス生成
 * 本番環境では ethers.js, web3.js, bitcoinjs-lib 等を使用
 */
export function generateWalletAddress(
  userId: string, 
  currency: string, 
  network: string
): WalletKeyPair {
  const seed = `${userId}-${currency}-${network}-${Date.now()}`;
  
  // 疑似的なハッシュ生成（実際にはcrypto.randomBytes等を使用）
  const hash = btoa(seed).replace(/[^a-zA-Z0-9]/g, '');
  const addressSuffix = hash.substring(0, 32).toLowerCase();
  const privateKeySuffix = hash.substring(10, 42).toLowerCase();
  
  const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.currency === currency);
  const prefix = currencyConfig?.addressPrefix || "0x";
  
  let address: string;
  let privateKey: string;
  
  switch (network) {
    case "ERC20":
    case "BEP20":
    case "Polygon":
      address = `0x${addressSuffix}`;
      privateKey = `0x${privateKeySuffix}${'0'.repeat(64 - privateKeySuffix.length)}`;
      break;
    
    case "Bitcoin":
      address = `bc1q${addressSuffix}`;
      privateKey = `KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn`;
      break;
    
    case "TRC20":
      address = `T${addressSuffix.substring(0, 33)}`;
      privateKey = `${privateKeySuffix}${'0'.repeat(64 - privateKeySuffix.length)}`;
      break;
    
    case "Solana":
      address = addressSuffix.substring(0, 44);
      privateKey = `${privateKeySuffix}${'0'.repeat(88 - privateKeySuffix.length)}`;
      break;
    
    case "XRP Ledger":
      address = `r${addressSuffix.substring(0, 33)}`;
      privateKey = `s${privateKeySuffix}`;
      break;
    
    case "Cardano":
      address = `addr1q${addressSuffix}`;
      privateKey = `ed25519_sk1${privateKeySuffix}`;
      break;
    
    default:
      address = `${prefix}${addressSuffix}`;
      privateKey = privateKeySuffix;
  }
  
  // HD Wallet風の導出パス生成
  const derivationPath = `m/44'/${getCoinType(currency)}'/${Math.floor(Math.random() * 100)}'/0/0`;
  
  return {
    address,
    privateKey,
    derivationPath
  };
}

/**
 * 通貨コードからCoin Typeを取得（BIP-44準拠）
 */
function getCoinType(currency: string): number {
  const coinTypes: Record<string, number> = {
    'BTC': 0,
    'ETH': 60,
    'USDT': 60, // ETH系として扱う
    'BNB': 714,
    'SOL': 501,
    'XRP': 144,
    'ADA': 1815
  };
  
  return coinTypes[currency] || 60; // デフォルトはETH系
}

/**
 * 秘密鍵を暗号化して保存用形式に変換
 */
export function encryptPrivateKey(privateKey: string): string {
  // 本番環境では適切な暗号化キーを環境変数から取得
  const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("WALLET_ENCRYPTION_KEY環境変数が設定されていません。セキュリティ上必須です。");
  }
  return simpleEncrypt(privateKey, encryptionKey);
}

/**
 * 通貨とネットワークの組み合わせが有効かチェック
 */
export function isValidCurrencyNetwork(currency: string, network: string): boolean {
  const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.currency === currency);
  return currencyConfig ? currencyConfig.networks.includes(network) : false;
}

/**
 * 指定通貨で利用可能なネットワーク一覧を取得
 */
export function getAvailableNetworks(currency: string): string[] {
  const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.currency === currency);
  return currencyConfig ? currencyConfig.networks : [];
}

/**
 * アドレス形式の基本的なバリデーション
 */
export function validateAddress(address: string, currency: string, network: string): boolean {
  if (!address || address.length < 10) return false;
  
  const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.currency === currency);
  if (!currencyConfig) return false;
  
  switch (network) {
    case "ERC20":
    case "BEP20":
    case "Polygon":
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    
    case "Bitcoin":
      return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
    
    case "TRC20":
      return /^T[a-zA-Z0-9]{33}$/.test(address);
    
    case "Solana":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    
    case "XRP Ledger":
      return /^r[a-zA-Z0-9]{24,34}$/.test(address);
    
    case "Cardano":
      return /^addr1[a-z0-9]{58}$/.test(address);
    
    default:
      return true; // 未知のネットワークは通す
  }
}