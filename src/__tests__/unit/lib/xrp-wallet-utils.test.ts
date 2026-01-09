/**
 * xrp-wallet-utils の単体テスト
 * XRP Ledger Destination Tag方式の入金管理の包括的テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateDestinationTag,
  generateXRPDepositInfo,
  validateXRPAddress,
  validateDestinationTag,
  dropsToXRP,
  xrpToDrops,
  estimateXRPTransactionFee,
  getMinimumAccountBalance,
  getAccountInfoUrl,
  getTransactionUrl,
  generatePaymentMemo,
  formatXRPDepositInfo,
  XRP_NETWORKS
} from '@/lib/xrp-wallet-utils'

// Supabaseクライアントのモック
const mockSupabaseClient = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn()
        }))
      }))
    }))
  }))
}

describe('xrp-wallet-utils', () => {
  describe('XRP_NETWORKS設定', () => {
    it('mainnetとtestnetの設定が定義されている', () => {
      expect(XRP_NETWORKS.mainnet).toBeDefined()
      expect(XRP_NETWORKS.testnet).toBeDefined()
    })

    it('mainnetの設定が正しい', () => {
      expect(XRP_NETWORKS.mainnet.explorer).toBe('https://xrpscan.com')
      expect(XRP_NETWORKS.mainnet.minReserve).toBe(10)
    })

    it('testnetの設定が正しい', () => {
      expect(XRP_NETWORKS.testnet.explorer).toBe('https://test.bithomp.com')
      expect(XRP_NETWORKS.testnet.minReserve).toBe(10)
    })
  })

  // XRP_FIXED_ADDRESSES は削除されました（DBから取得する方式に変更）
  // ホワイトラベル対応のため、固定アドレスはxrp_fixed_addressesテーブルで管理

  describe('generateDestinationTag', () => {
    it('ユーザーIDからDestination Tagを生成する', () => {
      const tag = generateDestinationTag('user-123')

      expect(typeof tag).toBe('number')
      expect(Number.isInteger(tag)).toBe(true)
    })

    it('1以上の正の整数を返す', () => {
      const tag = generateDestinationTag('user-456')

      expect(tag).toBeGreaterThanOrEqual(1)
    })

    it('32bit整数の最大値以下を返す', () => {
      const tag = generateDestinationTag('user-789')

      expect(tag).toBeLessThanOrEqual(0xFFFFFFFF)
    })

    it('異なるユーザーIDで異なるタグを生成する', () => {
      const tag1 = generateDestinationTag('user-111')
      const tag2 = generateDestinationTag('user-222')

      // タイムスタンプとランダム要素があるため、常に異なる
      expect(tag1).not.toBe(tag2)
    })

    it('0を返さない（0は無効なDestination Tag）', () => {
      // 複数回テストして0が返らないことを確認
      for (let i = 0; i < 10; i++) {
        const tag = generateDestinationTag(`user-test-${i}`)
        expect(tag).toBeGreaterThan(0)
      }
    })
  })

  describe('generateXRPDepositInfo', () => {
    // 各テスト前にモックをリセット
    beforeEach(() => {
      vi.clearAllMocks()
    })

    // Supabaseモックを作成するヘルパー関数
    const createMockSupabase = (address: string, shouldError = false) => ({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                shouldError
                  ? { data: null, error: new Error('Not found') }
                  : { data: { address }, error: null }
              )
            })
          })
        })
      })
    })

    it('mainnet用の入金情報を生成する', async () => {
      const mockAddress = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'
      const mockSupabase = createMockSupabase(mockAddress)

      const info = await generateXRPDepositInfo(mockSupabase as any, 'user-123', 'mainnet')

      expect(info).toBeDefined()
      expect(info.address).toBe(mockAddress)
      expect(info.network).toBe('mainnet')
      expect(typeof info.destinationTag).toBe('number')
    })

    it('testnet用の入金情報を生成する', async () => {
      const mockAddress = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
      const mockSupabase = createMockSupabase(mockAddress)

      const info = await generateXRPDepositInfo(mockSupabase as any, 'user-456', 'testnet')

      expect(info).toBeDefined()
      expect(info.address).toBe(mockAddress)
      expect(info.network).toBe('testnet')
      expect(typeof info.destinationTag).toBe('number')
    })

    it('destinationTagが1以上である', async () => {
      const mockSupabase = createMockSupabase('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      const info = await generateXRPDepositInfo(mockSupabase as any, 'user-789', 'mainnet')

      expect(info.destinationTag).toBeGreaterThanOrEqual(1)
    })

    it('返り値にaddress, destinationTag, networkが含まれる', async () => {
      const mockSupabase = createMockSupabase('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      const info = await generateXRPDepositInfo(mockSupabase as any, 'user-abc', 'mainnet')

      expect(info).toHaveProperty('address')
      expect(info).toHaveProperty('destinationTag')
      expect(info).toHaveProperty('network')
    })

    it('XRP固定アドレスが未設定の場合エラーを投げる', async () => {
      const mockSupabase = createMockSupabase('', true)

      await expect(
        generateXRPDepositInfo(mockSupabase as any, 'user-error', 'mainnet')
      ).rejects.toThrow('XRP固定アドレスが設定されていません')
    })
  })

  describe('validateXRPAddress', () => {
    it('有効なXRPアドレスを検証する', () => {
      const valid = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'

      expect(validateXRPAddress(valid)).toBe(true)
    })

    it('別の有効なXRPアドレスを検証する', () => {
      const valid = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'

      expect(validateXRPAddress(valid)).toBe(true)
    })

    it('rで始まらないアドレスを拒否する', () => {
      const invalid = 'xN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'

      expect(validateXRPAddress(invalid)).toBe(false)
    })

    it('長さが短すぎるアドレスを拒否する', () => {
      const invalid = 'rN7n7otQ'

      expect(validateXRPAddress(invalid)).toBe(false)
    })

    it('長さが長すぎるアドレスを拒否する', () => {
      const invalid = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH12345678901234567890'

      expect(validateXRPAddress(invalid)).toBe(false)
    })

    it('無効な文字を含むアドレスを拒否する', () => {
      const invalid = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzOl' // OとlはBase58に含まれない

      expect(validateXRPAddress(invalid)).toBe(false)
    })

    it('空文字列のアドレスを拒否する', () => {
      expect(validateXRPAddress('')).toBe(false)
    })
  })

  describe('validateDestinationTag', () => {
    it('有効なDestination Tag（数値）を検証する', () => {
      expect(validateDestinationTag(12345)).toBe(true)
    })

    it('有効なDestination Tag（文字列）を検証する', () => {
      expect(validateDestinationTag('12345')).toBe(true)
    })

    it('0を有効なタグとして検証する', () => {
      expect(validateDestinationTag(0)).toBe(true)
    })

    it('32bit整数の最大値を有効なタグとして検証する', () => {
      expect(validateDestinationTag(0xFFFFFFFF)).toBe(true)
    })

    it('負の数を拒否する', () => {
      expect(validateDestinationTag(-1)).toBe(false)
    })

    it('32bit整数の最大値を超える数を拒否する', () => {
      expect(validateDestinationTag(0xFFFFFFFF + 1)).toBe(false)
    })

    it('数値に変換できない文字列を拒否する', () => {
      expect(validateDestinationTag('invalid')).toBe(false)
    })
  })

  describe('dropsToXRP', () => {
    it('dropsをXRPに変換する（数値）', () => {
      expect(dropsToXRP(1000000)).toBe(1)
    })

    it('dropsをXRPに変換する（文字列）', () => {
      expect(dropsToXRP('1000000')).toBe(1)
    })

    it('10 dropsを0.00001 XRPに変換する', () => {
      expect(dropsToXRP(10)).toBe(0.00001)
    })

    it('100,000,000 dropsを100 XRPに変換する', () => {
      expect(dropsToXRP(100000000)).toBe(100)
    })

    it('0 dropsを0 XRPに変換する', () => {
      expect(dropsToXRP(0)).toBe(0)
    })
  })

  describe('xrpToDrops', () => {
    it('XRPをdropsに変換する', () => {
      expect(xrpToDrops(1)).toBe('1000000')
    })

    it('0.00001 XRPを10 dropsに変換する', () => {
      expect(xrpToDrops(0.00001)).toBe('10')
    })

    it('100 XRPを100,000,000 dropsに変換する', () => {
      expect(xrpToDrops(100)).toBe('100000000')
    })

    it('小数点以下を切り捨てる', () => {
      expect(xrpToDrops(1.0000009)).toBe('1000000')
    })

    it('0 XRPを0 dropsに変換する', () => {
      expect(xrpToDrops(0)).toBe('0')
    })
  })

  describe('estimateXRPTransactionFee', () => {
    it('トランザクション手数料を返す', () => {
      const fee = estimateXRPTransactionFee()

      expect(typeof fee).toBe('number')
      expect(fee).toBeGreaterThan(0)
    })

    it('手数料が0.000012 XRPである', () => {
      expect(estimateXRPTransactionFee()).toBe(0.000012)
    })
  })

  describe('getMinimumAccountBalance', () => {
    it('mainnetの最小残高を返す', () => {
      expect(getMinimumAccountBalance('mainnet')).toBe(10)
    })

    it('testnetの最小残高を返す', () => {
      expect(getMinimumAccountBalance('testnet')).toBe(10)
    })
  })

  describe('getAccountInfoUrl', () => {
    it('mainnetのアカウント情報URLを生成する', () => {
      const address = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'
      const url = getAccountInfoUrl(address, 'mainnet')

      expect(url).toBe('https://xrpscan.com/account/rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')
    })

    it('testnetのアカウント情報URLを生成する', () => {
      const address = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
      const url = getAccountInfoUrl(address, 'testnet')

      expect(url).toBe('https://test.bithomp.com/account/rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    })
  })

  describe('getTransactionUrl', () => {
    it('mainnetのトランザクションURLを生成する', () => {
      const txHash = '1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF'
      const url = getTransactionUrl(txHash, 'mainnet')

      expect(url).toBe('https://xrpscan.com/tx/1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF')
    })

    it('testnetのトランザクションURLを生成する', () => {
      const txHash = 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890'
      const url = getTransactionUrl(txHash, 'testnet')

      expect(url).toBe('https://test.bithomp.com/tx/ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890')
    })
  })

  describe('generatePaymentMemo', () => {
    it('日本語のメモを生成する', () => {
      const memo = generatePaymentMemo('user-123456', 'ja')

      expect(memo).toContain('入金確認用ID')
      expect(memo).toContain('user-123')
    })

    it('英語のメモを生成する', () => {
      const memo = generatePaymentMemo('user-789012', 'en')

      expect(memo).toContain('Deposit ID')
      expect(memo).toContain('user-789')
    })

    it('中国語のメモを生成する', () => {
      const memo = generatePaymentMemo('user-345678', 'zh')

      expect(memo).toContain('充值确认ID')
      expect(memo).toContain('user-345')
    })

    it('デフォルトで日本語のメモを生成する', () => {
      const memo = generatePaymentMemo('user-default')

      expect(memo).toContain('入金確認用ID')
    })

    it('サポートされていない言語の場合は日本語を返す', () => {
      const memo = generatePaymentMemo('user-unsupported', 'fr')

      expect(memo).toContain('入金確認用ID')
    })
  })

  describe('formatXRPDepositInfo', () => {
    // テスト用の入金情報を直接作成（generateXRPDepositInfoは非同期になったため）
    const depositInfo = {
      address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      destinationTag: 12345,
      network: 'mainnet' as const
    }

    it('整形された入金情報を返す（日本語）', () => {
      const formatted = formatXRPDepositInfo(depositInfo, 'ja')

      expect(formatted.address).toBe(depositInfo.address)
      expect(formatted.destinationTag).toBe(depositInfo.destinationTag.toString())
      expect(formatted.warning).toContain('Destination Tag')
      expect(formatted.instructions).toHaveLength(4)
    })

    it('整形された入金情報を返す（英語）', () => {
      const formatted = formatXRPDepositInfo(depositInfo, 'en')

      expect(formatted.warning).toContain('Destination Tag')
      expect(formatted.instructions[0]).toContain('Send XRP')
    })

    it('整形された入金情報を返す（中国語）', () => {
      const formatted = formatXRPDepositInfo(depositInfo, 'zh')

      expect(formatted.warning).toContain('目标标签')
      expect(formatted.instructions[0]).toContain('XRP')
    })

    it('返り値にaddress, destinationTag, warning, instructionsが含まれる', () => {
      const formatted = formatXRPDepositInfo(depositInfo)

      expect(formatted).toHaveProperty('address')
      expect(formatted).toHaveProperty('destinationTag')
      expect(formatted).toHaveProperty('warning')
      expect(formatted).toHaveProperty('instructions')
    })

    it('destinationTagが文字列として返される', () => {
      const formatted = formatXRPDepositInfo(depositInfo)

      expect(typeof formatted.destinationTag).toBe('string')
    })

    it('instructionsが配列として返される', () => {
      const formatted = formatXRPDepositInfo(depositInfo)

      expect(Array.isArray(formatted.instructions)).toBe(true)
      expect(formatted.instructions.length).toBeGreaterThan(0)
    })
  })
})
