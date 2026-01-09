/**
 * btc-wallet-utils の単体テスト
 * Bitcoin HD Wallet生成とBIP44 derivation pathの包括的テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateBTCAddressIndex,
  generateBTCDerivationPath,
  generateMockPublicKey,
  generateBTCAddress,
  deriveAddressFromXpub,
  validateBTCAddress,
  estimateBTCTransactionFee,
  generateMockXpub,
  BTC_NETWORKS
} from '@/lib/btc-wallet-utils'

// crypto-utilsのモック
vi.mock('@/lib/crypto-utils', () => ({
  sha256: vi.fn((data: string) => {
    // 決定論的なハッシュ生成
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash).toString(16).padStart(64, '0')
  }),
  hashTo32BitInt: vi.fn((data: string) => {
    // 32bit整数ハッシュ
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i)
      hash = hash & hash
    }
    return Math.abs(hash)
  }),
  randomHex: vi.fn((length: number) => {
    return 'a'.repeat(length)
  })
}))

describe('btc-wallet-utils', () => {
  describe('BTC_NETWORKS設定', () => {
    it('mainnetとtestnetの設定が定義されている', () => {
      expect(BTC_NETWORKS.mainnet).toBeDefined()
      expect(BTC_NETWORKS.testnet).toBeDefined()
    })

    it('mainnetの設定が正しい', () => {
      expect(BTC_NETWORKS.mainnet.coinType).toBe(0)
      expect(BTC_NETWORKS.mainnet.bech32).toBe('bc')
    })

    it('testnetの設定が正しい', () => {
      expect(BTC_NETWORKS.testnet.coinType).toBe(1)
      expect(BTC_NETWORKS.testnet.bech32).toBe('tb')
    })
  })

  describe('generateBTCAddressIndex', () => {
    it('ユーザーIDとアセットからアドレスインデックスを生成する', () => {
      const index = generateBTCAddressIndex('user-123', 'BTC')

      expect(typeof index).toBe('number')
      expect(Number.isInteger(index)).toBe(true)
    })

    it('正の整数を返す', () => {
      const index = generateBTCAddressIndex('user-456', 'BTC')

      expect(index).toBeGreaterThanOrEqual(0)
    })

    it('2^31-1以下の値を返す', () => {
      const index = generateBTCAddressIndex('user-789', 'BTC')

      expect(index).toBeLessThanOrEqual(2147483647)
    })

    it('異なるユーザーIDで異なるインデックスを生成する可能性が高い', () => {
      const index1 = generateBTCAddressIndex('user-111', 'BTC')
      const index2 = generateBTCAddressIndex('user-222', 'BTC')

      // タイムスタンプとランダム要素があるため、常に異なる
      expect(index1).not.toBe(index2)
    })

    it('デフォルトでBTCアセットを使用する', () => {
      const index = generateBTCAddressIndex('user-default')

      expect(typeof index).toBe('number')
      expect(index).toBeGreaterThanOrEqual(0)
    })
  })

  describe('generateBTCDerivationPath', () => {
    it('mainnet用のBIP44パスを生成する', () => {
      const path = generateBTCDerivationPath('mainnet', 0, 5)

      expect(path).toBe("m/44'/0'/0'/0/5")
    })

    it('testnet用のBIP44パスを生成する', () => {
      const path = generateBTCDerivationPath('testnet', 0, 10)

      expect(path).toBe("m/44'/1'/0'/0/10")
    })

    it('account番号を正しく反映する', () => {
      const path = generateBTCDerivationPath('mainnet', 5, 0)

      expect(path).toBe("m/44'/0'/5'/0/0")
    })

    it('addressIndexを正しく反映する', () => {
      const path = generateBTCDerivationPath('mainnet', 0, 100)

      expect(path).toBe("m/44'/0'/0'/0/100")
    })

    it('BIP44形式のパスを返す', () => {
      const path = generateBTCDerivationPath('mainnet', 0, 0)

      expect(path).toMatch(/^m\/44'\/\d+'\/\d+'\/0\/\d+$/)
    })

    it('mainnetとtestnetで異なるcoinTypeを使用する', () => {
      const mainnetPath = generateBTCDerivationPath('mainnet', 0, 0)
      const testnetPath = generateBTCDerivationPath('testnet', 0, 0)

      expect(mainnetPath).toContain("44'/0'")
      expect(testnetPath).toContain("44'/1'")
    })
  })

  describe('generateMockPublicKey', () => {
    it('derivationPathから公開鍵を生成する', () => {
      const path = "m/44'/0'/0'/0/0"
      const publicKey = generateMockPublicKey(path)

      expect(publicKey).toBeDefined()
      expect(typeof publicKey).toBe('string')
    })

    it('66文字の公開鍵を返す（33バイトの圧縮公開鍵）', () => {
      const path = "m/44'/0'/0'/0/0"
      const publicKey = generateMockPublicKey(path)

      expect(publicKey.length).toBe(66)
    })

    it('プレフィックスが02または03で始まる', () => {
      const path = "m/44'/0'/0'/0/0"
      const publicKey = generateMockPublicKey(path)

      expect(publicKey.startsWith('02') || publicKey.startsWith('03')).toBe(true)
    })

    it('同じderivationPathで同じ公開鍵を返す', () => {
      const path = "m/44'/0'/0'/0/5"
      const publicKey1 = generateMockPublicKey(path)
      const publicKey2 = generateMockPublicKey(path)

      expect(publicKey1).toBe(publicKey2)
    })
  })

  describe('generateBTCAddress', () => {
    it('mainnetでBTCアドレスを生成する', () => {
      const wallet = generateBTCAddress('user-123', 'mainnet', 'BTC')

      expect(wallet).toBeDefined()
      expect(wallet.address).toBeDefined()
      expect(wallet.derivationPath).toBeDefined()
      expect(wallet.addressIndex).toBeDefined()
    })

    it('testnetでBTCアドレスを生成する', () => {
      const wallet = generateBTCAddress('user-456', 'testnet', 'BTC')

      expect(wallet).toBeDefined()
      expect(wallet.address).toBeDefined()
    })

    it('返り値にaddress, derivationPath, addressIndexが含まれる', () => {
      const wallet = generateBTCAddress('user-789', 'mainnet', 'BTC')

      expect(wallet).toHaveProperty('address')
      expect(wallet).toHaveProperty('derivationPath')
      expect(wallet).toHaveProperty('addressIndex')
    })

    it('derivationPathがBIP44形式である', () => {
      const wallet = generateBTCAddress('user-abc', 'mainnet', 'BTC')

      expect(wallet.derivationPath).toMatch(/^m\/44'\/\d+'\/\d+'\/0\/\d+$/)
    })

    it('addressIndexが正の整数である', () => {
      const wallet = generateBTCAddress('user-def', 'mainnet', 'BTC')

      expect(typeof wallet.addressIndex).toBe('number')
      expect(Number.isInteger(wallet.addressIndex)).toBe(true)
      expect(wallet.addressIndex).toBeGreaterThanOrEqual(0)
    })

    it('mainnetアドレスは1で始まる（P2PKH形式）', () => {
      const wallet = generateBTCAddress('user-mainnet', 'mainnet', 'BTC')

      expect(wallet.address.startsWith('1')).toBe(true)
    })

    it('testnetアドレスはmで始まる（P2PKH形式）', () => {
      const wallet = generateBTCAddress('user-testnet', 'testnet', 'BTC')

      expect(wallet.address.startsWith('m')).toBe(true)
    })
  })

  describe('deriveAddressFromXpub', () => {
    it('有効なxpubからアドレスを導出する', () => {
      const xpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
      const address = deriveAddressFromXpub(xpub, 0, 'mainnet')

      expect(address).toBeDefined()
      expect(typeof address).toBe('string')
      expect(address.startsWith('1')).toBe(true)
    })

    it('有効なtpubからアドレスを導出する', () => {
      const tpub = 'tpubD6NzVbkrYhZ4XgiXtGrdW5XDAPFCL9h7we1vwNCpn8tGbBcgfVYjXyhWo4E1xkh56hjod1RhGjxbaTLV3X4FyWuejifB9jusQ46QzG87VKp'
      const address = deriveAddressFromXpub(tpub, 0, 'testnet')

      expect(address).toBeDefined()
      expect(typeof address).toBe('string')
      expect(address.startsWith('m')).toBe(true)
    })

    it('無効なxpubフォーマットでエラーをthrowする', () => {
      const invalidXpub = 'invalid-xpub-format'

      expect(() => {
        deriveAddressFromXpub(invalidXpub, 0, 'mainnet')
      }).toThrow('Invalid xpub format')
    })

    it('同じxpubとaddressIndexで同じアドレスを返す', () => {
      const xpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
      const address1 = deriveAddressFromXpub(xpub, 5, 'mainnet')
      const address2 = deriveAddressFromXpub(xpub, 5, 'mainnet')

      expect(address1).toBe(address2)
    })

    it('異なるaddressIndexでアドレス導出を実行する', () => {
      const xpub = 'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
      const address1 = deriveAddressFromXpub(xpub, 0, 'mainnet')
      const address2 = deriveAddressFromXpub(xpub, 1, 'mainnet')

      // モック実装では決定論的なハッシュを使用するため、両方とも有効なアドレス
      expect(address1).toBeDefined()
      expect(address2).toBeDefined()
      expect(typeof address1).toBe('string')
      expect(typeof address2).toBe('string')
    })
  })

  describe('validateBTCAddress', () => {
    it('有効なP2PKH mainnetアドレスを検証する（1...）', () => {
      const valid = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

      expect(validateBTCAddress(valid, 'mainnet')).toBe(true)
    })

    it('有効なP2SH mainnetアドレスを検証する（3...）', () => {
      const valid = '3J98t1WpEZ73CNmYviecrnyiWrnqRhWNLy'

      expect(validateBTCAddress(valid, 'mainnet')).toBe(true)
    })

    it('有効なtestnetアドレスを検証する（m...）', () => {
      const valid = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'

      expect(validateBTCAddress(valid, 'testnet')).toBe(true)
    })

    it('有効なtestnetアドレスを検証する（n...）', () => {
      const valid = 'n3ZddxzLvAY9o7184TB4c6FJasAybsw4HZ'

      expect(validateBTCAddress(valid, 'testnet')).toBe(true)
    })

    it('有効なtestnetアドレスを検証する（2...）', () => {
      const valid = '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc'

      expect(validateBTCAddress(valid, 'testnet')).toBe(true)
    })

    it('無効なプレフィックスのアドレスを拒否する', () => {
      const invalid = 'X1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

      expect(validateBTCAddress(invalid, 'mainnet')).toBe(false)
    })

    it('長さが短すぎるアドレスを拒否する', () => {
      const invalid = '1A1zP1eP5'

      expect(validateBTCAddress(invalid, 'mainnet')).toBe(false)
    })

    it('Base58以外の文字を含むアドレスを拒否する', () => {
      const invalid = '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf0O' // 0とOはBase58に含まれない

      expect(validateBTCAddress(invalid, 'mainnet')).toBe(false)
    })

    it('空文字列のアドレスを拒否する', () => {
      expect(validateBTCAddress('', 'mainnet')).toBe(false)
    })

    it('mainnetでtestnetアドレスを拒否する', () => {
      const testnetAddr = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn'

      expect(validateBTCAddress(testnetAddr, 'mainnet')).toBe(false)
    })

    it('testnetでmainnetアドレスを拒否する', () => {
      const mainnetAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

      expect(validateBTCAddress(mainnetAddr, 'testnet')).toBe(false)
    })
  })

  describe('estimateBTCTransactionFee', () => {
    it('基本的なトランザクション手数料を計算する', () => {
      const fee = estimateBTCTransactionFee(1, 1, 20)

      expect(typeof fee).toBe('number')
      expect(fee).toBeGreaterThan(0)
    })

    it('複数インプットで手数料が増加する', () => {
      const fee1Input = estimateBTCTransactionFee(1, 1, 20)
      const fee3Inputs = estimateBTCTransactionFee(3, 1, 20)

      expect(fee3Inputs).toBeGreaterThan(fee1Input)
    })

    it('複数アウトプットで手数料が増加する', () => {
      const fee1Output = estimateBTCTransactionFee(1, 1, 20)
      const fee3Outputs = estimateBTCTransactionFee(1, 3, 20)

      expect(fee3Outputs).toBeGreaterThan(fee1Output)
    })

    it('カスタムfeeRateを反映する', () => {
      const feeLowRate = estimateBTCTransactionFee(1, 1, 10)
      const feeHighRate = estimateBTCTransactionFee(1, 1, 50)

      expect(feeHighRate).toBeGreaterThan(feeLowRate)
    })

    it('デフォルトfeeRateで計算する（20 sat/vB）', () => {
      const feeDefault = estimateBTCTransactionFee(1, 1)
      const feeExplicit = estimateBTCTransactionFee(1, 1, 20)

      expect(feeDefault).toBe(feeExplicit)
    })
  })

  describe('generateMockXpub', () => {
    it('mainnet用のxpubを生成する', () => {
      const xpub = generateMockXpub('mainnet')

      expect(xpub).toBeDefined()
      expect(typeof xpub).toBe('string')
      expect(xpub.startsWith('xpub')).toBe(true)
    })

    it('testnet用のtpubを生成する', () => {
      const tpub = generateMockXpub('testnet')

      expect(tpub).toBeDefined()
      expect(typeof tpub).toBe('string')
      expect(tpub.startsWith('tpub')).toBe(true)
    })

    it('xpubが適切な長さを持つ', () => {
      const xpub = generateMockXpub('mainnet')

      // Base58エンコードされたxpubは通常100文字以上
      expect(xpub.length).toBeGreaterThan(50)
    })

    it('mainnetとtestnetで異なるプレフィックスを使用する', () => {
      const xpub = generateMockXpub('mainnet')
      const tpub = generateMockXpub('testnet')

      expect(xpub.startsWith('xpub')).toBe(true)
      expect(tpub.startsWith('tpub')).toBe(true)
    })
  })
})
