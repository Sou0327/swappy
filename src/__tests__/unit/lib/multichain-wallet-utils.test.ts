/**
 * multichain-wallet-utils の単体テスト
 * マルチチェーンウォレット管理の包括的テスト (ETH, BTC, TRC, XRP, ADA)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateMultichainAddress,
  validateMultichainAddress,
  estimateTransactionFee,
  getMinimumDepositAmount,
  getExplorerUrl,
  getChainConfig,
  getSupportedAssets,
  getAllDepositableAssets,
  SUPPORTED_ASSETS,
  CHAIN_CONFIGS,
  type SupportedChain,
  type SupportedNetwork,
  type SupportedAsset
} from '@/lib/multichain-wallet-utils'

// evm-wallet-utilsのモック
vi.mock('@/lib/evm-wallet-utils', () => ({
  generateEVMAddress: vi.fn((userId: string, network: string, asset: string) => ({
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    privateKey: 'mock-private-key',
    derivationPath: `m/44'/60'/0'/0/${userId.length}`,
    addressIndex: userId.length
  }))
}))

// btc-wallet-utilsのモック
vi.mock('@/lib/btc-wallet-utils', () => ({
  generateBTCAddress: vi.fn((userId: string, network: string, asset: string) => ({
    address: network === 'mainnet'
      ? '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
      : 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    privateKey: 'mock-private-key',
    xpub: 'xpub6D4BDPcP2GT577Vvch3R8wDkScZWzQzMMUm3PWbmWvVJrZwQY4VUNgqFJPMM3No2dFDFGTsxxpG5uJh7n7epu4trkrX7x7DogT5Uv6fcLW5',
    derivationPath: `m/44'/0'/0'/0/${userId.length}`,
    addressIndex: userId.length
  }))
}))

// xrp-wallet-utilsのモック
// 注意: generateXRPDepositInfo は非同期でDB参照が必要なため、
// generateMultichainAddress からは呼び出されなくなりました（エラーをスロー）
vi.mock('@/lib/xrp-wallet-utils', () => ({
  generateXRPDepositInfo: vi.fn() // 使用されないがインポートエラー回避のため
}))

// crypto-utilsのモック
vi.mock('@/lib/crypto-utils', () => ({
  sha256: vi.fn((input: string) => {
    // 決定論的なハッシュ生成（64文字の16進数）
    let hash = '';
    for (let i = 0; i < 64; i++) {
      const char = input.charCodeAt(i % input.length);
      hash += (char % 16).toString(16);
    }
    return hash;
  }),
  hashTo32BitInt: vi.fn((input: string) => 12345)
}))

describe('multichain-wallet-utils', () => {
  describe('SUPPORTED_ASSETS定数', () => {
    it('6つのアセットが定義されている', () => {
      expect(SUPPORTED_ASSETS).toHaveLength(6)
      expect(SUPPORTED_ASSETS).toEqual(['ETH', 'BTC', 'USDT', 'TRX', 'XRP', 'ADA'])
    })
  })

  describe('CHAIN_CONFIGS - ETH', () => {
    it('mainnet設定が正しい', () => {
      const config = CHAIN_CONFIGS.eth.mainnet

      expect(config).toBeDefined()
      expect(config?.name).toBe('Ethereum')
      expect(config?.symbol).toBe('ETH')
      expect(config?.decimals).toBe(18)
      expect(config?.explorer).toBe('https://etherscan.io')
      expect(config?.minConfirmations).toBe(12)
      expect(config?.supportsTokens).toBe(true)
      expect(config?.addressType).toBe('derived')
    })

    it('sepolia設定が正しい', () => {
      const config = CHAIN_CONFIGS.eth.sepolia

      expect(config).toBeDefined()
      expect(config?.name).toBe('Ethereum Sepolia')
      expect(config?.explorer).toBe('https://sepolia.etherscan.io')
      expect(config?.minConfirmations).toBe(1)
      expect(config?.addressType).toBe('derived')
    })
  })

  describe('CHAIN_CONFIGS - BTC', () => {
    it('mainnetとtestnet設定が正しい', () => {
      const mainnetConfig = CHAIN_CONFIGS.btc.mainnet
      const testnetConfig = CHAIN_CONFIGS.btc.testnet

      expect(mainnetConfig?.name).toBe('Bitcoin')
      expect(mainnetConfig?.symbol).toBe('BTC')
      expect(mainnetConfig?.decimals).toBe(8)
      expect(mainnetConfig?.explorer).toBe('https://blockstream.info')
      expect(mainnetConfig?.minConfirmations).toBe(3)
      expect(mainnetConfig?.supportsTokens).toBe(false)
      expect(mainnetConfig?.addressType).toBe('xpub')

      expect(testnetConfig?.name).toBe('Bitcoin Testnet')
      expect(testnetConfig?.addressType).toBe('xpub')
    })
  })

  describe('CHAIN_CONFIGS - TRC', () => {
    it('mainnetとshasta設定が正しい', () => {
      const mainnetConfig = CHAIN_CONFIGS.trc.mainnet
      const shastaConfig = CHAIN_CONFIGS.trc.shasta

      expect(mainnetConfig?.name).toBe('Tron')
      expect(mainnetConfig?.symbol).toBe('TRX')
      expect(mainnetConfig?.decimals).toBe(6)
      expect(mainnetConfig?.explorer).toBe('https://tronscan.org')
      expect(mainnetConfig?.rpcUrl).toBe('https://api.trongrid.io')
      expect(mainnetConfig?.minConfirmations).toBe(19)
      expect(mainnetConfig?.supportsTokens).toBe(true)
      expect(mainnetConfig?.addressType).toBe('derived')

      expect(shastaConfig?.name).toBe('Tron Shasta')
      expect(shastaConfig?.explorer).toBe('https://shasta.tronscan.org')
    })
  })

  describe('CHAIN_CONFIGS - XRP/ADA', () => {
    it('XRP mainnet設定が正しい', () => {
      const config = CHAIN_CONFIGS.xrp.mainnet

      expect(config?.name).toBe('XRP Ledger')
      expect(config?.symbol).toBe('XRP')
      expect(config?.decimals).toBe(6)
      expect(config?.explorer).toBe('https://xrpscan.com')
      expect(config?.minConfirmations).toBe(1)
      expect(config?.supportsTokens).toBe(false)
      expect(config?.addressType).toBe('fixed')
      expect(config?.requiresDestinationTag).toBe(true)
    })

    it('ADA mainnet設定が正しい', () => {
      const config = CHAIN_CONFIGS.ada.mainnet

      expect(config?.name).toBe('Cardano')
      expect(config?.symbol).toBe('ADA')
      expect(config?.decimals).toBe(6)
      expect(config?.explorer).toBe('https://cardanoscan.io')
      expect(config?.minConfirmations).toBe(15)
      expect(config?.supportsTokens).toBe(true)
      expect(config?.addressType).toBe('derived')
    })
  })

  describe('generateMultichainAddress - ETH', () => {
    it('ETH mainnetアドレスを生成する', () => {
      const result = generateMultichainAddress('user-123', 'eth', 'mainnet', 'ETH')

      expect(result.chain).toBe('eth')
      expect(result.network).toBe('mainnet')
      expect(result.asset).toBe('ETH')
      expect(result.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')
      expect(result.derivationPath).toBeDefined()
      expect(result.addressIndex).toBeDefined()
    })

    it('ETH sepoliaアドレスを生成する', () => {
      const result = generateMultichainAddress('user-456', 'eth', 'sepolia', 'ETH')

      expect(result.chain).toBe('eth')
      expect(result.network).toBe('sepolia')
      expect(result.address).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')
    })
  })

  describe('generateMultichainAddress - BTC', () => {
    it('BTC mainnetアドレスを生成する', () => {
      const result = generateMultichainAddress('user-789', 'btc', 'mainnet', 'BTC')

      expect(result.chain).toBe('btc')
      expect(result.network).toBe('mainnet')
      expect(result.asset).toBe('BTC')
      expect(result.address).toBe('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
      expect(result.xpub).toBeDefined()
      expect(result.xpub).toContain('xpub')
      expect(result.derivationPath).toBeDefined()
      expect(result.addressIndex).toBeDefined()
    })

    it('BTC testnetアドレスを生成する', () => {
      const result = generateMultichainAddress('user-abc', 'btc', 'testnet', 'BTC')

      expect(result.chain).toBe('btc')
      expect(result.network).toBe('testnet')
      expect(result.address).toBe('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')
    })
  })

  describe('generateMultichainAddress - TRC', () => {
    it('TRC mainnetアドレスを生成する', () => {
      const result = generateMultichainAddress('user-trc', 'trc', 'mainnet', 'TRX')

      expect(result.chain).toBe('trc')
      expect(result.network).toBe('mainnet')
      expect(result.asset).toBe('TRX')
      expect(result.address).toMatch(/^T[A-Z0-9]{32}$/)
      expect(result.derivationPath).toMatch(/^m\/44'\/195'\/0'\/0\/\d+$/)
      expect(result.addressIndex).toBeGreaterThanOrEqual(0)
    })

    it('TRC shastaアドレスを生成する', () => {
      const result = generateMultichainAddress('user-shasta', 'trc', 'shasta', 'TRX')

      expect(result.chain).toBe('trc')
      expect(result.network).toBe('shasta')
      expect(result.address).toMatch(/^T[A-Z0-9]{32}$/)
    })
  })

  describe('generateMultichainAddress - XRP', () => {
    // XRP は非同期でDB参照が必要なため、generateMultichainAddress からはエラーをスロー
    // ホワイトラベル対応: 呼び出し元は generateXRPDepositInfo を直接使用する必要がある

    it('XRP mainnetはエラーをスローする（非同期API使用を促す）', () => {
      expect(() => {
        generateMultichainAddress('user-xrp', 'xrp', 'mainnet', 'XRP')
      }).toThrow('XRP は generateXRPDepositInfo を直接使用してください')
    })

    it('XRP testnetはエラーをスローする（非同期API使用を促す）', () => {
      expect(() => {
        generateMultichainAddress('user-xrp-test', 'xrp', 'testnet', 'XRP')
      }).toThrow('XRP は generateXRPDepositInfo を直接使用してください')
    })
  })

  describe('generateMultichainAddress - ADA', () => {
    it('ADA mainnetアドレスを生成する', () => {
      const result = generateMultichainAddress('user-ada', 'ada', 'mainnet', 'ADA')

      expect(result.chain).toBe('ada')
      expect(result.network).toBe('mainnet')
      expect(result.asset).toBe('ADA')
      expect(result.address).toMatch(/^addr1[a-z0-9]{52}$/)
      expect(result.derivationPath).toMatch(/^m\/1852'\/1815'\/0'\/0\/\d+$/)
      expect(result.addressIndex).toBeGreaterThanOrEqual(0)
    })

    it('ADA testnetアドレスを生成する', () => {
      const result = generateMultichainAddress('user-ada-test', 'ada', 'testnet', 'ADA')

      expect(result.chain).toBe('ada')
      expect(result.network).toBe('testnet')
      expect(result.address).toMatch(/^addr_test1[a-z0-9]{52}$/)
    })
  })

  describe('generateMultichainAddress - エラーケース', () => {
    it('未サポートのチェーンでエラーを投げる', () => {
      expect(() => {
        generateMultichainAddress('user-test', 'invalid' as SupportedChain, 'mainnet', 'ETH')
      }).toThrow('Unsupported chain')
    })

    it('未サポートのネットワークでエラーを投げる', () => {
      expect(() => {
        generateMultichainAddress('user-test', 'eth', 'invalid' as SupportedNetwork, 'ETH')
      }).toThrow('Unsupported chain/network combination')
    })
  })

  describe('validateMultichainAddress - ETH', () => {
    it('有効なETHアドレスを検証する', () => {
      const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      expect(validateMultichainAddress(validAddress, 'eth', 'mainnet')).toBe(true)
    })

    it('長さが不正なETHアドレスを拒否する', () => {
      const invalidAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bE'

      expect(validateMultichainAddress(invalidAddress, 'eth', 'mainnet')).toBe(false)
    })

    it('プレフィックスが不正なETHアドレスを拒否する', () => {
      const invalidAddress = '742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      expect(validateMultichainAddress(invalidAddress, 'eth', 'mainnet')).toBe(false)
    })
  })

  describe('validateMultichainAddress - TRC', () => {
    it('有効なTRCアドレスを検証する', () => {
      const validAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

      expect(validateMultichainAddress(validAddress, 'trc', 'mainnet')).toBe(true)
    })

    it('無効なTRCアドレスを拒否する', () => {
      const invalidAddress = 'AR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

      expect(validateMultichainAddress(invalidAddress, 'trc', 'mainnet')).toBe(false)
    })
  })

  describe('validateMultichainAddress - BTC', () => {
    it('BTC mainnet legacyアドレスを検証する', () => {
      const legacyAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'

      expect(validateMultichainAddress(legacyAddress, 'btc', 'mainnet')).toBe(true)
    })

    it('BTC mainnet segwitアドレスを検証する', () => {
      const segwitAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

      expect(validateMultichainAddress(segwitAddress, 'btc', 'mainnet')).toBe(true)
    })

    it('無効なBTC mainnetアドレスを拒否する', () => {
      const invalidAddress = 'invalid-btc-address'

      expect(validateMultichainAddress(invalidAddress, 'btc', 'mainnet')).toBe(false)
    })

    it('BTC testnet legacyアドレスを検証する', () => {
      const testnetAddress = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'

      expect(validateMultichainAddress(testnetAddress, 'btc', 'testnet')).toBe(true)
    })

    it('BTC testnet segwitアドレスを検証する', () => {
      const testnetSegwit = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'

      expect(validateMultichainAddress(testnetSegwit, 'btc', 'testnet')).toBe(true)
    })

    it('無効なBTC testnetアドレスを拒否する', () => {
      const invalidAddress = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' // mainnetアドレス

      expect(validateMultichainAddress(invalidAddress, 'btc', 'testnet')).toBe(false)
    })
  })

  describe('validateMultichainAddress - XRP', () => {
    it('有効なXRPアドレスを検証する', () => {
      const validAddress = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'

      expect(validateMultichainAddress(validAddress, 'xrp', 'mainnet')).toBe(true)
    })

    it('無効なXRPアドレスを拒否する', () => {
      const invalidAddress = 'xN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'

      expect(validateMultichainAddress(invalidAddress, 'xrp', 'mainnet')).toBe(false)
    })
  })

  describe('validateMultichainAddress - ADA', () => {
    it('有効なADA mainnetアドレスを検証する', () => {
      const validAddress = 'addr1qxy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6'

      expect(validateMultichainAddress(validAddress, 'ada', 'mainnet')).toBe(true)
    })

    it('有効なADA testnetアドレスを検証する', () => {
      const validAddress = 'addr_test1qxy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6'

      expect(validateMultichainAddress(validAddress, 'ada', 'testnet')).toBe(true)
    })

    it('長さが不足したADAアドレスを拒否する', () => {
      const invalidAddress = 'addr1qxy3kdm6'

      expect(validateMultichainAddress(invalidAddress, 'ada', 'mainnet')).toBe(false)
    })

    it('プレフィックスが不正なADAアドレスを拒否する', () => {
      const invalidAddress = 'invalid1qxy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6qy3kdm6'

      expect(validateMultichainAddress(invalidAddress, 'ada', 'mainnet')).toBe(false)
    })
  })

  describe('validateMultichainAddress - 未サポート', () => {
    it('未サポートのチェーンでfalseを返す', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      expect(validateMultichainAddress(address, 'invalid' as SupportedChain, 'mainnet')).toBe(false)
    })
  })

  describe('estimateTransactionFee', () => {
    it('ETH (ETHアセット)の手数料を返す', () => {
      expect(estimateTransactionFee('eth', 'mainnet', 'ETH')).toBe(0.001)
    })

    it('ETH (USDTアセット)の手数料を返す', () => {
      expect(estimateTransactionFee('eth', 'mainnet', 'USDT')).toBe(0.002)
    })

    it('BTCの手数料を返す', () => {
      expect(estimateTransactionFee('btc', 'mainnet', 'BTC')).toBe(0.0001)
    })

    it('TRC (TRXアセット)の手数料を返す', () => {
      expect(estimateTransactionFee('trc', 'mainnet', 'TRX')).toBe(1.1)
    })

    it('TRC (USDTアセット)の手数料を返す', () => {
      expect(estimateTransactionFee('trc', 'mainnet', 'USDT')).toBe(10)
    })

    it('XRPの手数料を返す', () => {
      expect(estimateTransactionFee('xrp', 'mainnet', 'XRP')).toBe(0.000012)
    })

    it('ADAの手数料を返す', () => {
      expect(estimateTransactionFee('ada', 'mainnet', 'ADA')).toBe(0.17)
    })

    it('未サポートのチェーンで0を返す', () => {
      expect(estimateTransactionFee('invalid' as SupportedChain, 'mainnet', 'ETH')).toBe(0)
    })
  })

  describe('getMinimumDepositAmount', () => {
    it('ETH (ETHアセット)の最小入金額を返す', () => {
      expect(getMinimumDepositAmount('eth', 'mainnet', 'ETH')).toBe(0.01)
    })

    it('ETH (USDTアセット)の最小入金額を返す', () => {
      expect(getMinimumDepositAmount('eth', 'mainnet', 'USDT')).toBe(1)
    })

    it('BTCの最小入金額を返す', () => {
      expect(getMinimumDepositAmount('btc', 'mainnet', 'BTC')).toBe(0.0001)
    })

    it('TRC (TRXアセット)の最小入金額を返す', () => {
      expect(getMinimumDepositAmount('trc', 'mainnet', 'TRX')).toBe(10)
    })

    it('TRC (USDTアセット)の最小入金額を返す', () => {
      expect(getMinimumDepositAmount('trc', 'mainnet', 'USDT')).toBe(1)
    })

    it('XRPの最小入金額を返す', () => {
      expect(getMinimumDepositAmount('xrp', 'mainnet', 'XRP')).toBe(20)
    })

    it('ADAの最小入金額を返す', () => {
      expect(getMinimumDepositAmount('ada', 'mainnet', 'ADA')).toBe(1)
    })
  })

  describe('getExplorerUrl', () => {
    it('ETH addressのURLを生成する', () => {
      const url = getExplorerUrl('eth', 'mainnet', 'address', '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')

      expect(url).toBe('https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')
    })

    it('ETH txのURLを生成する', () => {
      const url = getExplorerUrl('eth', 'mainnet', 'tx', '0x1234567890abcdef')

      expect(url).toBe('https://etherscan.io/tx/0x1234567890abcdef')
    })

    it('BTC addressのURLを生成する', () => {
      const url = getExplorerUrl('btc', 'mainnet', 'address', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')

      expect(url).toBe('https://blockstream.info/address/1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
    })

    it('BTC txのURLを生成する', () => {
      const url = getExplorerUrl('btc', 'mainnet', 'tx', 'abc123')

      expect(url).toBe('https://blockstream.info/tx/abc123')
    })

    it('TRC addressのURLを生成する', () => {
      const url = getExplorerUrl('trc', 'mainnet', 'address', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')

      expect(url).toBe('https://tronscan.org/#/address/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
    })

    it('TRC txのURLを生成する', () => {
      const url = getExplorerUrl('trc', 'mainnet', 'tx', 'def456')

      expect(url).toBe('https://tronscan.org/#/transaction/def456')
    })

    it('XRP accountのURLを生成する', () => {
      const url = getExplorerUrl('xrp', 'mainnet', 'address', 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')

      expect(url).toBe('https://xrpscan.com/account/rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH')
    })

    it('XRP txのURLを生成する', () => {
      const url = getExplorerUrl('xrp', 'mainnet', 'tx', 'ghi789')

      expect(url).toBe('https://xrpscan.com/tx/ghi789')
    })

    it('ADA addressのURLを生成する', () => {
      const url = getExplorerUrl('ada', 'mainnet', 'address', 'addr1qxy3kdm6...')

      expect(url).toBe('https://cardanoscan.io/address/addr1qxy3kdm6...')
    })

    it('ADA txのURLを生成する', () => {
      const url = getExplorerUrl('ada', 'mainnet', 'tx', 'jkl012')

      expect(url).toBe('https://cardanoscan.io/transaction/jkl012')
    })
  })

  describe('getChainConfig', () => {
    it('有効なチェーン設定を取得する', () => {
      const config = getChainConfig('eth', 'mainnet')

      expect(config).toBeDefined()
      expect(config?.name).toBe('Ethereum')
      expect(config?.symbol).toBe('ETH')
    })

    it('無効なチェーン/ネットワークでnullを返す', () => {
      const config = getChainConfig('invalid' as SupportedChain, 'mainnet')

      expect(config).toBeNull()
    })
  })

  describe('getSupportedAssets', () => {
    it('ETHのサポートアセットを返す', () => {
      const assets = getSupportedAssets('eth', 'mainnet')

      expect(assets).toEqual(['ETH', 'USDT'])
    })

    it('BTCのサポートアセットを返す', () => {
      const assets = getSupportedAssets('btc', 'mainnet')

      expect(assets).toEqual(['BTC'])
    })

    it('TRCのサポートアセットを返す', () => {
      const assets = getSupportedAssets('trc', 'mainnet')

      expect(assets).toEqual(['TRX', 'USDT'])
    })

    it('XRPのサポートアセットを返す', () => {
      const assets = getSupportedAssets('xrp', 'mainnet')

      expect(assets).toEqual(['XRP'])
    })

    it('ADAのサポートアセットを返す', () => {
      const assets = getSupportedAssets('ada', 'mainnet')

      expect(assets).toEqual(['ADA'])
    })
  })

  describe('getAllDepositableAssets', () => {
    it('全入金可能アセットの配列を返す', () => {
      const assets = getAllDepositableAssets()

      expect(assets).toEqual(['ETH', 'BTC', 'USDT', 'TRX', 'XRP', 'ADA'])
    })

    it('新しい配列を返す（ミューテーション防止）', () => {
      const assets1 = getAllDepositableAssets()
      const assets2 = getAllDepositableAssets()

      // 異なる配列インスタンス
      expect(assets1).not.toBe(assets2)
      // 同じ内容
      expect(assets1).toEqual(assets2)
    })
  })
})
