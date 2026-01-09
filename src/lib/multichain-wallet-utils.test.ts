import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateMultichainAddress,
  validateMultichainAddress,
  getChainConfig,
  getSupportedAssets,
  getMinimumDepositAmount,
  getExplorerUrl,
  type SupportedChain,
  type SupportedNetwork,
  type SupportedAsset
} from './multichain-wallet-utils'

// crypto-js のモック
vi.mock('crypto-js', () => ({
  SHA256: vi.fn(() => ({
    toString: vi.fn(() => 'mocked-hash-value')
  })),
  enc: {
    Hex: 'Hex'
  }
}))

// @tatumio/tatum のモック
vi.mock('@tatumio/tatum', () => ({
  Bitcoin: {
    generateAddress: vi.fn(() => ({
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      privateKey: 'L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ'
    }))
  },
  Ethereum: {
    generateAddress: vi.fn(() => ({
      address: '0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2',
      privateKey: '0x4646464646464646464646464646464646464646464646464646464646464646'
    }))
  },
  Tron: {
    generateAddress: vi.fn(() => ({
      address: 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH',
      privateKey: '01234567890123456789012345678901234567890123456789012345678901234'
    }))
  }
}))

// xrpl のモック
vi.mock('xrpl', () => ({
  Wallet: {
    generate: vi.fn(() => ({
      address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
      seed: 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2',
      publicKey: 'ED01FA53FA5A7E77798F882ECE20B1ABC00BB358A9E55A202D0D0676BD0CE37A63',
      privateKey: 'EDB4C4E046826BD26190D09715FC31F4E6A728204EADD112905B08B14B7F15C4F3'
    }))
  }
}))

describe('Multichain Wallet Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('チェーン設定管理', () => {
    it('Ethereum チェーン設定を正しく取得する', () => {
      const config = getChainConfig('eth', 'mainnet')

      expect(config).toMatchObject({
        name: 'Ethereum',
        symbol: 'ETH',
        blockTime: expect.any(Number),
        confirmations: expect.any(Number),
      })
    })

    it('Bitcoin チェーン設定を正しく取得する', () => {
      const config = getChainConfig('btc', 'mainnet')

      expect(config).toMatchObject({
        name: 'Bitcoin',
        symbol: 'BTC',
        blockTime: expect.any(Number),
        confirmations: expect.any(Number),
      })
    })

    it('Tron チェーン設定を正しく取得する', () => {
      const config = getChainConfig('trc', 'mainnet')

      expect(config).toMatchObject({
        name: 'TRON',
        symbol: 'TRX',
        blockTime: expect.any(Number),
        confirmations: expect.any(Number),
      })
    })

    it('XRP チェーン設定を正しく取得する', () => {
      const config = getChainConfig('xrp', 'mainnet')

      expect(config).toMatchObject({
        name: 'XRP Ledger',
        symbol: 'XRP',
        decimals: 6,
        minConfirmations: 1,
        addressType: 'fixed',
        requiresDestinationTag: true,
      })
    })

    it('Cardano チェーン設定を正しく取得する', () => {
      const config = getChainConfig('ada', 'mainnet')

      expect(config).toMatchObject({
        name: 'Cardano',
        symbol: 'ADA',
        blockTime: expect.any(Number),
        confirmations: expect.any(Number),
      })
    })

    it('テストネット設定を正しく取得する', () => {
      const mainnetConfig = getChainConfig('eth', 'mainnet')
      const testnetConfig = getChainConfig('eth', 'testnet')

      expect(mainnetConfig.name).toBe('Ethereum')
      expect(testnetConfig.name).toBe('Ethereum Testnet')
      expect(testnetConfig.confirmations).toBeLessThanOrEqual(mainnetConfig.confirmations)
    })

    it('未対応のチェーンでエラーを発生させる', () => {
      expect(() => {
        getChainConfig('unsupported' as SupportedChain, 'mainnet')
      }).toThrow('Unsupported chain: unsupported')
    })
  })

  describe('対応資産管理', () => {
    it('Ethereum チェーンの対応資産を取得する', () => {
      const assets = getSupportedAssets('eth', 'mainnet')

      expect(assets).toContain('ETH')
      expect(assets).toContain('USDT')
      expect(Array.isArray(assets)).toBe(true)
    })

    it('Bitcoin チェーンの対応資産を取得する', () => {
      const assets = getSupportedAssets('btc', 'mainnet')

      expect(assets).toContain('BTC')
      expect(assets).toEqual(['BTC']) // Bitcoin チェーンは BTC のみ
    })

    it('TRON チェーンの対応資産を取得する', () => {
      const assets = getSupportedAssets('trc', 'mainnet')

      expect(assets).toContain('TRX')
      expect(assets).toContain('USDT')
    })

    it('XRP チェーンの対応資産を取得する', () => {
      const assets = getSupportedAssets('xrp', 'mainnet')

      expect(assets).toContain('XRP')
      expect(assets).toEqual(['XRP']) // XRP チェーンは XRP のみ
    })

    it('Cardano チェーンの対応資産を取得する', () => {
      const assets = getSupportedAssets('ada', 'mainnet')

      expect(assets).toContain('ADA')
      expect(assets).toEqual(['ADA']) // Cardano チェーンは ADA のみ
    })
  })

  describe('最小入金額管理', () => {
    it('各資産の最小入金額を正しく取得する', () => {
      expect(getMinimumDepositAmount('ETH', 'eth')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('BTC', 'btc')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('USDT', 'eth')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('USDT', 'trc')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('TRX', 'trc')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('XRP', 'xrp')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('ADA', 'ada')).toBeGreaterThan(0)
    })

    it('ETH の最小入金額が BTC より小さい', () => {
      const ethMin = getMinimumDepositAmount('ETH', 'eth')
      const btcMin = getMinimumDepositAmount('BTC', 'btc')

      expect(ethMin).toBeLessThan(btcMin)
    })

    it('USDT の最小入金額がチェーン間で一貫している', () => {
      const usdtEthMin = getMinimumDepositAmount('USDT', 'eth')
      const usdtTrcMin = getMinimumDepositAmount('USDT', 'trc')

      expect(usdtEthMin).toBe(usdtTrcMin)
    })

    it('未対応の資産・チェーン組み合わせでエラーを発生させる', () => {
      expect(() => {
        getMinimumDepositAmount('BTC', 'eth') // BTC は ETH チェーンでは未対応
      }).toThrow('Asset BTC is not supported on chain eth')
    })
  })

  describe('アドレス生成', () => {
    it('Bitcoin アドレスを生成する', async () => {
      const result = await generateMultichainAddress('btc', 'mainnet', 'test-user-id', 'BTC')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^[13bc1]/), // Bitcoin アドレスの形式
        derivationPath: expect.stringMatching(/^m\/44'\/0'\/\d+'\/0\/\d+$/),
      })
    })

    it('Ethereum アドレスを生成する', async () => {
      const result = await generateMultichainAddress('eth', 'mainnet', 'test-user-id', 'ETH')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/), // Ethereum アドレスの形式
        derivationPath: expect.stringMatching(/^m\/44'\/60'\/\d+'\/0\/\d+$/),
      })
    })

    it('TRON アドレスを生成する', async () => {
      const result = await generateMultichainAddress('trc', 'mainnet', 'test-user-id', 'TRX')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^T[A-Za-z0-9]{33}$/), // TRON アドレスの形式
        derivationPath: expect.stringMatching(/^m\/44'\/195'\/\d+'\/0\/\d+$/),
      })
    })

    it('XRP アドレスを生成する場合エラーをスローする（非同期API使用を促す）', () => {
      // XRP は非同期でDB参照が必要なため、generateMultichainAddress からはエラーをスロー
      // ホワイトラベル対応: 呼び出し元は generateXRPDepositInfo を直接使用する必要がある
      expect(() => {
        generateMultichainAddress('test-user-id', 'xrp', 'mainnet', 'XRP')
      }).toThrow('XRP は generateXRPDepositInfo を直接使用してください')
    })

    it('Cardano アドレスを生成する', async () => {
      const result = await generateMultichainAddress('ada', 'mainnet', 'test-user-id', 'ADA')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^addr1[a-z0-9]+$/), // Cardano アドレスの形式（Shelley era）
        derivationPath: expect.stringMatching(/^m\/1852'\/1815'\/\d+'\/0\/\d+$/),
      })
    })

    it('同じユーザーでも毎回異なるアドレスが生成される', async () => {
      const address1 = await generateMultichainAddress('eth', 'mainnet', 'test-user-id', 'ETH')
      const address2 = await generateMultichainAddress('eth', 'mainnet', 'test-user-id', 'ETH')

      expect(address1.address).not.toBe(address2.address)
      expect(address1.derivationPath).not.toBe(address2.derivationPath)
    })

    it('異なるネットワークで異なるアドレスが生成される', async () => {
      const mainnetAddress = await generateMultichainAddress('eth', 'mainnet', 'test-user-id', 'ETH')
      const testnetAddress = await generateMultichainAddress('eth', 'testnet', 'test-user-id', 'ETH')

      expect(mainnetAddress.address).not.toBe(testnetAddress.address)
    })

    it('未対応のチェーン・資産組み合わせでエラーを発生させる', async () => {
      await expect(
        generateMultichainAddress('btc', 'mainnet', 'test-user-id', 'ETH')
      ).rejects.toThrow('Asset ETH is not supported on chain btc')
    })
  })

  describe('アドレス検証', () => {
    it('有効な Bitcoin アドレスを検証する', () => {
      expect(validateMultichainAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'btc')).toBe(true)
      expect(validateMultichainAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'btc')).toBe(true)
      expect(validateMultichainAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'btc')).toBe(true)
    })

    it('有効な Ethereum アドレスを検証する', () => {
      expect(validateMultichainAddress('0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2', 'eth')).toBe(true)
      expect(validateMultichainAddress('0x0000000000000000000000000000000000000000', 'eth')).toBe(true)
    })

    it('有効な TRON アドレスを検証する', () => {
      expect(validateMultichainAddress('TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH', 'trc')).toBe(true)
      expect(validateMultichainAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'trc')).toBe(true)
    })

    it('有効な XRP アドレスを検証する', () => {
      expect(validateMultichainAddress('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH', 'xrp')).toBe(true)
      expect(validateMultichainAddress('rDNvpq6xGw6T9bUgQbHj2oG5KD7b4s1Aq2', 'xrp')).toBe(true)
    })

    it('有効な Cardano アドレスを検証する', () => {
      expect(validateMultichainAddress('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp', 'ada')).toBe(true)
    })

    it('無効なアドレス形式を検出する', () => {
      expect(validateMultichainAddress('invalid-address', 'btc')).toBe(false)
      expect(validateMultichainAddress('0xinvalid', 'eth')).toBe(false)
      expect(validateMultichainAddress('Xinvalid', 'trc')).toBe(false)
      expect(validateMultichainAddress('xinvalid', 'xrp')).toBe(false)
      expect(validateMultichainAddress('invalid', 'ada')).toBe(false)
    })

    it('空文字や null を適切に処理する', () => {
      expect(validateMultichainAddress('', 'btc')).toBe(false)
      expect(validateMultichainAddress(null as unknown as string, 'eth')).toBe(false)
      expect(validateMultichainAddress(undefined as unknown as string, 'trc')).toBe(false)
    })

    it('チェーンに対応しないアドレス形式を検出する', () => {
      expect(validateMultichainAddress('0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2', 'btc')).toBe(false)
      expect(validateMultichainAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'eth')).toBe(false)
      expect(validateMultichainAddress('TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH', 'btc')).toBe(false)
    })
  })

  describe('エクスプローラー URL 生成', () => {
    it('Bitcoin エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('btc', 'mainnet', 'transaction', 'abc123def456')
      const addressUrl = getExplorerUrl('btc', 'mainnet', 'address', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')

      expect(txUrl).toContain('blockstream.info')
      expect(txUrl).toContain('abc123def456')
      expect(addressUrl).toContain('blockstream.info')
      expect(addressUrl).toContain('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
    })

    it('Ethereum エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('eth', 'mainnet', 'transaction', '0xabc123def456')
      const addressUrl = getExplorerUrl('eth', 'mainnet', 'address', '0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2')

      expect(txUrl).toContain('etherscan.io')
      expect(txUrl).toContain('0xabc123def456')
      expect(addressUrl).toContain('etherscan.io')
      expect(addressUrl).toContain('0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2')
    })

    it('テストネット エクスプローラー URL を生成する', () => {
      const testnetTxUrl = getExplorerUrl('eth', 'testnet', 'transaction', '0xabc123def456')
      const mainnetTxUrl = getExplorerUrl('eth', 'mainnet', 'transaction', '0xabc123def456')

      expect(testnetTxUrl).not.toBe(mainnetTxUrl)
      expect(testnetTxUrl).toContain('sepolia') // または他のテストネット名
    })

    it('TRON エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('trc', 'mainnet', 'transaction', 'abc123def456')

      expect(txUrl).toContain('tronscan.org')
      expect(txUrl).toContain('abc123def456')
    })

    it('XRP エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('xrp', 'mainnet', 'transaction', 'ABC123DEF456')

      expect(txUrl).toContain('xrpscan.com')
      expect(txUrl).toContain('ABC123DEF456')
    })

    it('Cardano エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('ada', 'mainnet', 'transaction', 'abc123def456')

      expect(txUrl).toContain('cardanoscan.io')
      expect(txUrl).toContain('abc123def456')
    })

    it('無効なパラメータでエラーを発生させる', () => {
      expect(() => {
        getExplorerUrl('unsupported' as SupportedChain, 'mainnet', 'transaction', 'abc123')
      }).toThrow('Unsupported chain: unsupported')

      expect(() => {
        getExplorerUrl('btc', 'mainnet', 'invalid' as 'transaction' | 'address', 'abc123')
      }).toThrow('Unsupported explorer type: invalid')
    })
  })

  describe('型安全性テスト', () => {
    it('SupportedChain 型が正しく動作する', () => {
      const chains: SupportedChain[] = ['btc', 'eth', 'trc', 'xrp', 'ada']

      chains.forEach(chain => {
        expect(typeof chain).toBe('string')
        expect(['btc', 'eth', 'trc', 'xrp', 'ada']).toContain(chain)
      })
    })

    it('SupportedNetwork 型が正しく動作する', () => {
      const networks: SupportedNetwork[] = ['mainnet', 'testnet']

      networks.forEach(network => {
        expect(typeof network).toBe('string')
        expect(['mainnet', 'testnet']).toContain(network)
      })
    })

    it('SupportedAsset 型が正しく動作する', () => {
      const assets: SupportedAsset[] = ['BTC', 'ETH', 'USDT', 'TRX', 'XRP', 'ADA']

      assets.forEach(asset => {
        expect(typeof asset).toBe('string')
        expect(['BTC', 'ETH', 'USDT', 'TRX', 'XRP', 'ADA']).toContain(asset)
      })
    })
  })

  describe('エラーハンドリング', () => {
    it('ネットワーク接続エラーを適切にハンドリングする', async () => {
      // ネットワークエラーをシミュレート
      const { Bitcoin } = await import('@tatumio/tatum')
      vi.mocked(Bitcoin.generateAddress).mockRejectedValue(new Error('Network timeout'))

      await expect(
        generateMultichainAddress('btc', 'mainnet', 'test-user-id', 'BTC')
      ).rejects.toThrow('Network timeout')
    })

    it('無効な入力パラメータを適切にハンドリングする', async () => {
      await expect(
        generateMultichainAddress('' as SupportedChain, 'mainnet', 'test-user-id', 'BTC')
      ).rejects.toThrow()

      await expect(
        generateMultichainAddress('btc', 'mainnet', '', 'BTC')
      ).rejects.toThrow('User ID is required')
    })

    it('未実装の機能で適切なエラーメッセージを返す', () => {
      expect(() => {
        getMinimumDepositAmount('FUTURE_COIN' as SupportedAsset, 'btc')
      }).toThrow('Asset FUTURE_COIN is not supported')
    })
  })
})