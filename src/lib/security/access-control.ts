/**
 * 金融グレードアクセス制御システム
 * IP whitelist、デバイス認証、異常ログイン検知、自動ロック機能
 */

import { createHash } from 'crypto';
import { FinancialEncryption } from './encryption';
import { AuditLogger, AuditAction } from './audit-logger';

// Express Request型の拡張定義
export interface ExtendedRequest {
  ip?: string;
  connection?: {
    remoteAddress?: string;
  };
  get?: (header: string) => string | undefined;
  user?: {
    id: string;
    role?: string;
  };
}

export interface ExtendedResponse {
  status: (code: number) => {
    json: (data: unknown) => void;
  };
}

export interface IPWhitelistEntry {
  id: string;
  userId: string;
  ipAddress: string;
  cidrRange?: string;
  label: string;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdBy: string;
}

export interface DeviceFingerprint {
  userAgent: string;
  screen: {
    width: number;
    height: number;
    colorDepth: number;
  };
  timezone: string;
  language: string;
  platform: string;
  plugins: string[];
  cookieEnabled: boolean;
  doNotTrack: string;
}

export interface RegisteredDevice {
  id: string;
  userId: string;
  deviceHash: string;
  deviceName: string;
  fingerprint: DeviceFingerprint;
  firstSeen: Date;
  lastSeen: Date;
  isTrusted: boolean;
  isActive: boolean;
  ipAddresses: string[];
}

export interface LoginAttempt {
  id: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  deviceHash: string;
  timestamp: Date;
  success: boolean;
  failureReason?: string;
  location?: {
    country: string;
    city: string;
    latitude: number;
    longitude: number;
  };
}

export interface SecurityAlert {
  id: string;
  userId: string;
  type: 'suspicious_login' | 'new_device' | 'ip_violation' | 'brute_force' | 'account_takeover';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * IP ホワイトリスト管理
 */
export class IPWhitelistManager {
  private static whitelist: Map<string, IPWhitelistEntry[]> = new Map();

  /**
   * IPアドレスをホワイトリストに追加
   */
  static async addIP(
    userId: string,
    ipAddress: string,
    label: string,
    createdBy: string,
    expiresAt?: Date,
    cidrRange?: string
  ): Promise<IPWhitelistEntry> {
    const id = FinancialEncryption.generateSecureRandomString(16);
    
    const entry: IPWhitelistEntry = {
      id,
      userId,
      ipAddress,
      cidrRange,
      label,
      createdAt: new Date(),
      expiresAt,
      isActive: true,
      createdBy
    };

    const userWhitelist = this.whitelist.get(userId) || [];
    userWhitelist.push(entry);
    this.whitelist.set(userId, userWhitelist);

    // 監査ログ記録
    await AuditLogger.log(
      AuditAction.SYSTEM_CONFIG,
      'ip_whitelist',
      { action: 'add_ip', ipAddress, label, cidrRange },
      { userId: createdBy, riskLevel: 'medium' }
    );

    return entry;
  }

  /**
   * IPアドレスが許可されているかチェック
   */
  static isIPAllowed(userId: string, ipAddress: string): boolean {
    const userWhitelist = this.whitelist.get(userId) || [];
    const now = new Date();

    return userWhitelist.some(entry => {
      if (!entry.isActive) return false;
      if (entry.expiresAt && entry.expiresAt < now) return false;

      // 直接IP一致
      if (entry.ipAddress === ipAddress) return true;

      // CIDR範囲チェック
      if (entry.cidrRange) {
        return this.isIPInCIDR(ipAddress, entry.cidrRange);
      }

      return false;
    });
  }

  /**
   * CIDR範囲内IPチェック
   */
  private static isIPInCIDR(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = -1 << (32 - parseInt(bits));
    
    const ipInt = this.ipToInt(ip);
    const rangeInt = this.ipToInt(range);
    
    return (ipInt & mask) === (rangeInt & mask);
  }

  /**
   * IPアドレスを整数に変換
   */
  private static ipToInt(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  /**
   * ユーザーのホワイトリスト取得
   */
  static getUserWhitelist(userId: string): IPWhitelistEntry[] {
    return this.whitelist.get(userId) || [];
  }

  /**
   * ホワイトリストエントリ削除
   */
  static async removeIP(userId: string, entryId: string, removedBy: string): Promise<boolean> {
    const userWhitelist = this.whitelist.get(userId) || [];
    const entryIndex = userWhitelist.findIndex(entry => entry.id === entryId);
    
    if (entryIndex === -1) return false;

    const entry = userWhitelist[entryIndex];
    userWhitelist.splice(entryIndex, 1);
    this.whitelist.set(userId, userWhitelist);

    // 監査ログ記録
    await AuditLogger.log(
      AuditAction.SYSTEM_CONFIG,
      'ip_whitelist',
      { action: 'remove_ip', removedEntry: entry },
      { userId: removedBy, riskLevel: 'medium' }
    );

    return true;
  }
}

/**
 * デバイス認証システム
 */
export class DeviceAuthenticationManager {
  private static devices: Map<string, RegisteredDevice[]> = new Map();

  /**
   * デバイスフィンガープリント生成
   */
  static generateDeviceHash(fingerprint: DeviceFingerprint): string {
    const fingerprintString = JSON.stringify({
      userAgent: fingerprint.userAgent,
      screen: fingerprint.screen,
      timezone: fingerprint.timezone,
      language: fingerprint.language,
      platform: fingerprint.platform,
      plugins: fingerprint.plugins.sort(),
      cookieEnabled: fingerprint.cookieEnabled,
      doNotTrack: fingerprint.doNotTrack
    });

    return createHash('sha256').update(fingerprintString).digest('hex');
  }

  /**
   * デバイス登録
   */
  static async registerDevice(
    userId: string,
    deviceName: string,
    fingerprint: DeviceFingerprint,
    ipAddress: string,
    isTrusted: boolean = false
  ): Promise<RegisteredDevice> {
    const deviceHash = this.generateDeviceHash(fingerprint);
    const id = FinancialEncryption.generateSecureRandomString(16);

    const device: RegisteredDevice = {
      id,
      userId,
      deviceHash,
      deviceName,
      fingerprint,
      firstSeen: new Date(),
      lastSeen: new Date(),
      isTrusted,
      isActive: true,
      ipAddresses: [ipAddress]
    };

    const userDevices = this.devices.get(userId) || [];
    userDevices.push(device);
    this.devices.set(userId, userDevices);

    // 監査ログ記録
    await AuditLogger.log(
      AuditAction.SYSTEM_CONFIG,
      'device_registration',
      { deviceName, deviceHash, isTrusted },
      { userId, riskLevel: 'medium' }
    );

    return device;
  }

  /**
   * デバイス認証チェック
   */
  static async authenticateDevice(
    userId: string,
    fingerprint: DeviceFingerprint,
    ipAddress: string
  ): Promise<{ isKnown: boolean; device?: RegisteredDevice; riskScore: number }> {
    const deviceHash = this.generateDeviceHash(fingerprint);
    const userDevices = this.devices.get(userId) || [];
    
    const knownDevice = userDevices.find(device => 
      device.deviceHash === deviceHash && device.isActive
    );

    if (knownDevice) {
      // デバイス情報更新
      knownDevice.lastSeen = new Date();
      if (!knownDevice.ipAddresses.includes(ipAddress)) {
        knownDevice.ipAddresses.push(ipAddress);
      }

      return {
        isKnown: true,
        device: knownDevice,
        riskScore: knownDevice.isTrusted ? 0.1 : 0.3
      };
    }

    // 新しいデバイスのリスクスコア計算
    const riskScore = this.calculateDeviceRiskScore(fingerprint, ipAddress);

    return {
      isKnown: false,
      riskScore
    };
  }

  /**
   * デバイスリスクスコア計算
   */
  private static calculateDeviceRiskScore(fingerprint: DeviceFingerprint, ipAddress: string): number {
    let riskScore = 0.5; // ベーススコア

    // 疑わしいユーザーエージェント
    if (fingerprint.userAgent.includes('bot') || fingerprint.userAgent.includes('crawler')) {
      riskScore += 0.3;
    }

    // 珍しい画面サイズ
    const { width, height } = fingerprint.screen;
    if (width < 800 || height < 600) {
      riskScore += 0.1;
    }

    // VPN/Tor検知（簡易実装）
    if (this.isSuspiciousIP(ipAddress)) {
      riskScore += 0.2;
    }

    // プラグインが異常に少ない/多い
    if (fingerprint.plugins.length === 0 || fingerprint.plugins.length > 50) {
      riskScore += 0.1;
    }

    return Math.min(riskScore, 1.0);
  }

  /**
   * 疑わしいIP検知（簡易実装）
   */
  private static isSuspiciousIP(ipAddress: string): boolean {
    // 実装時: 外部サービス（MaxMind、IPQuality等）と連携
    const suspiciousRanges = [
      '10.0.0.0/8',    // プライベートIP
      '172.16.0.0/12', // プライベートIP
      '192.168.0.0/16' // プライベートIP
    ];

    return suspiciousRanges.some(range => 
      IPWhitelistManager['isIPInCIDR'](ipAddress, range)
    );
  }

  /**
   * ユーザーのデバイス一覧取得
   */
  static getUserDevices(userId: string): RegisteredDevice[] {
    return this.devices.get(userId) || [];
  }

  /**
   * デバイス信頼設定
   */
  static async setDeviceTrust(
    userId: string,
    deviceId: string,
    isTrusted: boolean,
    modifiedBy: string
  ): Promise<boolean> {
    const userDevices = this.devices.get(userId) || [];
    const device = userDevices.find(d => d.id === deviceId);

    if (!device) return false;

    device.isTrusted = isTrusted;

    // 監査ログ記録
    await AuditLogger.log(
      AuditAction.SYSTEM_CONFIG,
      'device_trust',
      { deviceId, deviceName: device.deviceName, isTrusted },
      { userId: modifiedBy, riskLevel: 'medium' }
    );

    return true;
  }
}

/**
 * 異常ログイン検知・自動ロックシステム
 */
export class AnomalyDetectionManager {
  private static loginAttempts: LoginAttempt[] = [];
  private static securityAlerts: SecurityAlert[] = [];
  private static lockedUsers: Map<string, { lockedAt: Date; reason: string; duration: number }> = new Map();

  /**
   * ログイン試行記録
   */
  static async recordLoginAttempt(
    userId: string | undefined,
    ipAddress: string,
    userAgent: string,
    deviceHash: string,
    success: boolean,
    failureReason?: string,
    location?: LoginAttempt['location']
  ): Promise<LoginAttempt> {
    const id = FinancialEncryption.generateSecureRandomString(16);

    const attempt: LoginAttempt = {
      id,
      userId,
      ipAddress,
      userAgent,
      deviceHash,
      timestamp: new Date(),
      success,
      failureReason,
      location
    };

    this.loginAttempts.push(attempt);

    // 異常検知実行
    if (!success && userId) {
      await this.detectAnomalies(userId, ipAddress);
    }

    return attempt;
  }

  /**
   * 異常検知
   */
  private static async detectAnomalies(userId: string, ipAddress: string): Promise<void> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 過去5分間の失敗試行
    const recentFailures = this.loginAttempts.filter(attempt =>
      attempt.userId === userId &&
      !attempt.success &&
      attempt.timestamp >= fiveMinutesAgo
    );

    // 過去24時間のIP別失敗試行
    const ipFailures = this.loginAttempts.filter(attempt =>
      attempt.ipAddress === ipAddress &&
      !attempt.success &&
      attempt.timestamp >= oneDayAgo
    );

    // ブルートフォース攻撃検知
    if (recentFailures.length >= 5) {
      await this.createSecurityAlert(
        userId,
        'brute_force',
        'critical',
        `過去5分間に${recentFailures.length}回の失敗ログインが検出されました`,
        { attempts: recentFailures.length, ipAddress }
      );

      // アカウント一時ロック（30分）
      await this.lockUser(userId, 'ブルートフォース攻撃検知', 30);
    }

    // IP別異常検知
    if (ipFailures.length >= 20) {
      await this.createSecurityAlert(
        userId,
        'suspicious_login',
        'high',
        `IP ${ipAddress} から過去24時間に${ipFailures.length}回の失敗ログインが検出されました`,
        { attempts: ipFailures.length, ipAddress }
      );
    }

    // 地理的異常検知
    await this.detectGeographicAnomalies(userId);
  }

  /**
   * 地理的異常検知
   */
  private static async detectGeographicAnomalies(userId: string): Promise<void> {
    const userAttempts = this.loginAttempts
      .filter(attempt => attempt.userId === userId && attempt.location)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    if (userAttempts.length < 2) return;

    const [latest, previous] = userAttempts;
    
    if (latest.location && previous.location) {
      const distance = this.calculateDistance(
        latest.location.latitude,
        latest.location.longitude,
        previous.location.latitude,
        previous.location.longitude
      );

      const timeDiff = latest.timestamp.getTime() - previous.timestamp.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      // 物理的に不可能な移動速度の検知（時速1000km以上）
      if (distance > 1000 && hoursDiff < (distance / 1000)) {
        await this.createSecurityAlert(
          userId,
          'suspicious_login',
          'high',
          '物理的に不可能な地理的移動が検出されました',
          {
            distance: Math.round(distance),
            timeDiff: hoursDiff,
            locations: [latest.location, previous.location]
          }
        );
      }
    }
  }

  /**
   * 2点間の距離計算（Haversine公式）
   */
  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // 地球の半径 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * セキュリティアラート作成
   */
  private static async createSecurityAlert(
    userId: string,
    type: SecurityAlert['type'],
    severity: SecurityAlert['severity'],
    description: string,
    metadata: Record<string, unknown>
  ): Promise<SecurityAlert> {
    const id = FinancialEncryption.generateSecureRandomString(16);

    const alert: SecurityAlert = {
      id,
      userId,
      type,
      severity,
      description,
      metadata,
      timestamp: new Date(),
      resolved: false
    };

    this.securityAlerts.push(alert);

    // 監査ログ記録
    await AuditLogger.logSecurityAlert(
      type,
      description,
      metadata,
      { userId, severity }
    );

    return alert;
  }

  /**
   * ユーザーロック
   */
  static async lockUser(userId: string, reason: string, durationMinutes: number): Promise<void> {
    const lockInfo = {
      lockedAt: new Date(),
      reason,
      duration: durationMinutes
    };

    this.lockedUsers.set(userId, lockInfo);

    // 監査ログ記録
    await AuditLogger.log(
      AuditAction.USER_SUSPEND,
      'user_lock',
      { reason, durationMinutes },
      { userId: 'system', riskLevel: 'critical' }
    );
  }

  /**
   * ユーザーロック解除
   */
  static async unlockUser(userId: string, unlockedBy: string): Promise<boolean> {
    if (this.lockedUsers.has(userId)) {
      this.lockedUsers.delete(userId);

      // 監査ログ記録
      await AuditLogger.log(
        AuditAction.USER_UNSUSPEND,
        'user_unlock',
        {},
        { userId: unlockedBy, riskLevel: 'medium' }
      );

      return true;
    }
    return false;
  }

  /**
   * ユーザーロック状態チェック
   */
  static isUserLocked(userId: string): boolean {
    const lockInfo = this.lockedUsers.get(userId);
    if (!lockInfo) return false;

    const now = new Date();
    const unlockTime = new Date(lockInfo.lockedAt.getTime() + lockInfo.duration * 60 * 1000);

    if (now >= unlockTime) {
      // 自動解除
      this.lockedUsers.delete(userId);
      return false;
    }

    return true;
  }

  /**
   * ユーザーのログイン履歴取得
   */
  static getUserLoginHistory(userId: string, limit: number = 50): LoginAttempt[] {
    return this.loginAttempts
      .filter(attempt => attempt.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * セキュリティアラート一覧取得
   */
  static getSecurityAlerts(userId?: string, resolved?: boolean): SecurityAlert[] {
    let alerts = [...this.securityAlerts];

    if (userId) {
      alerts = alerts.filter(alert => alert.userId === userId);
    }

    if (resolved !== undefined) {
      alerts = alerts.filter(alert => alert.resolved === resolved);
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * アラート解決
   */
  static async resolveAlert(alertId: string, resolvedBy: string): Promise<boolean> {
    const alert = this.securityAlerts.find(a => a.id === alertId);
    if (!alert || alert.resolved) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = resolvedBy;

    // 監査ログ記録
    await AuditLogger.log(
      AuditAction.SYSTEM_CONFIG,
      'alert_resolution',
      { alertId, alertType: alert.type },
      { userId: resolvedBy, riskLevel: 'low' }
    );

    return true;
  }
}

/**
 * アクセス制御ミドルウェア
 */
export function accessControlMiddleware() {
  return async (req: ExtendedRequest, res: ExtendedResponse, next: () => void) => {
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.get?.('User-Agent') || '';
    const userId = req.user?.id;

    try {
      // ユーザーロックチェック
      if (userId && AnomalyDetectionManager.isUserLocked(userId)) {
        return res.status(423).json({
          error: 'アカウントが一時的にロックされています',
          code: 'ACCOUNT_LOCKED'
        });
      }

      // IPホワイトリストチェック（管理者・VIPユーザー用）
      if (userId && req.user?.role === 'admin') {
        const isAllowed = IPWhitelistManager.isIPAllowed(userId, ipAddress);
        if (!isAllowed) {
          await AuditLogger.logSecurityAlert(
            'ip_violation',
            `管理者アカウントが未承認IPからアクセスを試行: ${ipAddress}`,
            { ipAddress, userId },
            { userId, severity: 'critical' }
          );

          return res.status(403).json({
            error: 'このIPアドレスからのアクセスは許可されていません',
            code: 'IP_NOT_ALLOWED'
          });
        }
      }

      next();

    } catch (error) {
      console.error('アクセス制御エラー:', error);
      next();
    }
  };
}