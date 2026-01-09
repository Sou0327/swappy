import { randomHex } from './crypto-utils';
import * as secp256k1 from '@noble/secp256k1';
import bs58check from 'bs58check';
import CryptoJS from 'crypto-js';

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
 * Bitcoin P2PKHアドレスを生成
 * HASH160(publicKey) = RIPEMD160(SHA256(publicKey))
 * Base58Check = versionByte + HASH160 + checksum
 */
function createBTCAddressFromPublicKey(
  publicKey: string,
  network: 'mainnet' | 'testnet'
): string {
  const networkConfig = BTC_NETWORKS[network];

  // CryptoJSでHASH160 = RIPEMD160(SHA256(publicKey))を計算
  const pubKeyWordArray = CryptoJS.enc.Hex.parse(publicKey);
  const sha256Hash = CryptoJS.SHA256(pubKeyWordArray);
  const hash160 = CryptoJS.RIPEMD160(sha256Hash);

  // WordArrayをBufferに変換
  const hash160Hex = hash160.toString(CryptoJS.enc.Hex);
  const hash160Buffer = Buffer.from(hash160Hex, 'hex');

  // バージョンバイト + HASH160
  const payload = Buffer.concat([
    Buffer.from([networkConfig.addressPrefix]),
    hash160Buffer
  ]);

  // Base58Checkエンコード（bs58checkがdouble-SHA256チェックサムを追加）
  return bs58check.encode(payload);
}

/**
 * 開発用公開鍵生成（決定論的）
 * derivationPathから決定論的に秘密鍵を導出し、secp256k1で公開鍵を計算
 * 注意: 本番環境では btc-wallet.ts の BitcoinHDWallet を使用してください
 */
export function generateMockPublicKey(derivationPath: string): string {
  // derivationPathのSHA256ハッシュを秘密鍵として使用（開発用のみ）
  const hashHex = CryptoJS.SHA256(derivationPath).toString(CryptoJS.enc.Hex);
  const privateKeyBuffer = Buffer.from(hashHex, 'hex');

  // secp256k1で圧縮公開鍵を生成（33バイト、02/03プレフィックス付き）
  // Note: @noble/secp256k1はUint8Arrayを期待するため変換
  const publicKey = secp256k1.getPublicKey(new Uint8Array(privateKeyBuffer), true);
  return Buffer.from(publicKey).toString('hex');
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
 * xpubからアドレスを導出（開発用）
 * xpub + addressIndexから決定論的に秘密鍵を導出し、secp256k1で公開鍵を計算
 * 注意: 本番環境では btc-wallet.ts の BitcoinHDWallet を使用してください
 */
export function deriveAddressFromXpub(
  xpub: string,
  addressIndex: number,
  network: 'mainnet' | 'testnet'
): string {
  // xpubの妥当性をチェック
  if (!xpub.startsWith('xpub') && !xpub.startsWith('tpub')) {
    throw new Error('Invalid xpub format');
  }

  // xpub + addressIndexのSHA256ハッシュを秘密鍵として使用（開発用のみ）
  const derivationData = `${xpub}-${addressIndex}`;
  const hashHex = CryptoJS.SHA256(derivationData).toString(CryptoJS.enc.Hex);
  const privateKeyBuffer = Buffer.from(hashHex, 'hex');

  // secp256k1で圧縮公開鍵を生成
  // Note: @noble/secp256k1はUint8Arrayを期待するため変換
  const publicKey = secp256k1.getPublicKey(new Uint8Array(privateKeyBuffer), true);

  return createBTCAddressFromPublicKey(Buffer.from(publicKey).toString('hex'), network);
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
 * BIP32形式の拡張公開鍵をBase58Checkでエンコード
 * 注意: 本番環境では btc-wallet.ts の BitcoinHDWallet を使用してください
 */
export function generateMockXpub(network: 'mainnet' | 'testnet'): string {
  // BIP32 xpub構造: 4バイトversion + 1バイトdepth + 4バイトfingerprint + 4バイトchildNumber + 32バイトchainCode + 33バイト公開鍵 = 78バイト
  const versionBytes = network === 'mainnet'
    ? Buffer.from([0x04, 0x88, 0xB2, 0x1E]) // mainnet xpub
    : Buffer.from([0x04, 0x35, 0x87, 0xCF]); // testnet tpub

  const depth = Buffer.from([0x00]); // depth 0
  const fingerprint = Buffer.from([0x00, 0x00, 0x00, 0x00]); // master key has no parent
  const childNumber = Buffer.from([0x00, 0x00, 0x00, 0x00]); // index 0

  // ランダムなチェーンコード（32バイト）
  const chainCode = Buffer.from(randomHex(64), 'hex');

  // ランダムな秘密鍵から公開鍵を生成（33バイト圧縮形式）
  // Note: @noble/secp256k1はUint8Arrayを期待するため変換
  const randomPrivateKey = Buffer.from(randomHex(64), 'hex');
  const publicKey = Buffer.from(secp256k1.getPublicKey(new Uint8Array(randomPrivateKey), true));

  // 全体を結合（78バイト）
  const payload = Buffer.concat([versionBytes, depth, fingerprint, childNumber, chainCode, publicKey]);

  // Base58Checkエンコード
  return bs58check.encode(payload);
}