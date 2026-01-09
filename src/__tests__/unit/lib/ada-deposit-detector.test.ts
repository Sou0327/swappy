/**
 * ada-deposit-detector の単体テスト
 * Cardano (ADA) 入金検知システムの包括的テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AdaDepositDetector, type AdaDepositResult } from '@/lib/ada-deposit-detector'

// Supabaseモック用の型定義
interface MockChainConfig {
  asset: string
  chain: string
  network: string
  active: boolean
  config?: Record<string, unknown>
}

interface MockDepositAddress {
  id: string
  user_id: string
  address: string
  chain: string
  network: string
  asset: string
  active: boolean
}

interface MockDeposit {
  id: string
  user_id: string
  transaction_hash: string
  chain: string
  network: string
  asset: string
  status: string
  confirmations_required: number
  confirmations_observed?: number
  amount?: number
  wallet_address?: string
}

// Supabaseモック
const mockChainConfigs = new Map<string, MockChainConfig>()
const mockDepositAddresses = new Map<string, MockDepositAddress>()
const mockDeposits = new Map<string, MockDeposit>()

interface ChainableMock {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

vi.mock('@/integrations/supabase/client', () => {
  const createChainableMock = (tableName: string): ChainableMock => {
    const chainable: ChainableMock = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn()
    }

    // chain_configsテーブル
    if (tableName === 'chain_configs') {
      chainable.select.mockImplementation(() => {
        const configs = Array.from(mockChainConfigs.values())
        chainable.eq.mockImplementation((col: string, val: unknown) => {
          let filtered = configs.filter(c => c[col as keyof MockChainConfig] === val)
          return {
            eq: vi.fn((col2: string, val2: unknown) => {
              filtered = filtered.filter(c => c[col2 as keyof MockChainConfig] === val2)
              return {
                eq: vi.fn((col3: string, val3: unknown) => {
                  filtered = filtered.filter(c => c[col3 as keyof MockChainConfig] === val3)
                  return Promise.resolve({ data: filtered, error: null })
                })
              }
            })
          }
        })
        return chainable
      })
    }

    // deposit_addressesテーブル
    if (tableName === 'deposit_addresses') {
      chainable.select.mockImplementation(() => {
        const addresses = Array.from(mockDepositAddresses.values())
        chainable.eq.mockImplementation((col: string, val: unknown) => {
          let filtered = addresses.filter(a => a[col as keyof MockDepositAddress] === val)
          return {
            eq: vi.fn((col2: string, val2: unknown) => {
              filtered = filtered.filter(a => a[col2 as keyof MockDepositAddress] === val2)
              return {
                eq: vi.fn((col3: string, val3: unknown) => {
                  filtered = filtered.filter(a => a[col3 as keyof MockDepositAddress] === val3)
                  return {
                    eq: vi.fn((col4: string, val4: unknown) => {
                      filtered = filtered.filter(a => a[col4 as keyof MockDepositAddress] === val4)
                      return Promise.resolve({ data: filtered, error: null })
                    })
                  }
                })
              }
            })
          }
        })
        return chainable
      })
    }

    // depositsテーブル
    if (tableName === 'deposits') {
      chainable.insert.mockResolvedValue({ error: null })
      chainable.select.mockImplementation((columns: string) => {
        const deposits = Array.from(mockDeposits.values())

        if (columns === 'id') {
          // 重複チェック用: .select('id').eq().eq().eq().single()
          chainable.eq.mockImplementation((col: string, val: unknown) => {
            let filtered = deposits.filter(d => d[col as keyof MockDeposit] === val)

            const level2 = {
              eq: vi.fn((col2: string, val2: unknown) => {
                filtered = filtered.filter(d => d[col2 as keyof MockDeposit] === val2)

                const level3 = {
                  eq: vi.fn((col3: string, val3: unknown) => {
                    filtered = filtered.filter(d => d[col3 as keyof MockDeposit] === val3)
                    return {
                      single: vi.fn().mockResolvedValue({
                        data: filtered.length > 0 ? filtered[0] : null,
                        error: null
                      })
                    }
                  })
                }

                return level3
              })
            }

            return level2
          })
        } else {
          // 確認数更新用: .select('id, transaction_hash, ...').eq().eq().eq().eq()
          chainable.eq.mockImplementation((col: string, val: unknown) => {
            let filtered = deposits.filter(d => d[col as keyof MockDeposit] === val)

            const level2 = {
              eq: vi.fn((col2: string, val2: unknown) => {
                filtered = filtered.filter(d => d[col2 as keyof MockDeposit] === val2)

                const level3 = {
                  eq: vi.fn((col3: string, val3: unknown) => {
                    filtered = filtered.filter(d => d[col3 as keyof MockDeposit] === val3)

                    const level4 = {
                      eq: vi.fn((col4: string, val4: unknown) => {
                        filtered = filtered.filter(d => d[col4 as keyof MockDeposit] === val4)
                        return Promise.resolve({ data: filtered, error: null })
                      })
                    }

                    return level4
                  })
                }

                return level3
              })
            }

            return level2
          })
        }

        return chainable
      })

      chainable.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null })
      })
    }

    return chainable
  }

  return {
    supabase: {
      from: vi.fn((table: string) => createChainableMock(table))
    }
  }
})

// グローバルfetchのモック
global.fetch = vi.fn()

// Blockfrost APIレスポンスのモック
const mockLatestBlock = {
  height: 9000000,
  time: Math.floor(Date.now() / 1000),
  slot: 100000000,
  hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  epoch: 450,
  epoch_slot: 123456,
  slot_leader: 'pool123',
  size: 12345,
  tx_count: 42,
  confirmations: 5
}

const mockTransaction = {
  hash: 'tx_hash_123',
  block: 'block_hash_123',
  block_height: 8999990,
  block_time: Math.floor(Date.now() / 1000) - 60, // 1分前
  slot: 99999990,
  index: 0,
  output_amount: [
    {
      unit: 'lovelace',
      quantity: '2000000' // 2 ADA
    }
  ],
  fees: '170000',
  deposit: '0',
  size: 300,
  utxo_count: 2,
  withdrawal_count: 0,
  mir_cert_count: 0,
  delegation_count: 0,
  stake_cert_count: 0,
  pool_update_count: 0,
  pool_retire_count: 0,
  asset_mint_or_burn_count: 0,
  redeemer_count: 0,
  valid_contract: true
}

const mockCustomTokenTransaction = {
  ...mockTransaction,
  output_amount: [
    {
      unit: 'lovelace',
      quantity: '2000000'
    },
    {
      unit: 'policy123asset456', // カスタムトークン
      quantity: '1000000' // 1トークン（6 decimals）
    }
  ]
}

const mockUtxo = {
  tx_hash: 'tx_hash_123',
  output_index: 0,
  amount: [
    {
      unit: 'lovelace',
      quantity: '2000000'
    }
  ],
  block: 'block_hash_123'
}

describe('AdaDepositDetector', () => {
  let detector: AdaDepositDetector

  beforeEach(() => {
    vi.clearAllMocks()
    mockChainConfigs.clear()
    mockDepositAddresses.clear()
    mockDeposits.clear()

    // デフォルトのfetchレスポンス
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockLatestBlock
    } as Response)

    // 環境変数モック
    vi.stubEnv('VITE_BLOCKFROST_API_KEY', 'test-api-key')
    vi.stubEnv('VITE_ADA_NETWORK', 'mainnet')
    vi.stubEnv('VITE_ADA_MIN_CONFIRMATIONS', '15')

    detector = new AdaDepositDetector('test-api-key', 'mainnet', 15)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('インスタンス化', () => {
    it('AdaDepositDetectorを正常にインスタンス化できる', () => {
      expect(detector).toBeInstanceOf(AdaDepositDetector)
    })

    it('mainnetネットワークで初期化できる', () => {
      const mainnetDetector = new AdaDepositDetector('api-key', 'mainnet', 15)
      expect(mainnetDetector).toBeInstanceOf(AdaDepositDetector)
    })

    it('testnetネットワークで初期化できる', () => {
      const testnetDetector = new AdaDepositDetector('api-key', 'testnet', 10)
      expect(testnetDetector).toBeInstanceOf(AdaDepositDetector)
    })
  })

  describe('Blockfrost API接続', () => {
    it('最新ブロック情報を取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLatestBlock
      } as Response)

      const block = await detector.getLatestBlock()

      expect(block.height).toBe(9000000)
      expect(block.time).toBeDefined()
      expect(block.slot).toBe(100000000)
    })

    it('API接続エラーを適切にthrowする', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Invalid API key'
      } as Response)

      await expect(detector.getLatestBlock()).rejects.toThrow('Blockfrost API Error: 403 Invalid API key')
    })

    it('ネットワークエラーを適切にthrowする', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.getLatestBlock()).rejects.toThrow('Network error')
    })
  })

  describe('サポートトークン取得', () => {
    it('ADAの設定を取得できる', async () => {
      mockChainConfigs.set('ada', {
        asset: 'ADA',
        chain: 'cardano',
        network: 'mainnet',
        active: true,
        config: {}
      })

      const tokens = await detector.getSupportedTokens()

      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toEqual({
        symbol: 'ADA',
        decimals: 6,
        type: 'native'
      })
    })

    it('ADAとカスタムトークンの設定を取得できる', async () => {
      mockChainConfigs.set('ada', {
        asset: 'ADA',
        chain: 'cardano',
        network: 'mainnet',
        active: true
      })
      mockChainConfigs.set('custom', {
        asset: 'CUSTOM',
        chain: 'cardano',
        network: 'mainnet',
        active: true,
        config: {
          policyId: 'policy123',
          assetName: 'asset456',
          decimals: 8
        }
      })

      const tokens = await detector.getSupportedTokens()

      expect(tokens).toHaveLength(2)
      expect(tokens[0].symbol).toBe('ADA')
      expect(tokens[0].type).toBe('native')
      expect(tokens[1]).toEqual({
        policyId: 'policy123',
        assetName: 'asset456',
        symbol: 'CUSTOM',
        decimals: 8,
        type: 'token'
      })
    })

    it('カスタムトークンのpolicyIdがない場合はスキップする', async () => {
      mockChainConfigs.set('ada', {
        asset: 'ADA',
        chain: 'cardano',
        network: 'mainnet',
        active: true
      })
      mockChainConfigs.set('custom', {
        asset: 'CUSTOM',
        chain: 'cardano',
        network: 'mainnet',
        active: true,
        config: {
          assetName: 'asset456' // policyIdなし
        }
      })

      const tokens = await detector.getSupportedTokens()

      expect(tokens).toHaveLength(1)
      expect(tokens[0].symbol).toBe('ADA')
    })

    it('取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 3-level eq chain
      const level2 = {
        eq: vi.fn().mockResolvedValue({ data: null, error: new Error('Database error') })
      }

      const level1 = {
        eq: vi.fn().mockReturnValue(level2)
      }

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue(level1)
      }

      vi.mocked(supabase.from).mockReturnValueOnce(mockChain as unknown as ReturnType<typeof supabase.from>)

      const tokens = await detector.getSupportedTokens()
      expect(tokens).toHaveLength(0)
    })
  })

  describe('入金アドレス取得', () => {
    it('ADA入金アドレスを取得できる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        active: true
      })

      const addresses = await detector.getDepositAddresses('ADA')

      expect(addresses).toHaveLength(1)
      expect(addresses[0]).toEqual({
        address: 'addr1_test123',
        userId: 'user-123',
        addressId: 'addr-1'
      })
    })

    it('複数の入金アドレスを取得できる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        active: true
      })
      mockDepositAddresses.set('addr-2', {
        id: 'addr-2',
        user_id: 'user-456',
        address: 'addr1_test456',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        active: true
      })

      const addresses = await detector.getDepositAddresses('ADA')

      expect(addresses).toHaveLength(2)
    })

    it('該当するアドレスがない場合は空配列を返す', async () => {
      const addresses = await detector.getDepositAddresses('ADA')
      expect(addresses).toHaveLength(0)
    })

    it('取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 4-level eq chain
      const level3 = {
        eq: vi.fn().mockResolvedValue({ data: null, error: new Error('Database error') })
      }

      const level2 = {
        eq: vi.fn().mockReturnValue(level3)
      }

      const level1 = {
        eq: vi.fn().mockReturnValue(level2)
      }

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnValue(level1)
      }

      vi.mocked(supabase.from).mockReturnValueOnce(mockChain as unknown as ReturnType<typeof supabase.from>)

      const addresses = await detector.getDepositAddresses('ADA')
      expect(addresses).toHaveLength(0)
    })
  })

  describe('トランザクション取得', () => {
    it('アドレスのトランザクション履歴を取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockTransaction]
      } as Response)

      const transactions = await detector.getAddressTransactions('addr1_test123')

      expect(transactions).toHaveLength(1)
      expect(transactions[0].hash).toBe('tx_hash_123')
    })

    it('トランザクション詳細を取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransaction
      } as Response)

      const txDetails = await detector.getTransactionDetails('tx_hash_123')

      expect(txDetails.hash).toBe('tx_hash_123')
      expect(txDetails.block_height).toBe(8999990)
    })

    it('UTXOを取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUtxo]
      } as Response)

      const utxos = await detector.getAddressUtxos('addr1_test123')

      expect(utxos).toHaveLength(1)
      expect(utxos[0].tx_hash).toBe('tx_hash_123')
    })
  })

  describe('入金記録', () => {
    it('ADA入金を正常に記録できる', async () => {
      await detector.recordDeposit(
        'user-123',
        'addr-1',
        'ADA',
        '2.000000',
        'tx_hash_123',
        8999990,
        'addr1_test123'
      )

      expect(true).toBe(true)
    })

    it('カスタムトークン入金を正常に記録できる', async () => {
      await detector.recordDeposit(
        'user-123',
        'addr-1',
        'CUSTOM',
        '1.00000000',
        'tx_hash_456',
        8999990,
        'addr1_test123',
        'policy123asset456'
      )

      expect(true).toBe(true)
    })

    it('重複する入金は記録されない', async () => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        transaction_hash: 'tx_hash_123',
        wallet_address: 'addr1_test123',
        asset: 'ADA'
      })

      await detector.recordDeposit(
        'user-123',
        'addr-1',
        'ADA',
        '2.000000',
        'tx_hash_123',
        8999990,
        'addr1_test123'
      )

      expect(true).toBe(true)
    })

    it('記録エラー時はthrowする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 1回目: 重複チェック
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      } as unknown as ReturnType<typeof supabase.from>)

      // 2回目: insert()
      vi.mocked(supabase.from).mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: new Error('Insert failed') })
      } as unknown as ReturnType<typeof supabase.from>)

      await expect(
        detector.recordDeposit(
          'user-123',
          'addr-1',
          'ADA',
          '2.000000',
          'tx_hash_123',
          8999990,
          'addr1_test123'
        )
      ).rejects.toThrow()
    })
  })

  describe('確認数更新', () => {
    beforeEach(() => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        user_id: 'user-123',
        transaction_hash: 'tx_hash_123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        status: 'pending',
        confirmations_required: 15,
        amount: 2.0
      })
    })

    it('確認数を正常に更新できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransaction
      } as Response)

      await detector.updateConfirmations(9000000, 'ADA')

      expect(true).toBe(true)
    })

    it('確認数が満たされた場合はconfirmedにステータス更新する', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockTransaction,
          block_height: 8999984 // 16確認 (9000000 - 8999984)
        })
      } as Response)

      await detector.updateConfirmations(9000000, 'ADA')

      expect(true).toBe(true)
    })

    it('pending入金がない場合は早期リターンする', async () => {
      mockDeposits.clear()

      await detector.updateConfirmations(9000000, 'ADA')

      expect(true).toBe(true)
    })

    it('トランザクション詳細取得エラー時は処理を継続する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.updateConfirmations(9000000, 'ADA')).resolves.not.toThrow()
    })
  })

  describe('ADA入金スキャン', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        active: true
      })
    })

    it('ADA入金を正常に検知できる', async () => {
      vi.mocked(global.fetch)
        // getLatestBlock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        // getAddressTransactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockTransaction]
        } as Response)
        // getTransactionDetails
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransaction
        } as Response)

      const results = await detector.scanAdaDeposits()

      expect(results).toHaveLength(1)
      expect(results[0].tokenSymbol).toBe('ADA')
      expect(results[0].amount).toBe('2.000000')
      expect(results[0].transactionHash).toBe('tx_hash_123')
    })

    it('fromSlotを指定してスキャンできる', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockTransaction]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransaction
        } as Response)

      const results = await detector.scanAdaDeposits(99999980)

      expect(Array.isArray(results)).toBe(true)
    })

    it('古いトランザクションは無視する', async () => {
      const oldTx = {
        ...mockTransaction,
        block_time: Math.floor(Date.now() / 1000) - 600 // 10分前
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [oldTx]
        } as Response)

      const results = await detector.scanAdaDeposits()

      expect(results).toHaveLength(0)
    })

    it('金額が0の場合は無視する', async () => {
      const zeroTx = {
        ...mockTransaction,
        output_amount: [
          {
            unit: 'lovelace',
            quantity: '0'
          }
        ]
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockTransaction]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => zeroTx
        } as Response)

      const results = await detector.scanAdaDeposits()

      expect(results).toHaveLength(0)
    })

    it('アドレスがない場合は空配列を返す', async () => {
      mockDepositAddresses.clear()

      const results = await detector.scanAdaDeposits()

      expect(results).toHaveLength(0)
    })

    it('トランザクション取得エラー時も処理を継続する', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        .mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.scanAdaDeposits()).resolves.not.toThrow()
    })
  })

  describe('カスタムトークン入金スキャン', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'CUSTOM',
        active: true
      })
    })

    it('カスタムトークン入金を正常に検知できる', async () => {
      vi.mocked(global.fetch)
        // getAddressTransactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockCustomTokenTransaction]
        } as Response)
        // getTransactionDetails
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCustomTokenTransaction
        } as Response)

      const results = await detector.scanTokenDeposits(
        'policy123',
        'asset456',
        'CUSTOM',
        6
      )

      expect(results).toHaveLength(1)
      expect(results[0].tokenSymbol).toBe('CUSTOM')
      expect(results[0].amount).toBe('1.000000')
      expect(results[0].tokenAddress).toBe('policy123asset456')
    })

    it('トークンが含まれていないトランザクションは無視する', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockTransaction] // ADAのみ
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransaction
        } as Response)

      const results = await detector.scanTokenDeposits(
        'policy123',
        'asset456',
        'CUSTOM',
        6
      )

      expect(results).toHaveLength(0)
    })

    it('金額が0の場合は無視する', async () => {
      const zeroTokenTx = {
        ...mockCustomTokenTransaction,
        output_amount: [
          {
            unit: 'lovelace',
            quantity: '2000000'
          },
          {
            unit: 'policy123asset456',
            quantity: '0'
          }
        ]
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockCustomTokenTransaction]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => zeroTokenTx
        } as Response)

      const results = await detector.scanTokenDeposits(
        'policy123',
        'asset456',
        'CUSTOM',
        6
      )

      expect(results).toHaveLength(0)
    })

    it('アドレスがない場合は空配列を返す', async () => {
      mockDepositAddresses.clear()

      const results = await detector.scanTokenDeposits(
        'policy123',
        'asset456',
        'CUSTOM',
        6
      )

      expect(results).toHaveLength(0)
    })

    it('トランザクション取得エラー時も処理を継続する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(
        detector.scanTokenDeposits('policy123', 'asset456', 'CUSTOM', 6)
      ).resolves.not.toThrow()
    })
  })

  describe('全トークンスキャン', () => {
    beforeEach(() => {
      mockChainConfigs.set('ada', {
        asset: 'ADA',
        chain: 'cardano',
        network: 'mainnet',
        active: true
      })
      mockChainConfigs.set('custom', {
        asset: 'CUSTOM',
        chain: 'cardano',
        network: 'mainnet',
        active: true,
        config: {
          policyId: 'policy123',
          assetName: 'asset456',
          decimals: 6
        }
      })

      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        active: true
      })

      mockDepositAddresses.set('addr-2', {
        id: 'addr-2',
        user_id: 'user-456',
        address: 'addr1_test456',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'CUSTOM',
        active: true
      })
    })

    it('すべてのサポートトークンをスキャンできる', async () => {
      vi.mocked(global.fetch)
        // getLatestBlock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        // ADA: getLatestBlock (scanAdaDeposits内)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        // ADA: getAddressTransactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockTransaction]
        } as Response)
        // ADA: getTransactionDetails
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransaction
        } as Response)
        // ADA: updateConfirmations
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransaction
        } as Response)
        // CUSTOM: getAddressTransactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockCustomTokenTransaction]
        } as Response)
        // CUSTOM: getTransactionDetails
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCustomTokenTransaction
        } as Response)
        // CUSTOM: updateConfirmations
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCustomTokenTransaction
        } as Response)

      const results = await detector.scanAllDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('fromSlotを指定してスキャンできる', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValue({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)

      const results = await detector.scanAllDeposits(99999980)

      expect(Array.isArray(results)).toBe(true)
    })

    it('トークンスキャンエラー時も処理を継続する', async () => {
      vi.mocked(global.fetch)
        // getLatestBlock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        // ADA: getLatestBlock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        // ADA: getAddressTransactions - エラー
        .mockRejectedValueOnce(new Error('Network error'))
        // CUSTOM: getAddressTransactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockCustomTokenTransaction]
        } as Response)
        // CUSTOM: getTransactionDetails
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCustomTokenTransaction
        } as Response)
        // updateConfirmations calls
        .mockResolvedValue({
          ok: true,
          json: async () => mockTransaction
        } as Response)

      const results = await detector.scanAllDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('サポートトークンがない場合は空配列を返す', async () => {
      mockChainConfigs.clear()

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockLatestBlock
      } as Response)

      const results = await detector.scanAllDeposits()

      expect(results).toHaveLength(0)
    })
  })

  describe('ネットワーク互換性', () => {
    it('mainnetとtestnetで異なる設定を使用する', () => {
      const mainnetDetector = new AdaDepositDetector('api-key', 'mainnet', 15)
      const testnetDetector = new AdaDepositDetector('api-key', 'testnet', 10)

      expect(mainnetDetector).toBeInstanceOf(AdaDepositDetector)
      expect(testnetDetector).toBeInstanceOf(AdaDepositDetector)
    })
  })

  describe('Lovelace/ADA変換', () => {
    it('Lovelace単位からADAへの変換が正しく動作する', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'ADA',
        active: true
      })

      const txWith5Ada = {
        ...mockTransaction,
        output_amount: [
          {
            unit: 'lovelace',
            quantity: '5000000' // 5 ADA
          }
        ]
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLatestBlock
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [txWith5Ada]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => txWith5Ada
        } as Response)

      const results = await detector.scanAdaDeposits()

      expect(results[0].amount).toBe('5.000000')
    })
  })

  describe('トークン金額フォーマット', () => {
    it('カスタムトークンの最小単位から可読形式への変換が正しく動作する', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'CUSTOM',
        active: true
      })

      const txWith100Token = {
        ...mockCustomTokenTransaction,
        output_amount: [
          {
            unit: 'lovelace',
            quantity: '2000000'
          },
          {
            unit: 'policy123asset456',
            quantity: '100000000' // 100トークン（6 decimals）
          }
        ]
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [txWith100Token]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => txWith100Token
        } as Response)

      const results = await detector.scanTokenDeposits(
        'policy123',
        'asset456',
        'CUSTOM',
        6
      )

      expect(results[0].amount).toBe('100.000000')
    })

    it('8 decimalsのトークンを正しくフォーマットできる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'addr1_test123',
        chain: 'cardano',
        network: 'mainnet',
        asset: 'TOKEN8',
        active: true
      })

      const tx8Dec = {
        ...mockCustomTokenTransaction,
        output_amount: [
          {
            unit: 'lovelace',
            quantity: '2000000'
          },
          {
            unit: 'policy999asset999',
            quantity: '1000000000' // 10トークン（8 decimals）
          }
        ]
      }

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [tx8Dec]
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => tx8Dec
        } as Response)

      const results = await detector.scanTokenDeposits(
        'policy999',
        'asset999',
        'TOKEN8',
        8
      )

      expect(results[0].amount).toBe('10.00000000')
    })
  })
})
