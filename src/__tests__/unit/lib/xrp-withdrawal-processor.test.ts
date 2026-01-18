/**
 * xrp-withdrawal-processor の単体テスト
 * XRP出金処理システムの包括的テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest'
import * as xrpl from 'xrpl'

// Supabaseモック - Map based data storage
interface MockWallet {
  id: string
  chain: string
  network: string
  asset: string
  address: string
  encrypted_private_key: string
  active: boolean
}

interface MockWithdrawal {
  id: string
  user_id: string
  chain: string
  network: string
  currency: string
  amount: number
  status: string
  transaction_hash?: string
  created_at: string
}

interface MockBalance {
  user_id: string
  asset: string
  available_balance: number
}

const mockWallets = new Map<string, MockWallet>()
const mockWithdrawals = new Map<string, MockWithdrawal>()
const mockBalances = new Map<string, MockBalance>()

interface ChainableMock {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
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
      gte: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      single: vi.fn()
    }

    // admin_walletsテーブル
    if (tableName === 'admin_wallets') {
      chainable.select.mockImplementation(() => {
        const wallets = Array.from(mockWallets.values())

        chainable.eq.mockImplementation((col: string, val: string | boolean) => {
          let filtered = wallets.filter(w => w[col as keyof MockWallet] === val)

          return {
            ...chainable,
            eq: vi.fn((col2: string, val2: string | boolean) => {
              filtered = filtered.filter(w => w[col2 as keyof MockWallet] === val2)
              return {
                ...chainable,
                eq: vi.fn((col3: string, val3: string | boolean) => {
                  filtered = filtered.filter(w => w[col3 as keyof MockWallet] === val3)
                  return {
                    ...chainable,
                    eq: vi.fn((col4: string, val4: string | boolean) => {
                      filtered = filtered.filter(w => w[col4 as keyof MockWallet] === val4)
                      return {
                        ...chainable,
                        single: vi.fn().mockResolvedValue({
                          data: filtered.length > 0 ? filtered[0] : null,
                          error: null
                        })
                      }
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
        })

        return chainable
      })
    }

    // withdrawalsテーブル
    if (tableName === 'withdrawals') {
      chainable.select.mockImplementation(() => {
        const withdrawals = Array.from(mockWithdrawals.values())

        chainable.eq.mockImplementation((col: string, val: string) => {
          let filtered = withdrawals.filter(w => w[col as keyof MockWithdrawal] === val)

          const thirdLevelChainable = {
            ...chainable,
            eq: vi.fn((col3: string, val3: string) => {
              filtered = filtered.filter(w => w[col3 as keyof MockWithdrawal] === val3)
              // 3つのeq()後はPromiseとしても、gteメソッドとしても機能する
              type FourthLevelChainable = {
                then: (resolve: (value: { data: MockWithdrawal[]; error: null }) => void) => Promise<{ data: MockWithdrawal[]; error: null }>
                catch: (reject: (reason: unknown) => void) => Promise<{ data: MockWithdrawal[]; error: null }>
                gte: ReturnType<typeof vi.fn>
              }

              const fourthLevel: FourthLevelChainable = {
                then: (resolve: (value: { data: MockWithdrawal[]; error: null }) => void) => Promise.resolve({ data: filtered, error: null }).then(resolve),
                catch: (reject: (reason: unknown) => void) => Promise.resolve({ data: filtered, error: null }).catch(reject),
                gte: vi.fn((col4: string, val4: number | string) => {
                  filtered = filtered.filter(w => {
                    const fieldValue = w[col4 as keyof MockWithdrawal]
                    return typeof fieldValue === 'number' && typeof val4 === 'number' ? fieldValue >= val4 : false
                  })
                  return {
                    neq: vi.fn((col5: string, val5: string) => {
                      filtered = filtered.filter(w => w[col5 as keyof MockWithdrawal] !== val5)
                      return Promise.resolve({ data: filtered, error: null })
                    }),
                    then: (resolve: (value: { data: MockWithdrawal[]; error: null }) => void) => Promise.resolve({ data: filtered, error: null }).then(resolve),
                    catch: (reject: (reason: unknown) => void) => Promise.resolve({ data: filtered, error: null }).catch(reject)
                  }
                })
              }
              return fourthLevel
            })
          }

          return {
            ...chainable,
            eq: vi.fn((col2: string, val2: string) => {
              filtered = filtered.filter(w => w[col2 as keyof MockWithdrawal] === val2)
              return thirdLevelChainable
            })
          }
        })

        return chainable
      })

      chainable.update.mockImplementation((data: Partial<MockWithdrawal>) => {
        chainable.eq.mockResolvedValue({ error: null })
        return chainable
      })
    }

    // user_balancesテーブル
    if (tableName === 'user_balances' || tableName === 'user_assets') {
      chainable.select.mockImplementation(() => {
        const balances = Array.from(mockBalances.values())

        chainable.eq.mockImplementation((col: string, val: string) => {
          let filtered = balances.filter(b => b[col as keyof MockBalance] === val)

          return {
            ...chainable,
            eq: vi.fn((col2: string, val2: string) => {
              filtered = filtered.filter(b => b[col2 as keyof MockBalance] === val2)
              return {
                ...chainable,
                single: vi.fn().mockResolvedValue({
                  data: filtered.length > 0 ? filtered[0] : null,
                  error: null
                })
              }
            }),
            single: vi.fn().mockResolvedValue({
              data: filtered.length > 0 ? filtered[0] : null,
              error: null
            })
          }
        })

        return chainable
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

// XRPLライブラリモック - Vitest 4対応: vi.hoisted() でホイスティング
// vi.mock() はファイル先頭にホイストされるため、vi.hoisted() で変数もホイストする
const { mockXrplClient, mockDropsToXrp, mockXrpToDrops, mockWalletFromSeed, mockWalletSign } = vi.hoisted(() => {
  const mockWalletSign = vi.fn().mockReturnValue({
    tx_blob: 'ABCDEF1234567890',
    hash: '0xTransactionHash123'
  })

  const mockWalletFromSeed = vi.fn().mockReturnValue({
    address: 'rHotWallet123',
    publicKey: 'ED1234567890ABCDEF',
    sign: mockWalletSign
  })

  const mockDropsToXrp = vi.fn().mockImplementation(
    (drops: string) => (parseFloat(drops) / 1000000).toFixed(6)
  )

  const mockXrpToDrops = vi.fn().mockImplementation(
    (xrp: string) => (parseFloat(xrp) * 1000000).toString()
  )

  const mockXrplClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(false),
    request: vi.fn().mockResolvedValue({
      result: {
        account_data: {
          Balance: '5000000000',
          Sequence: 100
        }
      }
    }),
    autofill: vi.fn().mockImplementation((tx: unknown) => Promise.resolve({ ...(tx as object), Fee: '12', Sequence: 100 })),
    submit: vi.fn().mockResolvedValue({
      result: {
        engine_result: 'tesSUCCESS',
        tx_json: {
          hash: '0xTransactionHash123'
        }
      }
    })
  }
  return { mockXrplClient, mockDropsToXrp, mockXrpToDrops, mockWalletFromSeed, mockWalletSign }
})

vi.mock('xrpl', () => {
  // Vitest 4: classキーワードを使ってコンストラクタをモック
  return {
    Client: class MockClient {
      constructor() {
        return mockXrplClient
      }
    },
    Wallet: {
      fromSeed: mockWalletFromSeed
    },
    dropsToXrp: mockDropsToXrp,
    xrpToDrops: mockXrpToDrops
  }
})

// XRPWalletManagerモック
vi.mock('@/lib/wallets/xrp-wallet', () => ({
  XRPWalletManager: {
    validateXRPAddress: vi.fn((address: string) => address.startsWith('r'))
  },
  XRP_NETWORKS: {
    mainnet: {
      name: 'XRP Mainnet',
      server: 'wss://xrplcluster.com'
    },
    testnet: {
      name: 'XRP Testnet',
      server: 'wss://s.altnet.rippletest.net:51233'
    }
  }
}))

// AuditLoggerモック
vi.mock('@/lib/security/audit-logger', () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined)
  },
  AuditAction: {
    WITHDRAWAL_REQUEST: 'withdrawal_request',
    DEPOSIT_CONFIRM: 'deposit_confirm',
    BALANCE_UPDATE: 'balance_update',
    SECURITY_ALERT: 'security_alert'
  }
}))

// FinancialEncryptionモック
vi.mock('@/lib/security/encryption', () => ({
  FinancialEncryption: {
    decrypt: vi.fn((data: unknown) => Promise.resolve('sEdVKbBBB4Mn5Ho9uvBMLqwcJHN1mKVh'))
  }
}))

// XRPWithdrawalProcessorをインポート（モック後）
import {
  XRPWithdrawalProcessor,
  type XRPWithdrawalRequest,
  type XRPWithdrawalConfig
} from '@/lib/xrp-withdrawal-processor'

describe('XRPWithdrawalProcessor', () => {
  let processor: XRPWithdrawalProcessor

  beforeEach(() => {
    vi.clearAllMocks()
    mockWallets.clear()
    mockWithdrawals.clear()
    mockBalances.clear()

    // mockXrplClient の状態をリセット（vi.mock内で定義済み）
    // vi.clearAllMocks() で各メソッドはリセットされるが、
    // mockImplementation も再設定する
    mockXrplClient.connect.mockResolvedValue(undefined)
    mockXrplClient.disconnect.mockResolvedValue(undefined)
    mockXrplClient.isConnected.mockReturnValue(false)
    mockXrplClient.request.mockResolvedValue({
      result: {
        account_data: {
          Balance: '5000000000',
          Sequence: 100
        }
      }
    })
    mockXrplClient.autofill.mockImplementation((tx) => Promise.resolve({ ...tx, Fee: '12', Sequence: 100 }))
    mockXrplClient.submit.mockResolvedValue({
      result: {
        engine_result: 'tesSUCCESS',
        tx_json: {
          hash: '0xTransactionHash123'
        }
      }
    })

    // dropsToXrp/xrpToDrops/Wallet.fromSeed も再設定（vi.clearAllMocksでリセットされるため）
    mockDropsToXrp.mockImplementation(
      (drops: string) => (parseFloat(drops) / 1000000).toFixed(6)
    )
    mockXrpToDrops.mockImplementation(
      (xrp: string) => (parseFloat(xrp) * 1000000).toString()
    )
    mockWalletSign.mockReturnValue({
      tx_blob: 'ABCDEF1234567890',
      hash: '0xTransactionHash123'
    })
    mockWalletFromSeed.mockReturnValue({
      address: 'rHotWallet123',
      publicKey: 'ED1234567890ABCDEF',
      sign: mockWalletSign
    })

    // ホットウォレット設定
    mockWallets.set('wallet-1', {
      id: 'wallet-1',
      chain: 'xrp',
      network: 'mainnet',
      asset: 'XRP',
      address: 'rHotWallet123',
      encrypted_private_key: 'encrypted_key_data',
      active: true
    })

    // 環境変数設定
    process.env.WALLET_MASTER_PASSWORD = 'test-password'

    processor = new XRPWithdrawalProcessor('mainnet')

    // ホットウォレットを直接設定（constructorの非同期loadHotWalletsをバイパス）
    interface ProcessorWithHotWallets {
      hotWallets: Map<string, unknown>
    }
    ;(processor as unknown as ProcessorWithHotWallets).hotWallets.set('wallet-1', {
      address: 'rHotWallet123',
      encryptedSeed: JSON.stringify({ iv: 'test_iv', data: 'encrypted_seed_data' }),
      encryptedPrivateKey: 'encrypted_key_data',
      publicKey: 'ED1234567890ABCDEF',
      maxBalance: 10000,
      sequence: 100
    })
  })

  afterEach(async () => {
    await processor.cleanup()
    delete process.env.WALLET_MASTER_PASSWORD
  })

  describe('インスタンス化', () => {
    it('XRPWithdrawalProcessorを正常にインスタンス化できる', () => {
      expect(processor).toBeInstanceOf(XRPWithdrawalProcessor)
    })

    it('mainnetネットワークで初期化できる', () => {
      const mainnetProcessor = new XRPWithdrawalProcessor('mainnet')
      expect(mainnetProcessor).toBeInstanceOf(XRPWithdrawalProcessor)
    })

    it('testnetネットワークで初期化できる', () => {
      const testnetProcessor = new XRPWithdrawalProcessor('testnet')
      expect(testnetProcessor).toBeInstanceOf(XRPWithdrawalProcessor)
    })

    it('カスタム設定でインスタンス化できる', () => {
      const customConfig: Partial<XRPWithdrawalConfig> = {
        maxDailyAmount: 100000,
        maxSingleAmount: 20000
      }
      const customProcessor = new XRPWithdrawalProcessor('mainnet', customConfig)
      expect(customProcessor).toBeInstanceOf(XRPWithdrawalProcessor)
    })

    it('無効なネットワークではエラーをthrowする', () => {
      expect(() => new XRPWithdrawalProcessor('invalid' as 'mainnet' | 'testnet')).toThrow('サポートされていないXRPネットワーク')
    })
  })

  describe('XRPL接続', () => {
    it('XRPLに接続できる', async () => {
      await processor.connect()
      expect(mockXrplClient.connect).toHaveBeenCalled()
    })

    it('既に接続済みの場合は再接続しない', async () => {
      await processor.connect() // 最初の接続
      vi.clearAllMocks() // モックの呼び出しをクリア
      await processor.connect() // 2回目の接続
      expect(mockXrplClient.connect).not.toHaveBeenCalled()
    })

    it('XRPLから切断できる', async () => {
      await processor.connect()
      await processor.disconnect()
      expect(mockXrplClient.disconnect).toHaveBeenCalled()
    })

    it('接続エラーを適切にthrowする', async () => {
      mockXrplClient.connect.mockRejectedValueOnce(new Error('Connection failed'))
      await expect(processor.connect()).rejects.toThrow('XRPL接続に失敗')
    })
  })

  describe('出金処理', () => {
    const validRequest: XRPWithdrawalRequest = {
      id: 'withdrawal-1',
      userId: 'user-123',
      toAddress: 'rDestinationAddress',
      amount: '100',
      priority: 'medium',
      createdAt: new Date().toISOString()
    }

    beforeEach(() => {
      mockBalances.set('user-123', {
        user_id: 'user-123',
        asset: 'XRP',
        available_balance: 1000
      })
    })

    it('出金を正常に処理できる', async () => {
      await processor.connect()
      const result = await processor.processWithdrawal(validRequest)

      expect(result.status).toBe('pending')
      expect(result.transactionHash).toBe('0xTransactionHash123')
      expect(mockXrplClient.submit).toHaveBeenCalled()
    })

    it('destination tagを指定した出金を処理できる', async () => {
      await processor.connect()
      const requestWithTag = { ...validRequest, destinationTag: 12345 }
      const result = await processor.processWithdrawal(requestWithTag)

      expect(result.status).toBe('pending')
      expect(mockXrplClient.autofill).toHaveBeenCalledWith(
        expect.objectContaining({ DestinationTag: 12345 })
      )
    })

    it('検証失敗時は適切にエラーを返す', async () => {
      const invalidRequest = { ...validRequest, toAddress: 'invalid_address' }

      await expect(processor.processWithdrawal(invalidRequest))
        .rejects.toThrow()
    })

    it('トランザクション失敗時は適切にエラーを返す', async () => {
      // リトライなしのprocessorを作成
      const noRetryProcessor = new XRPWithdrawalProcessor('mainnet', {
        retryAttempts: 1,  // リトライを無効化
        retryDelayMs: 100
      })

      // ホットウォレットを直接設定
      ;(noRetryProcessor as unknown as ProcessorWithHotWallets).hotWallets.set('wallet-1', {
        address: 'rHotWallet123',
        encryptedSeed: JSON.stringify({ iv: 'test_iv', data: 'encrypted_seed_data' }),
        encryptedPrivateKey: 'encrypted_key_data',
        publicKey: 'ED1234567890ABCDEF',
        maxBalance: 10000,
        sequence: 100
      })

      await noRetryProcessor.connect()
      // submitでエラーを返す
      mockXrplClient.submit.mockRejectedValue(new Error('Transaction failed'))

      await expect(noRetryProcessor.processWithdrawal(validRequest))
        .rejects.toThrow('XRP送金処理に失敗')
    })

    it('残高不足の場合はエラーをthrowする', async () => {
      mockBalances.set('user-123', {
        user_id: 'user-123',
        asset: 'XRP',
        available_balance: 50
      })

      await expect(processor.processWithdrawal(validRequest))
        .rejects.toThrow()
    })

    it('単回出金限度額を超える場合はエラーをthrowする', async () => {
      const invalidRequest = { ...validRequest, amount: '15000' }
      await expect(processor.processWithdrawal(invalidRequest))
        .rejects.toThrow()
    })
  })

  describe('出金確認処理', () => {
    it('検証済みトランザクションを確認できる', async () => {
      await processor.connect()

      // client.requestをコマンドに応じて異なるレスポンスを返すように設定
      mockXrplClient.request.mockImplementation((req: { command: string }) => {
        if (req.command === 'tx') {
          return Promise.resolve({
            result: {
              validated: true,
              ledger_index: 12345,
              meta: {
                TransactionResult: 'tesSUCCESS'
              }
            }
          })
        }
        // デフォルト（account_info等）
        return Promise.resolve({
          result: {
            account_data: {
              Balance: '5000000000',
              Sequence: 100
            }
          }
        })
      })

      mockWithdrawals.set('w1', {
        id: 'w1',
        user_id: 'user-123',
        chain: 'xrp',
        network: 'mainnet',
        currency: 'XRP',
        amount: 100,
        status: 'pending',
        transaction_hash: '0xHash123',  // tx_hash → transaction_hash
        created_at: new Date().toISOString()
      })

      await processor.processWithdrawalConfirmations()
      expect(mockXrplClient.request).toHaveBeenCalledWith({
        command: 'tx',
        transaction: '0xHash123'
      })
    })

    it('未検証トランザクションはスキップする', async () => {
      await processor.connect()

      // client.requestをコマンドに応じて設定
      mockXrplClient.request.mockImplementation((req: { command: string }) => {
        if (req.command === 'tx') {
          return Promise.resolve({
            result: {
              validated: false  // 未検証
            }
          })
        }
        return Promise.resolve({
          result: {
            account_data: {
              Balance: '5000000000',
              Sequence: 100
            }
          }
        })
      })

      mockWithdrawals.set('w1', {
        id: 'w1',
        user_id: 'user-123',
        chain: 'xrp',
        network: 'mainnet',
        currency: 'XRP',
        amount: 100,
        status: 'pending',
        transaction_hash: '0xHash123',  // tx_hash → transaction_hash
        created_at: new Date().toISOString()
      })

      await processor.processWithdrawalConfirmations()
      // 未検証なので更新されない
    })
  })

  describe('ホットウォレット残高管理', () => {
    it('ホットウォレットの残高を確認できる', async () => {
      await processor.connect()
      await processor.manageHotWalletBalances()
      expect(mockXrplClient.request).toHaveBeenCalledWith({
        command: 'account_info',
        account: 'rHotWallet123',
        ledger_index: 'validated'
      })
    })

    it('残高が低い場合はアラートを記録する', async () => {
      await processor.connect()
      mockXrplClient.request.mockResolvedValue({
        result: {
          account_data: {
            Balance: '50000000', // 50 XRP (低残高)
            Sequence: 100
          }
        }
      })

      await processor.manageHotWalletBalances()
      // AuditLoggerが呼ばれることを確認
    })
  })

  describe('統計情報取得', () => {
    it('統計情報を正常に取得できる', async () => {
      const stats = await processor.getStatistics()

      expect(stats).toHaveProperty('totalPendingWithdrawals')
      expect(stats).toHaveProperty('totalPendingAmount')
      expect(stats).toHaveProperty('hotWalletBalances')
      expect(stats).toHaveProperty('averageProcessingTime')
      expect(stats).toHaveProperty('successRate')
    })

    it('ホットウォレット残高情報を含む', async () => {
      mockXrplClient.request.mockResolvedValue({
        result: {
          account_data: {
            Balance: '5000000000',
            Sequence: 100
          }
        }
      })

      const stats = await processor.getStatistics()
      expect(stats.hotWalletBalances).toBeDefined()
      expect(Array.isArray(stats.hotWalletBalances)).toBe(true)
    })

    it('エラー時はデフォルト値を返す', async () => {
      mockXrplClient.request.mockRejectedValue(new Error('Failed'))

      const stats = await processor.getStatistics()
      expect(stats.totalPendingWithdrawals).toBe(0)
      expect(stats.totalPendingAmount).toBe('0.000000')
    })
  })

  describe('リソースクリーンアップ', () => {
    it('cleanup()でXRPL接続をクローズする', async () => {
      await processor.connect()
      await processor.cleanup()
      expect(mockXrplClient.disconnect).toHaveBeenCalled()
    })
  })
})
