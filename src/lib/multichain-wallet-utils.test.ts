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
import { generateBTCAddress } from './btc-wallet-utils'

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

// evm-wallet-utils のモック
vi.mock('./evm-wallet-utils', () => {
  let callCount = 0
  return {
    generateEVMAddress: vi.fn((_userId: string, network: string) => {
      callCount += 1
      const addressIndex = callCount
      const coinType = network === 'sepolia' ? 1 : 60
      return {
        address: `0x${addressIndex.toString(16).padStart(40, '0')}`,
        privateKey: 'mock-private-key',
        derivationPath: `m/44'/${coinType}'/${addressIndex}'/0/${addressIndex}`,
        addressIndex
      }
    })
  }
})

// btc-wallet-utils のモック
vi.mock('./btc-wallet-utils', () => {
  let callCount = 0
  return {
    generateBTCAddress: vi.fn((_userId: string, network: string) => {
      callCount += 1
      const addressIndex = callCount
      const coinType = network === 'mainnet' ? 0 : 1
      return {
        address: network === 'mainnet'
          ? '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
          : 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
        xpub: 'xpub-mock',
        derivationPath: `m/44'/${coinType}'/${addressIndex}'/0/${addressIndex}`,
        addressIndex
      }
    })
  }
})

// crypto-utils のモック（TRON/Cardanoのアドレス生成を安定化）
vi.mock('./crypto-utils', () => ({
  sha256: vi.fn((input: string) => {
    let hash = ''
    for (let i = 0; i < 64; i++) {
      const char = input.charCodeAt(i % input.length)
      hash += (char % 16).toString(16)
    }
    return hash
  }),
  hashTo32BitInt: vi.fn(() => 12345)
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
        decimals: 18,
        minConfirmations: expect.any(Number),
        supportsTokens: true,
        addressType: 'derived',
      })
    })

    it('Bitcoin チェーン設定を正しく取得する', () => {
      const config = getChainConfig('btc', 'mainnet')

      expect(config).toMatchObject({
        name: 'Bitcoin',
        symbol: 'BTC',
        decimals: 8,
        minConfirmations: expect.any(Number),
        supportsTokens: false,
        addressType: 'xpub',
      })
    })

    it('Tron チェーン設定を正しく取得する', () => {
      const config = getChainConfig('trc', 'mainnet')

      expect(config).toMatchObject({
        name: 'Tron',
        symbol: 'TRX',
        decimals: 6,
        minConfirmations: expect.any(Number),
        supportsTokens: true,
        addressType: 'derived',
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
        decimals: 6,
        minConfirmations: expect.any(Number),
        supportsTokens: true,
        addressType: 'derived',
      })
    })

    it('テストネット設定を正しく取得する', () => {
      const mainnetConfig = getChainConfig('eth', 'mainnet')
      const testnetConfig = getChainConfig('eth', 'testnet')

      expect(mainnetConfig.name).toBe('Ethereum')
      expect(testnetConfig.name).toBe('Ethereum Sepolia')
      expect(testnetConfig.minConfirmations).toBeLessThanOrEqual(mainnetConfig.minConfirmations)
    })

    it('未対応のチェーンでエラーを発生させる', () => {
      expect(getChainConfig('unsupported' as SupportedChain, 'mainnet')).toBeNull()
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
      expect(getMinimumDepositAmount('eth', 'mainnet', 'ETH')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('btc', 'mainnet', 'BTC')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('eth', 'mainnet', 'USDT')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('trc', 'mainnet', 'USDT')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('trc', 'mainnet', 'TRX')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('xrp', 'mainnet', 'XRP')).toBeGreaterThan(0)
      expect(getMinimumDepositAmount('ada', 'mainnet', 'ADA')).toBeGreaterThan(0)
    })

    it('BTC の最小入金額が ETH より小さい', () => {
      const ethMin = getMinimumDepositAmount('eth', 'mainnet', 'ETH')
      const btcMin = getMinimumDepositAmount('btc', 'mainnet', 'BTC')

      expect(btcMin).toBeLessThan(ethMin)
    })

    it('USDT の最小入金額がチェーン間で一貫している', () => {
      const usdtEthMin = getMinimumDepositAmount('eth', 'mainnet', 'USDT')
      const usdtTrcMin = getMinimumDepositAmount('trc', 'mainnet', 'USDT')

      expect(usdtEthMin).toBe(usdtTrcMin)
    })

    it('未対応のチェーンでは0を返す', () => {
      expect(getMinimumDepositAmount('unsupported' as SupportedChain, 'mainnet', 'ETH')).toBe(0)
    })
  })

  describe('アドレス生成', () => {
    it('Bitcoin アドレスを生成する', async () => {
      const result = await generateMultichainAddress('test-user-id', 'btc', 'mainnet', 'BTC')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^[13bc1]/), // Bitcoin アドレスの形式
        derivationPath: expect.stringMatching(/^m\/44'\/0'\/\d+'\/0\/\d+$/),
      })
    })

    it('Ethereum アドレスを生成する', async () => {
      const result = await generateMultichainAddress('test-user-id', 'eth', 'mainnet', 'ETH')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/), // Ethereum アドレスの形式
        derivationPath: expect.stringMatching(/^m\/44'\/60'\/\d+'\/0\/\d+$/),
      })
    })

    it('TRON アドレスを生成する', async () => {
      const result = await generateMultichainAddress('test-user-id', 'trc', 'mainnet', 'TRX')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^T[1-9A-HJ-NP-Za-km-z]{33}$/), // TRON アドレスの形式
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
      const result = await generateMultichainAddress('test-user-id', 'ada', 'mainnet', 'ADA')

      expect(result).toMatchObject({
        address: expect.stringMatching(/^addr1[a-z0-9]{98,}$/), // Cardano アドレスの形式（Shelley era）
        derivationPath: expect.stringMatching(/^m\/1852'\/1815'\/\d+'\/0\/\d+$/),
      })
    })

    it('同じユーザーでも毎回異なるアドレスが生成される', async () => {
      const address1 = await generateMultichainAddress('test-user-id', 'eth', 'mainnet', 'ETH')
      const address2 = await generateMultichainAddress('test-user-id', 'eth', 'mainnet', 'ETH')

      expect(address1.address).not.toBe(address2.address)
      expect(address1.derivationPath).not.toBe(address2.derivationPath)
    })

    it('異なるネットワークで異なるアドレスが生成される', async () => {
      const mainnetAddress = await generateMultichainAddress('test-user-id', 'eth', 'mainnet', 'ETH')
      const testnetAddress = await generateMultichainAddress('test-user-id', 'eth', 'testnet', 'ETH')

      expect(mainnetAddress.address).not.toBe(testnetAddress.address)
    })

    it('未対応のチェーン・資産組み合わせでエラーを発生させる', async () => {
      expect(() => {
        generateMultichainAddress('test-user-id', 'invalid' as SupportedChain, 'mainnet', 'ETH')
      }).toThrow('Unsupported chain/network combination')
    })
  })

  describe('アドレス検証', () => {
    it('有効な Bitcoin アドレスを検証する', () => {
      expect(validateMultichainAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'btc', 'mainnet')).toBe(true)
      expect(validateMultichainAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'btc', 'mainnet')).toBe(true)
      expect(validateMultichainAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'btc', 'mainnet')).toBe(true)
    })

    it('有効な Ethereum アドレスを検証する', () => {
      expect(validateMultichainAddress('0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2', 'eth', 'mainnet')).toBe(true)
      expect(validateMultichainAddress('0x0000000000000000000000000000000000000000', 'eth', 'mainnet')).toBe(true)
    })

    it('有効な TRON アドレスを検証する', () => {
      expect(validateMultichainAddress('TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH', 'trc', 'mainnet')).toBe(true)
      expect(validateMultichainAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', 'trc', 'mainnet')).toBe(true)
    })

    it('有効な XRP アドレスを検証する', () => {
      expect(validateMultichainAddress('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH', 'xrp', 'mainnet')).toBe(true)
      expect(validateMultichainAddress('rDNvpq6xGw6T9bUgQbHj2oG5KD7b4s1Aq2', 'xrp', 'mainnet')).toBe(true)
    })

    it('有効な Cardano アドレスを検証する', () => {
      expect(validateMultichainAddress('addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp', 'ada', 'mainnet')).toBe(true)
    })

    it('無効なアドレス形式を検出する', () => {
      expect(validateMultichainAddress('invalid-address', 'btc', 'mainnet')).toBe(false)
      expect(validateMultichainAddress('0xinvalid', 'eth', 'mainnet')).toBe(false)
      expect(validateMultichainAddress('Xinvalid', 'trc', 'mainnet')).toBe(false)
      expect(validateMultichainAddress('xinvalid', 'xrp', 'mainnet')).toBe(false)
      expect(validateMultichainAddress('invalid', 'ada', 'mainnet')).toBe(false)
    })

    it('空文字や null を適切に処理する', () => {
      expect(validateMultichainAddress('', 'btc', 'mainnet')).toBe(false)
      expect(validateMultichainAddress(null as unknown as string, 'eth', 'mainnet')).toBe(false)
      expect(validateMultichainAddress(undefined as unknown as string, 'trc', 'mainnet')).toBe(false)
    })

    it('チェーンに対応しないアドレス形式を検出する', () => {
      expect(validateMultichainAddress('0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2', 'btc', 'mainnet')).toBe(false)
      expect(validateMultichainAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'eth', 'mainnet')).toBe(false)
      expect(validateMultichainAddress('TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH', 'btc', 'mainnet')).toBe(false)
    })
  })

  describe('エクスプローラー URL 生成', () => {
    it('Bitcoin エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('btc', 'mainnet', 'tx', 'abc123def456')
      const addressUrl = getExplorerUrl('btc', 'mainnet', 'address', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')

      expect(txUrl).toContain('blockstream.info')
      expect(txUrl).toContain('abc123def456')
      expect(addressUrl).toContain('blockstream.info')
      expect(addressUrl).toContain('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
    })

    it('Ethereum エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('eth', 'mainnet', 'tx', '0xabc123def456')
      const addressUrl = getExplorerUrl('eth', 'mainnet', 'address', '0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2')

      expect(txUrl).toContain('etherscan.io')
      expect(txUrl).toContain('0xabc123def456')
      expect(addressUrl).toContain('etherscan.io')
      expect(addressUrl).toContain('0x742d35Cc6e4C29bb7Ce9F6F4e6c0c6b0D3c4D7a2')
    })

    it('テストネット エクスプローラー URL を生成する', () => {
      const testnetTxUrl = getExplorerUrl('eth', 'testnet', 'tx', '0xabc123def456')
      const mainnetTxUrl = getExplorerUrl('eth', 'mainnet', 'tx', '0xabc123def456')

      expect(testnetTxUrl).not.toBe(mainnetTxUrl)
      expect(testnetTxUrl).toContain('sepolia') // または他のテストネット名
    })

    it('TRON エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('trc', 'mainnet', 'tx', 'abc123def456')

      expect(txUrl).toContain('tronscan.org')
      expect(txUrl).toContain('abc123def456')
    })

    it('XRP エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('xrp', 'mainnet', 'tx', 'ABC123DEF456')

      expect(txUrl).toContain('xrpscan.com')
      expect(txUrl).toContain('ABC123DEF456')
    })

    it('Cardano エクスプローラー URL を生成する', () => {
      const txUrl = getExplorerUrl('ada', 'mainnet', 'tx', 'abc123def456')

      expect(txUrl).toContain('cardanoscan.io')
      expect(txUrl).toContain('abc123def456')
    })

    it('無効なパラメータでエラーを発生させる', () => {
      const url = getExplorerUrl('unsupported' as SupportedChain, 'mainnet', 'tx', 'abc123')
      expect(url).toBe('')
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
      const networks: SupportedNetwork[] = ['mainnet', 'testnet', 'sepolia', 'shasta']

      networks.forEach(network => {
        expect(typeof network).toBe('string')
        expect(['mainnet', 'testnet', 'sepolia', 'shasta']).toContain(network)
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
    it('内部の生成処理エラーをそのまま返す', () => {
      vi.mocked(generateBTCAddress).mockImplementationOnce(() => {
        throw new Error('Network timeout')
      })

      expect(() => {
        generateMultichainAddress('test-user-id', 'btc', 'mainnet', 'BTC')
      }).toThrow('Network timeout')
    })

    it('無効な入力パラメータを適切にハンドリングする', () => {
      expect(() => {
        generateMultichainAddress('test-user-id', '' as SupportedChain, 'mainnet', 'BTC')
      }).toThrow('Unsupported chain/network combination')

      expect(() => {
        generateMultichainAddress('test-user-id', 'eth', 'invalid' as SupportedNetwork, 'ETH')
      }).toThrow('Unsupported chain/network combination')
    })

    it('未対応のチェーンでは最小入金額が0になる', () => {
      expect(getMinimumDepositAmount('invalid' as SupportedChain, 'mainnet', 'ETH')).toBe(0)
    })
  })
})
