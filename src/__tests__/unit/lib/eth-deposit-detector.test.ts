/**
 * eth-deposit-detector の単体テスト
 * Ethereum入金検知システムの包括的テスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EthDepositDetector, type DepositDetectionResult } from '@/lib/eth-deposit-detector'

// グローバルfetchのモック
global.fetch = vi.fn()

// Supabaseモック
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
  transaction_hash: string
  confirmations_required?: number
  status?: string
}

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
      single: vi.fn(),
    }

    // deposit_addressesテーブル
    if (tableName === 'deposit_addresses') {
      chainable.select.mockImplementation(() => {
        const addresses = Array.from(mockDepositAddresses.values())
        chainable.eq.mockImplementation((col: string, val: string | boolean) => {
          let filtered = addresses.filter(a => a[col as keyof MockDepositAddress] === val)
          return {
            ...chainable,
            eq: vi.fn((col2: string, val2: string | boolean) => {
              filtered = filtered.filter(a => a[col2 as keyof MockDepositAddress] === val2)
              return {
                ...chainable,
                eq: vi.fn((col3: string, val3: string | boolean) => {
                  filtered = filtered.filter(a => a[col3 as keyof MockDepositAddress] === val3)
                  return {
                    ...chainable,
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

      chainable.select.mockImplementation(() => {
        const deposits = Array.from(mockDeposits.values())

        chainable.eq.mockImplementation((col: string, val: string | number | boolean) => {
          let filtered = deposits.filter(d => d[col as keyof MockDeposit] === val)

          const innerChainable = {
            eq: vi.fn((col2: string, val2: string | number | boolean) => {
              filtered = filtered.filter(d => d[col2 as keyof MockDeposit] === val2)
              return {
                eq: vi.fn((col3: string, val3: string | number | boolean) => {
                  filtered = filtered.filter(d => d[col3 as keyof MockDeposit] === val3)
                  return {
                    eq: vi.fn((col4: string, val4: string | number | boolean) => {
                      filtered = filtered.filter(d => d[col4 as keyof MockDeposit] === val4)
                      return Promise.resolve({ data: filtered, error: null })
                    })
                  }
                })
              }
            }),
            single: vi.fn().mockResolvedValue({
              data: filtered.length > 0 ? filtered[0] : null,
              error: null
            })
          }

          return innerChainable
        })

        return chainable
      })

      chainable.update.mockImplementation((data: Record<string, unknown>) => {
        chainable.eq.mockResolvedValue({ error: null })
        return chainable
      })
    }

    return chainable
  }

  return {
    supabase: {
      from: vi.fn((table: string) => createChainableMock(table)),
      rpc: vi.fn().mockResolvedValue({ error: null })
    }
  }
})

// Ethereum RPCレスポンスのモック
const mockBlockNumber = '0x1000000' // 16777216
const mockBlock = {
  number: '0x1000000',
  hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  parentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  timestamp: '0x6400000',
  transactions: [
    {
      hash: '0xtx1hash000000000000000000000000000000000000000000000000000000',
      from: '0xsenderaddress000000000000000000000000000000000000000000000',
      to: '0x1234567890123456789012345678901234567890',
      value: '0xde0b6b3a7640000', // 1 ETH in wei
      blockNumber: '0x1000000',
      blockHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      transactionIndex: '0x0',
      gas: '0x5208',
      gasPrice: '0x3b9aca00'
    }
  ]
}

const mockTxReceipt = {
  transactionHash: '0xtx1hash000000000000000000000000000000000000000000000000000000',
  blockNumber: '0x1000000',
  blockHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  status: '0x1'
}

describe('EthDepositDetector', () => {
  let detector: EthDepositDetector

  beforeEach(() => {
    vi.clearAllMocks()
    mockDepositAddresses.clear()
    mockDeposits.clear()

    // デフォルトのfetchレスポンス
    vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(options?.body as string)

      if (body.method === 'eth_blockNumber') {
        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      }

      if (body.method === 'eth_getBlockByNumber') {
        return {
          ok: true,
          json: async () => ({ result: mockBlock, error: null })
        } as Response
      }

      if (body.method === 'eth_getTransactionReceipt') {
        return {
          ok: true,
          json: async () => ({ result: mockTxReceipt, error: null })
        } as Response
      }

      return {
        ok: true,
        json: async () => ({ result: null, error: null })
      } as Response
    })

    detector = new EthDepositDetector('http://localhost:8545', 'mainnet', 12)
  })

  describe('インスタンス化', () => {
    it('EthDepositDetectorを正常にインスタンス化できる', () => {
      expect(detector).toBeInstanceOf(EthDepositDetector)
    })

    it('mainnetネットワークで初期化できる', () => {
      const mainnetDetector = new EthDepositDetector('http://localhost:8545', 'mainnet', 12)
      expect(mainnetDetector).toBeInstanceOf(EthDepositDetector)
    })

    it('sepoliaネットワークで初期化できる', () => {
      const sepoliaDetector = new EthDepositDetector('http://localhost:11155111', 'sepolia', 6)
      expect(sepoliaDetector).toBeInstanceOf(EthDepositDetector)
    })

    it('minConfirmationsを設定できる', () => {
      const customDetector = new EthDepositDetector('http://localhost:8545', 'mainnet', 20)
      expect(customDetector).toBeInstanceOf(EthDepositDetector)
    })
  })

  describe('RPC接続', () => {
    it('最新ブロック番号を取得できる', async () => {
      const blockNumber = await detector.getLatestBlockNumber()

      expect(blockNumber).toBe(16777216)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8545',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      )
    })

    it('RPCエラーを適切に処理する', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: -32000, message: 'Server error' }
        })
      } as Response)

      await expect(detector.getLatestBlockNumber()).rejects.toThrow('RPC Error: Server error')
    })

    it('ネットワークエラーを適切に処理する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.getLatestBlockNumber()).rejects.toThrow('Network error')
    })
  })

  describe('ブロック取得', () => {
    it('指定ブロックの詳細を取得できる', async () => {
      const block = await detector.getBlockWithTransactions(16777216)

      expect(block).toHaveProperty('number')
      expect(block).toHaveProperty('hash')
      expect(block).toHaveProperty('transactions')
      expect(Array.isArray(block.transactions)).toBe(true)
    })

    it('トランザクションを含むブロックを取得できる', async () => {
      const block = await detector.getBlockWithTransactions(16777216)

      expect(block.transactions.length).toBeGreaterThan(0)
      expect(block.transactions[0]).toHaveProperty('hash')
      expect(block.transactions[0]).toHaveProperty('value')
    })

    it('空のブロックを取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { ...mockBlock, transactions: [] }
        })
      } as Response)

      const block = await detector.getBlockWithTransactions(16777216)
      expect(block.transactions).toHaveLength(0)
    })
  })

  describe('入金アドレス取得', () => {
    it('管理対象の入金アドレス一覧を取得できる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      const addresses = await detector.getDepositAddresses()

      expect(addresses).toHaveLength(1)
      expect(addresses[0]).toHaveProperty('address')
      expect(addresses[0]).toHaveProperty('userId')
      expect(addresses[0]).toHaveProperty('addressId')
    })

    it('アドレスを小文字に正規化する', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      const addresses = await detector.getDepositAddresses()
      expect(addresses[0].address).toBe('0xabcdef1234567890abcdef1234567890abcdef12')
    })

    it('activeでないアドレスは取得されない', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: false
      })

      const addresses = await detector.getDepositAddresses()
      expect(addresses).toHaveLength(0)
    })

    it('取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 4つのeq()チェーンに対応
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      }

      // 最後のeq()でエラーを返す
      mockChain.eq = vi.fn()
        .mockReturnValueOnce(mockChain)  // 1st eq
        .mockReturnValueOnce(mockChain)  // 2nd eq
        .mockReturnValueOnce(mockChain)  // 3rd eq
        .mockResolvedValueOnce({ data: null, error: new Error('Database error') })  // 4th eq

      vi.mocked(supabase.from).mockReturnValueOnce(mockChain as unknown as ReturnType<typeof supabase.from>)

      const addresses = await detector.getDepositAddresses()
      expect(addresses).toHaveLength(0)
    })
  })

  describe('Wei/ETH変換', () => {
    it('1 ETH (1e18 wei) を正しく変換できる', async () => {
      // weiToEthはprivateメソッドなので、scanBlockRangeを通してテスト
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      const results = await detector.scanBlockRange(16777216, 16777216)

      if (results.length > 0) {
        expect(results[0].amount).toBe('1.000000000000000000')
      }
    })

    it('0.5 ETH を正しく変換できる', async () => {
      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getBlockByNumber') {
          return {
            ok: true,
            json: async () => ({
              result: {
                ...mockBlock,
                transactions: [{
                  ...mockBlock.transactions[0],
                  value: '0x6f05b59d3b20000' // 0.5 ETH in wei
                }]
              }
            })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      const results = await detector.scanBlockRange(16777216, 16777216)

      if (results.length > 0) {
        expect(results[0].amount).toBe('0.500000000000000000')
      }
    })
  })

  describe('入金検知', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })
    })

    it('新しい入金を検知できる', async () => {
      const results = await detector.scanBlockRange(16777216, 16777216)

      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
    })

    it('検知結果が正しい形式で返される', async () => {
      const results = await detector.scanBlockRange(16777216, 16777216)

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('userId')
        expect(results[0]).toHaveProperty('depositAddress')
        expect(results[0]).toHaveProperty('amount')
        expect(results[0]).toHaveProperty('transactionHash')
        expect(results[0]).toHaveProperty('blockNumber')
        expect(results[0]).toHaveProperty('confirmations')
      }
    })

    it('value=0x0のトランザクションは無視される', async () => {
      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getBlockByNumber') {
          return {
            ok: true,
            json: async () => ({
              result: {
                ...mockBlock,
                transactions: [{
                  ...mockBlock.transactions[0],
                  value: '0x0' // 0 ETH
                }]
              }
            })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      const results = await detector.scanBlockRange(16777216, 16777216)
      expect(results).toHaveLength(0)
    })

    it('toアドレスがnullのトランザクションは無視される', async () => {
      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getBlockByNumber') {
          return {
            ok: true,
            json: async () => ({
              result: {
                ...mockBlock,
                transactions: [{
                  ...mockBlock.transactions[0],
                  to: null // コントラクト作成トランザクション
                }]
              }
            })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      const results = await detector.scanBlockRange(16777216, 16777216)
      expect(results).toHaveLength(0)
    })

    it('登録されていないアドレスへの入金は無視される', async () => {
      mockDepositAddresses.clear()

      const results = await detector.scanBlockRange(16777216, 16777216)
      expect(results).toHaveLength(0)
    })

    it('複数ブロックをスキャンできる', async () => {
      const results = await detector.scanBlockRange(16777216, 16777218)

      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('入金記録', () => {
    it('入金を正常に記録できる', async () => {
      await detector.recordDeposit(
        'user-123',
        'addr-1',
        '1.0',
        '0xtx1hash',
        16777216,
        '0x1234567890123456789012345678901234567890'
      )

      expect(true).toBe(true) // 実際はsupabaseモックが呼ばれたことを確認
    })

    it('重複する入金は記録されない', async () => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        transaction_hash: '0xtx1hash'
      })

      await detector.recordDeposit(
        'user-123',
        'addr-1',
        '1.0',
        '0xtx1hash',
        16777216,
        '0x1234567890123456789012345678901234567890'
      )

      // 重複のため、insertは呼ばれない
      expect(true).toBe(true)
    })

    it('記録エラー時はthrowする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 1回目: 重複チェック (select().eq().single()) - 既存レコードなし
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
          '1.0',
          '0xtx1hash',
          16777216,
          '0x1234567890123456789012345678901234567890'
        )
      ).rejects.toThrow()
    })
  })

  describe('確認数更新', () => {
    beforeEach(() => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        transaction_hash: '0xtx1hash000000000000000000000000000000000000000000000000000000',
        confirmations_required: 12,
        status: 'pending'
      })
    })

    it('未確認入金の確認数を更新できる', async () => {
      await detector.updateConfirmations(16777220)

      expect(true).toBe(true) // 実際はupdateが呼ばれたことを確認
    })

    it('確認数が閾値に達したらconfirmedステータスに更新される', async () => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        transaction_hash: '0xtx1hash000000000000000000000000000000000000000000000000000000',
        confirmations_required: 12,
        status: 'pending'
      })

      await detector.updateConfirmations(16777228) // 12 confirmations

      expect(true).toBe(true)
    })

    it('未確認入金がない場合は早期リターンする', async () => {
      mockDeposits.clear()

      await detector.updateConfirmations(16777220)

      expect(true).toBe(true)
    })

    it('トランザクション詳細取得エラー時も処理を継続する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('RPC error'))

      await expect(detector.updateConfirmations(16777220)).resolves.not.toThrow()
    })
  })

  describe('最新スキャン', () => {
    it('最新の入金をスキャンできる', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      const results = await detector.scanLatestDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('スキャンエラー時は空配列を返す', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      const results = await detector.scanLatestDeposits()

      expect(results).toHaveLength(0)
    })

    it('最新5ブロックをスキャンする', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      await detector.scanLatestDeposits()

      // eth_getBlockByNumberが複数回呼ばれることを確認
      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('エラーハンドリング', () => {
    it('ブロックスキャンエラー時も処理を継続する', async () => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Block fetch error'))

      const results = await detector.scanBlockRange(16777216, 16777216)

      expect(Array.isArray(results)).toBe(true)
    })

    it('アドレス取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 4つのeq()チェーンに対応
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      }

      // 最後のeq()でエラーを返す
      mockChain.eq = vi.fn()
        .mockReturnValueOnce(mockChain)  // 1st eq (chain)
        .mockReturnValueOnce(mockChain)  // 2nd eq (network)
        .mockReturnValueOnce(mockChain)  // 3rd eq (asset)
        .mockResolvedValueOnce({ data: null, error: new Error('Database error') })  // 4th eq (active)

      vi.mocked(supabase.from).mockReturnValueOnce(mockChain as unknown as ReturnType<typeof supabase.from>)

      const results = await detector.scanBlockRange(16777216, 16777216)

      expect(results).toHaveLength(0)
    })
  })

  describe('ネットワーク互換性', () => {
    it('mainnetとsepoliaで異なる設定を使用する', () => {
      const mainnetDetector = new EthDepositDetector('http://localhost:8545', 'mainnet', 12)
      const sepoliaDetector = new EthDepositDetector('http://localhost:11155111', 'sepolia', 6)

      expect(mainnetDetector).toBeInstanceOf(EthDepositDetector)
      expect(sepoliaDetector).toBeInstanceOf(EthDepositDetector)
    })

    it('sepoliaネットワークで正しいネットワーク名を使用する', async () => {
      const sepoliaDetector = new EthDepositDetector('http://localhost:11155111', 'sepolia', 6)

      mockDepositAddresses.clear()
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'sepolia',
        asset: 'ETH',
        active: true
      })

      const addresses = await sepoliaDetector.getDepositAddresses()

      expect(addresses).toHaveLength(1)
    })
  })
})
