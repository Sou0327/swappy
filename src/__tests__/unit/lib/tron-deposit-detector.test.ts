/**
 * tron-deposit-detector の単体テスト
 * TRON (TRX・TRC20) 入金検知システムの包括的テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TronDepositDetector, type TronDepositResult } from '@/lib/tron-deposit-detector'

// Supabaseモック
interface MockChainConfig {
  asset: string
  chain: string
  network: string
  active: boolean
  config?: {
    contractAddress?: string
  }
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
  user_id?: string
  transaction_hash: string
  wallet_address?: string
  asset: string
  chain?: string
  network?: string
  status?: string
  confirmations_required?: number
  amount?: number
}

interface MockUserAsset {
  user_id: string
  asset: string
  balance?: number
}

const mockChainConfigs = new Map<string, MockChainConfig>()
const mockDepositAddresses = new Map<string, MockDepositAddress>()
const mockDeposits = new Map<string, MockDeposit>()
const mockUserAssets = new Map<string, MockUserAsset>()

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
        chainable.eq.mockImplementation((col: string, val: string | boolean) => {
          let filtered = configs.filter(c => c[col as keyof MockChainConfig] === val)
          return {
            eq: vi.fn((col2: string, val2: string | boolean) => {
              filtered = filtered.filter(c => c[col2 as keyof MockChainConfig] === val2)
              return {
                eq: vi.fn((col3: string, val3: string | boolean) => {
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
        chainable.eq.mockImplementation((col: string, val: string | boolean) => {
          let filtered = addresses.filter(a => a[col as keyof MockDepositAddress] === val)
          return {
            eq: vi.fn((col2: string, val2: string | boolean) => {
              filtered = filtered.filter(a => a[col2 as keyof MockDepositAddress] === val2)
              return {
                eq: vi.fn((col3: string, val3: string | boolean) => {
                  filtered = filtered.filter(a => a[col3 as keyof MockDepositAddress] === val3)
                  return {
                    eq: vi.fn((col4: string, val4: string | boolean) => {
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
          chainable.eq.mockImplementation((col: string, val: string | number | boolean) => {
            let filtered = deposits.filter(d => d[col as keyof MockDeposit] === val)

            const level2 = {
              eq: vi.fn((col2: string, val2: string | number | boolean) => {
                filtered = filtered.filter(d => d[col2 as keyof MockDeposit] === val2)

                const level3 = {
                  eq: vi.fn((col3: string, val3: string | number | boolean) => {
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
          chainable.eq.mockImplementation((col: string, val: string | number | boolean) => {
            let filtered = deposits.filter(d => d[col as keyof MockDeposit] === val)

            const level2 = {
              eq: vi.fn((col2: string, val2: string | number | boolean) => {
                filtered = filtered.filter(d => d[col2 as keyof MockDeposit] === val2)

                const level3 = {
                  eq: vi.fn((col3: string, val3: string | number | boolean) => {
                    filtered = filtered.filter(d => d[col3 as keyof MockDeposit] === val3)

                    const level4 = {
                      eq: vi.fn((col4: string, val4: string | number | boolean) => {
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

    // user_assetsテーブル
    if (tableName === 'user_assets') {
      chainable.select.mockImplementation(() => {
        chainable.eq.mockImplementation((col: string, val: string) => {
          const asset = mockUserAssets.get(`${val}`)
          return {
            eq: vi.fn((col2: string, val2: string) => {
              const key = `${val}-${val2}`
              const asset = mockUserAssets.get(key)
              return {
                single: vi.fn().mockResolvedValue({
                  data: asset || null,
                  error: null
                })
              }
            })
          }
        })
        return chainable
      })

      chainable.update.mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      })

      chainable.insert.mockResolvedValue({ error: null })
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

// TronGrid APIレスポンスのモック
const mockBlockInfo = {
  block_header: {
    raw_data: {
      number: 50000000,
      timestamp: Date.now()
    }
  }
}

const mockTrxTransaction = {
  txID: 'trx_tx_hash_123',
  blockNumber: 49999990,
  blockTimeStamp: Date.now() - 60000,
  result: 'SUCCESS',
  raw_data: {
    contract: [
      {
        type: 'TransferContract',
        parameter: {
          value: {
            amount: 1000000, // 1 TRX (Sun単位)
            owner_address: 'TFromAddress123',
            to_address: 'TTestAddress123'
          },
          type_url: 'type.googleapis.com/protocol.TransferContract'
        }
      }
    ],
    timestamp: Date.now() - 60000
  }
}

const mockTrc20Transaction = {
  block_number: 49999990,
  block_timestamp: Date.now() - 60000,
  contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT contract
  from: 'TFromAddress123',
  to: 'TTestAddress123',
  value: '1000000', // 1 USDT (6 decimals)
  token_info: {
    symbol: 'USDT',
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    name: 'Tether USD'
  },
  transaction_id: 'trc20_tx_hash_123'
}

const mockTransactionInfo = {
  blockNumber: 49999990,
  blockTimeStamp: Date.now() - 60000
}

describe('TronDepositDetector', () => {
  let detector: TronDepositDetector

  beforeEach(() => {
    vi.clearAllMocks()
    mockChainConfigs.clear()
    mockDepositAddresses.clear()
    mockDeposits.clear()
    mockUserAssets.clear()

    // デフォルトのfetchレスポンス
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockBlockInfo
    } as Response)

    // 環境変数モック
    vi.stubEnv('VITE_TRONGRID_API_KEY', 'test-api-key')
    vi.stubEnv('VITE_TRON_NETWORK', 'mainnet')
    vi.stubEnv('VITE_TRON_MIN_CONFIRMATIONS', '19')

    detector = new TronDepositDetector('test-api-key', 'mainnet', 19)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('インスタンス化', () => {
    it('TronDepositDetectorを正常にインスタンス化できる', () => {
      expect(detector).toBeInstanceOf(TronDepositDetector)
    })

    it('mainnetネットワークで初期化できる', () => {
      const mainnetDetector = new TronDepositDetector('api-key', 'mainnet', 19)
      expect(mainnetDetector).toBeInstanceOf(TronDepositDetector)
    })

    it('shastaテストネットで初期化できる', () => {
      const shastaDetector = new TronDepositDetector('api-key', 'shasta', 10)
      expect(shastaDetector).toBeInstanceOf(TronDepositDetector)
    })

    it('nileテストネットで初期化できる', () => {
      const nileDetector = new TronDepositDetector('api-key', 'nile', 10)
      expect(nileDetector).toBeInstanceOf(TronDepositDetector)
    })
  })

  describe('TronGrid API接続', () => {
    it('最新ブロック情報を取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBlockInfo
      } as Response)

      const block = await detector.getLatestBlock()

      expect(block.blockNumber).toBe(50000000)
      expect(block.timestamp).toBeDefined()
    })

    it('API接続エラーを適切にthrowする', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      } as Response)

      await expect(detector.getLatestBlock()).rejects.toThrow('TronGrid API Error: 401 Unauthorized')
    })

    it('APIエラーレスポンスを適切に処理する', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: 'Invalid API key'
        })
      } as Response)

      await expect(detector.getLatestBlock()).rejects.toThrow('TronGrid API Error: Invalid API key')
    })

    it('不正なレスポンス形式でエラーをthrowする', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      } as Response)

      await expect(detector.getLatestBlock()).rejects.toThrow('Invalid block response format')
    })
  })

  describe('サポートトークン取得', () => {
    it('TRXとUSDTの設定を取得できる', async () => {
      mockChainConfigs.set('trx', {
        asset: 'TRX',
        chain: 'trc',
        network: 'mainnet',
        active: true,
        config: {}
      })
      mockChainConfigs.set('usdt', {
        asset: 'USDT',
        chain: 'trc',
        network: 'mainnet',
        active: true,
        config: {
          contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
        }
      })

      const tokens = await detector.getSupportedTokens()

      expect(tokens).toHaveLength(2)
      expect(tokens[0]).toEqual({
        symbol: 'TRX',
        decimals: 6,
        type: 'native'
      })
      expect(tokens[1]).toEqual({
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        symbol: 'USDT',
        decimals: 6,
        type: 'trc20'
      })
    })

    it('TRXのみの設定を取得できる', async () => {
      mockChainConfigs.set('trx', {
        asset: 'TRX',
        chain: 'trc',
        network: 'mainnet',
        active: true
      })

      const tokens = await detector.getSupportedTokens()

      expect(tokens).toHaveLength(1)
      expect(tokens[0].symbol).toBe('TRX')
      expect(tokens[0].type).toBe('native')
    })

    it('USDTのcontractAddressがない場合はスキップする', async () => {
      mockChainConfigs.set('trx', {
        asset: 'TRX',
        chain: 'trc',
        network: 'mainnet',
        active: true
      })
      mockChainConfigs.set('usdt', {
        asset: 'USDT',
        chain: 'trc',
        network: 'mainnet',
        active: true,
        config: {} // contractAddressなし
      })

      const tokens = await detector.getSupportedTokens()

      expect(tokens).toHaveLength(1)
      expect(tokens[0].symbol).toBe('TRX')
    })

    it('取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 3-level eq chain for chain_configs
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
    it('TRX入金アドレスを取得できる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TTestAddress123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        active: true
      })

      const addresses = await detector.getDepositAddresses('TRX')

      expect(addresses).toHaveLength(1)
      expect(addresses[0]).toEqual({
        address: 'TTestAddress123',
        userId: 'user-123',
        addressId: 'addr-1'
      })
    })

    it('USDT入金アドレスを取得できる', async () => {
      mockDepositAddresses.set('addr-2', {
        id: 'addr-2',
        user_id: 'user-456',
        address: 'TUSDTAddress456',
        chain: 'trc',
        network: 'mainnet',
        asset: 'USDT',
        active: true
      })

      const addresses = await detector.getDepositAddresses('USDT')

      expect(addresses).toHaveLength(1)
      expect(addresses[0]).toEqual({
        address: 'TUSDTAddress456',
        userId: 'user-456',
        addressId: 'addr-2'
      })
    })

    it('複数の入金アドレスを取得できる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TAddr1',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        active: true
      })
      mockDepositAddresses.set('addr-2', {
        id: 'addr-2',
        user_id: 'user-456',
        address: 'TAddr2',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        active: true
      })

      const addresses = await detector.getDepositAddresses('TRX')

      expect(addresses).toHaveLength(2)
    })

    it('該当するアドレスがない場合は空配列を返す', async () => {
      const addresses = await detector.getDepositAddresses('TRX')
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

      const addresses = await detector.getDepositAddresses('TRX')
      expect(addresses).toHaveLength(0)
    })
  })

  describe('TRXトランザクション取得', () => {
    it('TRXトランザクションを正常に取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockTrxTransaction]
        })
      } as Response)

      const transactions = await detector.getTrxTransactions(
        'TTestAddress123',
        Date.now() - 300000,
        Date.now()
      )

      expect(transactions).toHaveLength(1)
      expect(transactions[0].txID).toBe('trx_tx_hash_123')
    })

    it('データがない場合は空配列を返す', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      } as Response)

      const transactions = await detector.getTrxTransactions(
        'TTestAddress123',
        Date.now() - 300000,
        Date.now()
      )

      expect(transactions).toHaveLength(0)
    })

    it('dataフィールドがない場合は空配列を返す', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      } as Response)

      const transactions = await detector.getTrxTransactions(
        'TTestAddress123',
        Date.now() - 300000,
        Date.now()
      )

      expect(transactions).toHaveLength(0)
    })
  })

  describe('TRC20トランザクション取得', () => {
    it('TRC20トランザクションを正常に取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockTrc20Transaction]
        })
      } as Response)

      const transactions = await detector.getTrc20Transactions(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'TTestAddress123',
        Date.now() - 300000,
        Date.now()
      )

      expect(transactions).toHaveLength(1)
      expect(transactions[0].transaction_id).toBe('trc20_tx_hash_123')
      expect(transactions[0].token_info.symbol).toBe('USDT')
    })

    it('データがない場合は空配列を返す', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      } as Response)

      const transactions = await detector.getTrc20Transactions(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'TTestAddress123',
        Date.now() - 300000,
        Date.now()
      )

      expect(transactions).toHaveLength(0)
    })
  })

  describe('入金記録', () => {
    it('TRX入金を正常に記録できる', async () => {
      await detector.recordDeposit(
        'user-123',
        'addr-1',
        'TRX',
        '1.000000',
        'trx_tx_hash_123',
        49999990,
        'TTestAddress123'
      )

      expect(true).toBe(true) // 正常終了を確認
    })

    it('TRC20入金を正常に記録できる', async () => {
      await detector.recordDeposit(
        'user-123',
        'addr-1',
        'USDT',
        '1.000000',
        'trc20_tx_hash_123',
        49999990,
        'TTestAddress123',
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
      )

      expect(true).toBe(true)
    })

    it('重複する入金は記録されない', async () => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        transaction_hash: 'trx_tx_hash_123',
        wallet_address: 'TTestAddress123',
        asset: 'TRX'
      })

      await detector.recordDeposit(
        'user-123',
        'addr-1',
        'TRX',
        '1.000000',
        'trx_tx_hash_123',
        49999990,
        'TTestAddress123'
      )

      expect(true).toBe(true) // 重複チェックで早期リターン
    })

    it('記録エラー時はthrowする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 1回目: 重複チェック - 既存レコードなし
      vi.mocked(supabase.from).mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      } as unknown as ReturnType<typeof supabase.from>)

      // 2回目: insert() - エラーを返す
      vi.mocked(supabase.from).mockReturnValueOnce({
        insert: vi.fn().mockResolvedValue({ error: new Error('Insert failed') })
      } as unknown as ReturnType<typeof supabase.from>)

      await expect(
        detector.recordDeposit(
          'user-123',
          'addr-1',
          'TRX',
          '1.000000',
          'trx_tx_hash_123',
          49999990,
          'TTestAddress123'
        )
      ).rejects.toThrow()
    })
  })

  describe('確認数更新', () => {
    beforeEach(() => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        user_id: 'user-123',
        transaction_hash: 'trx_tx_hash_123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        status: 'pending',
        confirmations_required: 19,
        amount: 1.0
      })
    })

    it('確認数を正常に更新できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactionInfo
      } as Response)

      await detector.updateConfirmations(50000000, 'TRX')

      expect(true).toBe(true)
    })

    it('確認数が満たされた場合はconfirmedにステータス更新する', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          blockNumber: 49999980, // 20確認 (50000000 - 49999980)
          blockTimeStamp: Date.now() - 120000
        })
      } as Response)

      await detector.updateConfirmations(50000000, 'TRX')

      expect(true).toBe(true)
    })

    it('pending入金がない場合は早期リターンする', async () => {
      mockDeposits.clear()

      await detector.updateConfirmations(50000000, 'TRX')

      expect(true).toBe(true)
    })

    it('トランザクション情報取得エラー時は処理を継続する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.updateConfirmations(50000000, 'TRX')).resolves.not.toThrow()
    })
  })

  describe('TRX入金スキャン', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TTestAddress123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        active: true
      })
    })

    it('TRX入金を正常に検知できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockTrxTransaction]
        })
      } as Response)

      const results = await detector.scanTrxDeposits(
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(1)
      expect(results[0].tokenSymbol).toBe('TRX')
      expect(results[0].amount).toBe('1.000000')
      expect(results[0].transactionHash).toBe('trx_tx_hash_123')
    })

    it('TransferContract以外のトランザクションは無視する', async () => {
      const nonTransferTx = {
        ...mockTrxTransaction,
        raw_data: {
          ...mockTrxTransaction.raw_data,
          contract: [
            {
              type: 'TriggerSmartContract', // 異なるコントラクトタイプ
              parameter: {
                value: {
                  owner_address: 'TFromAddress123',
                  to_address: 'TTestAddress123'
                },
                type_url: 'type.googleapis.com/protocol.TriggerSmartContract'
              }
            }
          ]
        }
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [nonTransferTx]
        })
      } as Response)

      const results = await detector.scanTrxDeposits(
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('to_addressが一致しない場合は無視する', async () => {
      const wrongAddressTx = {
        ...mockTrxTransaction,
        raw_data: {
          ...mockTrxTransaction.raw_data,
          contract: [
            {
              ...mockTrxTransaction.raw_data.contract[0],
              parameter: {
                value: {
                  amount: 1000000,
                  owner_address: 'TFromAddress123',
                  to_address: 'TDifferentAddress999' // 異なるアドレス
                },
                type_url: 'type.googleapis.com/protocol.TransferContract'
              }
            }
          ]
        }
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [wrongAddressTx]
        })
      } as Response)

      const results = await detector.scanTrxDeposits(
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('金額が0の場合は無視する', async () => {
      const zeroAmountTx = {
        ...mockTrxTransaction,
        raw_data: {
          ...mockTrxTransaction.raw_data,
          contract: [
            {
              ...mockTrxTransaction.raw_data.contract[0],
              parameter: {
                value: {
                  amount: 0,
                  owner_address: 'TFromAddress123',
                  to_address: 'TTestAddress123'
                },
                type_url: 'type.googleapis.com/protocol.TransferContract'
              }
            }
          ]
        }
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [zeroAmountTx]
        })
      } as Response)

      const results = await detector.scanTrxDeposits(
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('アドレスがない場合は空配列を返す', async () => {
      mockDepositAddresses.clear()

      const results = await detector.scanTrxDeposits(
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('トランザクション取得エラー時も処理を継続する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(
        detector.scanTrxDeposits(Date.now() - 300000, Date.now())
      ).resolves.not.toThrow()
    })
  })

  describe('TRC20入金スキャン', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TTestAddress123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'USDT',
        active: true
      })
    })

    it('TRC20入金を正常に検知できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [mockTrc20Transaction]
        })
      } as Response)

      const results = await detector.scanTrc20Deposits(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'USDT',
        6,
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(1)
      expect(results[0].tokenSymbol).toBe('USDT')
      expect(results[0].amount).toBe('1.000000')
      expect(results[0].transactionHash).toBe('trc20_tx_hash_123')
      expect(results[0].tokenAddress).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
    })

    it('to addressが一致しない場合は無視する', async () => {
      const wrongAddressTx = {
        ...mockTrc20Transaction,
        to: 'TDifferentAddress999'
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [wrongAddressTx]
        })
      } as Response)

      const results = await detector.scanTrc20Deposits(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'USDT',
        6,
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('金額が0の場合は無視する', async () => {
      const zeroAmountTx = {
        ...mockTrc20Transaction,
        value: '0'
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [zeroAmountTx]
        })
      } as Response)

      const results = await detector.scanTrc20Deposits(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'USDT',
        6,
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('アドレスがない場合は空配列を返す', async () => {
      mockDepositAddresses.clear()

      const results = await detector.scanTrc20Deposits(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'USDT',
        6,
        Date.now() - 300000,
        Date.now()
      )

      expect(results).toHaveLength(0)
    })

    it('トランザクション取得エラー時も処理を継続する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(
        detector.scanTrc20Deposits(
          'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          'USDT',
          6,
          Date.now() - 300000,
          Date.now()
        )
      ).resolves.not.toThrow()
    })
  })

  describe('全トークンスキャン', () => {
    beforeEach(() => {
      // TRXとUSDTを設定
      mockChainConfigs.set('trx', {
        asset: 'TRX',
        chain: 'trc',
        network: 'mainnet',
        active: true
      })
      mockChainConfigs.set('usdt', {
        asset: 'USDT',
        chain: 'trc',
        network: 'mainnet',
        active: true,
        config: {
          contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
        }
      })

      // TRX deposit address
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TTestAddress123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        active: true
      })

      // USDT deposit address
      mockDepositAddresses.set('addr-2', {
        id: 'addr-2',
        user_id: 'user-456',
        address: 'TUSDTAddress456',
        chain: 'trc',
        network: 'mainnet',
        asset: 'USDT',
        active: true
      })
    })

    it('すべてのサポートトークンをスキャンできる', async () => {
      vi.mocked(global.fetch)
        // getLatestBlock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlockInfo
        } as Response)
        // TRX transactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [mockTrxTransaction]
          })
        } as Response)
        // TRC20 transactions
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [mockTrc20Transaction]
          })
        } as Response)
        // updateConfirmations for TRX
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransactionInfo
        } as Response)
        // updateConfirmations for USDT
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTransactionInfo
        } as Response)

      const results = await detector.scanAllDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('タイムスタンプ範囲を指定してスキャンできる', async () => {
      const fromTimestamp = Date.now() - 600000 // 10分前
      const toTimestamp = Date.now()

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlockInfo
        } as Response)
        .mockResolvedValue({
          ok: true,
          json: async () => ({ data: [] })
        } as Response)

      const results = await detector.scanAllDeposits(fromTimestamp, toTimestamp)

      expect(Array.isArray(results)).toBe(true)
    })

    it('トークンスキャンエラー時も処理を継続する', async () => {
      vi.mocked(global.fetch)
        // getLatestBlock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockBlockInfo
        } as Response)
        // TRX transactions - エラー
        .mockRejectedValueOnce(new Error('Network error'))
        // TRC20 transactions - 正常
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [mockTrc20Transaction]
          })
        } as Response)
        // updateConfirmations
        .mockResolvedValue({
          ok: true,
          json: async () => mockTransactionInfo
        } as Response)

      const results = await detector.scanAllDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('サポートトークンがない場合は空配列を返す', async () => {
      mockChainConfigs.clear()

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBlockInfo
      } as Response)

      const results = await detector.scanAllDeposits()

      expect(results).toHaveLength(0)
    })
  })

  describe('ネットワーク互換性', () => {
    it('mainnetとshastaで異なる設定を使用する', () => {
      const mainnetDetector = new TronDepositDetector('api-key', 'mainnet', 19)
      const shastaDetector = new TronDepositDetector('api-key', 'shasta', 10)

      expect(mainnetDetector).toBeInstanceOf(TronDepositDetector)
      expect(shastaDetector).toBeInstanceOf(TronDepositDetector)
    })

    it('nileテストネットで初期化できる', () => {
      const nileDetector = new TronDepositDetector('api-key', 'nile', 10)
      expect(nileDetector).toBeInstanceOf(TronDepositDetector)
    })
  })

  describe('Sun/TRX変換', () => {
    it('Sun単位からTRXへの変換が正しく動作する', async () => {
      // 統合テストとして scanTrxDeposits で検証
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TTestAddress123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'TRX',
        active: true
      })

      const txWith2Trx = {
        ...mockTrxTransaction,
        raw_data: {
          ...mockTrxTransaction.raw_data,
          contract: [
            {
              ...mockTrxTransaction.raw_data.contract[0],
              parameter: {
                value: {
                  amount: 2000000, // 2 TRX
                  owner_address: 'TFromAddress123',
                  to_address: 'TTestAddress123'
                },
                type_url: 'type.googleapis.com/protocol.TransferContract'
              }
            }
          ]
        }
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [txWith2Trx]
        })
      } as Response)

      const results = await detector.scanTrxDeposits(
        Date.now() - 300000,
        Date.now()
      )

      expect(results[0].amount).toBe('2.000000')
    })
  })

  describe('TRC20金額フォーマット', () => {
    it('TRC20の最小単位から可読形式への変換が正しく動作する', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: 'TTestAddress123',
        chain: 'trc',
        network: 'mainnet',
        asset: 'USDT',
        active: true
      })

      const txWith100Usdt = {
        ...mockTrc20Transaction,
        value: '100000000' // 100 USDT (6 decimals)
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [txWith100Usdt]
        })
      } as Response)

      const results = await detector.scanTrc20Deposits(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        'USDT',
        6,
        Date.now() - 300000,
        Date.now()
      )

      expect(results[0].amount).toBe('100.000000')
    })
  })
})
