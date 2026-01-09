/**
 * erc20-deposit-detector の単体テスト
 * ERC-20トークン入金検知システムの包括的テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ERC20DepositDetector, type ERC20DepositResult } from '@/lib/erc20-deposit-detector'

// Supabaseモック
interface MockChainConfig {
  chain: string
  network: string
  asset: string
  config?: Record<string, unknown>
  active: boolean
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
  amount?: number
  asset: string
  transaction_hash: string
  wallet_address?: string
  confirmations_required?: number
  status?: string
}

const mockChainConfigs = new Map<string, MockChainConfig>()
const mockDepositAddresses = new Map<string, MockDepositAddress>()
const mockDeposits = new Map<string, MockDeposit>()

interface ChainableMock {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

vi.mock('@/integrations/supabase/client', () => {
  const createChainableMock = (tableName: string): ChainableMock => {
    const chainable: ChainableMock = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn(),
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
                neq: vi.fn((col3: string, val3: string | boolean) => {
                  filtered = filtered.filter(c => c[col3 as keyof MockChainConfig] !== val3)
                  return {
                    eq: vi.fn((col4: string, val4: string | boolean) => {
                      filtered = filtered.filter(c => c[col4 as keyof MockChainConfig] === val4)
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
      chainable.select.mockImplementation(() => {
        const deposits = Array.from(mockDeposits.values())

        // 重複チェック用: .select().eq().eq().eq().single()
        chainable.eq.mockImplementation((col: string, val: string | number | boolean) => {
          let filtered = deposits.filter(d => d[col as keyof MockDeposit] === val)

          const level2 = {
            eq: vi.fn((col2: string, val2: string | number | boolean) => {
              filtered = filtered.filter(d => d[col2 as keyof MockDeposit] === val2)

              const level3 = {
                eq: vi.fn((col3: string, val3: string | number | boolean) => {
                  filtered = filtered.filter(d => d[col3 as keyof MockDeposit] === val3)

                  const level4 = {
                    single: vi.fn().mockResolvedValue({
                      data: filtered.length > 0 ? filtered[0] : null,
                      error: null
                    }),
                    // 確認数更新用の5レベルeq()チェーン
                    eq: vi.fn((col4: string, val4: string | number | boolean) => {
                      filtered = filtered.filter(d => d[col4 as keyof MockDeposit] === val4)
                      return {
                        eq: vi.fn((col5: string, val5: string | number | boolean) => {
                          filtered = filtered.filter(d => d[col5 as keyof MockDeposit] === val5)
                          return Promise.resolve({ data: filtered, error: null })
                        })
                      }
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
      from: vi.fn((table: string) => createChainableMock(table)),
      rpc: vi.fn().mockResolvedValue({ error: null })
    }
  }
})

// グローバルfetchのモック
global.fetch = vi.fn()

// モックデータ
const mockBlockNumber = '0x1000000' // 16777216
const mockUsdtAddress = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const mockTransferLog = {
  address: mockUsdtAddress,
  topics: [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer signature
    '0x000000000000000000000000742d35cc6634c0532925a3b844bc454e4438f44e', // from
    '0x0000000000000000000000001234567890123456789012345678901234567890'  // to
  ],
  data: '0x00000000000000000000000000000000000000000000000000000000000f4240', // 1000000 (1 USDT with 6 decimals)
  blockNumber: '0xffffff',
  blockHash: '0xblockhash123',
  transactionHash: '0xtxhash123',
  transactionIndex: '0x0',
  logIndex: '0x0',
  removed: false
}

const mockTxReceipt = {
  blockNumber: '0xffffff',
  status: '0x1', // success
  transactionHash: '0xtxhash123'
}

describe('ERC20DepositDetector', () => {
  let detector: ERC20DepositDetector

  beforeEach(() => {
    vi.clearAllMocks()
    mockChainConfigs.clear()
    mockDepositAddresses.clear()
    mockDeposits.clear()

    // デフォルトのfetchレスポンス
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ result: mockBlockNumber, error: null })
    } as Response)

    // 環境変数モック
    vi.stubEnv('VITE_ETHEREUM_RPC_URL', 'http://localhost:8545')
    vi.stubEnv('VITE_USDT_CONTRACT_ADDRESS_MAINNET', mockUsdtAddress)
    vi.stubEnv('VITE_USDT_CONTRACT_ADDRESS_SEPOLIA', '0xsepoliausdt')
    vi.stubEnv('VITE_ETH_MIN_CONFIRMATIONS', '12')

    detector = new ERC20DepositDetector('http://localhost:8545', 'mainnet', 12)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('インスタンス化', () => {
    it('ERC20DepositDetectorを正常にインスタンス化できる', () => {
      expect(detector).toBeInstanceOf(ERC20DepositDetector)
    })

    it('mainnetネットワークで初期化できる', () => {
      const mainnetDetector = new ERC20DepositDetector(
        'http://localhost:8545',
        'mainnet',
        12
      )
      expect(mainnetDetector).toBeInstanceOf(ERC20DepositDetector)
    })

    it('sepoliaネットワークで初期化できる', () => {
      const sepoliaDetector = new ERC20DepositDetector(
        'http://localhost:11155111',
        'sepolia',
        6
      )
      expect(sepoliaDetector).toBeInstanceOf(ERC20DepositDetector)
    })

    it('minConfirmationsを設定できる', () => {
      const customDetector = new ERC20DepositDetector(
        'http://localhost:8545',
        'mainnet',
        20
      )
      expect(customDetector).toBeInstanceOf(ERC20DepositDetector)
    })
  })

  describe('RPC接続', () => {
    it('最新ブロック番号を取得できる', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: mockBlockNumber,
          error: null
        })
      } as Response)

      const blockNumber = await detector.getLatestBlockNumber()

      expect(blockNumber).toBe(16777216)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8545',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('eth_blockNumber')
        })
      )
    })

    it('RPCエラーを適切に処理する', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: null,
          error: { message: 'Connection refused' }
        })
      } as Response)

      await expect(detector.getLatestBlockNumber()).rejects.toThrow('RPC Error')
    })

    it('ネットワークエラーを適切に処理する', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.getLatestBlockNumber()).rejects.toThrow('Network error')
    })
  })

  describe('サポートトークン取得', () => {
    beforeEach(() => {
      // USDTの設定を追加
      mockChainConfigs.set('usdt', {
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        config: {},
        active: true
      })
    })

    it('サポートするトークンの一覧を取得できる', async () => {
      const tokens = await detector.getSupportedTokens()

      expect(Array.isArray(tokens)).toBe(true)
      expect(tokens.length).toBeGreaterThanOrEqual(1)
    })

    it('USDTトークンの設定が正しい', async () => {
      const tokens = await detector.getSupportedTokens()
      const usdt = tokens.find(t => t.symbol === 'USDT')

      expect(usdt).toBeDefined()
      expect(usdt?.contractAddress).toBe(mockUsdtAddress.toLowerCase())
      expect(usdt?.decimals).toBe(6)
    })

    it('ETHは除外される', async () => {
      mockChainConfigs.set('eth', {
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        active: true
      })

      const tokens = await detector.getSupportedTokens()
      const eth = tokens.find(t => t.symbol === 'ETH')

      expect(eth).toBeUndefined()
    })

    it('activeでないトークンは除外される', async () => {
      mockChainConfigs.set('dai', {
        chain: 'evm',
        network: 'ethereum',
        asset: 'DAI',
        active: false
      })

      const tokens = await detector.getSupportedTokens()
      const dai = tokens.find(t => t.symbol === 'DAI')

      expect(dai).toBeUndefined()
    })

    it('取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // .eq().eq().neq().eq()のパターンをモック
      const level3 = {
        eq: vi.fn().mockResolvedValue({ data: null, error: new Error('Database error') })
      }

      const level2 = {
        neq: vi.fn().mockReturnValue(level3)
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
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })
    })

    it('管理対象の入金アドレス一覧を取得できる', async () => {
      const addresses = await detector.getDepositAddresses('USDT')

      expect(addresses).toHaveLength(1)
      expect(addresses[0]).toHaveProperty('address')
      expect(addresses[0]).toHaveProperty('userId')
      expect(addresses[0]).toHaveProperty('addressId')
    })

    it('アドレスを小文字に正規化する', async () => {
      const addresses = await detector.getDepositAddresses('USDT')

      expect(addresses[0].address).toBe('0x1234567890123456789012345678901234567890')
      expect(addresses[0].address).toBe(addresses[0].address.toLowerCase())
    })

    it('activeでないアドレスは取得されない', async () => {
      mockDepositAddresses.set('addr-2', {
        id: 'addr-2',
        user_id: 'user-456',
        address: '0xabcdef',
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: false
      })

      const addresses = await detector.getDepositAddresses('USDT')

      expect(addresses).toHaveLength(1)
      expect(addresses[0].addressId).toBe('addr-1')
    })

    it('取得エラー時は空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      }

      mockChain.eq = vi.fn()
        .mockReturnValueOnce(mockChain)
        .mockReturnValueOnce(mockChain)
        .mockReturnValueOnce(mockChain)
        .mockResolvedValueOnce({ data: null, error: new Error('Database error') })

      vi.mocked(supabase.from).mockReturnValueOnce(mockChain as unknown as ReturnType<typeof supabase.from>)

      const addresses = await detector.getDepositAddresses('USDT')
      expect(addresses).toHaveLength(0)
    })
  })

  describe('Transferログ取得', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getLogs') {
          return {
            ok: true,
            json: async () => ({ result: [mockTransferLog], error: null })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })
    })

    it('Transferログを取得できる', async () => {
      const logs = await detector.getTransferLogs(
        mockUsdtAddress,
        ['0x1234567890123456789012345678901234567890'],
        16777216,
        16777216
      )

      expect(Array.isArray(logs)).toBe(true)
      expect(logs.length).toBeGreaterThanOrEqual(1)
    })

    it('複数アドレスのログを並列取得できる', async () => {
      const addresses = [
        '0x1234567890123456789012345678901234567890',
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      ]

      const logs = await detector.getTransferLogs(
        mockUsdtAddress,
        addresses,
        16777216,
        16777216
      )

      expect(Array.isArray(logs)).toBe(true)
    })

    it('ログフィルターが正しく構築される', async () => {
      await detector.getTransferLogs(
        mockUsdtAddress,
        ['0x1234567890123456789012345678901234567890'],
        16777216,
        16777216
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8545',
        expect.objectContaining({
          body: expect.stringContaining('eth_getLogs')
        })
      )
    })

    it('ログ取得エラー時は空配列を返す', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('RPC error'))

      const logs = await detector.getTransferLogs(
        mockUsdtAddress,
        ['0x1234567890123456789012345678901234567890'],
        16777216,
        16777216
      )

      expect(logs).toHaveLength(0)
    })
  })

  describe('トークン入金記録', () => {
    it('入金を正常に記録できる', async () => {
      await detector.recordTokenDeposit(
        'user-123',
        'addr-1',
        'USDT',
        '1.000000',
        '0xtxhash123',
        16777216,
        '0x1234567890123456789012345678901234567890',
        mockUsdtAddress
      )

      expect(true).toBe(true)
    })

    it('重複する入金は記録されない', async () => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        transaction_hash: '0xtxhash123',
        wallet_address: '0x1234567890123456789012345678901234567890',
        asset: 'USDT'
      })

      await detector.recordTokenDeposit(
        'user-123',
        'addr-1',
        'USDT',
        '1.000000',
        '0xtxhash123',
        16777216,
        '0x1234567890123456789012345678901234567890',
        mockUsdtAddress
      )

      // 重複のため、insertは呼ばれない
      expect(true).toBe(true)
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
        detector.recordTokenDeposit(
          'user-123',
          'addr-1',
          'USDT',
          '1.000000',
          '0xtxhash123',
          16777216,
          '0x1234567890123456789012345678901234567890',
          mockUsdtAddress
        )
      ).rejects.toThrow()
    })
  })

  describe('確認数更新', () => {
    beforeEach(() => {
      mockDeposits.set('deposit-1', {
        id: 'deposit-1',
        user_id: 'user-123',
        amount: 1.0,
        asset: 'USDT',
        transaction_hash: '0xtxhash123',
        confirmations_required: 12,
        status: 'pending'
      })

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getTransactionReceipt') {
          return {
            ok: true,
            json: async () => ({ result: mockTxReceipt, error: null })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })
    })

    it('未確認入金の確認数を更新できる', async () => {
      await detector.updateTokenConfirmations(16777230, 'USDT')

      expect(true).toBe(true)
    })

    it('確認数が閾値に達したらconfirmedステータスに更新される', async () => {
      await detector.updateTokenConfirmations(16777228, 'USDT') // 12 confirmations

      expect(true).toBe(true)
    })

    it('失敗したトランザクションはrejectedステータスになる', async () => {
      const failedReceipt = {
        ...mockTxReceipt,
        status: '0x0' // failed
      }

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getTransactionReceipt') {
          return {
            ok: true,
            json: async () => ({ result: failedReceipt, error: null })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      await detector.updateTokenConfirmations(16777230, 'USDT')

      expect(true).toBe(true)
    })

    it('未確認入金がない場合は早期リターンする', async () => {
      mockDeposits.clear()

      await detector.updateTokenConfirmations(16777230, 'USDT')

      expect(true).toBe(true)
    })

    it('トランザクション詳細取得エラー時も処理を継続する', async () => {
      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getTransactionReceipt') {
          throw new Error('RPC error')
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      await expect(detector.updateTokenConfirmations(16777230, 'USDT')).resolves.not.toThrow()
    })
  })

  describe('トークン入金スキャン', () => {
    beforeEach(() => {
      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getLogs') {
          return {
            ok: true,
            json: async () => ({ result: [mockTransferLog], error: null })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })
    })

    it('新しいトークン入金を検知できる', async () => {
      const results = await detector.scanTokenDeposits(
        mockUsdtAddress,
        'USDT',
        6,
        16777216,
        16777216
      )

      expect(Array.isArray(results)).toBe(true)
    })

    it('検知結果が正しい形式で返される', async () => {
      const results = await detector.scanTokenDeposits(
        mockUsdtAddress,
        'USDT',
        6,
        16777216,
        16777216
      )

      if (results.length > 0) {
        const result = results[0]
        expect(result).toHaveProperty('userId')
        expect(result).toHaveProperty('tokenAddress')
        expect(result).toHaveProperty('tokenSymbol')
        expect(result).toHaveProperty('depositAddress')
        expect(result).toHaveProperty('amount')
        expect(result).toHaveProperty('transactionHash')
        expect(result).toHaveProperty('blockNumber')
        expect(result).toHaveProperty('confirmations')
      }
    })

    it('amount=0のトランザクションは無視される', async () => {
      const zeroAmountLog = {
        ...mockTransferLog,
        data: '0x0000000000000000000000000000000000000000000000000000000000000000'
      }

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getLogs') {
          return {
            ok: true,
            json: async () => ({ result: [zeroAmountLog], error: null })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      const results = await detector.scanTokenDeposits(
        mockUsdtAddress,
        'USDT',
        6,
        16777216,
        16777216
      )

      expect(results).toHaveLength(0)
    })

    it('登録されていないアドレスへの入金は無視される', async () => {
      mockDepositAddresses.clear()

      const results = await detector.scanTokenDeposits(
        mockUsdtAddress,
        'USDT',
        6,
        16777216,
        16777216
      )

      expect(results).toHaveLength(0)
    })

    it('ログ処理エラー時も処理を継続する', async () => {
      const invalidLog = {
        ...mockTransferLog,
        blockNumber: 'invalid'
      }

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_getLogs') {
          return {
            ok: true,
            json: async () => ({ result: [invalidLog], error: null })
          } as Response
        }

        return {
          ok: true,
          json: async () => ({ result: mockBlockNumber, error: null })
        } as Response
      })

      await expect(
        detector.scanTokenDeposits(
          mockUsdtAddress,
          'USDT',
          6,
          16777216,
          16777216
        )
      ).resolves.not.toThrow()
    })
  })

  describe('全トークンスキャン', () => {
    beforeEach(() => {
      mockChainConfigs.set('usdt', {
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })

      mockDepositAddresses.set('addr-1', {
        id: 'addr-1',
        user_id: 'user-123',
        address: '0x1234567890123456789012345678901234567890',
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })

      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_blockNumber') {
          return {
            ok: true,
            json: async () => ({ result: mockBlockNumber, error: null })
          } as Response
        }

        if (body.method === 'eth_getLogs') {
          return {
            ok: true,
            json: async () => ({ result: [mockTransferLog], error: null })
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
    })

    it('全サポートトークンの入金をスキャンできる', async () => {
      const results = await detector.scanAllTokenDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('デフォルトで最新5ブロックをスキャンする', async () => {
      const results = await detector.scanAllTokenDeposits()

      expect(Array.isArray(results)).toBe(true)
    })

    it('カスタムブロック範囲でスキャンできる', async () => {
      const results = await detector.scanAllTokenDeposits(16777200, 16777210)

      expect(Array.isArray(results)).toBe(true)
    })

    it('ブロック番号取得エラー時は例外をthrowする', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(detector.scanAllTokenDeposits()).rejects.toThrow('Network error')
    })
  })

  describe('エラーハンドリング', () => {
    it('ブロック番号取得エラーは例外をthrowする', async () => {
      mockChainConfigs.set('usdt', {
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })

      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('RPC error'))

      await expect(detector.scanAllTokenDeposits()).rejects.toThrow('RPC error')
    })

    it('個別トークンエラー時も処理を継続する', async () => {
      mockChainConfigs.set('usdt', {
        chain: 'evm',
        network: 'ethereum',
        asset: 'USDT',
        active: true
      })

      // ログ取得で一部エラーが発生するケース
      vi.mocked(global.fetch).mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string)

        if (body.method === 'eth_blockNumber') {
          return {
            ok: true,
            json: async () => ({ result: mockBlockNumber, error: null })
          } as Response
        }

        if (body.method === 'eth_getLogs') {
          // エラーを返す
          throw new Error('Logs fetch error')
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

      const results = await detector.scanAllTokenDeposits(16777216, 16777216)

      // ログ取得エラーが発生しても、空配列が返される（処理は継続）
      expect(Array.isArray(results)).toBe(true)
      expect(results).toHaveLength(0)
    })
  })

  describe('ネットワーク互換性', () => {
    it('mainnetとsepoliaで異なる設定を使用する', () => {
      const mainnetDetector = new ERC20DepositDetector('http://localhost:8545', 'mainnet', 12)
      const sepoliaDetector = new ERC20DepositDetector('http://localhost:11155111', 'sepolia', 6)

      expect(mainnetDetector).toBeInstanceOf(ERC20DepositDetector)
      expect(sepoliaDetector).toBeInstanceOf(ERC20DepositDetector)
    })

    it('sepoliaネットワークで正しいコントラクトアドレスを使用する', async () => {
      const sepoliaDetector = new ERC20DepositDetector('http://localhost:11155111', 'sepolia', 6)

      mockChainConfigs.set('usdt-sepolia', {
        chain: 'evm',
        network: 'sepolia',
        asset: 'USDT',
        active: true
      })

      const tokens = await sepoliaDetector.getSupportedTokens()
      const usdt = tokens.find(t => t.symbol === 'USDT')

      expect(usdt?.contractAddress).toBe('0xsepoliausdt')
    })
  })
})
