/**
 * Tatum Security Module - セキュリティ強化版
 *
 * API Key暗号化、入力値検証、セキュアなデータ処理
 * セキュリティベストプラクティスの実装
 */

import { logger } from './logger.ts';
import { TatumValidationError } from './errors.ts';

// ====================================
// Security Configuration
// ====================================

export interface SecurityConfig {
  enableApiKeyEncryption: boolean;
  enableInputValidation: boolean;
  enableDataSanitization: boolean;
  encryptionKey?: string;
  allowedOrigins: string[];
  maxRequestSize: number;
  rateLimitBypassTokens: string[];
}

// ====================================
// API Key Encryption/Decryption
// ====================================

export class TatumKeyManager {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(private config: SecurityConfig) {
    if (config.enableApiKeyEncryption && !config.encryptionKey) {
      throw new Error('Encryption key is required when API key encryption is enabled');
    }
  }

  /**
   * API Keyの暗号化
   */
  async encryptApiKey(apiKey: string): Promise<string> {
    if (!this.config.enableApiKeyEncryption) {
      return apiKey; // 暗号化無効の場合はそのまま返す
    }

    try {
      const keyMaterial = await this.deriveKey(this.config.encryptionKey!);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedApiKey = this.encoder.encode(apiKey);

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        keyMaterial,
        encodedApiKey
      );

      // IVと暗号化データを結合してBase64エンコード
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));

    } catch (error) {
      logger.error('API key encryption failed', error as Error);
      throw new Error('Failed to encrypt API key');
    }
  }

  /**
   * API Keyの復号化
   */
  async decryptApiKey(encryptedApiKey: string): Promise<string> {
    if (!this.config.enableApiKeyEncryption) {
      return encryptedApiKey; // 暗号化無効の場合はそのまま返す
    }

    try {
      const keyMaterial = await this.deriveKey(this.config.encryptionKey!);
      const combined = new Uint8Array(
        Array.from(atob(encryptedApiKey), c => c.charCodeAt(0))
      );

      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        keyMaterial,
        encrypted
      );

      return this.decoder.decode(decrypted);

    } catch (error) {
      logger.error('API key decryption failed', error as Error);
      throw new Error('Failed to decrypt API key');
    }
  }

  /**
   * API Keyの検証
   */
  validateApiKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // 最小長チェック
    if (apiKey.length < 10) {
      return false;
    }

    // 文字種チェック（英数字とハイフンのみ許可）
    const validPattern = /^[a-zA-Z0-9\-_]+$/;
    if (!validPattern.test(apiKey)) {
      return false;
    }

    // テストキーの検出
    if (apiKey.startsWith('test_') && !this.isTestEnvironment()) {
      logger.warn('Test API key detected in production environment');
      return false;
    }

    return true;
  }

  private async deriveKey(password: string): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.encoder.encode('tatum-salt-2024'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private isTestEnvironment(): boolean {
    const env = Deno.env.get('DENO_ENV') || Deno.env.get('NODE_ENV');
    return env === 'test' || env === 'development';
  }
}

// ====================================
// Input Validation & Sanitization
// ====================================

export class TatumInputValidator {
  private config: SecurityConfig;

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * アドレス検証
   */
  validateAddress(address: string, chain: string): boolean {
    if (!this.config.enableInputValidation) {
      return true;
    }

    if (!address || typeof address !== 'string') {
      throw new TatumValidationError('Address must be a non-empty string');
    }

    // XSS攻撃パターンの検出
    if (this.containsXSSPatterns(address)) {
      throw new TatumValidationError('Address contains invalid characters');
    }

    // チェーン別のアドレス形式検証
    switch (chain.toLowerCase()) {
      case 'eth':
      case 'ethereum':
        return this.validateEthereumAddress(address);

      case 'btc':
      case 'bitcoin':
        return this.validateBitcoinAddress(address);

      case 'trx':
      case 'tron':
        return this.validateTronAddress(address);

      default:
        // 汎用的な検証
        return this.validateGenericAddress(address);
    }
  }

  /**
   * WebhookURL検証
   */
  validateWebhookUrl(url: string): boolean {
    if (!this.config.enableInputValidation) {
      return true;
    }

    if (!url || typeof url !== 'string') {
      throw new TatumValidationError('Webhook URL must be a non-empty string');
    }

    // XSS攻撃パターンの検出
    if (this.containsXSSPatterns(url)) {
      throw new TatumValidationError('Webhook URL contains invalid characters');
    }

    try {
      const urlObj = new URL(url);

      // HTTPSの強制（本番環境）
      if (!this.isTestEnvironment() && urlObj.protocol !== 'https:') {
        throw new TatumValidationError('Webhook URL must use HTTPS in production');
      }

      // 許可されたオリジンのチェック
      if (this.config.allowedOrigins.length > 0) {
        const origin = `${urlObj.protocol}//${urlObj.hostname}`;
        if (!this.config.allowedOrigins.includes(origin)) {
          throw new TatumValidationError('Webhook URL origin is not allowed');
        }
      }

      // 危険なポートの拒否
      const port = urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === 'https:' ? 443 : 80);
      if (this.isDangerousPort(port)) {
        throw new TatumValidationError('Webhook URL uses a dangerous port');
      }

      return true;

    } catch (error) {
      if (error instanceof TatumValidationError) {
        throw error;
      }
      throw new TatumValidationError('Invalid webhook URL format');
    }
  }

  /**
   * リクエストボディの検証
   */
  validateRequestBody<T = Record<string, unknown>>(body: T): T {
    if (!this.config.enableInputValidation) {
      return body;
    }

    if (!body || typeof body !== 'object') {
      throw new TatumValidationError('Request body must be a valid object');
    }

    // サニタイゼーション
    if (this.config.enableDataSanitization) {
      return this.sanitizeObject(body) as T;
    }

    return body;
  }

  /**
   * SQLインジェクション検出
   */
  detectSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
      /('|(\\')|(;)|(%)|(--)|(\|\|))/i,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * XSS攻撃パターンの検出
   */
  private containsXSSPatterns(input: string): boolean {
    const xssPatterns = [
      /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<[\s\S]*?>/g
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  private validateEthereumAddress(address: string): boolean {
    const ethPattern = /^0x[a-fA-F0-9]{40}$/;
    if (!ethPattern.test(address)) {
      throw new TatumValidationError('Invalid Ethereum address format');
    }
    return true;
  }

  private validateBitcoinAddress(address: string): boolean {
    // Bitcoin Legacy (1...), SegWit (3...), Bech32 (bc1...)
    const btcPattern = /^([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})$/;
    if (!btcPattern.test(address)) {
      throw new TatumValidationError('Invalid Bitcoin address format');
    }
    return true;
  }

  private validateTronAddress(address: string): boolean {
    const tronPattern = /^T[A-Za-z1-9]{33}$/;
    if (!tronPattern.test(address)) {
      throw new TatumValidationError('Invalid Tron address format');
    }
    return true;
  }

  private validateGenericAddress(address: string): boolean {
    // 汎用的な検証（最低限の文字種制限）
    const genericPattern = /^[a-zA-Z0-9]{20,100}$/;
    if (!genericPattern.test(address)) {
      throw new TatumValidationError('Invalid address format');
    }
    return true;
  }

  private sanitizeObject<T>(obj: T): T {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item)) as T;
    }

    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized as T;
    }

    return obj;
  }

  private sanitizeString(str: string): string {
    return str
      .replace(/[<>]/g, '') // HTML文字の削除
      .replace(/javascript:/gi, '') // JavaScript URLの削除
      .replace(/on\w+\s*=/gi, '') // イベントハンドラーの削除
      .trim();
  }

  private isDangerousPort(port: number): boolean {
    // 一般的に危険とされるポート
    const dangerousPorts = [
      22,   // SSH
      23,   // Telnet
      25,   // SMTP
      53,   // DNS
      135,  // RPC
      139,  // NetBIOS
      445,  // SMB
      1433, // SQL Server
      3389, // RDP
      5432  // PostgreSQL
    ];

    return dangerousPorts.includes(port);
  }

  private isTestEnvironment(): boolean {
    const env = Deno.env.get('DENO_ENV') || Deno.env.get('NODE_ENV');
    return env === 'test' || env === 'development';
  }
}

// ====================================
// Secure Request Handler
// ====================================

export class TatumSecureRequestHandler {
  private keyManager: TatumKeyManager;
  private validator: TatumInputValidator;

  constructor(config: SecurityConfig) {
    this.keyManager = new TatumKeyManager(config);
    this.validator = new TatumInputValidator(config);
  }

  /**
   * セキュアなリクエスト処理
   */
  async processSecureRequest(request: {
    address: string;
    chain: string;
    network: string;
    asset: string;
    webhookUrl?: string;
    apiKey: string;
  }): Promise<{
    address: string;
    chain: string;
    network: string;
    asset: string;
    webhookUrl?: string;
    apiKey: string;
  }> {
    // 入力値検証
    this.validator.validateAddress(request.address, request.chain);

    if (request.webhookUrl) {
      this.validator.validateWebhookUrl(request.webhookUrl);
    }

    if (!this.keyManager.validateApiKey(request.apiKey)) {
      throw new TatumValidationError('Invalid API key format');
    }

    // リクエストボディ全体の検証
    const validatedBody = this.validator.validateRequestBody(request);

    // API Keyの復号化（暗号化されている場合）
    const decryptedApiKey = await this.keyManager.decryptApiKey(request.apiKey);

    return {
      ...validatedBody,
      apiKey: decryptedApiKey
    };
  }

  /**
   * セキュアなAPI Key保存
   */
  async secureApiKey(apiKey: string): Promise<string> {
    if (!this.keyManager.validateApiKey(apiKey)) {
      throw new TatumValidationError('Invalid API key format');
    }

    return await this.keyManager.encryptApiKey(apiKey);
  }

  /**
   * セキュリティ監査ログ
   */
  auditLog(action: string, details: Record<string, unknown>): void {
    logger.info('Security audit', {
      action,
      timestamp: new Date().toISOString(),
      details: this.sanitizeForLogging(details)
    });
  }

  private sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized = JSON.parse(JSON.stringify(data));

    // API Keyのマスキング
    if (sanitized.apiKey) {
      sanitized.apiKey = this.maskSensitiveData(sanitized.apiKey);
    }

    // その他の機密情報のマスキング
    if (sanitized.address) {
      sanitized.address = this.maskAddress(sanitized.address);
    }

    return sanitized;
  }

  private maskSensitiveData(data: string): string {
    if (data.length <= 8) {
      return '*'.repeat(data.length);
    }
    return data.substring(0, 4) + '*'.repeat(data.length - 8) + data.substring(data.length - 4);
  }

  private maskAddress(address: string): string {
    if (address.length <= 10) {
      return '*'.repeat(address.length);
    }
    return address.substring(0, 6) + '*'.repeat(address.length - 10) + address.substring(address.length - 4);
  }
}

// ====================================
// Default Security Configuration
// ====================================

export const defaultSecurityConfig: SecurityConfig = {
  enableApiKeyEncryption: true,
  enableInputValidation: true,
  enableDataSanitization: true,
  allowedOrigins: [], // 空の場合は全て許可
  maxRequestSize: 1024 * 1024, // 1MB
  rateLimitBypassTokens: []
};

// ====================================
// Security Factory
// ====================================

export class TatumSecurityFactory {
  static createSecureHandler(config?: Partial<SecurityConfig>): TatumSecureRequestHandler {
    const mergedConfig = {
      ...defaultSecurityConfig,
      ...config,
      encryptionKey: config?.encryptionKey || Deno.env.get('TATUM_ENCRYPTION_KEY')
    };

    return new TatumSecureRequestHandler(mergedConfig);
  }

  static createKeyManager(config?: Partial<SecurityConfig>): TatumKeyManager {
    const mergedConfig = {
      ...defaultSecurityConfig,
      ...config,
      encryptionKey: config?.encryptionKey || Deno.env.get('TATUM_ENCRYPTION_KEY')
    };

    return new TatumKeyManager(mergedConfig);
  }

  static createValidator(config?: Partial<SecurityConfig>): TatumInputValidator {
    const mergedConfig = {
      ...defaultSecurityConfig,
      ...config
    };

    return new TatumInputValidator(mergedConfig);
  }
}