import bs58check from 'bs58check';
import { bech32, bech32m } from 'bech32';

/**
 * Bitcoinアドレス形式の詳細情報
 */
export interface BTCAddressInfo {
  address: string;
  type: 'P2PKH' | 'P2SH' | 'P2WPKH' | 'P2WSH' | 'P2TR' | 'UNKNOWN';
  network: 'mainnet' | 'testnet';
  isValid: boolean;
  checksum?: string;
  witnessVersion?: number;
}

/**
 * Base58Checkデコード
 * bs58checkライブラリを使用し、チェックサム検証を含む
 * チェックサム = double-SHA256の先頭4バイト
 */
function base58CheckDecode(encoded: string): Buffer | null {
  try {
    // bs58check.decodeはチェックサム検証を自動的に行う
    // 無効なチェックサムの場合は例外をスロー
    return Buffer.from(bs58check.decode(encoded));
  } catch {
    return null;
  }
}

/**
 * Base58Checkチェックサムの検証
 * bs58checkライブラリでdouble-SHA256チェックサムを検証
 */
function verifyBase58Checksum(encoded: string): boolean {
  try {
    // bs58check.decodeが成功すればチェックサムは有効
    bs58check.decode(encoded);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bech32/Bech32mチェックサムの検証
 * BIP173(Bech32) / BIP350(Bech32m)準拠のBCH符号検証
 * @param address Bech32/Bech32mエンコードされたアドレス
 * @param useBech32m Taproot用Bech32mを使用するか
 */
function verifyBech32Checksum(address: string, useBech32m: boolean = false): boolean {
  try {
    // bech32/bech32m.decodeがBCH符号チェックサムを検証
    // 無効なチェックサムの場合は例外をスロー
    if (useBech32m) {
      bech32m.decode(address);
    } else {
      bech32.decode(address);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * P2PKHアドレスの検証（1で始まる）
 */
function validateP2PKH(address: string, network: 'mainnet' | 'testnet'): boolean {
  if (network === 'mainnet' && !address.startsWith('1')) return false;
  if (network === 'testnet' && !address.startsWith('m') && !address.startsWith('n')) return false;
  
  if (address.length < 26 || address.length > 35) return false;
  
  return verifyBase58Checksum(address);
}

/**
 * P2SHアドレスの検証（3または2で始まる）
 */
function validateP2SH(address: string, network: 'mainnet' | 'testnet'): boolean {
  if (network === 'mainnet' && !address.startsWith('3')) return false;
  if (network === 'testnet' && !address.startsWith('2')) return false;
  
  if (address.length < 26 || address.length > 35) return false;
  
  return verifyBase58Checksum(address);
}

/**
 * Bech32アドレスの検証（bc1またはtb1で始まる）
 */
function validateBech32(address: string, network: 'mainnet' | 'testnet'): boolean {
  const expectedPrefix = network === 'mainnet' ? 'bc1' : 'tb1';
  if (!address.startsWith(expectedPrefix)) return false;

  // 最小・最大長チェック
  if (address.length < 14 || address.length > 74) return false;

  return verifyBech32Checksum(address);
}

/**
 * Taprootアドレスの検証（bc1pまたはtb1pで始まる）
 * BIP350: TaprootはBech32m（witness version 1）を使用
 */
function validateTaproot(address: string, network: 'mainnet' | 'testnet'): boolean {
  const expectedPrefix = network === 'mainnet' ? 'bc1p' : 'tb1p';
  if (!address.startsWith(expectedPrefix)) return false;

  // Taproot アドレスは62文字固定
  if (address.length !== 62) return false;

  // TaprootはBech32mを使用（BIP350）
  return verifyBech32Checksum(address, true);
}

/**
 * Bitcoinアドレスの詳細分析
 */
export function analyzeBTCAddress(address: string, network: 'mainnet' | 'testnet'): BTCAddressInfo {
  const result: BTCAddressInfo = {
    address,
    type: 'UNKNOWN',
    network,
    isValid: false
  };

  try {
    // P2PKH検証
    if ((network === 'mainnet' && address.startsWith('1')) ||
        (network === 'testnet' && (address.startsWith('m') || address.startsWith('n')))) {
      result.type = 'P2PKH';
      result.isValid = validateP2PKH(address, network);
      return result;
    }

    // P2SH検証
    if ((network === 'mainnet' && address.startsWith('3')) ||
        (network === 'testnet' && address.startsWith('2'))) {
      result.type = 'P2SH';
      result.isValid = validateP2SH(address, network);
      return result;
    }

    // Taproot検証
    const taprootPrefix = network === 'mainnet' ? 'bc1p' : 'tb1p';
    if (address.startsWith(taprootPrefix)) {
      result.type = 'P2TR';
      result.isValid = validateTaproot(address, network);
      result.witnessVersion = 1;
      return result;
    }

    // Bech32検証（P2WPKH/P2WSH）
    const bech32Prefix = network === 'mainnet' ? 'bc1' : 'tb1';
    if (address.startsWith(bech32Prefix)) {
      // アドレス長でP2WPKHとP2WSHを区別
      if (address.length === 42) {
        result.type = 'P2WPKH';
      } else if (address.length === 62) {
        result.type = 'P2WSH';
      }
      result.isValid = validateBech32(address, network);
      result.witnessVersion = 0;
      return result;
    }

  } catch (error) {
    console.error('Bitcoinアドレス分析エラー:', error);
  }

  return result;
}

/**
 * 簡易Bitcoinアドレス検証（既存互換性）
 */
export function validateBTCAddress(address: string, network: 'mainnet' | 'testnet'): boolean {
  const analysis = analyzeBTCAddress(address, network);
  return analysis.isValid;
}

/**
 * アドレス形式の説明文を取得
 */
export function getAddressTypeDescription(type: BTCAddressInfo['type']): string {
  switch (type) {
    case 'P2PKH':
      return 'Pay-to-Public-Key-Hash (レガシー形式)';
    case 'P2SH':
      return 'Pay-to-Script-Hash (マルチシグ対応)';
    case 'P2WPKH':
      return 'Pay-to-Witness-Public-Key-Hash (SegWit v0)';
    case 'P2WSH':
      return 'Pay-to-Witness-Script-Hash (SegWit v0)';
    case 'P2TR':
      return 'Pay-to-Taproot (SegWit v1)';
    default:
      return '不明な形式';
  }
}

/**
 * アドレス形式のテストユーティリティ
 */
export class BTCAddressTester {
  /**
   * 各アドレス形式のサンプルアドレス
   */
  static readonly SAMPLE_ADDRESSES = {
    mainnet: {
      P2PKH: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      P2SH: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      P2WPKH: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      P2WSH: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
      P2TR: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297'
    },
    testnet: {
      P2PKH: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
      P2SH: '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc',
      P2WPKH: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      P2WSH: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
      P2TR: 'tb1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rus3q89l3'
    }
  };

  /**
   * 全アドレス形式のテストを実行
   */
  static testAllFormats(): { [key: string]: boolean } {
    const results: { [key: string]: boolean } = {};

    for (const network of ['mainnet', 'testnet'] as const) {
      for (const [type, address] of Object.entries(this.SAMPLE_ADDRESSES[network])) {
        const key = `${network}_${type}`;
        const analysis = analyzeBTCAddress(address, network);
        results[key] = analysis.isValid && analysis.type === type;
      }
    }

    return results;
  }

  /**
   * 無効なアドレスのテスト
   */
  static testInvalidAddresses(): { [key: string]: boolean } {
    const invalidAddresses = [
      '', // 空文字
      '1', // 短すぎる
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2123456789012345678901234567890', // 長すぎる
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN0', // 無効なチェックサム
      'bc1invalid', // 無効なBech32
      '4InvalidPrefix', // 無効なプレフィックス
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2O', // 無効なBase58文字
    ];

    const results: { [key: string]: boolean } = {};

    invalidAddresses.forEach((address, index) => {
      const key = `invalid_${index}`;
      const mainnetValid = validateBTCAddress(address, 'mainnet');
      const testnetValid = validateBTCAddress(address, 'testnet');
      results[key] = !mainnetValid && !testnetValid; // 両方で無効であることを確認
    });

    return results;
  }

  /**
   * パフォーマンステスト
   */
  static performanceTest(iterations: number = 1000): number {
    const startTime = Date.now();
    const testAddress = this.SAMPLE_ADDRESSES.mainnet.P2PKH;

    for (let i = 0; i < iterations; i++) {
      validateBTCAddress(testAddress, 'mainnet');
    }

    return Date.now() - startTime;
  }
}