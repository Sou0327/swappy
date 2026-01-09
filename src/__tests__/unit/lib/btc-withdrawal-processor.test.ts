/**
 * btc-withdrawal-processor の単体テスト
 * Bitcoin出金処理システムの包括的テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BTCWithdrawalProcessor } from '@/lib/btc-withdrawal-processor'
import type { BTCWithdrawalRequest } from '@/lib/btc-withdrawal-processor'

// UTXOManagerのモック
const mockUTXOManagerInstance = {
  getBalanceByAddress: vi.fn(() => 100000000), // 1 BTC
  getTotalBalance: vi.fn(() => 500000000), // 5 BTC
  constructTransaction: vi.fn(() => ({
    inputs: [{ txid: 'mock-txid', vout: 0, amount: 100000000, address: '1MockAddress' }],
    outputs: [
      { address: '1OutputAddress', amount: 50000000 },
      { address: '1ChangeAddress', amount: 49999000 }
    ],
    fee: 1000,
    totalInput: 100000000,
    changeAmount: 49999000
  })),
  spendUTXO: vi.fn().mockResolvedValue(undefined)
}

vi.mock('@/lib/utxo-manager', () => ({
  UTXOManager: vi.fn(() => mockUTXOManagerInstance),
  UTXOSelectionStrategy: {
    LARGEST_FIRST: 'LARGEST_FIRST',
    SMALLEST_FIRST: 'SMALLEST_FIRST',
    OPTIMAL: 'OPTIMAL',
    BRANCH_AND_BOUND: 'BRANCH_AND_BOUND'
  },
  FeeEstimationLevel: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    URGENT: 'URGENT'
  }
}))

// btc-address-validatorのモック
vi.mock('@/lib/btc-address-validator', () => ({
  validateBTCAddress: vi.fn((address: string, network: string) => {
    if (network === 'mainnet') {
      return address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1')
    } else {
      return address.startsWith('m') || address.startsWith('n') || address.startsWith('2') || address.startsWith('tb1')
    }
  }),
  analyzeBTCAddress: vi.fn()
}))

// AuditLoggerのモック
vi.mock('@/lib/security/audit-logger', () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined)
  },
  AuditAction: {
    WITHDRAWAL_APPROVE: 'withdrawal_approve',
    SECURITY_ALERT: 'security_alert',
    SYSTEM_CONFIG: 'system_config'
  }
}))

// FinancialEncryptionのモック
vi.mock('@/lib/security/encryption', () => ({
  FinancialEncryption: {
    decrypt: vi.fn().mockResolvedValue('decrypted-private-key-mock')
  }
}))

// Supabaseのモック
vi.mock('@/integrations/supabase/client', () => {
  const mockSupabaseFrom = vi.fn((table: string) => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: vi.fn()
    }

    if (table === 'user_balances') {
      chainable.single.mockResolvedValue({
        data: { available_balance: 10 },
        error: null
      })
    } else if (table === 'withdrawals') {
      chainable.neq.mockResolvedValue({
        data: [],
        error: null
      })
    } else if (table === 'admin_wallets') {
      chainable.single.mockResolvedValue({
        data: {
          id: 'wallet-1',
          address: '1HotWalletAddress',
          chain: 'btc',
          network: 'mainnet',
          asset: 'BTC',
          active: true
        },
        error: null
      })
    }

    chainable.update.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    })

    return chainable
  })

  return {
    supabase: {
      from: mockSupabaseFrom
    }
  }
})

describe('btc-withdrawal-processor', () => {
  let processor: BTCWithdrawalProcessor

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('コンストラクタと設定', () => {
    it('デフォルト設定でインスタンス化する', () => {
      processor = new BTCWithdrawalProcessor()

      expect(processor).toBeDefined()
      expect(processor['network']).toBe('mainnet')
      expect(processor['config'].maxDailyAmount).toBe(10)
      expect(processor['config'].maxSingleAmount).toBe(5)
    })

    it('カスタム設定でインスタンス化する', () => {
      processor = new BTCWithdrawalProcessor('mainnet', {
        maxDailyAmount: 20,
        maxSingleAmount: 10
      })

      expect(processor['config'].maxDailyAmount).toBe(20)
      expect(processor['config'].maxSingleAmount).toBe(10)
    })

    it('mainnetネットワークで作成する', () => {
      processor = new BTCWithdrawalProcessor('mainnet')

      expect(processor['network']).toBe('mainnet')
    })

    it('testnetネットワークで作成する', () => {
      processor = new BTCWithdrawalProcessor('testnet')

      expect(processor['network']).toBe('testnet')
    })

    it('デフォルト設定値を確認する', () => {
      processor = new BTCWithdrawalProcessor()

      const config = processor['config']
      expect(config.maxDailyAmount).toBe(10)
      expect(config.maxSingleAmount).toBe(5)
      expect(config.minConfirmationsRequired).toBe(6)
      expect(config.maxFeeRate).toBe(100)
      expect(config.dustThreshold).toBe(546)
      expect(config.maxInputs).toBe(100)
      expect(config.hotWalletThreshold).toBe(1)
      expect(config.coldWalletThreshold).toBe(10)
    })
  })

  describe('validateWithdrawalRequest', () => {
    beforeEach(() => {
      processor = new BTCWithdrawalProcessor('mainnet')
    })

    it('有効な出金要求を検証する', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-1',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request)).resolves.not.toThrow()
    })

    it('無効なアドレスでエラーを投げる', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-2',
        userId: 'user-123',
        toAddress: 'invalid-address',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('無効な送金先アドレス')
    })

    it('負の金額でエラーを投げる', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-3',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '-0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('出金額は正の値である必要があります')
    })

    it('ゼロ金額でエラーを投げる', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-4',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('出金額は正の値である必要があります')
    })

    it('単回限度額超過でエラーを投げる', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-5',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '6', // maxSingleAmount: 5 BTC
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('単回出金限度額を超えています')
    })

    it('日次限度額超過でエラーを投げる', async () => {
      // getDailyWithdrawalTotalのモックを一時的に変更
      vi.spyOn(processor as unknown as { getDailyWithdrawalTotal: () => Promise<number> }, 'getDailyWithdrawalTotal').mockResolvedValue(9)

      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-6',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '2', // 9 + 2 = 11 > maxDailyAmount: 10
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('日次出金限度額を超えています')
    })

    it('残高不足でエラーを投げる', async () => {
      // getUserBalanceのモックを一時的に変更
      vi.spyOn(processor as unknown as { getUserBalance: () => Promise<number> }, 'getUserBalance').mockResolvedValue(0.3)

      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-7',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('残高が不足しています')
    })

    it('手数料制限が低すぎる場合にエラーを投げる', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-8',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        maxFee: '0.000001', // 最小手数料: 0.00001
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request))
        .rejects.toThrow('手数料制限が低すぎます')
    })

    it('適切なmaxFeeで検証を通過する', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-9',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        maxFee: '0.001',
        createdAt: new Date().toISOString()
      }

      await expect(processor['validateWithdrawalRequest'](request)).resolves.not.toThrow()
    })
  })

  describe('mapPriorityToFeeLevel', () => {
    beforeEach(() => {
      processor = new BTCWithdrawalProcessor()
    })

    it('urgent を URGENT にマッピングする', () => {
      const result = processor['mapPriorityToFeeLevel']('urgent')
      expect(result).toBe('URGENT')
    })

    it('high を HIGH にマッピングする', () => {
      const result = processor['mapPriorityToFeeLevel']('high')
      expect(result).toBe('HIGH')
    })

    it('medium を MEDIUM にマッピングする', () => {
      const result = processor['mapPriorityToFeeLevel']('medium')
      expect(result).toBe('MEDIUM')
    })

    it('low を LOW にマッピングする', () => {
      const result = processor['mapPriorityToFeeLevel']('low')
      expect(result).toBe('LOW')
    })
  })

  describe('selectUTXOStrategy', () => {
    beforeEach(() => {
      processor = new BTCWithdrawalProcessor()
    })

    it('大額出金 (>80%) で OPTIMAL を返す', () => {
      mockUTXOManagerInstance.getTotalBalance.mockReturnValue(100000000) // 1 BTC
      const result = processor['selectUTXOStrategy'](85000000) // 0.85 BTC

      expect(result).toBe('OPTIMAL')
    })

    it('小額出金 (<0.1 BTC) で SMALLEST_FIRST を返す', () => {
      mockUTXOManagerInstance.getTotalBalance.mockReturnValue(100000000) // 1 BTC
      const result = processor['selectUTXOStrategy'](5000000) // 0.05 BTC

      expect(result).toBe('SMALLEST_FIRST')
    })

    it('中額出金で BRANCH_AND_BOUND を返す', () => {
      mockUTXOManagerInstance.getTotalBalance.mockReturnValue(100000000) // 1 BTC
      const result = processor['selectUTXOStrategy'](50000000) // 0.5 BTC

      expect(result).toBe('BRANCH_AND_BOUND')
    })

    it('境界値 (0.1 BTC) で BRANCH_AND_BOUND を返す', () => {
      mockUTXOManagerInstance.getTotalBalance.mockReturnValue(100000000) // 1 BTC
      const result = processor['selectUTXOStrategy'](10000000) // 0.1 BTC

      expect(result).toBe('BRANCH_AND_BOUND')
    })
  })

  describe('processWithdrawal - 統合テスト', () => {
    beforeEach(() => {
      processor = new BTCWithdrawalProcessor('mainnet')

      // hotWalletsに手動でウォレットを追加
      processor['hotWallets'].set('wallet-1', {
        address: '1HotWalletAddress',
        encryptedPrivateKey: JSON.stringify({ encrypted: 'data' }),
        encryptedSeed: '',
        derivationPath: "m/44'/0'/0'/0/0",
        addressType: 'P2WPKH',
        maxBalance: 1
      })
    })

    it('正常な出金処理フローを実行する', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-success',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      const result = await processor.processWithdrawal(request)

      expect(result).toBeDefined()
      expect(result.withdrawalId).toBe('withdrawal-success')
      expect(result.transactionHash).toBeDefined()
      expect(result.status).toBe('pending')
      expect(result.inputCount).toBeGreaterThan(0)
      expect(result.outputCount).toBeGreaterThan(0)
    })

    it('バリデーション失敗でエラーを投げる', async () => {
      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-invalid',
        userId: 'user-123',
        toAddress: 'invalid-address',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor.processWithdrawal(request))
        .rejects.toThrow('無効な送金先アドレス')
    })

    it('ホットウォレット不足でエラーを投げる', async () => {
      // 残高を0に設定
      mockUTXOManagerInstance.getBalanceByAddress.mockReturnValue(0)

      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-no-wallet',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor.processWithdrawal(request))
        .rejects.toThrow('利用可能なホットウォレットがありません')
    })

    it('手数料制限超過でエラーを投げる', async () => {
      // 高い手数料を返すようにモック
      mockUTXOManagerInstance.constructTransaction.mockReturnValue({
        inputs: [{ txid: 'mock', vout: 0, amount: 100000000, address: '1Mock' }],
        outputs: [{ address: '1Output', amount: 50000000 }],
        fee: 200000, // 0.002 BTC
        totalInput: 100000000,
        changeAmount: 49800000
      })

      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-high-fee',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        maxFee: '0.001', // 0.001 BTC < 0.002 BTC
        createdAt: new Date().toISOString()
      }

      await expect(processor.processWithdrawal(request))
        .rejects.toThrow('手数料が制限を超えています')
    })

    it('入力数制限超過でエラーを投げる', async () => {
      // 101個の入力を返すようにモック
      const manyInputs = Array.from({ length: 101 }, (_, i) => ({
        txid: `txid-${i}`,
        vout: 0,
        amount: 1000000,
        address: '1Address'
      }))

      mockUTXOManagerInstance.constructTransaction.mockReturnValue({
        inputs: manyInputs,
        outputs: [{ address: '1Output', amount: 50000000 }],
        fee: 1000,
        totalInput: 101000000,
        changeAmount: 50999000
      })

      const request: BTCWithdrawalRequest = {
        id: 'withdrawal-many-inputs',
        userId: 'user-123',
        toAddress: '1ValidBTCAddress',
        amount: '0.5',
        priority: 'medium',
        createdAt: new Date().toISOString()
      }

      await expect(processor.processWithdrawal(request))
        .rejects.toThrow('入力数が制限を超えています')
    })
  })

  describe('ホットウォレット管理', () => {
    beforeEach(() => {
      processor = new BTCWithdrawalProcessor('mainnet')

      processor['hotWallets'].set('wallet-1', {
        address: '1HotWallet1',
        encryptedPrivateKey: '',
        encryptedSeed: '',
        derivationPath: '',
        addressType: 'P2WPKH',
        maxBalance: 1
      })
    })

    it('十分な残高のウォレットを選択する', async () => {
      mockUTXOManagerInstance.getBalanceByAddress.mockReturnValue(150000000) // 1.5 BTC

      const wallet = await processor['selectOptimalHotWallet'](0.5)

      expect(wallet).toBeDefined()
      expect(wallet?.address).toBe('1HotWallet1')
    })

    it('残高不足で null を返す', async () => {
      mockUTXOManagerInstance.getBalanceByAddress.mockReturnValue(10000000) // 0.1 BTC

      const wallet = await processor['selectOptimalHotWallet'](0.5)

      expect(wallet).toBeNull()
    })

    it('高残高時にコールドウォレットへ送金する', async () => {
      mockUTXOManagerInstance.getBalanceByAddress.mockReturnValue(200000000) // 2 BTC

      const transferSpy = vi.spyOn(processor as unknown as { transferTowardsColdWallet: () => Promise<void> }, 'transferTowardsColdWallet')
        .mockResolvedValue(undefined)

      await processor.manageHotWalletBalances()

      expect(transferSpy).toHaveBeenCalled()
    })

    it('低残高時にアラートを発行する', async () => {
      mockUTXOManagerInstance.getBalanceByAddress.mockReturnValue(30000000) // 0.3 BTC (< 0.5 BTC threshold)

      const alertSpy = vi.spyOn(processor as unknown as { alertLowBalance: () => Promise<void> }, 'alertLowBalance')
        .mockResolvedValue(undefined)

      await processor.manageHotWalletBalances()

      expect(alertSpy).toHaveBeenCalled()
    })
  })

  describe('確認処理と統計', () => {
    beforeEach(() => {
      processor = new BTCWithdrawalProcessor('mainnet')
    })

    it('pending withdrawals を処理する', async () => {
      // processWithdrawalConfirmations() を実行
      // デフォルトモックでは空配列を返すので、エラーなく完了する
      await expect(processor.processWithdrawalConfirmations()).resolves.not.toThrow()
    })

    it('統計情報を取得する', async () => {
      processor['hotWallets'].set('wallet-1', {
        address: '1Stats',
        encryptedPrivateKey: '',
        encryptedSeed: '',
        derivationPath: '',
        addressType: 'P2WPKH',
        maxBalance: 1
      })

      mockUTXOManagerInstance.getBalanceByAddress.mockReturnValue(50000000) // 0.5 BTC

      const stats = await processor.getStatistics()

      expect(stats).toBeDefined()
      expect(stats.totalPendingWithdrawals).toBeDefined()
      expect(stats.totalPendingAmount).toBeDefined()
      expect(stats.hotWalletBalances).toHaveLength(1)
      expect(stats.hotWalletBalances[0].address).toBe('1Stats')
      expect(stats.hotWalletBalances[0].balance).toBe('0.50000000')
    })
  })
})
