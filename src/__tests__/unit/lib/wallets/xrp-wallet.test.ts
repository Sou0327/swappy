/**
 * xrp-wallet の単体テスト
 * XRP Ledger Walletマネージャーの包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { XRPWalletManager, XRP_NETWORKS } from '@/lib/wallets/xrp-wallet'

// xrplライブラリのモック
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockDisconnect = vi.fn().mockResolvedValue(undefined)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRequest = vi.fn<any[], any>()
const mockAutofill = vi.fn()
const mockSubmit = vi.fn()
const mockSign = vi.fn()

vi.mock('xrpl', () => ({
  Client: class {
    connect = mockConnect
    disconnect = mockDisconnect
    request = mockRequest
    autofill = mockAutofill
    submit = mockSubmit
  },
  Wallet: {
    generate: vi.fn(() => ({
      address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      publicKey: '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020',
      privateKey: '00D78B9735C3F26501C7337B8A5727FD53A6EFDBC6AA55984F098488561F985E23',
      seed: 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2',
      sign: mockSign
    })),
    fromSeed: vi.fn((seed) => ({
      address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      publicKey: '0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020',
      privateKey: '00D78B9735C3F26501C7337B8A5727FD53A6EFDBC6AA55984F098488561F985E23',
      seed: seed,
      sign: mockSign
    }))
  },
  dropsToXrp: vi.fn((drops) => (parseInt(drops) / 1000000).toString()),
  xrpToDrops: vi.fn((xrp) => (parseFloat(xrp) * 1000000).toString()),
  isValidAddress: vi.fn((addr) => typeof addr === 'string' && addr.startsWith('r') && addr.length >= 25)
}))

// FinancialEncryptionのモック
vi.mock('@/lib/security/encryption', () => ({
  FinancialEncryption: {
    encrypt: vi.fn((data, password) =>
      Promise.resolve({
        encrypted: Buffer.from(data).toString('base64'),
        iv: 'mock-iv',
        tag: 'mock-tag'
      })
    ),
    decrypt: vi.fn((encryptedData, password) => {
      if (encryptedData.encrypted) {
        return Promise.resolve(Buffer.from(encryptedData.encrypted, 'base64').toString('utf8'))
      }
      return Promise.resolve('sEdTM1uX8pu2do5XvTnutH6HsouMaM2')
    })
  }
}))

// AuditLoggerのモック
vi.mock('@/lib/security/audit-logger', () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined)
  },
  AuditAction: {
    WALLET_CREATE: 'WALLET_CREATE'
  }
}))

describe('xrp-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('XRP_NETWORKS設定', () => {
    it('mainnet、testnet、devnetの設定が定義されている', () => {
      expect(XRP_NETWORKS.mainnet).toBeDefined()
      expect(XRP_NETWORKS.testnet).toBeDefined()
      expect(XRP_NETWORKS.devnet).toBeDefined()
    })

    it('mainnetの設定が正しい', () => {
      expect(XRP_NETWORKS.mainnet.name).toBe('XRP Ledger Mainnet')
      expect(XRP_NETWORKS.mainnet.server).toBe('wss://xrplcluster.com')
      expect(XRP_NETWORKS.mainnet.isTestnet).toBe(false)
      expect(XRP_NETWORKS.mainnet.nativeCurrency).toBe('XRP')
    })

    it('testnetの設定が正しい', () => {
      expect(XRP_NETWORKS.testnet.name).toBe('XRP Ledger Testnet')
      expect(XRP_NETWORKS.testnet.isTestnet).toBe(true)
      expect(XRP_NETWORKS.testnet.nativeCurrency).toBe('XRP')
    })

    it('devnetの設定が正しい', () => {
      expect(XRP_NETWORKS.devnet.name).toBe('XRP Ledger Devnet')
      expect(XRP_NETWORKS.devnet.isTestnet).toBe(true)
    })

    it('各ネットワークにexplorerUrlが設定されている', () => {
      expect(XRP_NETWORKS.mainnet.explorerUrl).toBeDefined()
      expect(XRP_NETWORKS.testnet.explorerUrl).toBeDefined()
      expect(XRP_NETWORKS.devnet.explorerUrl).toBeDefined()
    })
  })

  describe('XRPWalletManager - 基本設定', () => {
    it('mainnetでインスタンスを生成する', () => {
      const manager = new XRPWalletManager('mainnet')
      expect(manager).toBeDefined()
    })

    it('testnetでインスタンスを生成する', () => {
      const manager = new XRPWalletManager('testnet')
      expect(manager).toBeDefined()
    })

    it('不正なネットワーク名でエラーを投げる', () => {
      expect(() => {
        new XRPWalletManager('invalid-network')
      }).toThrow('サポートされていないネットワーク')
    })
  })

  describe('XRPWalletManager - 接続管理', () => {
    let manager: XRPWalletManager

    beforeEach(() => {
      manager = new XRPWalletManager('mainnet')
    })

    afterEach(async () => {
      await manager.disconnect()
    })

    it('connect()でXRPLクライアントに接続する', async () => {
      await manager.connect()
      expect(mockConnect).toHaveBeenCalled()
    })

    it('disconnect()でXRPLクライアントから切断する', async () => {
      await manager.connect()
      await manager.disconnect()
      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('既に接続済みの場合、connect()は再接続しない', async () => {
      await manager.connect()
      mockConnect.mockClear()
      await manager.connect()
      expect(mockConnect).not.toHaveBeenCalled()
    })

    it('接続エラーを適切にハンドリングする', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection failed'))

      await expect(manager.connect()).rejects.toThrow('XRPL接続に失敗')
    })
  })

  describe('XRPWalletManager - ウォレット生成・復元', () => {
    it('generateSecureWallet()でセキュアなウォレットを生成する', async () => {
      const wallet = await XRPWalletManager.generateSecureWallet('user-123', 'mainnet')

      expect(wallet).toBeDefined()
      expect(wallet.address).toBeDefined()
      expect(wallet.publicKey).toBeDefined()
      expect(wallet.privateKey).toBeDefined()
      expect(wallet.seed).toBeDefined()
    })

    it('生成されたウォレットの形式が正しい', async () => {
      const wallet = await XRPWalletManager.generateSecureWallet('user-456', 'mainnet')

      expect(wallet.address.startsWith('r')).toBe(true)
      expect(wallet.publicKey.length).toBeGreaterThan(0)
      expect(typeof wallet.privateKey).toBe('string')
      expect(typeof wallet.seed).toBe('string')
    })

    it('秘密情報が暗号化されている', async () => {
      const wallet = await XRPWalletManager.generateSecureWallet('user-789', 'mainnet')

      // JSON形式で暗号化されている
      expect(() => JSON.parse(wallet.privateKey)).not.toThrow()
      expect(() => JSON.parse(wallet.seed)).not.toThrow()
    })

    it('restoreWalletFromSeed()でウォレットを復元する', async () => {
      const encryptedSeed = JSON.stringify({
        encrypted: Buffer.from('sEdTM1uX8pu2do5XvTnutH6HsouMaM2').toString('base64'),
        iv: 'mock-iv',
        tag: 'mock-tag'
      })

      const restoredWallet = await XRPWalletManager.restoreWalletFromSeed(
        encryptedSeed,
        'user-123'
      )

      expect(restoredWallet).toBeDefined()
      expect(restoredWallet.address).toBe('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')
    })

    it('復元されたウォレットが元のウォレットと一致する', async () => {
      const original = await XRPWalletManager.generateSecureWallet('user-abc', 'mainnet')
      const restored = await XRPWalletManager.restoreWalletFromSeed(
        original.seed,
        'user-abc'
      )

      expect(restored.address).toBe(original.address)
    })

    it('不正なシードでエラーを投げる', async () => {
      const invalidSeed = 'invalid-encrypted-seed'

      await expect(
        XRPWalletManager.restoreWalletFromSeed(invalidSeed, 'user-123')
      ).rejects.toThrow('XRPウォレット復元に失敗')
    })
  })

  describe('XRPWalletManager - アカウント情報取得', () => {
    let manager: XRPWalletManager

    beforeEach(() => {
      manager = new XRPWalletManager('mainnet')

      // account_infoのレスポンスをモック
      mockRequest.mockImplementation((req: { command: string; account?: string }) => {
        if (req.command === 'account_info') {
          return Promise.resolve({
            result: {
              account_data: {
                Account: req.account,
                Balance: '100000000', // 100 XRP in drops
                Sequence: 1,
                OwnerCount: 0,
                Flags: 0
              }
            }
          })
        }
        if (req.command === 'account_lines') {
          return Promise.resolve({
            result: {
              lines: [
                {
                  currency: 'USD',
                  account: 'rIssuerAddress',
                  balance: '100.50',
                  limit: '1000'
                }
              ]
            }
          })
        }
      })
    })

    afterEach(async () => {
      await manager.disconnect()
    })

    it('getAccountInfo()でアカウント情報を取得する', async () => {
      const accountInfo = await manager.getAccountInfo('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      expect(accountInfo).toBeDefined()
      expect(accountInfo.address).toBe('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')
      expect(accountInfo.balance).toBe('100')
      expect(accountInfo.sequence).toBe(1)
    })

    it('getBalance()でXRP残高を取得する', async () => {
      const balance = await manager.getBalance('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      expect(typeof balance).toBe('string')
      expect(parseFloat(balance)).toBeGreaterThan(0)
    })

    it('getTokenBalances()でトークン残高を取得する', async () => {
      const tokens = await manager.getTokenBalances('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      expect(Array.isArray(tokens)).toBe(true)
      if (tokens.length > 0) {
        expect(tokens[0]).toHaveProperty('currency')
        expect(tokens[0]).toHaveProperty('issuer')
        expect(tokens[0]).toHaveProperty('balance')
      }
    })

    it('存在しないアドレスでエラーを投げる', async () => {
      mockRequest.mockRejectedValueOnce(new Error('actNotFound'))

      await expect(
        manager.getAccountInfo('rInvalidAddress')
      ).rejects.toThrow('アカウント情報取得に失敗')
    })

    it('未接続状態でも自動的に接続する', async () => {
      const balance = await manager.getBalance('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      expect(mockConnect).toHaveBeenCalled()
      expect(balance).toBeDefined()
    })
  })

  describe('XRPWalletManager - XRP送金', () => {
    let manager: XRPWalletManager
    interface MockWallet {
      address: string
      sign: ReturnType<typeof vi.fn>
    }
    let wallet: MockWallet

    beforeEach(() => {
      manager = new XRPWalletManager('mainnet')

      // Walletインスタンスのモック
      wallet = {
        address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
        sign: mockSign.mockReturnValue({
          tx_blob: 'SIGNED_TX_BLOB',
          hash: 'ABCD1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB'
        })
      }

      // account_infoのモック（残高チェック用）
      mockRequest.mockImplementation((req: { command: string; account?: string }) => {
        if (req.command === 'account_info') {
          return Promise.resolve({
            result: {
              account_data: {
                Account: req.account,
                Balance: '100000000', // 100 XRP
                Sequence: 1,
                OwnerCount: 0,
                Flags: 0
              }
            }
          })
        }
      })

      // autofillのモック
      mockAutofill.mockImplementation((payment) =>
        Promise.resolve({ ...payment, Fee: '12' })
      )

      // submitのモック
      mockSubmit.mockResolvedValue({
        result: {
          engine_result: 'tesSUCCESS',
          engine_result_message: 'The transaction was applied.',
          tx_json: { inLedger: 12345 }
        }
      })
    })

    afterEach(async () => {
      await manager.disconnect()
    })

    it('sendXRP()で基本的な送金を実行する', async () => {
      const result = await manager.sendXRP(
        wallet,
        {
          fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
          toAddress: 'rRecipientAddress123456789012345678',
          amount: '10'
        },
        'user-123'
      )

      expect(result).toBeDefined()
      expect(result.hash).toBeDefined()
      expect(result.result).toBe('tesSUCCESS')
      expect(mockSign).toHaveBeenCalled()
      expect(mockSubmit).toHaveBeenCalled()
    })

    it('destinationTagを含む送金', async () => {
      const result = await manager.sendXRP(
        wallet,
        {
          fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
          toAddress: 'rRecipientAddress123456789012345678',
          amount: '5',
          destinationTag: 12345
        },
        'user-456'
      )

      expect(result).toBeDefined()
      expect(mockAutofill).toHaveBeenCalled()
    })

    it('memosを含む送金', async () => {
      const result = await manager.sendXRP(
        wallet,
        {
          fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
          toAddress: 'rRecipientAddress123456789012345678',
          amount: '3',
          memos: ['Payment for invoice #123']
        },
        'user-789'
      )

      expect(result).toBeDefined()
    })

    it('不正なアドレスでエラーを投げる', async () => {
      await expect(
        manager.sendXRP(
          wallet,
          {
            fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
            toAddress: 'invalid-address',
            amount: '10'
          }
        )
      ).rejects.toThrow('無効な送金先アドレス')
    })

    it('残高不足でエラーを投げる', async () => {
      await expect(
        manager.sendXRP(
          wallet,
          {
            fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
            toAddress: 'rRecipientAddress123456789012345678',
            amount: '200' // 残高100 XRPより多い
          }
        )
      ).rejects.toThrow('残高が不足しています')
    })

    it('負の金額でエラーを投げる', async () => {
      await expect(
        manager.sendXRP(
          wallet,
          {
            fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
            toAddress: 'rRecipientAddress123456789012345678',
            amount: '-10'
          }
        )
      ).rejects.toThrow('送金額は正の値である必要があります')
    })

    it('手数料が正しく計算される', async () => {
      const result = await manager.sendXRP(
        wallet,
        {
          fromAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
          toAddress: 'rRecipientAddress123456789012345678',
          amount: '10'
        }
      )

      expect(result.fee).toBe('12') // drops
    })
  })

  describe('XRPWalletManager - トランザクション確認', () => {
    let manager: XRPWalletManager

    beforeEach(() => {
      manager = new XRPWalletManager('mainnet')
    })

    afterEach(async () => {
      await manager.disconnect()
    })

    it('getTransactionStatus()でトランザクション状態を確認する', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          validated: true,
          ledger_index: 12345,
          meta: { TransactionResult: 'tesSUCCESS' }
        }
      })

      const status = await manager.getTransactionStatus(
        'ABCD1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB'
      )

      expect(status).toBeDefined()
      expect(status.validated).toBe(true)
    })

    it('検証済みトランザクションを確認する', async () => {
      mockRequest.mockResolvedValueOnce({
        result: {
          validated: true,
          ledger_index: 12345,
          meta: { TransactionResult: 'tesSUCCESS' }
        }
      })

      const status = await manager.getTransactionStatus('valid-tx-hash')

      expect(status.validated).toBe(true)
      expect(status.ledgerIndex).toBe(12345)
    })

    it('存在しないトランザクションを適切に処理する', async () => {
      mockRequest.mockRejectedValueOnce({
        data: { error: 'txnNotFound' }
      })

      const status = await manager.getTransactionStatus('non-existent-tx-hash')

      expect(status.validated).toBe(false)
      expect(status.ledgerIndex).toBeUndefined()
    })
  })
})
