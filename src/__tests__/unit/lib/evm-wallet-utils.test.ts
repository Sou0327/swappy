/**
 * evm-wallet-utils の単体テスト
 * EVMチェーン（Ethereum/Sepolia）ウォレット生成とBIP44派生の包括的テスト
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  generateDerivationPath,
  generateAddressIndex,
  generateEVMAddress,
  isValidEVMAddress,
  isValidEVMAsset,
  getEVMNetworkConfig,
  getEVMAssetConfig,
  getEVMTransactionUrl,
  getEVMAddressUrl,
  encryptEVMPrivateKey,
  meetsMinimumDeposit,
  getRequiredConfirmations,
  SUPPORTED_EVM_ASSETS
} from '@/lib/evm-wallet-utils'

describe('evm-wallet-utils', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.WALLET_ENCRYPTION_KEY = 'test-encryption-key-12345'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('SUPPORTED_EVM_ASSETS', () => {
    it('4つのサポート資産が定義されている', () => {
      expect(SUPPORTED_EVM_ASSETS).toHaveLength(4)
    })

    it('mainnet ETHとUSDTが含まれている', () => {
      const mainnetAssets = SUPPORTED_EVM_ASSETS.filter(a => a.network === 'ethereum')

      expect(mainnetAssets).toHaveLength(2)
      expect(mainnetAssets.find(a => a.asset === 'ETH')).toBeDefined()
      expect(mainnetAssets.find(a => a.asset === 'USDT')).toBeDefined()
    })

    it('sepolia testnet ETHとUSDTが含まれている', () => {
      const sepoliaAssets = SUPPORTED_EVM_ASSETS.filter(a => a.network === 'sepolia')

      expect(sepoliaAssets).toHaveLength(2)
      expect(sepoliaAssets.find(a => a.asset === 'ETH')).toBeDefined()
      expect(sepoliaAssets.find(a => a.asset === 'USDT')).toBeDefined()
    })

    it('各資産にdecimalsが設定されている', () => {
      SUPPORTED_EVM_ASSETS.forEach(asset => {
        expect(asset.decimals).toBeDefined()
        expect(typeof asset.decimals).toBe('number')
      })
    })

    it('USDTにcontractAddressが設定されている', () => {
      const usdtAssets = SUPPORTED_EVM_ASSETS.filter(a => a.asset === 'USDT')

      usdtAssets.forEach(asset => {
        expect(asset.contractAddress).toBeDefined()
      })
    })
  })

  describe('generateDerivationPath', () => {
    it('ethereum mainnet用のBIP44パスを生成する', () => {
      const path = generateDerivationPath('ethereum', 0, 5)

      expect(path).toBe("m/44'/60'/0'/0/5")
    })

    it('sepolia testnet用のBIP44パスを生成する', () => {
      const path = generateDerivationPath('sepolia', 0, 10)

      expect(path).toBe("m/44'/1'/0'/0/10")
    })

    it('accountIndex を正しく反映する', () => {
      const path = generateDerivationPath('ethereum', 5, 0)

      expect(path).toBe("m/44'/60'/5'/0/0")
    })

    it('addressIndex を正しく反映する', () => {
      const path = generateDerivationPath('ethereum', 0, 100)

      expect(path).toBe("m/44'/60'/0'/0/100")
    })

    it('BIP44形式のパスを返す', () => {
      const path = generateDerivationPath('ethereum', 0, 0)

      expect(path).toMatch(/^m\/44'\/\d+'\/\d+'\/0\/\d+$/)
    })
  })

  describe('generateAddressIndex', () => {
    it('ユーザーIDとアセットからアドレスインデックスを生成する', () => {
      const index = generateAddressIndex('user-123', 'ETH')

      expect(typeof index).toBe('number')
      expect(Number.isInteger(index)).toBe(true)
    })

    it('正の整数を返す', () => {
      const index = generateAddressIndex('user-456', 'USDT')

      expect(index).toBeGreaterThanOrEqual(0)
    })

    it('2^31-1以下の値を返す', () => {
      const index = generateAddressIndex('user-789', 'ETH')

      expect(index).toBeLessThanOrEqual(2147483647)
    })

    it('異なるユーザーIDで異なるインデックスを生成する', () => {
      const index1 = generateAddressIndex('user-111', 'ETH')
      const index2 = generateAddressIndex('user-222', 'ETH')

      // タイムスタンプとランダム要素があるため、常に異なる
      expect(index1).not.toBe(index2)
    })

    it('同じユーザーIDでも異なるアセットで異なるインデックスを生成する', () => {
      const indexETH = generateAddressIndex('user-same', 'ETH')
      const indexUSDT = generateAddressIndex('user-same', 'USDT')

      expect(indexETH).not.toBe(indexUSDT)
    })
  })

  describe('generateEVMAddress', () => {
    it('ethereum mainnetでEVMアドレスを生成する', () => {
      const wallet = generateEVMAddress('user-123', 'ethereum', 'ETH')

      expect(wallet).toBeDefined()
      expect(wallet.address).toBeDefined()
      expect(wallet.privateKey).toBeDefined()
      expect(wallet.derivationPath).toBeDefined()
      expect(wallet.addressIndex).toBeDefined()
    })

    it('sepolia testnetでEVMアドレスを生成する', () => {
      const wallet = generateEVMAddress('user-456', 'sepolia', 'USDT')

      expect(wallet).toBeDefined()
      expect(wallet.address).toBeDefined()
    })

    it('アドレスが0xで始まる', () => {
      const wallet = generateEVMAddress('user-789', 'ethereum', 'ETH')

      expect(wallet.address.startsWith('0x')).toBe(true)
    })

    it('アドレスが42文字（0x + 40文字）である', () => {
      const wallet = generateEVMAddress('user-abc', 'ethereum', 'ETH')

      expect(wallet.address.length).toBe(42)
    })

    it('秘密鍵が0xで始まる', () => {
      const wallet = generateEVMAddress('user-def', 'ethereum', 'ETH')

      expect(wallet.privateKey.startsWith('0x')).toBe(true)
    })

    it('秘密鍵が66文字（0x + 64文字）である', () => {
      const wallet = generateEVMAddress('user-ghi', 'ethereum', 'ETH')

      expect(wallet.privateKey.length).toBe(66)
    })

    it('derivationPathがBIP44形式である', () => {
      const wallet = generateEVMAddress('user-jkl', 'ethereum', 'ETH')

      expect(wallet.derivationPath).toMatch(/^m\/44'\/\d+'\/\d+'\/0\/\d+$/)
    })

    it('addressIndexが正の整数である', () => {
      const wallet = generateEVMAddress('user-mno', 'ethereum', 'ETH')

      expect(typeof wallet.addressIndex).toBe('number')
      expect(Number.isInteger(wallet.addressIndex)).toBe(true)
      expect(wallet.addressIndex).toBeGreaterThanOrEqual(0)
    })
  })

  describe('isValidEVMAddress', () => {
    it('有効なEthereumアドレスを検証する', () => {
      const valid = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'

      expect(isValidEVMAddress(valid)).toBe(true)
    })

    it('チェックサム付きアドレスを検証する', () => {
      const valid = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

      expect(isValidEVMAddress(valid)).toBe(true)
    })

    it('小文字のみのアドレスを検証する', () => {
      const valid = '0xdac17f958d2ee523a2206206994597c13d831ec7'

      expect(isValidEVMAddress(valid)).toBe(true)
    })

    it('0xプレフィックスなしのアドレスを拒否する', () => {
      const invalid = '742d35Cc6634C0532925a3b844Bc9e7595f0bEb'

      expect(isValidEVMAddress(invalid)).toBe(false)
    })

    it('長さが不正なアドレスを拒否する（短い）', () => {
      const invalid = '0x742d35Cc'

      expect(isValidEVMAddress(invalid)).toBe(false)
    })

    it('長さが不正なアドレスを拒否する（長い）', () => {
      const invalid = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb123'

      expect(isValidEVMAddress(invalid)).toBe(false)
    })

    it('16進数以外の文字を含むアドレスを拒否する', () => {
      const invalid = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbG'

      expect(isValidEVMAddress(invalid)).toBe(false)
    })

    it('空文字列のアドレスを拒否する', () => {
      expect(isValidEVMAddress('')).toBe(false)
    })
  })

  describe('isValidEVMAsset', () => {
    it('有効なethereum-ETHの組み合わせを検証する', () => {
      expect(isValidEVMAsset('ethereum', 'ETH')).toBe(true)
    })

    it('有効なethereum-USDTの組み合わせを検証する', () => {
      expect(isValidEVMAsset('ethereum', 'USDT')).toBe(true)
    })

    it('有効なsepolia-ETHの組み合わせを検証する', () => {
      expect(isValidEVMAsset('sepolia', 'ETH')).toBe(true)
    })

    it('有効なsepolia-USDTの組み合わせを検証する', () => {
      expect(isValidEVMAsset('sepolia', 'USDT')).toBe(true)
    })

    it('無効なネットワークを拒否する', () => {
      expect(isValidEVMAsset('polygon', 'ETH')).toBe(false)
    })

    it('無効なアセットを拒否する', () => {
      expect(isValidEVMAsset('ethereum', 'BTC')).toBe(false)
    })
  })

  describe('getEVMNetworkConfig', () => {
    it('ethereum mainnetの設定を返す', () => {
      const config = getEVMNetworkConfig('ethereum')

      expect(config.chainId).toBe(1)
      expect(config.name).toBe('Ethereum Mainnet')
      expect(config.explorerUrl).toBe('https://etherscan.io')
    })

    it('sepolia testnetの設定を返す', () => {
      const config = getEVMNetworkConfig('sepolia')

      expect(config.chainId).toBe(11155111)
      expect(config.name).toBe('Sepolia Testnet')
      expect(config.explorerUrl).toBe('https://sepolia.etherscan.io')
    })

    it('ネットワーク設定にnativeCurrencyが含まれる', () => {
      const config = getEVMNetworkConfig('ethereum')

      expect(config.nativeCurrency).toBeDefined()
      expect(config.nativeCurrency.symbol).toBe('ETH')
      expect(config.nativeCurrency.decimals).toBe(18)
    })
  })

  describe('getEVMAssetConfig', () => {
    it('ethereum ETHの設定を返す', () => {
      const config = getEVMAssetConfig('ethereum', 'ETH')

      expect(config).toBeDefined()
      expect(config?.asset).toBe('ETH')
      expect(config?.network).toBe('ethereum')
      expect(config?.decimals).toBe(18)
    })

    it('ethereum USDTの設定を返す', () => {
      const config = getEVMAssetConfig('ethereum', 'USDT')

      expect(config).toBeDefined()
      expect(config?.asset).toBe('USDT')
      expect(config?.contractAddress).toBeDefined()
      expect(config?.decimals).toBe(6)
    })

    it('存在しないネットワーク-アセットの組み合わせでundefinedを返す', () => {
      const config = getEVMAssetConfig('ethereum', 'BTC' as 'ETH' | 'USDT')

      expect(config).toBeUndefined()
    })
  })

  describe('getEVMTransactionUrl', () => {
    it('ethereum mainnetのトランザクションURLを生成する', () => {
      const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const url = getEVMTransactionUrl('ethereum', txHash)

      expect(url).toBe('https://etherscan.io/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
    })

    it('sepolia testnetのトランザクションURLを生成する', () => {
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      const url = getEVMTransactionUrl('sepolia', txHash)

      expect(url).toBe('https://sepolia.etherscan.io/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
    })
  })

  describe('getEVMAddressUrl', () => {
    it('ethereum mainnetのアドレスURLを生成する', () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      const url = getEVMAddressUrl('ethereum', address)

      expect(url).toBe('https://etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')
    })

    it('sepolia testnetのアドレスURLを生成する', () => {
      const address = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
      const url = getEVMAddressUrl('sepolia', address)

      expect(url).toBe('https://sepolia.etherscan.io/address/0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')
    })
  })

  describe('encryptEVMPrivateKey', () => {
    it('秘密鍵を暗号化する', () => {
      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      const encrypted = encryptEVMPrivateKey(privateKey)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toBe(privateKey)
    })

    it('暗号化結果にURL安全な文字のみを含む', () => {
      const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      const encrypted = encryptEVMPrivateKey(privateKey)

      expect(encrypted).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('同じ秘密鍵とキーで同じ暗号化結果を返す', () => {
      const privateKey = '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba'
      const encrypted1 = encryptEVMPrivateKey(privateKey)
      const encrypted2 = encryptEVMPrivateKey(privateKey)

      expect(encrypted1).toBe(encrypted2)
    })

    it('WALLET_ENCRYPTION_KEYが設定されていない場合エラーをthrowする', () => {
      delete process.env.WALLET_ENCRYPTION_KEY

      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

      expect(() => {
        encryptEVMPrivateKey(privateKey)
      }).toThrow('WALLET_ENCRYPTION_KEY環境変数が設定されていません')
    })
  })

  describe('meetsMinimumDeposit', () => {
    it('ETHの最小入金額（0.01）を満たす', () => {
      expect(meetsMinimumDeposit(0.01, 'ETH')).toBe(true)
      expect(meetsMinimumDeposit(0.1, 'ETH')).toBe(true)
      expect(meetsMinimumDeposit(1.0, 'ETH')).toBe(true)
    })

    it('ETHの最小入金額を満たさない', () => {
      expect(meetsMinimumDeposit(0.009, 'ETH')).toBe(false)
      expect(meetsMinimumDeposit(0.001, 'ETH')).toBe(false)
    })

    it('USDTの最小入金額（1.0）を満たす', () => {
      expect(meetsMinimumDeposit(1.0, 'USDT')).toBe(true)
      expect(meetsMinimumDeposit(10.0, 'USDT')).toBe(true)
      expect(meetsMinimumDeposit(100.0, 'USDT')).toBe(true)
    })

    it('USDTの最小入金額を満たさない', () => {
      expect(meetsMinimumDeposit(0.99, 'USDT')).toBe(false)
      expect(meetsMinimumDeposit(0.5, 'USDT')).toBe(false)
    })
  })

  describe('getRequiredConfirmations', () => {
    it('ethereum mainnetで12確認を返す', () => {
      expect(getRequiredConfirmations('ethereum')).toBe(12)
    })

    it('sepolia testnetで3確認を返す', () => {
      expect(getRequiredConfirmations('sepolia')).toBe(3)
    })
  })
})
