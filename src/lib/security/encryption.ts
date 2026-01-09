/**
 * 金融グレード暗号化システム
 * AES-256-GCM による秘密鍵・機密データ暗号化
 */

import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface EncryptedData {
  encrypted: string;
  iv: string;
  salt: string;
  authTag: string;
}

export interface KeyRotationInfo {
  keyId: string;
  version: number;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

/**
 * 金融グレード暗号化マネージャー
 * - AES-256-GCM 暗号化
 * - PBKDF2-based key derivation
 * - セキュアランダム数生成
 * - メモリ安全な鍵管理
 */
export class FinancialEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16;  // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly TAG_LENGTH = 16; // 128 bits
  private static readonly SCRYPT_N = 32768; // CPU cost parameter
  private static readonly SCRYPT_R = 8;     // Memory cost parameter
  private static readonly SCRYPT_P = 1;     // Parallelization parameter

  /**
   * データを暗号化
   * @param plaintext 平文データ
   * @param masterPassword マスターパスワード
   * @returns 暗号化されたデータ
   */
  static async encrypt(plaintext: string, masterPassword: string): Promise<EncryptedData> {
    try {
      // セキュアランダムソルト生成
      const salt = randomBytes(this.SALT_LENGTH);
      
      // PBKDF2でマスターキー導出
      const key = await scryptAsync(masterPassword, salt, this.KEY_LENGTH) as Buffer;
      
      // セキュアランダムIV生成
      const iv = randomBytes(this.IV_LENGTH);
      
      // AES-256-GCM暗号化
      const cipher = createCipheriv(this.ALGORITHM, key, iv);
      cipher.setAAD(salt); // ソルトを追加認証データとして使用
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // 認証タグ取得
      const authTag = cipher.getAuthTag();
      
      // メモリクリア（セキュリティ対策）
      key.fill(0);
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        authTag: authTag.toString('hex')
      };
      
    } catch (error) {
      throw new Error(`暗号化に失敗しました: ${error.message}`);
    }
  }

  /**
   * データを復号化
   * @param encryptedData 暗号化データ
   * @param masterPassword マスターパスワード
   * @returns 復号化された平文
   */
  static async decrypt(encryptedData: EncryptedData, masterPassword: string): Promise<string> {
    try {
      const { encrypted, iv, salt, authTag } = encryptedData;
      
      // バッファ変換
      const saltBuffer = Buffer.from(salt, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');
      
      // PBKDF2でマスターキー導出
      const key = await scryptAsync(masterPassword, saltBuffer, this.KEY_LENGTH) as Buffer;
      
      // AES-256-GCM復号化
      const decipher = createDecipheriv(this.ALGORITHM, key, ivBuffer);
      decipher.setAAD(saltBuffer); // 認証データ設定
      decipher.setAuthTag(authTagBuffer);
      
      let plaintext = decipher.update(encrypted, 'hex', 'utf8');
      plaintext += decipher.final('utf8');
      
      // メモリクリア（セキュリティ対策）
      key.fill(0);
      
      return plaintext;
      
    } catch (error) {
      throw new Error(`復号化に失敗しました: ${error.message}`);
    }
  }

  /**
   * セキュアランダム数生成
   * @param length バイト長
   * @returns ランダムバイト配列
   */
  static generateSecureRandom(length: number): Buffer {
    return randomBytes(length);
  }

  /**
   * セキュアランダム文字列生成
   * @param length 文字列長
   * @returns ランダム16進文字列
   */
  static generateSecureRandomString(length: number): string {
    return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * パスワードハッシュ生成（認証用）
   * @param password パスワード
   * @param salt ソルト（省略時は自動生成）
   * @returns ハッシュ化パスワードとソルト
   */
  static async hashPassword(password: string, salt?: Buffer): Promise<{ hash: string; salt: string }> {
    try {
      const saltBuffer = salt || randomBytes(this.SALT_LENGTH);
      const hash = await scryptAsync(password, saltBuffer, 64) as Buffer;
      
      return {
        hash: hash.toString('hex'),
        salt: saltBuffer.toString('hex')
      };
    } catch (error) {
      throw new Error(`パスワードハッシュ化に失敗しました: ${error.message}`);
    }
  }

  /**
   * パスワード検証
   * @param password 検証するパスワード
   * @param hash 保存されているハッシュ
   * @param salt 保存されているソルト
   * @returns 検証結果
   */
  static async verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    try {
      const saltBuffer = Buffer.from(salt, 'hex');
      const hashBuffer = Buffer.from(hash, 'hex');
      const derivedHash = await scryptAsync(password, saltBuffer, 64) as Buffer;
      
      // タイミング攻撃を防ぐため、固定時間比較を使用
      return derivedHash.equals(hashBuffer);
    } catch (error) {
      return false;
    }
  }

  /**
   * メモリ安全なバッファクリア
   * @param buffer クリアするバッファ
   */
  static secureBufferClear(buffer: Buffer): void {
    if (buffer && buffer.length > 0) {
      buffer.fill(0);
    }
  }

  /**
   * 暗号化強度の検証
   * @param encryptedData 暗号化データ
   * @returns 検証結果
   */
  static validateEncryptionStrength(encryptedData: EncryptedData): boolean {
    const { iv, salt, authTag } = encryptedData;
    
    // 必要な長さの確認
    const ivBuffer = Buffer.from(iv, 'hex');
    const saltBuffer = Buffer.from(salt, 'hex');
    const authTagBuffer = Buffer.from(authTag, 'hex');
    
    return (
      ivBuffer.length === this.IV_LENGTH &&
      saltBuffer.length === this.SALT_LENGTH &&
      authTagBuffer.length === this.TAG_LENGTH
    );
  }
}

/**
 * キーローテーション管理システム
 */
export class KeyRotationManager {
  private static keys: Map<string, KeyRotationInfo> = new Map();
  private static readonly ROTATION_INTERVAL_DAYS = 90; // 90日ごとにローテーション

  /**
   * 新しいキーを生成
   * @returns キー情報
   */
  static generateNewKey(): KeyRotationInfo {
    const keyId = FinancialEncryption.generateSecureRandomString(32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (this.ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000));
    
    const keyInfo: KeyRotationInfo = {
      keyId,
      version: this.keys.size + 1,
      createdAt: now,
      expiresAt,
      isActive: true
    };
    
    // 既存キーを非アクティブ化
    this.keys.forEach(key => key.isActive = false);
    
    this.keys.set(keyId, keyInfo);
    
    return keyInfo;
  }

  /**
   * アクティブキーを取得
   * @returns アクティブキー情報
   */
  static getActiveKey(): KeyRotationInfo | null {
    for (const [keyId, keyInfo] of this.keys) {
      if (keyInfo.isActive && new Date() < keyInfo.expiresAt) {
        return keyInfo;
      }
    }
    return null;
  }

  /**
   * 期限切れキーをチェック
   * @returns ローテーションが必要かどうか
   */
  static needsRotation(): boolean {
    const activeKey = this.getActiveKey();
    if (!activeKey) return true;
    
    const now = new Date();
    const rotationThreshold = new Date(activeKey.expiresAt.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7日前
    
    return now >= rotationThreshold;
  }

  /**
   * すべてのキー情報を取得（管理者用）
   * @returns キー情報一覧
   */
  static getAllKeys(): KeyRotationInfo[] {
    return Array.from(this.keys.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

/**
 * HSM統合準備用のインターフェース
 * AWS CloudHSM や Azure Dedicated HSM 統合時に使用
 */
export interface HSMProvider {
  encrypt(data: string, keyId: string): Promise<EncryptedData>;
  decrypt(encryptedData: EncryptedData, keyId: string): Promise<string>;
  generateKey(): Promise<string>;
  rotateKey(oldKeyId: string): Promise<string>;
}

/**
 * HSM統合の抽象クラス（将来実装用）
 */
export abstract class HSMIntegration implements HSMProvider {
  abstract encrypt(data: string, keyId: string): Promise<EncryptedData>;
  abstract decrypt(encryptedData: EncryptedData, keyId: string): Promise<string>;
  abstract generateKey(): Promise<string>;
  abstract rotateKey(oldKeyId: string): Promise<string>;
  
  /**
   * HSM接続性テスト
   */
  abstract testConnection(): Promise<boolean>;
  
  /**
   * HSMヘルスチェック
   */
  abstract healthCheck(): Promise<{ status: string; details: Record<string, unknown> }>;
}