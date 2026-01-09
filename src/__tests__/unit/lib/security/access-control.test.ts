/**
 * 金融グレードアクセス制御システムのユニットテスト
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  IPWhitelistManager,
  DeviceAuthenticationManager,
  AnomalyDetectionManager,
  accessControlMiddleware,
  type DeviceFingerprint,
  type ExtendedRequest,
  type ExtendedResponse
} from '../../../../lib/security/access-control'

// audit-loggerモジュールをモック
vi.mock('../../../../lib/security/audit-logger', () => ({
  AuditLogger: {
    log: vi.fn(),
    logSecurityAlert: vi.fn()
  },
  AuditAction: {
    SYSTEM_CONFIG: 'system_config',
    USER_SUSPEND: 'user_suspend',
    USER_UNSUSPEND: 'user_unsuspend'
  }
}))

describe('IPWhitelistManager', () => {
  const testIp = '8.8.8.8' // パブリックIPを使用（Googleの公開DNS）
  const adminUserId = 'admin-456'

  describe('IPアドレス管理', () => {
    it('IPアドレスをホワイトリストに追加できる', async () => {
      const testUserId = 'user-add-ip'
      const entry = await IPWhitelistManager.addIP(
        testUserId,
        testIp,
        'オフィスIP',
        adminUserId
      )

      expect(entry).toHaveProperty('id')
      expect(entry.userId).toBe(testUserId)
      expect(entry.ipAddress).toBe(testIp)
      expect(entry.label).toBe('オフィスIP')
      expect(entry.createdBy).toBe(adminUserId)
      expect(entry.isActive).toBe(true)
    })

    it('CIDR範囲を含むIPエントリを追加できる', async () => {
      const testUserId = 'user-cidr'
      const entry = await IPWhitelistManager.addIP(
        testUserId,
        '10.0.0.0',
        '社内ネットワーク',
        adminUserId,
        undefined,
        '10.0.0.0/24'
      )

      expect(entry.cidrRange).toBe('10.0.0.0/24')
    })

    it('有効期限付きIPエントリを追加できる', async () => {
      const testUserId = 'user-expiry'
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1日後

      const entry = await IPWhitelistManager.addIP(
        testUserId,
        testIp,
        '一時アクセス',
        adminUserId,
        expiresAt
      )

      expect(entry.expiresAt).toEqual(expiresAt)
    })
  })

  describe('IP許可チェック', () => {
    it('登録済みIPアドレスは許可される', async () => {
      const testUserId = 'user-allowed'
      await IPWhitelistManager.addIP(
        testUserId,
        testIp,
        'オフィスIP',
        adminUserId
      )

      const isAllowed = IPWhitelistManager.isIPAllowed(testUserId, testIp)
      expect(isAllowed).toBe(true)
    })

    it('未登録IPアドレスは拒否される', () => {
      const testUserId = 'user-not-allowed'
      const isAllowed = IPWhitelistManager.isIPAllowed(testUserId, '1.2.3.4')
      expect(isAllowed).toBe(false)
    })

    it('CIDR範囲内のIPアドレスは許可される', async () => {
      const testUserId = 'user-cidr-in'
      await IPWhitelistManager.addIP(
        testUserId,
        '10.0.0.0',
        '社内ネットワーク',
        adminUserId,
        undefined,
        '10.0.0.0/24'
      )

      const isAllowed1 = IPWhitelistManager.isIPAllowed(testUserId, '10.0.0.1')
      const isAllowed2 = IPWhitelistManager.isIPAllowed(testUserId, '10.0.0.255')

      expect(isAllowed1).toBe(true)
      expect(isAllowed2).toBe(true)
    })

    it('CIDR範囲外のIPアドレスは拒否される', async () => {
      const testUserId = 'user-cidr-out'
      await IPWhitelistManager.addIP(
        testUserId,
        '10.0.0.0',
        '社内ネットワーク',
        adminUserId,
        undefined,
        '10.0.0.0/24'
      )

      const isAllowed = IPWhitelistManager.isIPAllowed(testUserId, '10.0.1.0')
      expect(isAllowed).toBe(false)
    })

    it('期限切れのIPエントリは拒否される', async () => {
      vi.useFakeTimers()
      const testUserId = 'user-expired'

      const now = Date.now()
      const expiresAt = new Date(now + 60 * 60 * 1000) // 1時間後

      await IPWhitelistManager.addIP(
        testUserId,
        testIp,
        '一時アクセス',
        adminUserId,
        expiresAt
      )

      // 期限内はOK
      expect(IPWhitelistManager.isIPAllowed(testUserId, testIp)).toBe(true)

      // 2時間後に進める（期限切れ）
      vi.setSystemTime(now + 2 * 60 * 60 * 1000)

      // 期限切れで拒否される
      expect(IPWhitelistManager.isIPAllowed(testUserId, testIp)).toBe(false)

      vi.useRealTimers()
    })

    it('非アクティブなIPエントリは拒否される', async () => {
      const testUserId = 'user-inactive'
      const entry = await IPWhitelistManager.addIP(
        testUserId,
        testIp,
        'オフィスIP',
        adminUserId
      )

      // アクティブな状態ではOK
      expect(IPWhitelistManager.isIPAllowed(testUserId, testIp)).toBe(true)

      // 非アクティブ化
      entry.isActive = false

      // 非アクティブなので拒否される
      expect(IPWhitelistManager.isIPAllowed(testUserId, testIp)).toBe(false)
    })
  })

  describe('ホワイトリスト管理', () => {
    it('ユーザーのホワイトリストを取得できる', async () => {
      const testUserId = 'user-get-list'
      await IPWhitelistManager.addIP(testUserId, '8.8.4.4', 'IP1', adminUserId)
      await IPWhitelistManager.addIP(testUserId, '1.1.1.1', 'IP2', adminUserId)

      const whitelist = IPWhitelistManager.getUserWhitelist(testUserId)

      expect(whitelist.length).toBe(2)
    })

    it('IPエントリを削除できる', async () => {
      const testUserId = 'user-remove'
      const entry = await IPWhitelistManager.addIP(
        testUserId,
        testIp,
        'オフィスIP',
        adminUserId
      )

      const removed = await IPWhitelistManager.removeIP(testUserId, entry.id, adminUserId)

      expect(removed).toBe(true)
      expect(IPWhitelistManager.isIPAllowed(testUserId, testIp)).toBe(false)
    })

    it('存在しないエントリの削除はfalseを返す', async () => {
      const testUserId = 'user-no-entry'
      const removed = await IPWhitelistManager.removeIP(testUserId, 'invalid-id', adminUserId)
      expect(removed).toBe(false)
    })
  })
})

describe('DeviceAuthenticationManager', () => {
  const testIp = '8.8.8.8' // パブリックIPを使用

  const createMockFingerprint = (overrides?: Partial<DeviceFingerprint>): DeviceFingerprint => ({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    screen: {
      width: 1920,
      height: 1080,
      colorDepth: 24
    },
    timezone: 'Asia/Tokyo',
    language: 'ja-JP',
    platform: 'Win32',
    plugins: ['PDF Viewer', 'Chrome PDF Plugin'],
    cookieEnabled: true,
    doNotTrack: '1',
    ...overrides
  })

  describe('デバイスフィンガープリント', () => {
    it('デバイスハッシュを生成できる', () => {
      const fingerprint = createMockFingerprint()
      const hash = DeviceAuthenticationManager.generateDeviceHash(fingerprint)

      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(64) // SHA-256ハッシュは64文字
      expect(hash).toMatch(/^[0-9a-f]+$/) // 16進文字列
    })

    it('同じフィンガープリントからは同じハッシュが生成される', () => {
      const fingerprint = createMockFingerprint()

      const hash1 = DeviceAuthenticationManager.generateDeviceHash(fingerprint)
      const hash2 = DeviceAuthenticationManager.generateDeviceHash(fingerprint)

      expect(hash1).toBe(hash2)
    })

    it('異なるフィンガープリントからは異なるハッシュが生成される', () => {
      const fingerprint1 = createMockFingerprint()
      const fingerprint2 = createMockFingerprint({ userAgent: 'Different User Agent' })

      const hash1 = DeviceAuthenticationManager.generateDeviceHash(fingerprint1)
      const hash2 = DeviceAuthenticationManager.generateDeviceHash(fingerprint2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('デバイス登録', () => {
    it('新しいデバイスを登録できる', async () => {
      const testUserId = 'user-register-device'
      const fingerprint = createMockFingerprint()

      const device = await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Windows PC',
        fingerprint,
        testIp,
        false
      )

      expect(device).toHaveProperty('id')
      expect(device.userId).toBe(testUserId)
      expect(device.deviceName).toBe('Windows PC')
      expect(device.isTrusted).toBe(false)
      expect(device.isActive).toBe(true)
      expect(device.ipAddresses).toContain(testIp)
    })

    it('信頼済みデバイスとして登録できる', async () => {
      const testUserId = 'user-trusted-device'
      const fingerprint = createMockFingerprint()

      const device = await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Trusted Device',
        fingerprint,
        testIp,
        true
      )

      expect(device.isTrusted).toBe(true)
    })
  })

  describe('デバイス認証', () => {
    it('既知のデバイスを認識できる', async () => {
      const testUserId = 'user-known-device'
      const fingerprint = createMockFingerprint()

      await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Known Device',
        fingerprint,
        testIp
      )

      const result = await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        testIp
      )

      expect(result.isKnown).toBe(true)
      expect(result.device).toBeDefined()
      expect(result.riskScore).toBeLessThan(0.5)
    })

    it('信頼済みデバイスは低リスクスコアを返す', async () => {
      const testUserId = 'user-trusted-risk'
      const fingerprint = createMockFingerprint()

      await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Trusted Device',
        fingerprint,
        testIp,
        true
      )

      const result = await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        testIp
      )

      expect(result.isKnown).toBe(true)
      expect(result.riskScore).toBe(0.1)
    })

    it('未知のデバイスは検出される', async () => {
      const testUserId = 'user-unknown-device'
      const fingerprint = createMockFingerprint()

      const result = await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        testIp
      )

      expect(result.isKnown).toBe(false)
      expect(result.device).toBeUndefined()
      expect(result.riskScore).toBeGreaterThan(0)
    })

    it('既知のデバイスの新しいIPアドレスを記録する', async () => {
      const testUserId = 'user-new-ip'
      const fingerprint = createMockFingerprint()

      const device = await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Known Device',
        fingerprint,
        '1.1.1.1'
      )

      // 新しいIPから認証
      await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        '8.8.4.4'
      )

      // 新しいIPが記録されている
      expect(device.ipAddresses).toContain('1.1.1.1')
      expect(device.ipAddresses).toContain('8.8.4.4')
    })

    it('既知のデバイスのlastSeenが更新される', async () => {
      vi.useFakeTimers()
      const testUserId = 'user-lastseen'

      const fingerprint = createMockFingerprint()
      const now = Date.now()

      const device = await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Known Device',
        fingerprint,
        testIp
      )

      const originalLastSeen = device.lastSeen.getTime()

      // 1時間後に設定
      vi.setSystemTime(now + 60 * 60 * 1000)

      await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        testIp
      )

      expect(device.lastSeen.getTime()).toBeGreaterThan(originalLastSeen)

      vi.useRealTimers()
    })
  })

  describe('デバイスリスク評価', () => {
    it('ボットユーザーエージェントは高リスク', async () => {
      const testUserId = 'user-bot'
      const fingerprint = createMockFingerprint({
        userAgent: 'Googlebot/2.1'
      })

      const result = await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        testIp
      )

      expect(result.riskScore).toBeGreaterThan(0.5)
    })

    it('小さい画面サイズは中リスク', async () => {
      const testUserId = 'user-small-screen'
      const fingerprint = createMockFingerprint({
        screen: { width: 640, height: 480, colorDepth: 24 }
      })

      const result = await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        testIp
      )

      expect(result.riskScore).toBeGreaterThan(0.5)
    })

    it('プライベートIPアドレスは疑わしい', async () => {
      const testUserId = 'user-private-ip'
      const fingerprint = createMockFingerprint()

      const result = await DeviceAuthenticationManager.authenticateDevice(
        testUserId,
        fingerprint,
        '192.168.1.1' // プライベートIP
      )

      expect(result.riskScore).toBeGreaterThan(0.5)
    })

    it('プラグイン数が異常な場合は中リスク', async () => {
      const testUserId1 = 'user-no-plugins'
      const testUserId2 = 'user-too-many-plugins'
      const fingerprintNoPlugins = createMockFingerprint({ plugins: [] })
      const fingerprintTooManyPlugins = createMockFingerprint({
        plugins: Array(60).fill('plugin')
      })

      const result1 = await DeviceAuthenticationManager.authenticateDevice(
        testUserId1,
        fingerprintNoPlugins,
        testIp
      )

      const result2 = await DeviceAuthenticationManager.authenticateDevice(
        testUserId2,
        fingerprintTooManyPlugins,
        testIp
      )

      expect(result1.riskScore).toBeGreaterThan(0.5)
      expect(result2.riskScore).toBeGreaterThan(0.5)
    })
  })

  describe('デバイス管理', () => {
    it('ユーザーのデバイス一覧を取得できる', async () => {
      const testUserId = 'user-device-list'
      const fingerprint1 = createMockFingerprint()
      const fingerprint2 = createMockFingerprint({ userAgent: 'Different Agent' })

      await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Device 1',
        fingerprint1,
        testIp
      )

      await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Device 2',
        fingerprint2,
        testIp
      )

      const devices = DeviceAuthenticationManager.getUserDevices(testUserId)

      expect(devices.length).toBe(2)
    })

    it('デバイスの信頼設定を変更できる', async () => {
      const testUserId = 'user-set-trust'
      const fingerprint = createMockFingerprint()

      const device = await DeviceAuthenticationManager.registerDevice(
        testUserId,
        'Test Device',
        fingerprint,
        testIp,
        false
      )

      expect(device.isTrusted).toBe(false)

      const result = await DeviceAuthenticationManager.setDeviceTrust(
        testUserId,
        device.id,
        true,
        'admin-123'
      )

      expect(result).toBe(true)
      expect(device.isTrusted).toBe(true)
    })

    it('存在しないデバイスの信頼設定はfalseを返す', async () => {
      const testUserId = 'user-no-device'
      const result = await DeviceAuthenticationManager.setDeviceTrust(
        testUserId,
        'invalid-id',
        true,
        'admin-123'
      )

      expect(result).toBe(false)
    })
  })
})

describe('AnomalyDetectionManager', () => {
  const testIp = '8.8.8.8' // パブリックIPを使用
  const testDeviceHash = 'abcd1234'
  const testUserAgent = 'Mozilla/5.0'

  describe('ログイン試行記録', () => {
    it('成功したログイン試行を記録できる', async () => {
      const testUserId = 'user-login-success'
      const attempt = await AnomalyDetectionManager.recordLoginAttempt(
        testUserId,
        testIp,
        testUserAgent,
        testDeviceHash,
        true
      )

      expect(attempt).toHaveProperty('id')
      expect(attempt.userId).toBe(testUserId)
      expect(attempt.ipAddress).toBe(testIp)
      expect(attempt.success).toBe(true)
      expect(attempt.failureReason).toBeUndefined()
    })

    it('失敗したログイン試行を記録できる', async () => {
      const testUserId = 'user-login-fail'
      const attempt = await AnomalyDetectionManager.recordLoginAttempt(
        testUserId,
        testIp,
        testUserAgent,
        testDeviceHash,
        false,
        '無効なパスワード'
      )

      expect(attempt.success).toBe(false)
      expect(attempt.failureReason).toBe('無効なパスワード')
    })

    it('位置情報付きログイン試行を記録できる', async () => {
      const testUserId = 'user-login-location'
      const location = {
        country: 'Japan',
        city: 'Tokyo',
        latitude: 35.6762,
        longitude: 139.6503
      }

      const attempt = await AnomalyDetectionManager.recordLoginAttempt(
        testUserId,
        testIp,
        testUserAgent,
        testDeviceHash,
        true,
        undefined,
        location
      )

      expect(attempt.location).toEqual(location)
    })
  })

  describe('ブルートフォース攻撃検知', () => {
    it('5回連続失敗でアカウントがロックされる', async () => {
      const testUserId = 'user-brute-force'
      // 5回連続で失敗ログインを記録
      for (let i = 0; i < 5; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(
          testUserId,
          testIp,
          testUserAgent,
          testDeviceHash,
          false,
          '無効なパスワード'
        )
      }

      // アカウントがロックされている
      const isLocked = AnomalyDetectionManager.isUserLocked(testUserId)
      expect(isLocked).toBe(true)
    })

    it('ブルートフォース攻撃検知でセキュリティアラートが生成される', async () => {
      const userId = 'user-brute-force'

      // 5回連続で失敗ログイン
      for (let i = 0; i < 5; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(
          userId,
          testIp,
          testUserAgent,
          testDeviceHash,
          false,
          '無効なパスワード'
        )
      }

      const alerts = AnomalyDetectionManager.getSecurityAlerts(userId)
      const bruteForceAlert = alerts.find(a => a.type === 'brute_force')

      expect(bruteForceAlert).toBeDefined()
      expect(bruteForceAlert?.severity).toBe('critical')
    })
  })

  describe('ユーザーロック管理', () => {
    it('ユーザーを手動でロックできる', async () => {
      const userId = 'user-manual-lock'

      await AnomalyDetectionManager.lockUser(userId, '手動ロック', 60)

      expect(AnomalyDetectionManager.isUserLocked(userId)).toBe(true)
    })

    it('ユーザーを手動で解除できる', async () => {
      const userId = 'user-unlock'

      await AnomalyDetectionManager.lockUser(userId, 'テストロック', 60)
      expect(AnomalyDetectionManager.isUserLocked(userId)).toBe(true)

      const unlocked = await AnomalyDetectionManager.unlockUser(userId, 'admin-123')

      expect(unlocked).toBe(true)
      expect(AnomalyDetectionManager.isUserLocked(userId)).toBe(false)
    })

    it('ロック期間経過後に自動解除される', async () => {
      vi.useFakeTimers()

      const userId = 'user-auto-unlock'

      await AnomalyDetectionManager.lockUser(userId, 'テストロック', 30) // 30分

      expect(AnomalyDetectionManager.isUserLocked(userId)).toBe(true)

      // 31分後に進める
      vi.advanceTimersByTime(31 * 60 * 1000)

      expect(AnomalyDetectionManager.isUserLocked(userId)).toBe(false)

      vi.useRealTimers()
    })

    it('ロックされていないユーザーの解除はfalseを返す', async () => {
      const unlocked = await AnomalyDetectionManager.unlockUser('never-locked-user', 'admin-123')
      expect(unlocked).toBe(false)
    })
  })

  describe('ログイン履歴', () => {
    it('ユーザーのログイン履歴を取得できる', async () => {
      const userId = 'user-history'

      await AnomalyDetectionManager.recordLoginAttempt(userId, testIp, testUserAgent, testDeviceHash, true)
      await AnomalyDetectionManager.recordLoginAttempt(userId, testIp, testUserAgent, testDeviceHash, false)

      const history = AnomalyDetectionManager.getUserLoginHistory(userId)

      expect(history.length).toBeGreaterThanOrEqual(2)
      expect(history.every(h => h.userId === userId)).toBe(true)
    })

    it('ログイン履歴は新しい順にソートされる', async () => {
      vi.useFakeTimers()

      const userId = 'user-sort-history'

      await AnomalyDetectionManager.recordLoginAttempt(userId, testIp, testUserAgent, testDeviceHash, true)

      vi.advanceTimersByTime(60000) // 1分後

      await AnomalyDetectionManager.recordLoginAttempt(userId, testIp, testUserAgent, testDeviceHash, true)

      const history = AnomalyDetectionManager.getUserLoginHistory(userId)

      expect(history.length).toBeGreaterThanOrEqual(2)

      // 最新のログインが先頭
      const filtered = history.filter(h => h.userId === userId)
      expect(filtered[0].timestamp.getTime()).toBeGreaterThanOrEqual(filtered[1].timestamp.getTime())

      vi.useRealTimers()
    })

    it('履歴取得の件数制限が機能する', async () => {
      const userId = 'user-limit-history'

      for (let i = 0; i < 10; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(userId, testIp, testUserAgent, testDeviceHash, true)
      }

      const history = AnomalyDetectionManager.getUserLoginHistory(userId, 5)

      expect(history.length).toBeLessThanOrEqual(5)
    })
  })

  describe('セキュリティアラート', () => {
    it('セキュリティアラート一覧を取得できる', async () => {
      const userId = 'user-alerts'

      // ブルートフォース攻撃を発生させてアラート生成
      for (let i = 0; i < 5; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(
          userId,
          testIp,
          testUserAgent,
          testDeviceHash,
          false
        )
      }

      const alerts = AnomalyDetectionManager.getSecurityAlerts(userId)

      expect(alerts.length).toBeGreaterThan(0)
      expect(alerts.every(a => a.userId === userId)).toBe(true)
    })

    it('未解決のアラートのみを取得できる', async () => {
      const userId = 'user-unresolved'

      // アラート生成
      for (let i = 0; i < 5; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(
          userId,
          testIp,
          testUserAgent,
          testDeviceHash,
          false
        )
      }

      const unresolvedAlerts = AnomalyDetectionManager.getSecurityAlerts(userId, false)

      expect(unresolvedAlerts.every(a => !a.resolved)).toBe(true)
    })

    it('アラートを解決できる', async () => {
      const userId = 'user-resolve'

      // アラート生成
      for (let i = 0; i < 5; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(
          userId,
          testIp,
          testUserAgent,
          testDeviceHash,
          false
        )
      }

      const alerts = AnomalyDetectionManager.getSecurityAlerts(userId, false)
      const alertToResolve = alerts[0]

      const resolved = await AnomalyDetectionManager.resolveAlert(alertToResolve.id, 'admin-123')

      expect(resolved).toBe(true)
      expect(alertToResolve.resolved).toBe(true)
      expect(alertToResolve.resolvedBy).toBe('admin-123')
      expect(alertToResolve.resolvedAt).toBeDefined()
    })

    it('既に解決済みのアラートの解決はfalseを返す', async () => {
      const userId = 'user-already-resolved'

      // アラート生成
      for (let i = 0; i < 5; i++) {
        await AnomalyDetectionManager.recordLoginAttempt(
          userId,
          testIp,
          testUserAgent,
          testDeviceHash,
          false
        )
      }

      const alerts = AnomalyDetectionManager.getSecurityAlerts(userId, false)
      const alert = alerts[0]

      await AnomalyDetectionManager.resolveAlert(alert.id, 'admin-123')

      // 2回目の解決はfalse
      const result = await AnomalyDetectionManager.resolveAlert(alert.id, 'admin-456')
      expect(result).toBe(false)
    })
  })

  describe('地理的異常検知', () => {
    it('物理的に不可能な移動を検知する', async () => {
      const userId = 'user-geo-anomaly'

      // 東京からログイン
      await AnomalyDetectionManager.recordLoginAttempt(
        userId,
        testIp,
        testUserAgent,
        testDeviceHash,
        true,
        undefined,
        { country: 'Japan', city: 'Tokyo', latitude: 35.6762, longitude: 139.6503 }
      )

      // 5分後にニューヨークからログイン（物理的に不可能）
      await AnomalyDetectionManager.recordLoginAttempt(
        userId,
        '8.8.8.8',
        testUserAgent,
        testDeviceHash,
        false,
        undefined,
        { country: 'USA', city: 'New York', latitude: 40.7128, longitude: -74.0060 }
      )

      const alerts = AnomalyDetectionManager.getSecurityAlerts(userId)
      const geoAlert = alerts.find(a => a.description.includes('物理的に不可能'))

      expect(geoAlert).toBeDefined()
      expect(geoAlert?.type).toBe('suspicious_login')
      expect(geoAlert?.severity).toBe('high')
    })
  })
})

describe('accessControlMiddleware', () => {
  it('ミドルウェア関数を返す', () => {
    const middleware = accessControlMiddleware()
    expect(typeof middleware).toBe('function')
  })

  it('ロックされたユーザーは423エラーを返す', async () => {
    const middleware = accessControlMiddleware()
    const userId = 'locked-user-123'

    await AnomalyDetectionManager.lockUser(userId, 'テストロック', 60)

    const req: ExtendedRequest = {
      ip: '192.168.1.100',
      user: { id: userId },
      get: () => 'Mozilla/5.0'
    }

    let statusCode = 0
    let responseData: unknown = null

    const res: ExtendedResponse = {
      status: (code: number) => ({
        json: (data: unknown) => {
          statusCode = code
          responseData = data
        }
      })
    }

    const next = vi.fn()

    await middleware(req, res, next)

    expect(statusCode).toBe(423)
    expect(responseData).toEqual({
      error: 'アカウントが一時的にロックされています',
      code: 'ACCOUNT_LOCKED'
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('ロックされていないユーザーはnextを呼ぶ', async () => {
    const middleware = accessControlMiddleware()

    const req: ExtendedRequest = {
      ip: '192.168.1.100',
      user: { id: 'normal-user-123' },
      get: () => 'Mozilla/5.0'
    }

    const res: ExtendedResponse = {
      status: () => ({ json: () => {} })
    }

    const next = vi.fn()

    await middleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('管理者が未承認IPからアクセスすると403エラーを返す', async () => {
    const middleware = accessControlMiddleware()
    const adminId = 'admin-123'

    // ホワイトリストに別のIPを登録
    await IPWhitelistManager.addIP(adminId, '10.0.0.1', '承認IP', 'system')

    const req: ExtendedRequest = {
      ip: '192.168.1.100', // 未承認IP
      user: { id: adminId, role: 'admin' },
      get: () => 'Mozilla/5.0'
    }

    let statusCode = 0
    let responseData: unknown = null

    const res: ExtendedResponse = {
      status: (code: number) => ({
        json: (data: unknown) => {
          statusCode = code
          responseData = data
        }
      })
    }

    const next = vi.fn()

    await middleware(req, res, next)

    expect(statusCode).toBe(403)
    expect(responseData).toEqual({
      error: 'このIPアドレスからのアクセスは許可されていません',
      code: 'IP_NOT_ALLOWED'
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('管理者が承認済みIPからアクセスするとnextを呼ぶ', async () => {
    const middleware = accessControlMiddleware()
    const adminId = 'admin-approved'
    const approvedIp = '10.0.0.100'

    // ホワイトリストに登録
    await IPWhitelistManager.addIP(adminId, approvedIp, '承認IP', 'system')

    const req: ExtendedRequest = {
      ip: approvedIp,
      user: { id: adminId, role: 'admin' },
      get: () => 'Mozilla/5.0'
    }

    const res: ExtendedResponse = {
      status: () => ({ json: () => {} })
    }

    const next = vi.fn()

    await middleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })
})
