/**
 * utxo-manager の単体テスト
 * Bitcoin UTXO管理システムの包括的テスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  UTXOManager,
  UTXO,
  UTXOSelectionStrategy,
  FeeEstimationLevel,
  TransactionOutput
} from '@/lib/utxo-manager'

// AuditLoggerとFinancialEncryptionのモック
vi.mock('@/lib/security/audit-logger', () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined)
  },
  AuditAction: {
    UTXO_ADD: 'utxo_add',
    UTXO_SPEND: 'utxo_spend'
  }
}))

vi.mock('@/lib/security/encryption', () => ({
  FinancialEncryption: {
    encrypt: vi.fn((data: string) => `encrypted_${data}`),
    decrypt: vi.fn((data: string) => data.replace('encrypted_', ''))
  }
}))

describe('utxo-manager', () => {
  let manager: UTXOManager

  // テスト用UTXOサンプル
  const createUTXO = (overrides: Partial<UTXO> = {}): UTXO => ({
    txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    vout: 0,
    amount: 100000, // 0.001 BTC in satoshi
    scriptPubKey: '76a914...',
    address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    confirmations: 6,
    spent: false,
    ...overrides
  })

  beforeEach(() => {
    manager = new UTXOManager('mainnet')
    vi.clearAllMocks()
  })

  describe('Constructor & Basic Operations', () => {
    it('mainnetでインスタンス化できる', () => {
      const mainnetManager = new UTXOManager('mainnet')
      expect(mainnetManager).toBeDefined()
    })

    it('testnetでインスタンス化できる', () => {
      const testnetManager = new UTXOManager('testnet')
      expect(testnetManager).toBeDefined()
    })

    it('デフォルトでmainnetが設定される', () => {
      const defaultManager = new UTXOManager()
      expect(defaultManager).toBeDefined()
    })

    it('clearでUTXOセットをクリアする', async () => {
      const utxo = createUTXO()
      await manager.addUTXO(utxo)

      expect(manager.getTotalBalance()).toBe(100000)

      manager.clear()

      expect(manager.getTotalBalance()).toBe(0)
    })
  })

  describe('addUTXO - Validation', () => {
    it('有効なUTXOを追加できる', async () => {
      const utxo = createUTXO()

      await expect(manager.addUTXO(utxo)).resolves.toBeUndefined()

      const balance = manager.getTotalBalance()
      expect(balance).toBe(100000)
    })

    it('無効なアドレスを拒否する', async () => {
      const utxo = createUTXO({ address: 'invalid-address' })

      await expect(manager.addUTXO(utxo)).rejects.toThrow('無効なアドレス')
    })

    it('重複するUTXOを拒否する', async () => {
      const utxo = createUTXO()

      await manager.addUTXO(utxo)

      await expect(manager.addUTXO(utxo)).rejects.toThrow('既に存在します')
    })

    it('負の金額を拒否する', async () => {
      const utxo = createUTXO({ amount: -1000 })

      await expect(manager.addUTXO(utxo)).rejects.toThrow('正の値である必要があります')
    })

    it('ゼロ金額を拒否する', async () => {
      const utxo = createUTXO({ amount: 0 })

      await expect(manager.addUTXO(utxo)).rejects.toThrow('正の値である必要があります')
    })

    it('userIdが指定された場合、監査ログを記録する', async () => {
      const { AuditLogger } = await import('@/lib/security/audit-logger')
      const utxo = createUTXO()

      await manager.addUTXO(utxo, 'user-123')

      expect(AuditLogger.log).toHaveBeenCalledWith(
        'utxo_add',
        'utxo_manager',
        expect.objectContaining({
          amount: 100000,
          address: expect.any(String)
        }),
        expect.objectContaining({ userId: 'user-123' })
      )
    })
  })

  describe('spendUTXO', () => {
    it('UTXOを使用済みとしてマークできる', async () => {
      const utxo = createUTXO()
      await manager.addUTXO(utxo)

      await manager.spendUTXO(utxo.txid, utxo.vout, 'spent-txid-123')

      const availableUTXOs = manager.getAvailableUTXOs()
      expect(availableUTXOs.length).toBe(0)
    })

    it('存在しないUTXOを使用しようとするとエラー', async () => {
      await expect(
        manager.spendUTXO('nonexistent-txid', 0, 'spent-txid')
      ).rejects.toThrow('が見つかりません')
    })

    it('既に使用済みのUTXOを再度使用しようとするとエラー', async () => {
      const utxo = createUTXO()
      await manager.addUTXO(utxo)
      await manager.spendUTXO(utxo.txid, utxo.vout, 'spent-txid-1')

      await expect(
        manager.spendUTXO(utxo.txid, utxo.vout, 'spent-txid-2')
      ).rejects.toThrow('既に使用済みです')
    })

    it('userIdが指定された場合、監査ログを記録する', async () => {
      const { AuditLogger } = await import('@/lib/security/audit-logger')
      const utxo = createUTXO()
      await manager.addUTXO(utxo)

      await manager.spendUTXO(utxo.txid, utxo.vout, 'spent-txid', 'user-456')

      expect(AuditLogger.log).toHaveBeenCalledWith(
        'utxo_spend',
        'utxo_manager',
        expect.objectContaining({
          spentTxid: 'spent-txid',
          amount: 100000
        }),
        expect.objectContaining({ userId: 'user-456' })
      )
    })
  })

  describe('Search & Balance', () => {
    beforeEach(async () => {
      // 3つのUTXOを追加
      await manager.addUTXO(createUTXO({ vout: 0, amount: 100000, confirmations: 1 }))
      await manager.addUTXO(createUTXO({ vout: 1, amount: 200000, confirmations: 3 }))
      await manager.addUTXO(createUTXO({ vout: 2, amount: 300000, confirmations: 6 }))
    })

    it('getAvailableUTXOsで未使用UTXOを取得', () => {
      const utxos = manager.getAvailableUTXOs()

      expect(utxos.length).toBe(3)
      expect(utxos.every(utxo => !utxo.spent)).toBe(true)
    })

    it('minConfirmationsでフィルタできる', () => {
      const utxos = manager.getAvailableUTXOs(6)

      expect(utxos.length).toBe(1)
      expect(utxos[0].confirmations).toBe(6)
    })

    it('getTotalBalanceで総残高を計算', () => {
      const balance = manager.getTotalBalance()

      expect(balance).toBe(600000) // 100000 + 200000 + 300000
    })

    it('getTotalBalanceでminConfirmationsを指定できる', () => {
      const balance = manager.getTotalBalance(3)

      expect(balance).toBe(500000) // 200000 + 300000
    })

    it('getUTXOsByAddressで特定アドレスのUTXOを取得', async () => {
      const address2 = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'
      await manager.addUTXO(createUTXO({ vout: 3, address: address2, amount: 50000 }))

      const utxos = manager.getUTXOsByAddress(address2)

      expect(utxos.length).toBe(1)
      expect(utxos[0].address).toBe(address2)
    })

    it('getBalanceByAddressでアドレス別残高を計算', async () => {
      const address1 = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
      const balance = manager.getBalanceByAddress(address1)

      expect(balance).toBe(600000)
    })

    it('使用済みUTXOは利用可能リストに含まれない', async () => {
      await manager.spendUTXO(createUTXO().txid, 0, 'spent-txid')

      const utxos = manager.getAvailableUTXOs()

      expect(utxos.length).toBe(2)
    })
  })

  describe('UTXO Selection Strategies', () => {
    beforeEach(async () => {
      // 複数のUTXOを追加
      await manager.addUTXO(createUTXO({ vout: 0, amount: 50000 }))
      await manager.addUTXO(createUTXO({ vout: 1, amount: 100000 }))
      await manager.addUTXO(createUTXO({ vout: 2, amount: 150000 }))
      await manager.addUTXO(createUTXO({ vout: 3, amount: 200000 }))
    })

    it('LARGEST_FIRST戦略で大きいUTXOから選択', () => {
      const selected = manager.selectUTXOs(
        250000,
        UTXOSelectionStrategy.LARGEST_FIRST
      )

      expect(selected.length).toBe(2)
      expect(selected[0].amount).toBe(200000)
      expect(selected[1].amount).toBe(150000)
    })

    it('SMALLEST_FIRST戦略で小さいUTXOから選択', () => {
      const selected = manager.selectUTXOs(
        250000,
        UTXOSelectionStrategy.SMALLEST_FIRST
      )

      expect(selected.length).toBe(3)
      expect(selected[0].amount).toBe(50000)
      expect(selected[1].amount).toBe(100000)
      expect(selected[2].amount).toBe(150000)
    })

    it('BRANCH_AND_BOUND戦略で最適組み合わせを探索', () => {
      const selected = manager.selectUTXOs(
        250000,
        UTXOSelectionStrategy.BRANCH_AND_BOUND
      )

      const total = selected.reduce((sum, utxo) => sum + utxo.amount, 0)
      expect(total).toBeGreaterThanOrEqual(250000)
    })

    it('OPTIMAL戦略が自動的に最適戦略を選択', () => {
      const selected = manager.selectUTXOs(
        250000,
        UTXOSelectionStrategy.OPTIMAL
      )

      const total = selected.reduce((sum, utxo) => sum + utxo.amount, 0)
      expect(total).toBeGreaterThanOrEqual(250000)
    })

    it('目標額に到達できない場合はエラー', () => {
      expect(() => {
        manager.selectUTXOs(1000000) // 総額500000なので不足
      }).toThrow('選択されたUTXOの合計額が不足しています')
    })

    it('利用可能なUTXOがない場合はエラー', () => {
      manager.clear()

      expect(() => {
        manager.selectUTXOs(100000)
      }).toThrow('利用可能なUTXOがありません')
    })

    it('minConfirmationsを指定してUTXO選択', async () => {
      manager.clear()
      await manager.addUTXO(createUTXO({ vout: 0, amount: 100000, confirmations: 1 }))
      await manager.addUTXO(createUTXO({ vout: 1, amount: 200000, confirmations: 6 }))

      const selected = manager.selectUTXOs(
        150000,
        UTXOSelectionStrategy.LARGEST_FIRST,
        10,
        6
      )

      expect(selected.length).toBe(1)
      expect(selected[0].confirmations).toBe(6)
    })
  })

  describe('Fee Estimation', () => {
    it('LOWレベルの手数料レートを返す', () => {
      const feeRate = manager.estimateFeeRate(FeeEstimationLevel.LOW)
      expect(feeRate).toBe(1)
    })

    it('MEDIUMレベルの手数料レートを返す', () => {
      const feeRate = manager.estimateFeeRate(FeeEstimationLevel.MEDIUM)
      expect(feeRate).toBe(10)
    })

    it('HIGHレベルの手数料レートを返す', () => {
      const feeRate = manager.estimateFeeRate(FeeEstimationLevel.HIGH)
      expect(feeRate).toBe(20)
    })

    it('URGENTレベルの手数料レートを返す', () => {
      const feeRate = manager.estimateFeeRate(FeeEstimationLevel.URGENT)
      expect(feeRate).toBe(50)
    })
  })

  describe('Lock Management', () => {
    let utxo1: UTXO
    let utxo2: UTXO

    beforeEach(async () => {
      utxo1 = createUTXO({ vout: 0, amount: 100000 })
      utxo2 = createUTXO({ vout: 1, amount: 200000 })
      await manager.addUTXO(utxo1)
      await manager.addUTXO(utxo2)
    })

    it('UTXOをロックできる', () => {
      manager.lockUTXOs([utxo1])

      const available = manager.getAvailableUTXOs()
      expect(available.length).toBe(1)
      expect(available[0].vout).toBe(1)
    })

    it('複数のUTXOをロックできる', () => {
      manager.lockUTXOs([utxo1, utxo2])

      const available = manager.getAvailableUTXOs()
      expect(available.length).toBe(0)
    })

    it('ロックされたUTXOはUTXO選択から除外される', () => {
      manager.lockUTXOs([utxo1, utxo2])

      expect(() => {
        manager.selectUTXOs(100000)
      }).toThrow('利用可能なUTXOがありません')
    })

    it('UTXOのロックを解除できる', () => {
      manager.lockUTXOs([utxo1])
      manager.unlockUTXOs([utxo1])

      const available = manager.getAvailableUTXOs()
      expect(available.length).toBe(2)
    })

    it('ロックと解除を繰り返せる', () => {
      manager.lockUTXOs([utxo1])
      expect(manager.getAvailableUTXOs().length).toBe(1)

      manager.unlockUTXOs([utxo1])
      expect(manager.getAvailableUTXOs().length).toBe(2)

      manager.lockUTXOs([utxo1, utxo2])
      expect(manager.getAvailableUTXOs().length).toBe(0)
    })
  })

  describe('Statistics', () => {
    beforeEach(async () => {
      await manager.addUTXO(createUTXO({ vout: 0, amount: 100000 }))
      await manager.addUTXO(createUTXO({ vout: 1, amount: 200000 }))
      await manager.addUTXO(createUTXO({ vout: 2, amount: 300000, spent: true }))
    })

    it('getUTXOStatisticsで統計情報を取得', () => {
      const stats = manager.getUTXOStatistics()

      expect(stats.total).toBe(3)
      expect(stats.available).toBe(2)
      expect(stats.spent).toBe(1)
      expect(stats.totalValue).toBe(300000) // 未使用のみ
      expect(stats.averageValue).toBe(150000)
    })
  })

  describe('Import/Export', () => {
    beforeEach(async () => {
      await manager.addUTXO(createUTXO({ vout: 0, amount: 100000 }))
      await manager.addUTXO(createUTXO({ vout: 1, amount: 200000 }))
    })

    it('exportUTXOSetでJSON文字列を生成', () => {
      const exported = manager.exportUTXOSet()

      expect(typeof exported).toBe('string')
      expect(() => JSON.parse(exported)).not.toThrow()
    })

    it('importUTXOSetでJSON文字列からUTXOセットを復元', () => {
      const exported = manager.exportUTXOSet()

      const newManager = new UTXOManager('mainnet')
      newManager.importUTXOSet(exported)

      expect(newManager.getTotalBalance()).toBe(300000)
    })

    it('無効なJSONをインポートするとエラー', () => {
      expect(() => {
        manager.importUTXOSet('invalid json')
      }).toThrow()
    })

    it('エクスポート後にクリアして再インポートできる', () => {
      const exported = manager.exportUTXOSet()
      manager.clear()

      expect(manager.getTotalBalance()).toBe(0)

      manager.importUTXOSet(exported)

      expect(manager.getTotalBalance()).toBe(300000)
    })
  })

  describe('Transaction Construction', () => {
    beforeEach(async () => {
      await manager.addUTXO(createUTXO({ vout: 0, amount: 500000 }))
      await manager.addUTXO(createUTXO({ vout: 1, amount: 300000 }))
    })

    it('トランザクションを構築できる', async () => {
      const outputs: TransactionOutput[] = [
        { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', amount: 200000 }
      ]

      const tx = await manager.constructTransaction(
        outputs,
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', // change address
        FeeEstimationLevel.MEDIUM
      )

      expect(tx.inputs.length).toBeGreaterThan(0)
      expect(tx.outputs.length).toBeGreaterThan(0)
      expect(tx.fee).toBeGreaterThan(0)
      expect(tx.totalInput).toBeGreaterThanOrEqual(tx.totalOutput + tx.fee)
    })

    it('お釣りアドレスが設定される', async () => {
      const outputs: TransactionOutput[] = [
        { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', amount: 100000 }
      ]

      const tx = await manager.constructTransaction(
        outputs,
        '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
        FeeEstimationLevel.MEDIUM
      )

      expect(tx.changeAddress).toBeDefined()
      expect(tx.changeAmount).toBeGreaterThan(0)
    })

    it('残高不足の場合はエラー', async () => {
      const outputs: TransactionOutput[] = [
        { address: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', amount: 1000000 }
      ]

      await expect(
        manager.constructTransaction(
          outputs,
          '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
          FeeEstimationLevel.MEDIUM
        )
      ).rejects.toThrow()
    })

    // 注意: constructTransactionは送信先アドレスのバリデーションを行いません
    // アドレス検証は呼び出し側の責任です
  })
})
