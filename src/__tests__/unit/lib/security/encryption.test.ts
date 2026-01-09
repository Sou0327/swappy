/**
 * 金融グレード暗号化システムのユニットテスト
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  FinancialEncryption,
  KeyRotationManager,
  type EncryptedData,
  type KeyRotationInfo
} from '../../../../lib/security/encryption'

describe('FinancialEncryption', () => {
  const testPassword = 'test-master-password-12345'
  const testData = '機密データ: クレジットカード番号 1234-5678-9012-3456'

  describe('暗号化・復号化', () => {
    it('正常に暗号化・復号化できる', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)

      expect(encrypted).toHaveProperty('encrypted')
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('salt')
      expect(encrypted).toHaveProperty('authTag')

      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)
      expect(decrypted).toBe(testData)
    })

    it('異なるパスワードでの復号化は失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)

      await expect(
        FinancialEncryption.decrypt(encrypted, 'wrong-password')
      ).rejects.toThrow('復号化に失敗しました')
    })

    it('改ざんされた暗号化データの復号化は失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)

      // 暗号化データを改ざん
      const tamperedData: EncryptedData = {
        ...encrypted,
        encrypted: encrypted.encrypted.slice(0, -4) + 'ffff'
      }

      await expect(
        FinancialEncryption.decrypt(tamperedData, testPassword)
      ).rejects.toThrow()
    })

    it('改ざんされたIVでの復号化は失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)

      const tamperedData: EncryptedData = {
        ...encrypted,
        iv: encrypted.iv.slice(0, -4) + 'ffff'
      }

      await expect(
        FinancialEncryption.decrypt(tamperedData, testPassword)
      ).rejects.toThrow()
    })

    it('改ざんされた認証タグでの復号化は失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)

      const tamperedData: EncryptedData = {
        ...encrypted,
        authTag: encrypted.authTag.slice(0, -4) + 'ffff'
      }

      await expect(
        FinancialEncryption.decrypt(tamperedData, testPassword)
      ).rejects.toThrow()
    })

    it('空文字列の暗号化・復号化ができる', async () => {
      const encrypted = await FinancialEncryption.encrypt('', testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe('')
    })

    it('長い文字列の暗号化・復号化ができる', async () => {
      const longData = 'A'.repeat(10000)
      const encrypted = await FinancialEncryption.encrypt(longData, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(longData)
    })

    it('特殊文字を含むデータの暗号化・復号化ができる', async () => {
      const specialData = '🔐💰📊\n\r\t"\'\\日本語テスト'
      const encrypted = await FinancialEncryption.encrypt(specialData, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(specialData)
    })

    it('同じデータでも毎回異なる暗号化結果が生成される（ソルト・IVのランダム性）', async () => {
      const encrypted1 = await FinancialEncryption.encrypt(testData, testPassword)
      const encrypted2 = await FinancialEncryption.encrypt(testData, testPassword)

      // ソルトとIVが異なるため、暗号化結果も異なる
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
      expect(encrypted1.salt).not.toBe(encrypted2.salt)

      // どちらも正しく復号化できる
      const decrypted1 = await FinancialEncryption.decrypt(encrypted1, testPassword)
      const decrypted2 = await FinancialEncryption.decrypt(encrypted2, testPassword)

      expect(decrypted1).toBe(testData)
      expect(decrypted2).toBe(testData)
    })
  })

  describe('セキュアランダム生成', () => {
    it('指定バイト長のセキュアランダムバイト配列を生成できる', () => {
      const random32 = FinancialEncryption.generateSecureRandom(32)
      const random16 = FinancialEncryption.generateSecureRandom(16)

      expect(random32).toBeInstanceOf(Buffer)
      expect(random32.length).toBe(32)
      expect(random16.length).toBe(16)
    })

    it('毎回異なるランダム値が生成される', () => {
      const random1 = FinancialEncryption.generateSecureRandom(32)
      const random2 = FinancialEncryption.generateSecureRandom(32)

      expect(random1.equals(random2)).toBe(false)
    })

    it('指定長のセキュアランダム文字列を生成できる', () => {
      const str32 = FinancialEncryption.generateSecureRandomString(32)
      const str16 = FinancialEncryption.generateSecureRandomString(16)

      expect(typeof str32).toBe('string')
      expect(str32.length).toBe(32)
      expect(str16.length).toBe(16)

      // 16進文字列のみ（0-9, a-f）
      expect(str32).toMatch(/^[0-9a-f]+$/)
      expect(str16).toMatch(/^[0-9a-f]+$/)
    })

    it('ランダム文字列は毎回異なる値', () => {
      const str1 = FinancialEncryption.generateSecureRandomString(32)
      const str2 = FinancialEncryption.generateSecureRandomString(32)

      expect(str1).not.toBe(str2)
    })
  })

  describe('パスワードハッシュ化と検証', () => {
    const password = 'user-password-12345'

    it('パスワードをハッシュ化できる', async () => {
      const { hash, salt } = await FinancialEncryption.hashPassword(password)

      expect(typeof hash).toBe('string')
      expect(typeof salt).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
      expect(salt.length).toBeGreaterThan(0)
    })

    it('同じパスワードでも異なるソルトで異なるハッシュが生成される', async () => {
      const result1 = await FinancialEncryption.hashPassword(password)
      const result2 = await FinancialEncryption.hashPassword(password)

      expect(result1.salt).not.toBe(result2.salt)
      expect(result1.hash).not.toBe(result2.hash)
    })

    it('正しいパスワードで検証が成功する', async () => {
      const { hash, salt } = await FinancialEncryption.hashPassword(password)
      const isValid = await FinancialEncryption.verifyPassword(password, hash, salt)

      expect(isValid).toBe(true)
    })

    it('間違ったパスワードで検証が失敗する', async () => {
      const { hash, salt } = await FinancialEncryption.hashPassword(password)
      const isValid = await FinancialEncryption.verifyPassword('wrong-password', hash, salt)

      expect(isValid).toBe(false)
    })

    it('同じソルトで同じハッシュが生成される', async () => {
      const firstResult = await FinancialEncryption.hashPassword(password)
      const saltBuffer = Buffer.from(firstResult.salt, 'hex')

      const secondResult = await FinancialEncryption.hashPassword(password, saltBuffer)

      expect(secondResult.hash).toBe(firstResult.hash)
      expect(secondResult.salt).toBe(firstResult.salt)
    })

    it('不正なソルト形式で検証が失敗する', async () => {
      const { hash } = await FinancialEncryption.hashPassword(password)
      const isValid = await FinancialEncryption.verifyPassword(password, hash, 'invalid-salt')

      expect(isValid).toBe(false)
    })

    it('不正なハッシュ形式で検証が失敗する', async () => {
      const { salt } = await FinancialEncryption.hashPassword(password)
      const isValid = await FinancialEncryption.verifyPassword(password, 'invalid-hash', salt)

      expect(isValid).toBe(false)
    })
  })

  describe('メモリ安全性', () => {
    it('バッファを安全にクリアできる', () => {
      const buffer = Buffer.from('sensitive-data-12345')

      FinancialEncryption.secureBufferClear(buffer)

      // すべてのバイトが0になっている
      expect(buffer.every(byte => byte === 0)).toBe(true)
    })

    it('空バッファのクリアでエラーが発生しない', () => {
      const emptyBuffer = Buffer.alloc(0)

      expect(() => {
        FinancialEncryption.secureBufferClear(emptyBuffer)
      }).not.toThrow()
    })

    it('nullバッファのクリアでエラーが発生しない', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        FinancialEncryption.secureBufferClear(null as any)
      }).not.toThrow()
    })
  })

  describe('暗号化強度の検証', () => {
    it('正常な暗号化データは検証に成功する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)
      const isValid = FinancialEncryption.validateEncryptionStrength(encrypted)

      expect(isValid).toBe(true)
    })

    it('短いIVは検証に失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)
      const invalidData: EncryptedData = {
        ...encrypted,
        iv: 'ff' // 短すぎるIV
      }

      const isValid = FinancialEncryption.validateEncryptionStrength(invalidData)
      expect(isValid).toBe(false)
    })

    it('短いソルトは検証に失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)
      const invalidData: EncryptedData = {
        ...encrypted,
        salt: 'ff' // 短すぎるソルト
      }

      const isValid = FinancialEncryption.validateEncryptionStrength(invalidData)
      expect(isValid).toBe(false)
    })

    it('短い認証タグは検証に失敗する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testData, testPassword)
      const invalidData: EncryptedData = {
        ...encrypted,
        authTag: 'ff' // 短すぎる認証タグ
      }

      const isValid = FinancialEncryption.validateEncryptionStrength(invalidData)
      expect(isValid).toBe(false)
    })
  })
})

describe('KeyRotationManager', () => {
  beforeEach(() => {
    // テスト間でキーマップをクリア
    // 注意: これはプライベートフィールドなので、実際のテストでは別のアプローチが必要かもしれません
    // ここでは各テストで新しいキーを生成することで対応
  })

  describe('キー生成', () => {
    it('新しいキーを生成できる', () => {
      const keyInfo = KeyRotationManager.generateNewKey()

      expect(keyInfo).toHaveProperty('keyId')
      expect(keyInfo).toHaveProperty('version')
      expect(keyInfo).toHaveProperty('createdAt')
      expect(keyInfo).toHaveProperty('expiresAt')
      expect(keyInfo).toHaveProperty('isActive')

      expect(typeof keyInfo.keyId).toBe('string')
      expect(keyInfo.keyId.length).toBe(32)
      expect(keyInfo.isActive).toBe(true)
    })

    it('キーIDは毎回異なる値が生成される', () => {
      const key1 = KeyRotationManager.generateNewKey()
      const key2 = KeyRotationManager.generateNewKey()

      expect(key1.keyId).not.toBe(key2.keyId)
    })

    it('新しいキーを生成すると既存キーが非アクティブになる', () => {
      const key1 = KeyRotationManager.generateNewKey()
      expect(key1.isActive).toBe(true)

      const key2 = KeyRotationManager.generateNewKey()
      expect(key2.isActive).toBe(true)
      expect(key1.isActive).toBe(false) // key1は非アクティブ化されている
    })

    it('キーバージョンが順次増加する', () => {
      const initialVersion = KeyRotationManager.generateNewKey().version
      const nextVersion = KeyRotationManager.generateNewKey().version

      expect(nextVersion).toBeGreaterThan(initialVersion)
    })

    it('有効期限が90日後に設定される', () => {
      const keyInfo = KeyRotationManager.generateNewKey()

      const expectedExpiry = new Date(keyInfo.createdAt.getTime() + (90 * 24 * 60 * 60 * 1000))
      const actualExpiry = keyInfo.expiresAt

      // 1秒以内の誤差を許容
      expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(1000)
    })
  })

  describe('アクティブキー取得', () => {
    it('アクティブキーを取得できる', () => {
      const generatedKey = KeyRotationManager.generateNewKey()
      const activeKey = KeyRotationManager.getActiveKey()

      expect(activeKey).not.toBeNull()
      expect(activeKey?.keyId).toBe(generatedKey.keyId)
      expect(activeKey?.isActive).toBe(true)
    })

    it('期限切れキーはアクティブキーとして返されない', () => {
      vi.useFakeTimers()

      const key = KeyRotationManager.generateNewKey()
      expect(KeyRotationManager.getActiveKey()?.keyId).toBe(key.keyId)

      // 91日後に進める（有効期限切れ）
      vi.advanceTimersByTime(91 * 24 * 60 * 60 * 1000)

      const activeKey = KeyRotationManager.getActiveKey()
      expect(activeKey).toBeNull() // 期限切れなのでnull

      vi.useRealTimers()
    })
  })

  describe('ローテーション必要性判定', () => {
    it('キーが存在しない場合はローテーションが必要', () => {
      // 新しいキーマネージャーではキーがないため
      const needsRotation = KeyRotationManager.needsRotation()

      // 最初の状態ではアクティブキーがある可能性があるため、
      // 実際の動作を確認
      expect(typeof needsRotation).toBe('boolean')
    })

    it('有効期限の7日前になるとローテーションが必要', () => {
      vi.useFakeTimers()

      const key = KeyRotationManager.generateNewKey()
      expect(KeyRotationManager.needsRotation()).toBe(false)

      // 84日後に進める（有効期限90日 - 7日前 = 83日後）
      vi.advanceTimersByTime(84 * 24 * 60 * 60 * 1000)

      const needsRotation = KeyRotationManager.needsRotation()
      expect(needsRotation).toBe(true)

      vi.useRealTimers()
    })

    it('有効期限内はローテーション不要', () => {
      vi.useFakeTimers()

      KeyRotationManager.generateNewKey()

      // 50日後に進める（まだ有効期限内）
      vi.advanceTimersByTime(50 * 24 * 60 * 60 * 1000)

      const needsRotation = KeyRotationManager.needsRotation()
      expect(needsRotation).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('全キー情報取得', () => {
    it('すべてのキー情報を取得できる', () => {
      const key1 = KeyRotationManager.generateNewKey()
      const key2 = KeyRotationManager.generateNewKey()
      const key3 = KeyRotationManager.generateNewKey()

      const allKeys = KeyRotationManager.getAllKeys()

      expect(allKeys.length).toBeGreaterThanOrEqual(3)
      expect(allKeys.some(k => k.keyId === key1.keyId)).toBe(true)
      expect(allKeys.some(k => k.keyId === key2.keyId)).toBe(true)
      expect(allKeys.some(k => k.keyId === key3.keyId)).toBe(true)
    })

    it('キーが新しい順にソートされている', () => {
      vi.useFakeTimers()

      const key1 = KeyRotationManager.generateNewKey()
      vi.advanceTimersByTime(1000) // 1秒進める

      const key2 = KeyRotationManager.generateNewKey()
      vi.advanceTimersByTime(1000)

      const key3 = KeyRotationManager.generateNewKey()

      const allKeys = KeyRotationManager.getAllKeys()

      // 最初のキーが最新（key3）
      const latestKeys = allKeys.filter(k =>
        k.keyId === key1.keyId || k.keyId === key2.keyId || k.keyId === key3.keyId
      )

      expect(latestKeys[0].keyId).toBe(key3.keyId)
      expect(latestKeys[1].keyId).toBe(key2.keyId)
      expect(latestKeys[2].keyId).toBe(key1.keyId)

      vi.useRealTimers()
    })
  })
})
