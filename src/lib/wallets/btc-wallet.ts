/**
 * 金融グレードBitcoin HD Walletシステム
 * BIP32/BIP44完全対応、P2PKH/P2SH/Bech32アドレス形式サポート
 */

import { createHash, createHmac } from 'crypto';
import * as secp256k1 from '@noble/secp256k1';
import { bech32, bech32m } from 'bech32';
import bs58check from 'bs58check';
import { FinancialEncryption } from '../security/encryption';
import { AuditLogger, AuditAction } from '../security/audit-logger';

export interface BitcoinNetwork {
  name: string;
  messagePrefix: string;
  bech32: string;
  bip32: {
    public: number;
    private: number;
  };
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

export interface ExtendedKey {
  key: Buffer;
  chainCode: Buffer;
  depth: number;
  index: number;
  parentFingerprint: number;
}

export interface HDWalletKeyPair {
  privateKey: Buffer;
  publicKey: Buffer;
  address: string;
  derivationPath: string;
  addressIndex: number;
  addressType: 'P2PKH' | 'P2SH' | 'P2WPKH';
  network: 'mainnet' | 'testnet';
  xpub?: string;
  xprv?: string;
}

export interface UTXOInput {
  txid: string;
  vout: number;
  amount: number;
  scriptPubKey: string;
  address?: string;
}

export interface UTXOOutput {
  address: string;
  amount: number;
}

export interface BitcoinTransaction {
  inputs: UTXOInput[];
  outputs: UTXOOutput[];
  fee: number;
  estimatedSize: number;
  rawTx?: string;
}

// Bitcoin ネットワーク設定
export const BITCOIN_NETWORKS: Record<string, BitcoinNetwork> = {
  mainnet: {
    name: 'Bitcoin Mainnet',
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bc',
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4
    },
    pubKeyHash: 0x00,
    scriptHash: 0x05,
    wif: 0x80
  },
  testnet: {
    name: 'Bitcoin Testnet',
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'tb',
    bip32: {
      public: 0x043587cf,
      private: 0x04358394
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef
  }
};

/**
 * 金融グレードBitcoin HD Walletマネージャー
 */
export class BitcoinHDWallet {
  private static readonly MASTER_SEED_LENGTH = 64; // 512 bits
  private static readonly BIP44_PURPOSE = 44;
  private static readonly BTC_COIN_TYPE_MAINNET = 0;
  private static readonly BTC_COIN_TYPE_TESTNET = 1;

  /**
   * マスターシードからHDウォレットを生成
   * @param masterSeed マスターシード（512ビット）
   * @param network ネットワーク
   * @returns 拡張キー
   */
  static generateMasterKey(masterSeed: Buffer, network: 'mainnet' | 'testnet'): ExtendedKey {
    if (masterSeed.length !== this.MASTER_SEED_LENGTH) {
      throw new Error(`マスターシードは${this.MASTER_SEED_LENGTH}バイトである必要があります`);
    }

    // HMAC-SHA512でマスターキーを生成
    const hmac = createHmac('sha512', 'Bitcoin seed');
    const I = hmac.update(masterSeed).digest();

    const masterPrivateKey = I.subarray(0, 32);
    const masterChainCode = I.subarray(32, 64);

    // 秘密鍵の妥当性チェック
    this.validatePrivateKey(masterPrivateKey);

    return {
      key: masterPrivateKey,
      chainCode: masterChainCode,
      depth: 0,
      index: 0,
      parentFingerprint: 0
    };
  }

  /**
   * 拡張秘密鍵から子キーを導出（BIP32）
   * @param parentKey 親の拡張キー
   * @param index 子のインデックス
   * @param hardened ハードン化導出
   * @returns 子の拡張キー
   */
  static deriveChildKey(parentKey: ExtendedKey, index: number, hardened: boolean = false): ExtendedKey {
    if (hardened) {
      index += 0x80000000; // ハードン化ビットを設定
    }

    let data: Buffer;
    
    if (hardened) {
      // ハードン化導出: ser256(kpar) || ser32(i)
      data = Buffer.concat([
        Buffer.from([0x00]), // 0x00パディング
        parentKey.key,
        this.serializeUInt32(index)
      ]);
    } else {
      // 非ハードン化導出: serP(point(kpar)) || ser32(i)
      const parentPublicKey = this.derivePublicKey(parentKey.key);
      data = Buffer.concat([
        parentPublicKey,
        this.serializeUInt32(index)
      ]);
    }

    // HMAC-SHA512で子キーを計算
    const hmac = createHmac('sha512', parentKey.chainCode);
    const I = hmac.update(data).digest();

    const childPrivateKey = I.subarray(0, 32);
    const childChainCode = I.subarray(32, 64);

    // 秘密鍵の妥当性チェック
    this.validatePrivateKey(childPrivateKey);

    // 親のフィンガープリントを計算
    const parentPublicKey = this.derivePublicKey(parentKey.key);
    const parentFingerprint = this.calculateFingerprint(parentPublicKey);

    return {
      key: this.addPrivateKeys(parentKey.key, childPrivateKey),
      chainCode: childChainCode,
      depth: parentKey.depth + 1,
      index: index,
      parentFingerprint: parentFingerprint
    };
  }

  /**
   * BIP44パスに従ってキーを導出
   * @param masterKey マスターキー
   * @param network ネットワーク
   * @param account アカウント番号
   * @param change 変更フラグ（0=受取、1=お釣り）
   * @param addressIndex アドレスインデックス
   * @returns BIP44キーペア
   */
  static deriveBIP44Key(
    masterKey: ExtendedKey,
    network: 'mainnet' | 'testnet',
    account: number = 0,
    change: number = 0,
    addressIndex: number
  ): ExtendedKey {
    const coinType = network === 'mainnet' ? this.BTC_COIN_TYPE_MAINNET : this.BTC_COIN_TYPE_TESTNET;

    // BIP44パス: m/44'/coin_type'/account'/change/address_index
    let currentKey = masterKey;

    // m/44'
    currentKey = this.deriveChildKey(currentKey, this.BIP44_PURPOSE, true);

    // m/44'/coin_type'
    currentKey = this.deriveChildKey(currentKey, coinType, true);

    // m/44'/coin_type'/account'
    currentKey = this.deriveChildKey(currentKey, account, true);

    // m/44'/coin_type'/account'/change
    currentKey = this.deriveChildKey(currentKey, change, false);

    // m/44'/coin_type'/account'/change/address_index
    currentKey = this.deriveChildKey(currentKey, addressIndex, false);

    return currentKey;
  }

  /**
   * 秘密鍵から公開鍵を導出（secp256k1）
   * BIP32準拠: 楕円曲線上の点乗算 G * privateKey
   * @param privateKey 秘密鍵（32バイト）
   * @returns 圧縮公開鍵（33バイト、02/03プレフィックス付き）
   */
  static derivePublicKey(privateKey: Buffer): Buffer {
    // secp256k1楕円曲線上でG（生成点）を秘密鍵回乗算
    // 結果を圧縮形式（33バイト）で返す
    // Note: @noble/secp256k1はUint8Arrayを期待するため変換
    const publicKey = secp256k1.getPublicKey(new Uint8Array(privateKey), true);
    return Buffer.from(publicKey);
  }

  /**
   * 公開鍵からアドレスを生成
   * @param publicKey 公開鍵
   * @param addressType アドレス形式
   * @param network ネットワーク
   * @returns Bitcoinアドレス
   */
  static generateAddress(
    publicKey: Buffer,
    addressType: 'P2PKH' | 'P2SH' | 'P2WPKH',
    network: 'mainnet' | 'testnet'
  ): string {
    const networkConfig = BITCOIN_NETWORKS[network];

    switch (addressType) {
      case 'P2PKH':
        return this.generateP2PKHAddress(publicKey, networkConfig);
      case 'P2SH':
        return this.generateP2SHAddress(publicKey, networkConfig);
      case 'P2WPKH':
        return this.generateP2WPKHAddress(publicKey, networkConfig);
      default:
        throw new Error(`サポートされていないアドレス形式: ${addressType}`);
    }
  }

  /**
   * P2PKHアドレス生成（従来形式）
   */
  private static generateP2PKHAddress(publicKey: Buffer, network: BitcoinNetwork): string {
    // HASH160(公開鍵) = RIPEMD160(SHA256(公開鍵))
    const sha256Hash = createHash('sha256').update(publicKey).digest();
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

    // ネットワークバージョン + ハッシュ
    const payload = Buffer.concat([
      Buffer.from([network.pubKeyHash]),
      ripemd160Hash
    ]);

    return this.base58CheckEncode(payload);
  }

  /**
   * P2SHアドレス生成（スクリプトハッシュ）
   */
  private static generateP2SHAddress(publicKey: Buffer, network: BitcoinNetwork): string {
    // P2WPKH-in-P2SHスクリプト作成
    const sha256Hash = createHash('sha256').update(publicKey).digest();
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();
    
    const redeemScript = Buffer.concat([
      Buffer.from([0x00, 0x14]), // OP_0 + 20バイト
      ripemd160Hash
    ]);

    // スクリプトのハッシュを計算
    const scriptHash = createHash('ripemd160')
      .update(createHash('sha256').update(redeemScript).digest())
      .digest();

    const payload = Buffer.concat([
      Buffer.from([network.scriptHash]),
      scriptHash
    ]);

    return this.base58CheckEncode(payload);
  }

  /**
   * P2WPKHアドレス生成（Bech32、SegWit）
   */
  private static generateP2WPKHAddress(publicKey: Buffer, network: BitcoinNetwork): string {
    const sha256Hash = createHash('sha256').update(publicKey).digest();
    const ripemd160Hash = createHash('ripemd160').update(sha256Hash).digest();

    // Bech32エンコード（簡易版）
    return this.bech32Encode(network.bech32, 0, ripemd160Hash);
  }

  /**
   * Base58Checkエンコード
   * BIP32/BIP38準拠: ペイロード + double-SHA256チェックサム(4バイト)
   * bs58checkライブラリで検証済み実装を使用
   */
  private static base58CheckEncode(payload: Buffer): string {
    return bs58check.encode(payload);
  }

  /**
   * Bech32エンコード
   * BIP173/BIP350準拠: BCH符号によるチェックサム計算
   * bech32ライブラリで検証済み実装を使用
   * @param hrp Human-readable part（'bc' for mainnet, 'tb' for testnet）
   * @param witnessVersion SegWitバージョン（0 = P2WPKH/P2WSH）
   * @param program ウィットネスプログラム（HASH160後の20バイト）
   */
  private static bech32Encode(hrp: string, witnessVersion: number, program: Buffer): string {
    // BIP173: witness version 0はBech32
    // BIP350: witness version 1以降はBech32m
    const encoder = witnessVersion === 0 ? bech32 : bech32m;
    // 8ビットデータを5ビットワードに変換
    const words = encoder.toWords(program);
    // ウィットネスバージョンを先頭に追加
    words.unshift(witnessVersion);
    // BCH符号でチェックサムを計算してエンコード
    return encoder.encode(hrp, words);
  }

  /**
   * 完全なHDウォレットキーペアを生成
   */
  static async generateHDWalletKeyPair(
    userId: string,
    network: 'mainnet' | 'testnet',
    addressType: 'P2PKH' | 'P2SH' | 'P2WPKH' = 'P2WPKH',
    account: number = 0,
    addressIndex: number
  ): Promise<HDWalletKeyPair> {
    try {
      // セキュアなマスターシード生成
      const masterSeed = FinancialEncryption.generateSecureRandom(this.MASTER_SEED_LENGTH);
      
      // マスターキー生成
      const masterKey = this.generateMasterKey(masterSeed, network);
      
      // BIP44パスでキー導出
      const derivedKey = this.deriveBIP44Key(masterKey, network, account, 0, addressIndex);
      
      // 公開鍵導出
      const publicKey = this.derivePublicKey(derivedKey.key);
      
      // アドレス生成
      const address = this.generateAddress(publicKey, addressType, network);
      
      // 導出パス生成
      const coinType = network === 'mainnet' ? this.BTC_COIN_TYPE_MAINNET : this.BTC_COIN_TYPE_TESTNET;
      const derivationPath = `m/44'/${coinType}'/${account}'/0/${addressIndex}`;

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.WALLET_CREATE,
        'btc_hd_wallet',
        {
          network,
          addressType,
          derivationPath,
          addressIndex
        },
        { userId, riskLevel: 'medium' }
      );

      // セキュアにメモリクリア
      FinancialEncryption.secureBufferClear(masterSeed);
      FinancialEncryption.secureBufferClear(masterKey.key);

      return {
        privateKey: derivedKey.key,
        publicKey,
        address,
        derivationPath,
        addressIndex,
        addressType,
        network
      };

    } catch (error) {
      throw new Error(`HDウォレットキーペア生成に失敗: ${error.message}`);
    }
  }

  /**
   * UTXOベースのトランザクション作成
   */
  static createTransaction(
    inputs: UTXOInput[],
    outputs: UTXOOutput[],
    feeRate: number = 20 // sat/vB
  ): BitcoinTransaction {
    // 入力金額の合計計算
    const totalInput = inputs.reduce((sum, input) => sum + input.amount, 0);
    
    // 出力金額の合計計算
    const totalOutput = outputs.reduce((sum, output) => sum + output.amount, 0);
    
    // トランザクションサイズ推定
    const estimatedSize = this.estimateTransactionSize(inputs.length, outputs.length);
    
    // 手数料計算
    const fee = estimatedSize * feeRate;
    
    // 入力と出力のバランスチェック
    if (totalInput < totalOutput + fee) {
      throw new Error('入力金額が不足しています');
    }

    return {
      inputs,
      outputs,
      fee,
      estimatedSize
    };
  }

  /**
   * トランザクションサイズを推定
   */
  private static estimateTransactionSize(inputCount: number, outputCount: number): number {
    // 基本サイズ: バージョン(4) + 入力数(1) + 出力数(1) + ロックタイム(4) = 10バイト
    const baseTxSize = 10;
    
    // P2WPKH入力: 40バイト + witness data
    const inputSize = inputCount * 68; // 簡易計算
    
    // P2PKH出力: 34バイト
    const outputSize = outputCount * 34;
    
    return baseTxSize + inputSize + outputSize;
  }

  /**
   * ユーティリティ関数：32ビット整数シリアライゼーション
   */
  private static serializeUInt32(value: number): Buffer {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt32BE(value, 0);
    return buffer;
  }

  /**
   * 秘密鍵の妥当性検証
   */
  private static validatePrivateKey(privateKey: Buffer): void {
    const keyValue = BigInt('0x' + privateKey.toString('hex'));
    const maxValue = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    
    if (keyValue === BigInt(0) || keyValue >= maxValue) {
      throw new Error('無効な秘密鍵');
    }
  }

  /**
   * 秘密鍵の加算（モジュラー演算）
   */
  private static addPrivateKeys(key1: Buffer, key2: Buffer): Buffer {
    const k1 = BigInt('0x' + key1.toString('hex'));
    const k2 = BigInt('0x' + key2.toString('hex'));
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    
    const result = (k1 + k2) % n;
    return Buffer.from(result.toString(16).padStart(64, '0'), 'hex');
  }

  /**
   * フィンガープリント計算
   */
  private static calculateFingerprint(publicKey: Buffer): number {
    const hash = createHash('ripemd160')
      .update(createHash('sha256').update(publicKey).digest())
      .digest();
    
    return hash.readUInt32BE(0);
  }

  /**
   * アドレス妥当性検証
   */
  static validateAddress(address: string, network: 'mainnet' | 'testnet'): boolean {
    try {
      if (!address || address.length < 26) return false;

      // Bech32アドレス（SegWit）チェック
      const bech32Prefix = network === 'mainnet' ? 'bc1' : 'tb1';
      if (address.startsWith(bech32Prefix)) {
        return this.validateBech32Address(address);
      }

      // Base58アドレス（Legacy/P2SH）チェック
      return this.validateBase58Address(address, network);

    } catch (error) {
      return false;
    }
  }

  /**
   * Bech32アドレス妥当性検証（BCHチェックサム検証付き）
   * BIP173/BIP350準拠
   */
  private static validateBech32Address(address: string): boolean {
    try {
      // 小文字または大文字で統一されているか確認（混在は無効）
      const hasUpper = /[A-Z]/.test(address);
      const hasLower = /[a-z]/.test(address);
      if (hasUpper && hasLower) {
        return false;
      }

      const lowerAddress = address.toLowerCase();

      // witness version 1以降はBech32m（BIP350）
      if (lowerAddress.startsWith('bc1p') || lowerAddress.startsWith('tb1p')) {
        // Taproot (P2TR) - Bech32m
        bech32m.decode(lowerAddress);
        return true;
      }

      // witness version 0はBech32（BIP173）
      bech32.decode(lowerAddress);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Base58アドレス妥当性検証（チェックサム検証付き）
   */
  private static validateBase58Address(address: string, network: 'mainnet' | 'testnet'): boolean {
    try {
      // bs58checkでデコード（チェックサム検証込み）
      const decoded = bs58check.decode(address);
      const versionByte = decoded[0];

      // ネットワーク別のバージョンバイト検証
      if (network === 'mainnet') {
        // P2PKH: 0x00, P2SH: 0x05
        return versionByte === 0x00 || versionByte === 0x05;
      } else {
        // testnet P2PKH: 0x6f, testnet P2SH: 0xc4
        return versionByte === 0x6f || versionByte === 0xc4;
      }
    } catch {
      return false;
    }
  }
}

/**
 * UTXO管理システム
 */
export class UTXOManager {
  private static utxos: Map<string, UTXOInput[]> = new Map();

  /**
   * UTXOを追加
   */
  static addUTXO(address: string, utxo: UTXOInput): void {
    const addressUTXOs = this.utxos.get(address) || [];
    addressUTXOs.push(utxo);
    this.utxos.set(address, addressUTXOs);
  }

  /**
   * UTXOを取得
   */
  static getUTXOs(address: string): UTXOInput[] {
    return this.utxos.get(address) || [];
  }

  /**
   * UTXO残高計算
   */
  static calculateBalance(address: string): number {
    const addressUTXOs = this.getUTXOs(address);
    return addressUTXOs.reduce((total, utxo) => total + utxo.amount, 0);
  }

  /**
   * 送金用UTXO選択
   */
  static selectUTXOsForAmount(address: string, amount: number): UTXOInput[] {
    const availableUTXOs = this.getUTXOs(address).sort((a, b) => b.amount - a.amount);
    const selectedUTXOs: UTXOInput[] = [];
    let selectedAmount = 0;

    for (const utxo of availableUTXOs) {
      selectedUTXOs.push(utxo);
      selectedAmount += utxo.amount;

      if (selectedAmount >= amount) {
        break;
      }
    }

    if (selectedAmount < amount) {
      throw new Error('残高不足: 送金に必要なUTXOがありません');
    }

    return selectedUTXOs;
  }

  /**
   * UTXOを消費（送金時）
   */
  static consumeUTXOs(address: string, consumedUTXOs: UTXOInput[]): void {
    const addressUTXOs = this.utxos.get(address) || [];
    
    for (const consumedUTXO of consumedUTXOs) {
      const index = addressUTXOs.findIndex(
        utxo => utxo.txid === consumedUTXO.txid && utxo.vout === consumedUTXO.vout
      );
      
      if (index !== -1) {
        addressUTXOs.splice(index, 1);
      }
    }

    this.utxos.set(address, addressUTXOs);
  }
}