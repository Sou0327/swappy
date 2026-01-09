import { sha256, hashTo32BitInt, randomHex } from './crypto-utils';

// BIP44 derivation path for Bitcoin
// m/44'/0'/0'/0/address_index (mainnet)
// m/44'/1'/0'/0/address_index (testnet)

export interface BTCWalletKeyPair {
  address: string;
  derivationPath: string;
  addressIndex: number;
  xpub?: string;
}

export interface BTCNetworkConfig {
  name: string;
  coinType: number;
  addressPrefix: number;
  scriptPrefix: number;
  wif: number;
  bech32: string;
}

// Bitcoin network configurations
export const BTC_NETWORKS: Record<string, BTCNetworkConfig> = {
  mainnet: {
    name: 'Bitcoin Mainnet',
    coinType: 0,
    addressPrefix: 0x00,
    scriptPrefix: 0x05,
    wif: 0x80,
    bech32: 'bc'
  },
  testnet: {
    name: 'Bitcoin Testnet',
    coinType: 1,
    addressPrefix: 0x6f,
    scriptPrefix: 0xc4,
    wif: 0xef,
    bech32: 'tb'
  }
};

/**
 * ユーザーIDとアセットからアドレスインデックスを生成
 * 暗号学的ハッシュを使用して衝突を回避
 */
export function generateBTCAddressIndex(userId: string, asset: string = 'BTC'): number {
  // タイムスタンプとランダム要素を追加して一意性を確保
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  const combined = `${userId}-${asset}-btc-${timestamp}-${random}`;

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
 * BIP44 derivation pathを生成
 */
export function generateBTCDerivationPath(
  network: 'mainnet' | 'testnet',
  account: number = 0,
  addressIndex: number
): string {
  const networkConfig = BTC_NETWORKS[network];
  return `m/44'/${networkConfig.coinType}'/${account}'/0/${addressIndex}`;
}

/**
 * 簡易Base58エンコード（モック版）
 */
function simpleBase58Encode(hexString: string): string {
  // 簡易版: 実際のプロダクションではbitcoinjs-libを使用
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < hexString.length; i += 2) {
    const byte = parseInt(hexString.substr(i, 2), 16);
    result += alphabet[byte % 58];
  }
  return result;
}


/**
 * Bitcoin addressを生成（P2PKH形式）
 * 注意: これは簡易実装です。本番環境では bitcoinjs-lib を使用してください
 */
function createBTCAddressFromPublicKey(
  publicKey: string,
  network: 'mainnet' | 'testnet'
): string {
  const networkConfig = BTC_NETWORKS[network];
  
  // 簡易版アドレス生成（モック）
  const addressHash = sha256(`${networkConfig.addressPrefix}-${publicKey}`);
  const addressHex = addressHash.slice(0, 40);
  
  // ネットワークプレフィックスを追加
  const prefix = network === 'mainnet' ? '1' : 'm';
  return prefix + simpleBase58Encode(addressHex);
}

/**
 * 簡易的な公開鍵生成（実際は秘密鍵から導出）
 * 注意: これはモックです。本番環境では適切なBIP32/BIP44実装を使用してください
 */
export function generateMockPublicKey(derivationPath: string): string {
  const hash = sha256(derivationPath);
  // 33バイトの圧縮公開鍵として扱う（0x02 or 0x03 プレフィックス）
  const prefix = hashTo32BitInt(derivationPath) % 2 === 0 ? '02' : '03';
  return prefix + hash.slice(0, 64);
}

/**
 * BTCアドレス生成のメイン関数
 */
export function generateBTCAddress(
  userId: string,
  network: 'mainnet' | 'testnet',
  asset: string = 'BTC'
): BTCWalletKeyPair {
  const addressIndex = generateBTCAddressIndex(userId, asset);
  const derivationPath = generateBTCDerivationPath(network, 0, addressIndex);
  
  // 本番環境では、マスターキーからBIP32/BIP44で実際の鍵を導出
  const publicKey = generateMockPublicKey(derivationPath);
  const address = createBTCAddressFromPublicKey(publicKey, network);
  
  return {
    address,
    derivationPath,
    addressIndex
  };
}

/**
 * xpubからアドレスを導出（簡易版）
 * 注意: これはモック実装です。本番環境では bitcoinjs-lib を使用してください
 */
export function deriveAddressFromXpub(
  xpub: string,
  addressIndex: number,
  network: 'mainnet' | 'testnet'
): string {
  // xpubの妥当性をチェック（簡易）
  if (!xpub.startsWith('xpub') && !xpub.startsWith('tpub')) {
    throw new Error('Invalid xpub format');
  }
  
  // 実際の実装では、xpubから子鍵を導出してアドレスを生成
  // ここではモックとして、xpub+addressIndexのハッシュから生成
  const derivationData = `${xpub}-${addressIndex}`;
  const hash = sha256(derivationData);
  
  // 簡易的な公開鍵を生成してアドレスに変換
  const prefix = hashTo32BitInt(derivationData) % 2 === 0 ? '02' : '03';
  const publicKey = prefix + hash.slice(0, 64);
  
  return createBTCAddressFromPublicKey(publicKey, network);
}

/**
 * BTCアドレスの妥当性をチェック
 */
export function validateBTCAddress(address: string, network: 'mainnet' | 'testnet'): boolean {
  try {
    // 基本的な形式チェック
    if (!address || address.length < 26 || address.length > 35) {
      return false;
    }
    
    // Base58文字チェック
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    if (!base58Regex.test(address)) {
      return false;
    }
    
    // ネットワーク固有のプレフィックスチェック
    if (network === 'mainnet') {
      return address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1');
    } else {
      return address.startsWith('m') || address.startsWith('n') || address.startsWith('2') || address.startsWith('tb1');
    }
  } catch (error) {
    return false;
  }
}

/**
 * BTC transaction feeを推定
 */
export function estimateBTCTransactionFee(
  inputCount: number,
  outputCount: number,
  feeRate: number = 20 // sat/vB
): number {
  // 簡易的なfee計算（実際はより複雑）
  const txSize = inputCount * 148 + outputCount * 34 + 10; // バイト
  return txSize * feeRate;
}

/**
 * 開発用のモックxpub生成
 */
export function generateMockXpub(network: 'mainnet' | 'testnet'): string {
  const prefix = network === 'mainnet' ? 'xpub' : 'tpub';
  const randomData = randomHex(148); // xpubのデータ部分
  return prefix + simpleBase58Encode(randomData);
}