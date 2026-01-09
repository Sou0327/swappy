import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  FinancialEncryption,
  KeyRotationManager,
  type EncryptedData,
  type KeyRotationInfo
} from './encryption'
import { randomBytes } from 'crypto'

describe('FinancialEncryption', () => {
  const testPassword = 'test-master-password-123'
  const testPlaintext = 'sensitive-financial-data-to-encrypt'
  const longPlaintext = 'A'.repeat(1000) // 長いテストデータ

  describe('暗号化機能', () => {
    it('基本的な暗号化と復号化が正常に動作する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(testPlaintext)
    })

    it('暗号化結果が毎回異なる値になる', async () => {
      const encrypted1 = await FinancialEncryption.encrypt(testPlaintext, testPassword)
      const encrypted2 = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      // 同じ平文でも暗号化結果は異なる（ランダムソルトとIVのため）
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
      expect(encrypted1.salt).not.toBe(encrypted2.salt)
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag)
    })

    it('空文字列の暗号化と復号化が正常に動作する', async () => {
      const emptyText = ''
      const encrypted = await FinancialEncryption.encrypt(emptyText, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(emptyText)
    })

    it('長いデータの暗号化と復号化が正常に動作する', async () => {
      const encrypted = await FinancialEncryption.encrypt(longPlaintext, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(longPlaintext)
    })

    it('日本語文字列の暗号化と復号化が正常に動作する', async () => {
      const japaneseText = 'こんにちは、これは金融データのテストです。￥1,000,000の取引情報です。'
      const encrypted = await FinancialEncryption.encrypt(japaneseText, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(japaneseText)
    })

    it('特殊文字を含む文字列の暗号化と復号化が正常に動作する', async () => {
      const specialText = '!@#$%^&*()[]{}|;:,.<>?`~"\'\\\n\t\r'
      const encrypted = await FinancialEncryption.encrypt(specialText, testPassword)
      const decrypted = await FinancialEncryption.decrypt(encrypted, testPassword)

      expect(decrypted).toBe(specialText)
    })
  })

  describe('パスワード違いでの復号化', () => {
    it('間違ったパスワードで復号化しようとするとエラーが発生する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)
      const wrongPassword = 'wrong-password'

      await expect(
        FinancialEncryption.decrypt(encrypted, wrongPassword)
      ).rejects.toThrow('復号化に失敗しました')
    })

    it('空のパスワードで復号化しようとするとエラーが発生する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      await expect(
        FinancialEncryption.decrypt(encrypted, '')
      ).rejects.toThrow('復号化に失敗しました')
    })
  })

  describe('データ整合性検証', () => {
    it('暗号化データが改ざんされると復号化でエラーが発生する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      // 暗号化データを改ざん
      const tamperedEncrypted: EncryptedData = {
        ...encrypted,
        encrypted: encrypted.encrypted.slice(0, -2) + 'XX'
      }

      await expect(
        FinancialEncryption.decrypt(tamperedEncrypted, testPassword)
      ).rejects.toThrow('復号化に失敗しました')
    })

    it('認証タグが改ざんされると復号化でエラーが発生する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      // 認証タグを完全に破損（より確実な改ざん）
      const tamperedEncrypted: EncryptedData = {
        ...encrypted,
        authTag: '0'.repeat(32) // 32文字の0で置き換え
      }

      await expect(
        FinancialEncryption.decrypt(tamperedEncrypted, testPassword)
      ).rejects.toThrow('復号化に失敗しました')
    })

    it('IVが改ざんされると復号化でエラーが発生する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      // IVを改ざん
      const tamperedEncrypted: EncryptedData = {
        ...encrypted,
        iv: encrypted.iv.slice(0, -2) + 'XX'
      }

      await expect(
        FinancialEncryption.decrypt(tamperedEncrypted, testPassword)
      ).rejects.toThrow('復号化に失敗しました')
    })

    it('ソルトが改ざんされると復号化でエラーが発生する', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      // ソルトを改ざん
      const tamperedEncrypted: EncryptedData = {
        ...encrypted,
        salt: encrypted.salt.slice(0, -2) + 'XX'
      }

      await expect(
        FinancialEncryption.decrypt(tamperedEncrypted, testPassword)
      ).rejects.toThrow('復号化に失敗しました')
    })
  })

  describe('暗号化強度検証', () => {
    it('暗号化データの長さが適切である', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)

      // 各フィールドが適切な長さを持つ
      expect(Buffer.from(encrypted.iv, 'hex')).toHaveLength(16) // 128 bits
      expect(Buffer.from(encrypted.salt, 'hex')).toHaveLength(32) // 256 bits
      expect(Buffer.from(encrypted.authTag, 'hex')).toHaveLength(16) // 128 bits
      expect(encrypted.encrypted.length).toBeGreaterThan(0)
    })

    it('暗号化強度検証が正常なデータでtrueを返す', async () => {
      const encrypted = await FinancialEncryption.encrypt(testPlaintext, testPassword)
      const isValid = FinancialEncryption.validateEncryptionStrength(encrypted)

      expect(isValid).toBe(true)
    })

    it('不正な長さのデータで強度検証がfalseを返す', () => {
      const invalidEncrypted: EncryptedData = {
        encrypted: 'test',
        iv: 'short', // 不正な長さ
        salt: 'short', // 不正な長さ
        authTag: 'short' // 不正な長さ
      }

      const isValid = FinancialEncryption.validateEncryptionStrength(invalidEncrypted)
      expect(isValid).toBe(false)
    })
  })

  describe('パスワードハッシュ機能', () => {
    it('パスワードハッシュ化が正常に動作する', async () => {
      const password = 'user-password-123'
      const result = await FinancialEncryption.hashPassword(password)

      expect(result.hash).toBeDefined()
      expect(result.salt).toBeDefined()
      expect(result.hash.length).toBeGreaterThan(0)
      expect(result.salt.length).toBeGreaterThan(0)
    })

    it('同じパスワードでも毎回異なるハッシュとソルトが生成される', async () => {
      const password = 'user-password-123'
      const result1 = await FinancialEncryption.hashPassword(password)
      const result2 = await FinancialEncryption.hashPassword(password)

      expect(result1.hash).not.toBe(result2.hash)
      expect(result1.salt).not.toBe(result2.salt)
    })

    it('指定したソルトでパスワードハッシュ化が動作する', async () => {
      const password = 'user-password-123'
      const customSalt = randomBytes(32)
      const result = await FinancialEncryption.hashPassword(password, customSalt)

      expect(result.salt).toBe(customSalt.toString('hex'))
    })

    it('パスワード検証が正常に動作する', async () => {
      const password = 'user-password-123'
      const { hash, salt } = await FinancialEncryption.hashPassword(password)

      const isValid = await FinancialEncryption.verifyPassword(password, hash, salt)
      expect(isValid).toBe(true)

      const isInvalid = await FinancialEncryption.verifyPassword('wrong-password', hash, salt)
      expect(isInvalid).toBe(false)
    })

    it('パスワード検証でエラーが発生した場合falseを返す', async () => {
      const result = await FinancialEncryption.verifyPassword(
        'password',
        'invalid-hash',
        'invalid-salt'
      )

      expect(result).toBe(false)
    })
  })

  describe('セキュリティユーティリティ', () => {
    it('セキュアランダム数生成が正常に動作する', () => {
      const random1 = FinancialEncryption.generateSecureRandom(32)
      const random2 = FinancialEncryption.generateSecureRandom(32)

      expect(random1).toHaveLength(32)
      expect(random2).toHaveLength(32)
      expect(random1.equals(random2)).toBe(false)
    })

    it('セキュアランダム文字列生成が正常に動作する', () => {
      const randomStr1 = FinancialEncryption.generateSecureRandomString(32)
      const randomStr2 = FinancialEncryption.generateSecureRandomString(32)

      expect(randomStr1).toHaveLength(32)
      expect(randomStr2).toHaveLength(32)
      expect(randomStr1).not.toBe(randomStr2)
      expect(/^[0-9a-f]+$/i.test(randomStr1)).toBe(true) // 16進文字列
    })

    it('バッファクリアが正常に動作する', () => {
      const buffer = Buffer.from('sensitive-data')
      const originalData = buffer.toString()

      FinancialEncryption.secureBufferClear(buffer)

      expect(buffer.toString()).not.toBe(originalData)
      expect(buffer.every(byte => byte === 0)).toBe(true)
    })

    it('null/undefinedバッファでクリアしてもエラーが発生しない', () => {
      expect(() => {
        FinancialEncryption.secureBufferClear(null as unknown as Buffer)
        FinancialEncryption.secureBufferClear(undefined as unknown as Buffer)
      }).not.toThrow()
    })
  })

  describe('エラーハンドリング', () => {
    it('無効な暗号化データ形式でエラーが発生する', async () => {
      const invalidData = {
        encrypted: 'invalid',
        iv: 'invalid',
        salt: 'invalid',
        authTag: 'invalid'
      } as EncryptedData

      await expect(
        FinancialEncryption.decrypt(invalidData, testPassword)
      ).rejects.toThrow('復号化に失敗しました')
    })
  })
})

// KeyRotationManager の内部状態アクセス用型定義
interface KeyRotationManagerInternal {
  keys: Map<string, KeyRotationInfo>;
}

describe('KeyRotationManager', () => {
  beforeEach(() => {
    // テスト前にキー履歴をクリア（プライベートプロパティへのアクセス）
    (KeyRotationManager as unknown as KeyRotationManagerInternal).keys = new Map()
  })

  describe('キー生成', () => {
    it('新しいキーを正常に生成する', () => {
      const keyInfo = KeyRotationManager.generateNewKey()

      expect(keyInfo.keyId).toBeDefined()
      expect(keyInfo.version).toBe(1)
      expect(keyInfo.isActive).toBe(true)
      expect(keyInfo.createdAt).toBeInstanceOf(Date)
      expect(keyInfo.expiresAt).toBeInstanceOf(Date)
      expect(keyInfo.expiresAt.getTime()).toBeGreaterThan(keyInfo.createdAt.getTime())
    })

    it('複数のキーを生成すると古いキーが非アクティブになる', () => {
      const key1 = KeyRotationManager.generateNewKey()
      const key2 = KeyRotationManager.generateNewKey()

      expect(key1.isActive).toBe(false) // 古いキーは非アクティブ
      expect(key2.isActive).toBe(true)  // 新しいキーはアクティブ
      expect(key2.version).toBe(2)
    })

    it('キーIDが毎回異なる値になる', () => {
      const key1 = KeyRotationManager.generateNewKey()
      const key2 = KeyRotationManager.generateNewKey()

      expect(key1.keyId).not.toBe(key2.keyId)
    })
  })

  describe('アクティブキー管理', () => {
    it('アクティブキーを正常に取得する', () => {
      const generatedKey = KeyRotationManager.generateNewKey()
      const activeKey = KeyRotationManager.getActiveKey()

      expect(activeKey).not.toBeNull()
      expect(activeKey?.keyId).toBe(generatedKey.keyId)
      expect(activeKey?.isActive).toBe(true)
    })

    it('キーが存在しない場合はnullを返す', () => {
      const activeKey = KeyRotationManager.getActiveKey()
      expect(activeKey).toBeNull()
    })

    it('期限切れキーはアクティブキーとして返されない', () => {
      const key = KeyRotationManager.generateNewKey()

      // 強制的に期限切れにする
      key.expiresAt = new Date(Date.now() - 1000)
      ;(KeyRotationManager as unknown as KeyRotationManagerInternal).keys.set(key.keyId, key)

      const activeKey = KeyRotationManager.getActiveKey()
      expect(activeKey).toBeNull()
    })
  })

  describe('キーローテーション判定', () => {
    it('キーが存在しない場合はローテーションが必要', () => {
      const needsRotation = KeyRotationManager.needsRotation()
      expect(needsRotation).toBe(true)
    })

    it('新しいキーではローテーションが不要', () => {
      KeyRotationManager.generateNewKey()
      const needsRotation = KeyRotationManager.needsRotation()
      expect(needsRotation).toBe(false)
    })

    it('期限が近づいたキーではローテーションが必要', () => {
      const key = KeyRotationManager.generateNewKey()

      // 6日後に期限切れ（7日前閾値を下回る）
      key.expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
      ;(KeyRotationManager as unknown as KeyRotationManagerInternal).keys.set(key.keyId, key)

      const needsRotation = KeyRotationManager.needsRotation()
      expect(needsRotation).toBe(true)
    })

    it('期限に余裕があるキーではローテーションが不要', () => {
      const key = KeyRotationManager.generateNewKey()

      // 30日後に期限切れ（7日前閾値を十分上回る）
      key.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      ;(KeyRotationManager as unknown as KeyRotationManagerInternal).keys.set(key.keyId, key)

      const needsRotation = KeyRotationManager.needsRotation()
      expect(needsRotation).toBe(false)
    })
  })

  describe('キー履歴管理', () => {
    it('すべてのキー情報を取得する', () => {
      const key1 = KeyRotationManager.generateNewKey()
      const key2 = KeyRotationManager.generateNewKey()
      const key3 = KeyRotationManager.generateNewKey()

      const allKeys = KeyRotationManager.getAllKeys()

      expect(allKeys).toHaveLength(3)

      // すべてのキーが適切なプロパティを持つ
      allKeys.forEach(key => {
        expect(key.keyId).toBeDefined()
        expect(key.version).toBeGreaterThan(0)
        expect(key.createdAt).toBeInstanceOf(Date)
        expect(key.expiresAt).toBeInstanceOf(Date)
        expect(typeof key.isActive).toBe('boolean')
      })

      // アクティブなキーが1つだけ存在する
      const activeKeys = allKeys.filter(key => key.isActive)
      expect(activeKeys).toHaveLength(1)
    })

    it('キーが存在しない場合は空配列を返す', () => {
      const allKeys = KeyRotationManager.getAllKeys()
      expect(allKeys).toHaveLength(0)
    })
  })

  describe('日付関連の処理', () => {
    it('デフォルトの90日ローテーション間隔が正しく設定される', () => {
      const key = KeyRotationManager.generateNewKey()
      const rotationInterval = key.expiresAt.getTime() - key.createdAt.getTime()
      const expectedInterval = 90 * 24 * 60 * 60 * 1000 // 90日をミリ秒で

      // 多少の誤差を許容（1秒以内）
      expect(Math.abs(rotationInterval - expectedInterval)).toBeLessThan(1000)
    })
  })
})