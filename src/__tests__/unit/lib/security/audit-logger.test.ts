/**
 * 金融グレード監査ログシステムのユニットテスト
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  AuditLogger,
  AuditAction,
  type AuditLogEntry
} from '../../../../lib/security/audit-logger'

// encryptionモジュールをモック
vi.mock('../../../../lib/security/encryption', () => ({
  FinancialEncryption: {
    generateSecureRandomString: vi.fn((length: number) => {
      return Math.random().toString(36).substring(2, 2 + length)
    }),
    encrypt: vi.fn(async (data: string) => {
      return {
        encrypted: Buffer.from(data).toString('base64'),
        iv: 'mock-iv',
        salt: 'mock-salt',
        authTag: 'mock-auth-tag'
      }
    })
  }
}))

describe('AuditLogger', () => {
  beforeEach(() => {
    // 各テストでログをクリア（プライベートフィールドなのでリフレクションを使用）
    // @ts-expect-error - テスト用にプライベートフィールドにアクセス
    AuditLogger['logs'] = []
  })

  describe('基本的なログ記録', () => {
    it('ログエントリを記録できる', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.LOGIN,
        'user-login',
        { username: 'testuser' },
        {
          userId: 'user-123',
          ipAddress: '8.8.8.8',
          result: 'success',
          riskLevel: 'low'
        }
      )

      expect(logEntry).toHaveProperty('id')
      expect(logEntry).toHaveProperty('timestamp')
      expect(logEntry).toHaveProperty('hash')
      expect(logEntry.action).toBe(AuditAction.LOGIN)
      expect(logEntry.resource).toBe('user-login')
      expect(logEntry.userId).toBe('user-123')
      expect(logEntry.result).toBe('success')
      expect(logEntry.riskLevel).toBe('low')
    })

    it('デフォルト値が正しく設定される', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.API_CALL,
        '/api/test',
        {}
      )

      expect(logEntry.result).toBe('success')
      expect(logEntry.riskLevel).toBe('low')
    })

    it('複数のログエントリを記録できる', async () => {
      await AuditLogger.log(AuditAction.LOGIN, 'login-1', {})
      await AuditLogger.log(AuditAction.LOGOUT, 'logout-1', {})
      await AuditLogger.log(AuditAction.API_CALL, 'api-1', {})

      // @ts-expect-error - テスト用にプライベートフィールドにアクセス
      const logs = AuditLogger['logs']
      expect(logs.length).toBe(3)
    })

    it('失敗結果のログを記録できる', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.LOGIN_FAILED,
        'failed-login',
        {},
        {
          userId: 'user-456',
          result: 'failure',
          errorMessage: '無効な認証情報',
          riskLevel: 'medium'
        }
      )

      expect(logEntry.result).toBe('failure')
      expect(logEntry.errorMessage).toBe('無効な認証情報')
      expect(logEntry.riskLevel).toBe('medium')
    })
  })

  describe('ハッシュチェーン', () => {
    it('最初のログにはpreviousHashがnull', async () => {
      const logEntry = await AuditLogger.log(AuditAction.LOGIN, 'first-log', {})

      expect(logEntry.previousHash).toBeNull()
    })

    it('2番目以降のログには前のログのハッシュが含まれる', async () => {
      const firstLog = await AuditLogger.log(AuditAction.LOGIN, 'first-log', {})
      const secondLog = await AuditLogger.log(AuditAction.LOGOUT, 'second-log', {})

      expect(secondLog.previousHash).toBe(firstLog.hash)
    })

    it('ハッシュチェーンが正しく連結される', async () => {
      const log1 = await AuditLogger.log(AuditAction.LOGIN, 'log-1', {})
      const log2 = await AuditLogger.log(AuditAction.API_CALL, 'log-2', {})
      const log3 = await AuditLogger.log(AuditAction.LOGOUT, 'log-3', {})

      expect(log1.previousHash).toBeNull()
      expect(log2.previousHash).toBe(log1.hash)
      expect(log3.previousHash).toBe(log2.hash)
    })
  })

  describe('ログ整合性検証', () => {
    it('改ざんされていないログチェーンは検証に成功する', async () => {
      await AuditLogger.log(AuditAction.LOGIN, 'log-1', {})
      await AuditLogger.log(AuditAction.API_CALL, 'log-2', {})
      await AuditLogger.log(AuditAction.LOGOUT, 'log-3', {})

      const result = AuditLogger.verifyLogIntegrity()

      expect(result.valid).toBe(true)
      expect(result.corruptedEntries).toHaveLength(0)
    })

    it('ハッシュが改ざんされたログは検証に失敗する', async () => {
      await AuditLogger.log(AuditAction.LOGIN, 'log-1', {})
      await AuditLogger.log(AuditAction.LOGOUT, 'log-2', {})

      // @ts-expect-error - テスト用にプライベートフィールドにアクセス
      const logs: AuditLogEntry[] = AuditLogger['logs']

      // ハッシュを改ざん
      logs[1].hash = 'tampered-hash'

      const result = AuditLogger.verifyLogIntegrity()

      expect(result.valid).toBe(false)
      expect(result.corruptedEntries.length).toBeGreaterThan(0)
    })

    it('previousHashが改ざんされたログは検証に失敗する', async () => {
      await AuditLogger.log(AuditAction.LOGIN, 'log-1', {})
      await AuditLogger.log(AuditAction.LOGOUT, 'log-2', {})

      // @ts-expect-error - テスト用にプライベートフィールドにアクセス
      const logs: AuditLogEntry[] = AuditLogger['logs']

      // previousHashを改ざん
      logs[1].previousHash = 'tampered-previous-hash'

      const result = AuditLogger.verifyLogIntegrity()

      expect(result.valid).toBe(false)
      expect(result.corruptedEntries.length).toBeGreaterThan(0)
    })
  })

  describe('機密データサニタイゼーション', () => {
    it('パスワードフィールドは[REDACTED]に置換される', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.PASSWORD_CHANGE,
        'password-update',
        {
          password: 'secret-password-123',
          newPassword: 'new-secret-456',
          username: 'testuser'
        }
      )

      expect(logEntry.details.password).toBe('[REDACTED]')
      expect(logEntry.details.newPassword).toBe('[REDACTED]')
      expect(logEntry.details.username).toBe('testuser')
    })

    it('APIキーフィールドは[REDACTED]に置換される', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.API_CALL,
        'api-request',
        {
          apiKey: 'sk-1234567890',
          accessToken: 'token-abc-def',
          username: 'testuser'
        }
      )

      expect(logEntry.details.apiKey).toBe('[REDACTED]')
      expect(logEntry.details.accessToken).toBe('[REDACTED]')
      expect(logEntry.details.username).toBe('testuser')
    })

    it('ネストされたオブジェクトの機密データもサニタイズされる', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.WALLET_CREATE,
        'wallet-creation',
        {
          wallet: {
            address: '0x1234567890',
            privateKey: 'pk-secret-key-123',
            balance: 100
          },
          user: {
            id: 'user-123',
            password: 'user-secret-password'
          }
        }
      )

      expect(logEntry.details.wallet).toBeDefined()
      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.wallet.privateKey).toBe('[REDACTED]')
      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.wallet.address).toBe('0x1234567890')
      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.user.password).toBe('[REDACTED]')
      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.user.id).toBe('user-123')
    })

    it('配列内の機密データもサニタイズされる', async () => {
      const logEntry = await AuditLogger.log(
        AuditAction.DATA_EXPORT,
        'bulk-export',
        {
          users: [
            { id: 'user-1', password: 'secret-1' },
            { id: 'user-2', password: 'secret-2' }
          ]
        }
      )

      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.users[0].password).toBe('[REDACTED]')
      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.users[1].password).toBe('[REDACTED]')
      // @ts-expect-error - テスト用に型チェックを無視
      expect(logEntry.details.users[0].id).toBe('user-1')
    })
  })

  describe('ログ検索', () => {
    beforeEach(async () => {
      // @ts-expect-error - テスト用にプライベートフィールドにアクセス
      AuditLogger['logs'] = []
      await AuditLogger.log(AuditAction.LOGIN, 'login-1', {}, { userId: 'user-123', ipAddress: '8.8.8.8', riskLevel: 'low' })
      await new Promise(resolve => setTimeout(resolve, 5)) // タイムスタンプの違いを保証
      await AuditLogger.log(AuditAction.API_CALL, 'api-1', {}, { userId: 'user-456', ipAddress: '1.1.1.1', riskLevel: 'medium' })
      await new Promise(resolve => setTimeout(resolve, 5))
      await AuditLogger.log(AuditAction.LOGOUT, 'logout-1', {}, { userId: 'user-123', ipAddress: '8.8.8.8', riskLevel: 'low' })
      await new Promise(resolve => setTimeout(resolve, 5))
      await AuditLogger.log(AuditAction.LOGIN_FAILED, 'login-failed-1', {}, { userId: 'user-789', ipAddress: '8.8.8.8', riskLevel: 'high' })
    })

    it('userIdでログを検索できる', () => {
      const logs = AuditLogger.searchLogs({ userId: 'user-123' })

      expect(logs.length).toBe(2)
      expect(logs.every(log => log.userId === 'user-123')).toBe(true)
    })

    it('actionでログを検索できる', () => {
      const logs = AuditLogger.searchLogs({ action: AuditAction.API_CALL })

      expect(logs.length).toBe(1)
      expect(logs[0].action).toBe(AuditAction.API_CALL)
    })

    it('riskLevelでログを検索できる', () => {
      const logs = AuditLogger.searchLogs({ riskLevel: 'high' })

      expect(logs.length).toBe(1)
      expect(logs[0].riskLevel).toBe('high')
    })

    it('ipAddressでログを検索できる', () => {
      const logs = AuditLogger.searchLogs({ ipAddress: '8.8.8.8' })

      expect(logs.length).toBe(3)
      expect(logs.every(log => log.ipAddress === '8.8.8.8')).toBe(true)
    })

    it('複数の条件で検索できる', () => {
      const logs = AuditLogger.searchLogs({
        userId: 'user-123',
        ipAddress: '8.8.8.8',
        riskLevel: 'low'
      })

      expect(logs.length).toBe(2)
      expect(logs.every(log =>
        log.userId === 'user-123' &&
        log.ipAddress === '8.8.8.8' &&
        log.riskLevel === 'low'
      )).toBe(true)
    })

    it('limitパラメータで結果数を制限できる', () => {
      const logs = AuditLogger.searchLogs({ limit: 2 })

      expect(logs.length).toBe(2)
    })

    it('結果は新しい順にソートされる', () => {
      const logs = AuditLogger.searchLogs({})

      // 最新のログが最初
      expect(logs[0].action).toBe(AuditAction.LOGIN_FAILED)
      expect(logs[logs.length - 1].action).toBe(AuditAction.LOGIN)
    })

    it('日付範囲で検索できる', async () => {
      const startDate = new Date(Date.now() - 60000) // 1分前
      const endDate = new Date()

      const logs = AuditLogger.searchLogs({ startDate, endDate })

      expect(logs.length).toBeGreaterThan(0)
      expect(logs.every(log =>
        log.timestamp >= startDate && log.timestamp <= endDate
      )).toBe(true)
    })

    it('resourceでログを検索できる', () => {
      const logs = AuditLogger.searchLogs({ resource: 'login' })

      expect(logs.length).toBe(2) // login-1 and failed-1
      expect(logs.every(log => log.resource.includes('login'))).toBe(true)
    })
  })

  describe('API呼び出しログ', () => {
    it('API呼び出しを記録できる', async () => {
      const logEntry = await AuditLogger.logAPICall(
        '/api/users',
        'GET',
        {
          endpoint: '/api/users',
          method: 'GET',
          responseStatus: 200,
          processingTime: 150
        },
        {
          userId: 'user-123',
          ipAddress: '8.8.8.8',
          result: 'success'
        }
      )

      expect(logEntry.action).toBe(AuditAction.API_CALL)
      expect(logEntry.resource).toBe('GET /api/users')
      expect(logEntry.details.endpoint).toBe('/api/users')
      expect(logEntry.details.method).toBe('GET')
      expect(logEntry.result).toBe('success')
    })

    it('管理者エンドポイントは高リスクレベルになる', async () => {
      const logEntry = await AuditLogger.logAPICall(
        '/api/admin/users',
        'DELETE',
        {
          endpoint: '/api/admin/users',
          method: 'DELETE',
          responseStatus: 200
        },
        {
          userId: 'admin-123',
          result: 'success'
        }
      )

      expect(logEntry.riskLevel).toBe('critical')
    })

    it('出金エンドポイントは高リスクレベルになる', async () => {
      const logEntry = await AuditLogger.logAPICall(
        '/api/withdrawal',
        'POST',
        {
          endpoint: '/api/withdrawal',
          method: 'POST',
          responseStatus: 200
        },
        {
          userId: 'user-123',
          result: 'success'
        }
      )

      expect(logEntry.riskLevel).toBe('critical')
    })

    it('エラーステータスは高リスクレベルになる', async () => {
      const logEntry = await AuditLogger.logAPICall(
        '/api/data',
        'GET',
        {
          endpoint: '/api/data',
          method: 'GET',
          responseStatus: 500
        },
        {
          userId: 'user-123',
          result: 'failure'
        }
      )

      expect(logEntry.riskLevel).toBe('high')
    })

    it('4xxエラーは中リスクレベルになる', async () => {
      const logEntry = await AuditLogger.logAPICall(
        '/api/data',
        'GET',
        {
          endpoint: '/api/data',
          method: 'GET',
          responseStatus: 404
        },
        {
          userId: 'user-123',
          result: 'failure'
        }
      )

      expect(logEntry.riskLevel).toBe('medium')
    })
  })

  describe('機密操作ログ', () => {
    it('機密操作を記録できる', async () => {
      const logEntry = await AuditLogger.logSensitiveOperation(
        AuditAction.BALANCE_UPDATE,
        'user-balance',
        {
          operation: 'balance-adjustment',
          oldValue: { balance: 100 },
          newValue: { balance: 200 },
          affectedFields: ['balance'],
          reason: '入金処理'
        },
        {
          userId: 'admin-123',
          userRole: 'admin',
          sessionId: 'session-abc',
          ipAddress: '8.8.8.8',
          result: 'success'
        }
      )

      expect(logEntry.action).toBe(AuditAction.BALANCE_UPDATE)
      expect(logEntry.riskLevel).toBe('high')
      expect(logEntry.details.operation).toBe('balance-adjustment')
      expect(logEntry.details.affectedFields).toContain('balance')
      expect(logEntry.details.encryptedOldValue).toBeDefined()
      expect(logEntry.details.encryptedNewValue).toBeDefined()
    })
  })

  describe('セキュリティアラートログ', () => {
    it('セキュリティアラートを記録できる', async () => {
      const logEntry = await AuditLogger.logSecurityAlert(
        'brute_force',
        'ブルートフォース攻撃を検出',
        { attempts: 10, ipAddress: '1.2.3.4' },
        {
          userId: 'user-123',
          ipAddress: '1.2.3.4',
          severity: 'critical'
        }
      )

      expect(logEntry.action).toBe(AuditAction.SECURITY_ALERT)
      expect(logEntry.resource).toBe('brute_force')
      expect(logEntry.riskLevel).toBe('critical')
      expect(logEntry.details.description).toBe('ブルートフォース攻撃を検出')
      expect(logEntry.details.attempts).toBe(10)
    })
  })

  describe('セキュリティレポート生成', () => {
    beforeEach(async () => {
      // 様々なログを生成
      await AuditLogger.log(AuditAction.LOGIN, 'login-1', {}, { userId: 'user-1', ipAddress: '8.8.8.8', riskLevel: 'low' })
      await AuditLogger.log(AuditAction.LOGIN, 'login-2', {}, { userId: 'user-2', ipAddress: '8.8.8.8', riskLevel: 'low' })
      await AuditLogger.log(AuditAction.API_CALL, 'api-1', {}, { userId: 'user-1', ipAddress: '1.1.1.1', riskLevel: 'medium' })
      await AuditLogger.log(AuditAction.LOGOUT, 'logout-1', {}, { userId: 'user-1', ipAddress: '8.8.8.8', riskLevel: 'low' })
      await AuditLogger.log(AuditAction.LOGIN_FAILED, 'failed-1', {}, { userId: 'user-3', ipAddress: '8.8.8.8', result: 'failure', riskLevel: 'high' })
      await AuditLogger.log(AuditAction.SECURITY_ALERT, 'alert-1', {}, { ipAddress: '8.8.8.8', riskLevel: 'critical' })
    })

    it('セキュリティレポートを生成できる', () => {
      const startDate = new Date(Date.now() - 60000)
      const endDate = new Date()

      const report = AuditLogger.generateSecurityReport(startDate, endDate)

      expect(report).toHaveProperty('totalEvents')
      expect(report).toHaveProperty('riskDistribution')
      expect(report).toHaveProperty('topActions')
      expect(report).toHaveProperty('suspiciousIPs')
      expect(report).toHaveProperty('failedOperations')

      expect(report.totalEvents).toBeGreaterThan(0)
    })

    it('リスクレベル分布が正しく計算される', () => {
      const startDate = new Date(Date.now() - 60000)
      const endDate = new Date()

      const report = AuditLogger.generateSecurityReport(startDate, endDate)

      expect(report.riskDistribution.low).toBe(3)
      expect(report.riskDistribution.medium).toBe(1)
      expect(report.riskDistribution.high).toBe(1)
      expect(report.riskDistribution.critical).toBe(1)
    })

    it('トップアクションが正しく集計される', () => {
      const startDate = new Date(Date.now() - 60000)
      const endDate = new Date()

      const report = AuditLogger.generateSecurityReport(startDate, endDate)

      expect(report.topActions.length).toBeGreaterThan(0)
      const loginAction = report.topActions.find(a => a.action === AuditAction.LOGIN)
      expect(loginAction).toBeDefined()
      expect(loginAction?.count).toBe(2)
    })

    it('失敗操作が正しく抽出される', () => {
      const startDate = new Date(Date.now() - 60000)
      const endDate = new Date()

      const report = AuditLogger.generateSecurityReport(startDate, endDate)

      expect(report.failedOperations.length).toBe(1)
      expect(report.failedOperations[0].result).toBe('failure')
    })
  })

  describe('ログサイズ管理', () => {
    it('最大ログ数を超えると古いログが削除される', async () => {
      // @ts-expect-error - テスト用にプライベートフィールドにアクセス
      const originalMaxLogEntries = AuditLogger['MAX_LOG_ENTRIES']

      // @ts-expect-error - テスト用に最大値を小さく設定
      AuditLogger['MAX_LOG_ENTRIES'] = 5

      // 7つのログを追加
      for (let i = 0; i < 7; i++) {
        await AuditLogger.log(AuditAction.API_CALL, `log-${i}`, {})
      }

      // @ts-expect-error - テスト用にプライベートフィールドにアクセス
      const logs = AuditLogger['logs']

      // 最大5つまで保持される
      expect(logs.length).toBe(5)

      // 最新のログが残っている
      expect(logs[logs.length - 1].resource).toBe('log-6')

      // @ts-expect-error - 元に戻す
      AuditLogger['MAX_LOG_ENTRIES'] = originalMaxLogEntries
    })
  })
})
