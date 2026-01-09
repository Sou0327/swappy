/**
 * 金融グレード監査ログシステム
 * 全API呼び出し・機密操作の詳細記録とログ改ざん防止
 */

import { createHash, createHmac } from 'crypto';
import { FinancialEncryption } from './encryption';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  userRole?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  hash: string;
  previousHash?: string;
}

export interface SensitiveOperation {
  operation: string;
  oldValue?: unknown;
  newValue?: unknown;
  affectedFields?: string[];
  reason?: string;
}

export interface APICallDetails {
  endpoint: string;
  method: string;
  requestSize?: number;
  responseStatus?: number;
  processingTime?: number;
  rateLimitInfo?: {
    remaining: number;
    resetTime: Date;
  };
  [key: string]: unknown;
}

/**
 * 監査ログレベル
 */
export enum AuditLevel {
  INFO = 'info',
  WARN = 'warn', 
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * 監査対象アクション
 */
export enum AuditAction {
  // 認証・認可
  LOGIN = 'auth.login',
  LOGOUT = 'auth.logout',
  LOGIN_FAILED = 'auth.login_failed',
  PASSWORD_CHANGE = 'auth.password_change',
  ROLE_CHANGE = 'auth.role_change',
  
  // ウォレット・資産操作
  WALLET_CREATE = 'wallet.create',
  WALLET_ACCESS = 'wallet.access',
  DEPOSIT_REQUEST = 'deposit.request',
  DEPOSIT_CONFIRM = 'deposit.confirm',
  WITHDRAWAL_REQUEST = 'withdrawal.request',
  WITHDRAWAL_APPROVE = 'withdrawal.approve',
  WITHDRAWAL_REJECT = 'withdrawal.reject',
  BALANCE_UPDATE = 'balance.update',
  
  // 取引
  ORDER_CREATE = 'trade.order_create',
  ORDER_CANCEL = 'trade.order_cancel',
  ORDER_EXECUTE = 'trade.order_execute',
  
  // UTXO・トランザクション操作
  UTXO_ADD = 'utxo.add',
  UTXO_SPEND = 'utxo.spend',
  TRANSACTION_CREATE = 'transaction.create',
  
  // 管理者操作
  USER_SUSPEND = 'admin.user_suspend',
  USER_UNSUSPEND = 'admin.user_unsuspend',
  SYSTEM_CONFIG = 'admin.system_config',
  MANUAL_ADJUSTMENT = 'admin.manual_adjustment',
  
  // KYC・コンプライアンス
  KYC_SUBMIT = 'kyc.submit',
  KYC_APPROVE = 'kyc.approve',
  KYC_REJECT = 'kyc.reject',
  SUSPICIOUS_ACTIVITY = 'compliance.suspicious_activity',
  
  // システム操作
  API_CALL = 'system.api_call',
  DATA_EXPORT = 'system.data_export',
  SECURITY_ALERT = 'system.security_alert'
}

/**
 * 改ざん防止付き監査ログマネージャー
 */
export class AuditLogger {
  private static logs: AuditLogEntry[] = [];
  private static readonly HMAC_SECRET = process.env.AUDIT_LOG_HMAC_SECRET || '***REMOVED***';
  private static readonly MAX_LOG_ENTRIES = 100000; // ログの最大保持数
  
  /**
   * 監査ログエントリを記録
   */
  static async log(
    action: AuditAction,
    resource: string,
    details: Record<string, unknown> = {},
    context: {
      userId?: string;
      userRole?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      result?: 'success' | 'failure' | 'pending';
      errorMessage?: string;
      riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    } = {}
  ): Promise<AuditLogEntry> {
    const timestamp = new Date();
    const id = FinancialEncryption.generateSecureRandomString(32);
    
    // 前のログのハッシュを取得
    const previousHash = this.logs.length > 0 ? this.logs[this.logs.length - 1].hash : null;
    
    const logEntry: Omit<AuditLogEntry, 'hash'> = {
      id,
      timestamp,
      userId: context.userId,
      userRole: context.userRole,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      action,
      resource,
      details: this.sanitizeDetails(details),
      result: context.result || 'success',
      errorMessage: context.errorMessage,
      riskLevel: context.riskLevel || 'low',
      previousHash
    };
    
    // ハッシュチェーン生成
    const hash = this.generateLogHash(logEntry);
    
    const finalLogEntry: AuditLogEntry = {
      ...logEntry,
      hash
    };
    
    // ログを追加
    this.logs.push(finalLogEntry);
    
    // ログサイズ管理
    if (this.logs.length > this.MAX_LOG_ENTRIES) {
      // 古いログをアーカイブ（実装時はデータベースやS3に移動）
      this.logs.splice(0, this.logs.length - this.MAX_LOG_ENTRIES);
    }
    
    // 重要度の高いログは即座に永続化
    if (context.riskLevel === 'critical' || context.riskLevel === 'high') {
      await this.persistLogEntry(finalLogEntry);
    }
    
    return finalLogEntry;
  }

  /**
   * API呼び出しログ
   */
  static async logAPICall(
    endpoint: string,
    method: string,
    details: APICallDetails,
    context: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      result?: 'success' | 'failure';
      errorMessage?: string;
    }
  ): Promise<AuditLogEntry> {
    return this.log(
      AuditAction.API_CALL,
      `${method} ${endpoint}`,
      details,
      {
        ...context,
        riskLevel: this.calculateAPIRiskLevel(endpoint, method, details)
      }
    );
  }

  /**
   * 機密操作ログ
   */
  static async logSensitiveOperation(
    operation: string,
    resource: string,
    sensitiveDetails: SensitiveOperation,
    context: {
      userId: string;
      userRole: string;
      sessionId: string;
      ipAddress: string;
      result?: 'success' | 'failure';
      errorMessage?: string;
    }
  ): Promise<AuditLogEntry> {
    return this.log(
      operation as AuditAction,
      resource,
      {
        operation: sensitiveDetails.operation,
        affectedFields: sensitiveDetails.affectedFields,
        reason: sensitiveDetails.reason,
        // 機密データは暗号化して保存
        encryptedOldValue: sensitiveDetails.oldValue ? 
          await FinancialEncryption.encrypt(JSON.stringify(sensitiveDetails.oldValue), this.HMAC_SECRET) : undefined,
        encryptedNewValue: sensitiveDetails.newValue ? 
          await FinancialEncryption.encrypt(JSON.stringify(sensitiveDetails.newValue), this.HMAC_SECRET) : undefined
      },
      {
        ...context,
        riskLevel: 'high'
      }
    );
  }

  /**
   * セキュリティアラートログ
   */
  static async logSecurityAlert(
    alertType: string,
    description: string,
    details: Record<string, unknown>,
    context: {
      userId?: string;
      ipAddress?: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<AuditLogEntry> {
    return this.log(
      AuditAction.SECURITY_ALERT,
      alertType,
      {
        description,
        ...details,
        detectedAt: new Date().toISOString()
      },
      {
        userId: context.userId,
        ipAddress: context.ipAddress,
        result: 'success',
        riskLevel: context.severity
      }
    );
  }

  /**
   * ログチェーンの整合性検証
   */
  static verifyLogIntegrity(): { valid: boolean; corruptedEntries: string[] } {
    const corruptedEntries: string[] = [];
    
    for (let i = 0; i < this.logs.length; i++) {
      const log = this.logs[i];
      const expectedHash = this.generateLogHash(log);
      
      if (log.hash !== expectedHash) {
        corruptedEntries.push(log.id);
      }
      
      // 前のハッシュの整合性チェック
      if (i > 0) {
        const previousLog = this.logs[i - 1];
        if (log.previousHash !== previousLog.hash) {
          corruptedEntries.push(log.id);
        }
      }
    }
    
    return {
      valid: corruptedEntries.length === 0,
      corruptedEntries
    };
  }

  /**
   * ログ検索・フィルタリング
   */
  static searchLogs(filters: {
    userId?: string;
    action?: AuditAction;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    ipAddress?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let filteredLogs = [...this.logs];
    
    if (filters.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
    }
    
    if (filters.action) {
      filteredLogs = filteredLogs.filter(log => log.action === filters.action);
    }
    
    if (filters.resource) {
      filteredLogs = filteredLogs.filter(log => log.resource.includes(filters.resource));
    }
    
    if (filters.startDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startDate!);
    }
    
    if (filters.endDate) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endDate!);
    }
    
    if (filters.riskLevel) {
      filteredLogs = filteredLogs.filter(log => log.riskLevel === filters.riskLevel);
    }
    
    if (filters.ipAddress) {
      filteredLogs = filteredLogs.filter(log => log.ipAddress === filters.ipAddress);
    }
    
    // 最新順にソート
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // 制限数を適用
    if (filters.limit) {
      filteredLogs = filteredLogs.slice(0, filters.limit);
    }
    
    return filteredLogs;
  }

  /**
   * ハッシュ生成（改ざん防止）
   */
  private static generateLogHash(logEntry: Omit<AuditLogEntry, 'hash'>): string {
    const dataToHash = JSON.stringify({
      id: logEntry.id,
      timestamp: logEntry.timestamp.toISOString(),
      userId: logEntry.userId,
      action: logEntry.action,
      resource: logEntry.resource,
      details: logEntry.details,
      result: logEntry.result,
      previousHash: logEntry.previousHash
    });
    
    return createHmac('sha256', this.HMAC_SECRET)
      .update(dataToHash)
      .digest('hex');
  }

  /**
   * 機密データサニタイゼーション
   */
  private static sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...details };
    const sensitiveFields = ['password', 'privateKey', 'secret', 'token', 'apiKey'];
    
    const sanitizeObject = (obj: unknown): unknown => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          sanitizedObj[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          sanitizedObj[key] = sanitizeObject(value);
        } else {
          sanitizedObj[key] = value;
        }
      }
      return sanitizedObj;
    };
    
    return sanitizeObject(sanitized) as Record<string, unknown>;
  }

  /**
   * APIリスクレベル計算
   */
  private static calculateAPIRiskLevel(
    endpoint: string, 
    method: string, 
    details: APICallDetails
  ): 'low' | 'medium' | 'high' | 'critical' {
    // 高リスクエンドポイント
    const criticalEndpoints = ['/api/admin', '/api/withdrawal', '/api/user/role'];
    const highRiskEndpoints = ['/api/deposit', '/api/trade', '/api/wallet'];
    const mediumRiskEndpoints = ['/api/user', '/api/profile'];
    
    if (criticalEndpoints.some(ce => endpoint.startsWith(ce))) {
      return 'critical';
    }
    
    if (highRiskEndpoints.some(he => endpoint.startsWith(he))) {
      return 'high';
    }
    
    if (mediumRiskEndpoints.some(me => endpoint.startsWith(me))) {
      return 'medium';
    }
    
    // HTTPステータスによるリスク評価
    if (details.responseStatus && details.responseStatus >= 400) {
      return details.responseStatus >= 500 ? 'high' : 'medium';
    }
    
    return 'low';
  }

  /**
   * ログの永続化（重要ログ用）
   */
  private static async persistLogEntry(logEntry: AuditLogEntry): Promise<void> {
    try {
      // 実装時: データベースまたはS3等への永続化
      console.log(`[CRITICAL LOG] ${JSON.stringify(logEntry)}`);
      
      // 暗号化して保存
      const encryptedLog = await FinancialEncryption.encrypt(
        JSON.stringify(logEntry),
        this.HMAC_SECRET
      );
      
      // TODO: 実際の永続化ロジック実装
      // await database.auditLogs.create(encryptedLog);
      
    } catch (error) {
      console.error('ログ永続化エラー:', error);
      // 永続化失敗は非常に重要な問題のため、アラートを送信
    }
  }

  /**
   * ログレポート生成
   */
  static generateSecurityReport(
    startDate: Date,
    endDate: Date
  ): {
    totalEvents: number;
    riskDistribution: Record<string, number>;
    topActions: Array<{ action: string; count: number }>;
    suspiciousIPs: Array<{ ip: string; eventCount: number }>;
    failedOperations: Array<AuditLogEntry>;
  } {
    const logs = this.searchLogs({ startDate, endDate });
    
    // リスクレベル分布
    const riskDistribution = logs.reduce((acc, log) => {
      acc[log.riskLevel] = (acc[log.riskLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // トップアクション
    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topActions = Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));
    
    // 疑わしいIP
    const ipCounts = logs.reduce((acc, log) => {
      if (log.ipAddress) {
        acc[log.ipAddress] = (acc[log.ipAddress] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const suspiciousIPs = Object.entries(ipCounts)
      .filter(([, count]) => count > 100) // 閾値: 100回以上のアクセス
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, eventCount]) => ({ ip, eventCount }));
    
    // 失敗操作
    const failedOperations = logs
      .filter(log => log.result === 'failure')
      .slice(0, 50);
    
    return {
      totalEvents: logs.length,
      riskDistribution,
      topActions,
      suspiciousIPs,
      failedOperations
    };
  }
}

/**
 * Express Request型定義
 */
interface ExpressRequest {
  path: string;
  method: string;
  get: (header: string) => string | undefined;
  user?: { id: string };
  sessionID?: string;
  ip?: string;
  connection?: { remoteAddress?: string };
}

/**
 * Express Response型定義
 */
interface ExpressResponse {
  statusCode: number;
  on: (event: string, handler: () => void) => void;
}

/**
 * 監査ログミドルウェア（Express用）
 */
export function auditMiddleware() {
  return async (req: ExpressRequest, res: ExpressResponse, next: () => void) => {
    const startTime = Date.now();

    // レスポンス終了時にログを記録
    res.on('finish', async () => {
      const processingTime = Date.now() - startTime;

      await AuditLogger.logAPICall(
        req.path,
        req.method,
        {
          endpoint: req.path,
          method: req.method,
          requestSize: req.get('Content-Length') ? parseInt(req.get('Content-Length')) : undefined,
          responseStatus: res.statusCode,
          processingTime
        },
        {
          userId: req.user?.id,
          sessionId: req.sessionID,
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get('User-Agent'),
          result: res.statusCode < 400 ? 'success' : 'failure',
          errorMessage: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined
        }
      );
    });

    next();
  };
}