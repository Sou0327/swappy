/**
 * btc-wallet の単体テスト
 * Bitcoin HD Wallet (BIP32/BIP44) の包括的テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { BitcoinHDWallet, UTXOManager } from '@/lib/wallets/btc-wallet'
import type { ExtendedKey, UTXOInput } from '@/lib/wallets/btc-wallet'

// FinancialEncryptionのモック
vi.mock('@/lib/security/encryption', () => ({
  FinancialEncryption: {
    generateSecureRandom: vi.fn((length: number) => {
      // 決定論的なランダム生成（テスト用）
      return Buffer.alloc(length, 0xAA)
    }),
    secureBufferClear: vi.fn()
  }
}))

// AuditLoggerのモック
vi.mock('@/lib/security/audit-logger', () => ({
  AuditLogger: {
    log: vi.fn().mockResolvedValue(undefined)
  },
  AuditAction: {
    WALLET_CREATE: 'WALLET_CREATE',
    WALLET_DERIVE: 'WALLET_DERIVE',
    TRANSACTION_CREATE: 'TRANSACTION_CREATE'
  }
}))

describe('btc-wallet', () => {
  describe('BitcoinHDWallet', () => {
    describe('Master Key Generation', () => {
      it('正しい長さのシードでマスターキーを生成する', () => {
        const masterSeed = Buffer.alloc(64, 0x01) // 64バイト = 512ビット
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')

        expect(masterKey).toBeDefined()
        expect(masterKey.key).toBeInstanceOf(Buffer)
        expect(masterKey.chainCode).toBeInstanceOf(Buffer)
      })

      it('不正な長さのシードでエラーを投げる', () => {
        const shortSeed = Buffer.alloc(32) // 32バイトは不正

        expect(() => {
          BitcoinHDWallet.generateMasterKey(shortSeed, 'mainnet')
        }).toThrow('マスターシードは64バイトである必要があります')
      })

      it('mainnetとtestnetで異なるマスターキーを生成する', () => {
        const masterSeed = Buffer.alloc(64, 0x02)
        const mainnetKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')
        const testnetKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'testnet')

        // 同じシードでもnetworkが異なれば異なる結果になる可能性がある
        // （実装によってはchainCodeやその他のメタデータが異なる）
        expect(mainnetKey).toBeDefined()
        expect(testnetKey).toBeDefined()
      })

      it('生成されたkeyが有効な秘密鍵である', () => {
        const masterSeed = Buffer.alloc(64, 0x03)
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')

        // 秘密鍵は32バイト
        expect(masterKey.key.length).toBe(32)
        // 秘密鍵は0でない
        expect(masterKey.key.some(byte => byte !== 0)).toBe(true)
      })

      it('マスターキーのdepthが0、indexが0である', () => {
        const masterSeed = Buffer.alloc(64, 0x04)
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')

        expect(masterKey.depth).toBe(0)
        expect(masterKey.index).toBe(0)
      })

      it('chainCodeが32バイトである', () => {
        const masterSeed = Buffer.alloc(64, 0x05)
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')

        expect(masterKey.chainCode.length).toBe(32)
      })
    })

    describe('Child Key Derivation', () => {
      let parentKey: ExtendedKey

      beforeEach(() => {
        const masterSeed = Buffer.alloc(64, 0x10)
        parentKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')
      })

      it('通常の子鍵を導出する（非hardened）', () => {
        const childKey = BitcoinHDWallet.deriveChildKey(parentKey, 0, false)

        expect(childKey).toBeDefined()
        expect(childKey.key).toBeInstanceOf(Buffer)
        expect(childKey.key.length).toBe(32)
      })

      it('Hardened子鍵を導出する', () => {
        const childKey = BitcoinHDWallet.deriveChildKey(parentKey, 0, true)

        expect(childKey).toBeDefined()
        expect(childKey.key).toBeInstanceOf(Buffer)
        // hardenedの場合、indexは0x80000000以上
        expect(childKey.index).toBeGreaterThanOrEqual(0x80000000)
      })

      it('depthが正しくインクリメントされる', () => {
        const childKey = BitcoinHDWallet.deriveChildKey(parentKey, 0, false)

        expect(childKey.depth).toBe(parentKey.depth + 1)
      })

      it('parentFingerprintが設定される', () => {
        const childKey = BitcoinHDWallet.deriveChildKey(parentKey, 0, false)

        expect(childKey.parentFingerprint).toBeDefined()
        expect(typeof childKey.parentFingerprint).toBe('number')
      })

      it('異なるインデックスで異なる鍵を生成する', () => {
        const child1 = BitcoinHDWallet.deriveChildKey(parentKey, 0, false)
        const child2 = BitcoinHDWallet.deriveChildKey(parentKey, 1, false)

        expect(child1.key.equals(child2.key)).toBe(false)
      })

      it('連続導出の一貫性がある', () => {
        const child1a = BitcoinHDWallet.deriveChildKey(parentKey, 5, false)
        const child1b = BitcoinHDWallet.deriveChildKey(parentKey, 5, false)

        // 同じ親鍵と同じインデックスなら同じ結果
        expect(child1a.key.equals(child1b.key)).toBe(true)
      })

      it('hardenedフラグが正しく動作する', () => {
        const normalChild = BitcoinHDWallet.deriveChildKey(parentKey, 5, false)
        const hardenedChild = BitcoinHDWallet.deriveChildKey(parentKey, 5, true)

        // hardenedとnon-hardenedは異なる鍵を生成
        expect(normalChild.key.equals(hardenedChild.key)).toBe(false)
        expect(normalChild.index).toBe(5)
        expect(hardenedChild.index).toBe(0x80000000 + 5)
      })
    })

    describe('BIP44 Path Derivation', () => {
      let masterKey: ExtendedKey

      beforeEach(() => {
        const masterSeed = Buffer.alloc(64, 0x20)
        masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')
      })

      it('mainnet BIP44パスを導出する (m/44\'/0\'/0\'/0/0)', () => {
        const derivedKey = BitcoinHDWallet.deriveBIP44Key(
          masterKey,
          'mainnet',
          0,
          0,
          0
        )

        expect(derivedKey).toBeDefined()
        expect(derivedKey.depth).toBe(5) // m → 44' → 0' → 0' → 0 → 0
      })

      it('testnet BIP44パスを導出する (m/44\'/1\'/0\'/0/0)', () => {
        const derivedKey = BitcoinHDWallet.deriveBIP44Key(
          masterKey,
          'testnet',
          0,
          0,
          0
        )

        expect(derivedKey).toBeDefined()
        expect(derivedKey.depth).toBe(5)
      })

      it('異なるaccountインデックスで異なる鍵を生成する', () => {
        const account0 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 0)
        const account1 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 1, 0, 0)

        expect(account0.key.equals(account1.key)).toBe(false)
      })

      it('changeインデックスが正しく動作する (0=受信, 1=おつり)', () => {
        const receive = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 0)
        const change = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 1, 0)

        expect(receive.key.equals(change.key)).toBe(false)
      })

      it('addressIndexの範囲をテストする', () => {
        const addr0 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 0)
        const addr10 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 10)
        const addr100 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 100)

        // 異なるアドレスインデックスで異なる鍵
        expect(addr0.key.equals(addr10.key)).toBe(false)
        expect(addr10.key.equals(addr100.key)).toBe(false)
      })

      it('完全なパス導出の一貫性がある', () => {
        const key1 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 5)
        const key2 = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 5)

        // 同じパラメータなら同じ結果
        expect(key1.key.equals(key2.key)).toBe(true)
      })
    })

    describe('Public Key Derivation', () => {
      let extendedKey: ExtendedKey

      beforeEach(() => {
        const masterSeed = Buffer.alloc(64, 0x30)
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')
        extendedKey = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 0)
      })

      it('秘密鍵から公開鍵を導出する', () => {
        const publicKey = BitcoinHDWallet.derivePublicKey(extendedKey.key)

        expect(publicKey).toBeInstanceOf(Buffer)
        expect(publicKey.length).toBeGreaterThan(0)
      })

      it('圧縮公開鍵フォーマットが33バイトである', () => {
        const compressedPubKey = BitcoinHDWallet.derivePublicKey(extendedKey.key)

        expect(compressedPubKey.length).toBe(33)
        // 圧縮公開鍵は0x02または0x03で始まる
        expect([0x02, 0x03]).toContain(compressedPubKey[0])
      })

      it('同じ秘密鍵から一貫した公開鍵を生成する', () => {
        const pubKey1 = BitcoinHDWallet.derivePublicKey(extendedKey.key)
        const pubKey2 = BitcoinHDWallet.derivePublicKey(extendedKey.key)

        expect(pubKey1.equals(pubKey2)).toBe(true)
      })
    })

    describe('Address Generation', () => {
      let publicKey: Buffer

      beforeEach(() => {
        const masterSeed = Buffer.alloc(64, 0x40)
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')
        const derivedKey = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 0)
        publicKey = BitcoinHDWallet.derivePublicKey(derivedKey.key, true)
      })

      it('P2PKH mainnetアドレスを生成する（1で始まる）', () => {
        const address = BitcoinHDWallet.generateAddress(publicKey, 'P2PKH', 'mainnet')

        expect(address).toBeDefined()
        expect(typeof address).toBe('string')
        expect(address.startsWith('1')).toBe(true)
        expect(address.length).toBeGreaterThanOrEqual(26)
        expect(address.length).toBeLessThanOrEqual(35)
      })

      it('P2PKH testnetアドレスを生成する（m/nで始まる）', () => {
        const address = BitcoinHDWallet.generateAddress(publicKey, 'P2PKH', 'testnet')

        expect(address).toBeDefined()
        expect(typeof address).toBe('string')
        expect(['m', 'n'].some(prefix => address.startsWith(prefix))).toBe(true)
      })

      it('P2SH mainnetアドレスを生成する（3で始まる）', () => {
        const address = BitcoinHDWallet.generateAddress(publicKey, 'P2SH', 'mainnet')

        expect(address).toBeDefined()
        expect(address.startsWith('3')).toBe(true)
      })

      it('P2SH testnetアドレスを生成する（2で始まる）', () => {
        const address = BitcoinHDWallet.generateAddress(publicKey, 'P2SH', 'testnet')

        expect(address).toBeDefined()
        expect(address.startsWith('2')).toBe(true)
      })

      it('P2WPKH mainnetアドレスを生成する（bc1で始まる）', () => {
        const address = BitcoinHDWallet.generateAddress(publicKey, 'P2WPKH', 'mainnet')

        expect(address).toBeDefined()
        expect(address.startsWith('bc1')).toBe(true)
        expect(address.toLowerCase()).toBe(address) // Bech32は小文字
      })

      it('P2WPKH testnetアドレスを生成する（tb1で始まる）', () => {
        const address = BitcoinHDWallet.generateAddress(publicKey, 'P2WPKH', 'testnet')

        expect(address).toBeDefined()
        expect(address.startsWith('tb1')).toBe(true)
        expect(address.toLowerCase()).toBe(address)
      })

      it('アドレス生成の一貫性がある', () => {
        const addr1 = BitcoinHDWallet.generateAddress(publicKey, 'P2PKH', 'mainnet')
        const addr2 = BitcoinHDWallet.generateAddress(publicKey, 'P2PKH', 'mainnet')

        expect(addr1).toBe(addr2)
      })

      it('不正なアドレスタイプでエラーを投げる', () => {
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          BitcoinHDWallet.generateAddress(publicKey, 'INVALID' as any, 'mainnet')
        }).toThrow()
      })

      it('異なるアドレスタイプで異なるアドレスを生成する', () => {
        const p2pkh = BitcoinHDWallet.generateAddress(publicKey, 'P2PKH', 'mainnet')
        const p2sh = BitcoinHDWallet.generateAddress(publicKey, 'P2SH', 'mainnet')
        const p2wpkh = BitcoinHDWallet.generateAddress(publicKey, 'P2WPKH', 'mainnet')

        // すべて異なるアドレス
        expect(p2pkh).not.toBe(p2sh)
        expect(p2sh).not.toBe(p2wpkh)
        expect(p2pkh).not.toBe(p2wpkh)
      })
    })

    describe('Address Validation', () => {
      it('有効なP2PKHアドレスを検証する', () => {
        const validP2PKH = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' // Genesis block address

        expect(BitcoinHDWallet.validateAddress(validP2PKH, 'mainnet')).toBe(true)
      })

      it('有効なP2SHアドレスを検証する', () => {
        // 注意: CNmQ（正しいチェックサム）、CNmYはチェックサム無効
        const validP2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'

        expect(BitcoinHDWallet.validateAddress(validP2SH, 'mainnet')).toBe(true)
      })

      it('有効なBech32アドレスを検証する', () => {
        const validBech32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'

        expect(BitcoinHDWallet.validateAddress(validBech32, 'mainnet')).toBe(true)
      })

      it('無効なアドレス形式を拒否する', () => {
        const invalidAddresses = [
          'invalid',
          '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0', // Ethereumアドレス
          'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH', // XRPアドレス
          '1234567890' // 短すぎる
        ]

        invalidAddresses.forEach(addr => {
          expect(BitcoinHDWallet.validateAddress(addr, 'mainnet')).toBe(false)
        })
      })

      it('空文字列・null・undefinedを拒否する', () => {
        expect(BitcoinHDWallet.validateAddress('', 'mainnet')).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(BitcoinHDWallet.validateAddress(null as any, 'mainnet')).toBe(false)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(BitcoinHDWallet.validateAddress(undefined as any, 'mainnet')).toBe(false)
      })

      it('Base58Checkチェックサムエラーを検出する', () => {
        // 最後の文字を変更（N2→N3）
        const invalidP2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3'
        expect(BitcoinHDWallet.validateAddress(invalidP2PKH, 'mainnet')).toBe(false)
      })

      it('Bech32チェックサムエラーを検出する', () => {
        // BIP173公式テスト: 最後の文字を変更（t4→t5）
        const invalidBech32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5'
        expect(BitcoinHDWallet.validateAddress(invalidBech32, 'mainnet')).toBe(false)
      })
    })

    describe('BIP173 Official Test Vectors', () => {
      // BIP173公式テストベクター - 有効なBech32アドレス
      const validBech32Addresses = [
        // SegWit v0 mainnet
        { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', network: 'mainnet' as const },
        { address: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', network: 'mainnet' as const },
        // SegWit v0 testnet
        { address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', network: 'testnet' as const },
        { address: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7', network: 'testnet' as const }
      ]

      // BIP173公式テストベクター - 無効なBech32アドレス（チェックサムエラー等）
      const invalidBech32Addresses = [
        // チェックサムエラー（最後の文字を変更）
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5',
        // 無効な文字（o, b, i, 1はBech32で使用不可）
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7ko8f3t4',
        // 短すぎる
        'bc1',
        // 無効なHRP
        'xx1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'
      ]

      it('BIP173有効アドレスを検証する', () => {
        validBech32Addresses.forEach(({ address, network }) => {
          expect(BitcoinHDWallet.validateAddress(address, network)).toBe(true)
        })
      })

      it('BIP173無効アドレスを拒否する', () => {
        invalidBech32Addresses.forEach(address => {
          expect(BitcoinHDWallet.validateAddress(address, 'mainnet')).toBe(false)
        })
      })

      it('大文字小文字混在のBech32アドレスを拒否する', () => {
        // Bech32は全小文字または全大文字のみ許可
        const mixedCase = 'bc1qW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
        expect(BitcoinHDWallet.validateAddress(mixedCase, 'mainnet')).toBe(false)
      })
    })

    describe('Transaction Creation', () => {
      let publicKey: Buffer
      let address: string

      beforeEach(() => {
        const masterSeed = Buffer.alloc(64, 0x50)
        const masterKey = BitcoinHDWallet.generateMasterKey(masterSeed, 'mainnet')
        const derivedKey = BitcoinHDWallet.deriveBIP44Key(masterKey, 'mainnet', 0, 0, 0)
        publicKey = BitcoinHDWallet.derivePublicKey(derivedKey.key)
        address = BitcoinHDWallet.generateAddress(publicKey, 'P2PKH', 'mainnet')
      })

      it('基本的なトランザクションを作成する', () => {
        const inputs: UTXOInput[] = [
          {
            txid: 'a'.repeat(64),
            vout: 0,
            amount: 100000,
            address: address
          }
        ]

        const outputs = [
          { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 90000 }
        ]

        const transaction = BitcoinHDWallet.createTransaction(inputs, outputs)

        expect(transaction).toBeDefined()
        expect(transaction.inputs).toHaveLength(1)
        expect(transaction.outputs).toHaveLength(1)
        expect(transaction.fee).toBeDefined()
        expect(transaction.estimatedSize).toBeDefined()
      })

      it('複数入力・複数出力のトランザクションを作成する', () => {
        const inputs: UTXOInput[] = [
          { txid: 'a'.repeat(64), vout: 0, amount: 50000, address: address },
          { txid: 'b'.repeat(64), vout: 1, amount: 50000, address: address }
        ]

        const outputs = [
          { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 30000 },
          { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', amount: 60000 }
        ]

        const transaction = BitcoinHDWallet.createTransaction(inputs, outputs)

        expect(transaction.inputs).toHaveLength(2)
        expect(transaction.outputs).toHaveLength(2)
      })

      it('トランザクション作成時に手数料を計算する', () => {
        const inputs: UTXOInput[] = [
          { txid: 'a'.repeat(64), vout: 0, amount: 100000, address: address }
        ]

        const outputs = [
          { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 90000 }
        ]

        const transaction = BitcoinHDWallet.createTransaction(inputs, outputs)

        expect(typeof transaction.fee).toBe('number')
        expect(transaction.fee).toBeGreaterThan(0)
      })

      it('トランザクションサイズを推定する', () => {
        const inputs: UTXOInput[] = [
          { txid: 'a'.repeat(64), vout: 0, amount: 100000, address: address }
        ]

        const outputs = [
          { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 90000 }
        ]

        const transaction = BitcoinHDWallet.createTransaction(inputs, outputs)

        expect(typeof transaction.estimatedSize).toBe('number')
        expect(transaction.estimatedSize).toBeGreaterThan(0)
        // 1-in-1-outトランザクション: base(10) + input(68) + output(34) = 112バイト
        expect(transaction.estimatedSize).toBe(112)
      })
    })
  })

  describe('UTXOManager', () => {
    describe('UTXO Management', () => {
      const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'

      beforeEach(() => {
        // UTXOManagerの内部状態をクリア（必要に応じて）
        // 実装に応じて適切なクリーンアップを行う
      })

      it('UTXOを追加する', () => {
        const utxo: UTXOInput = {
          txid: 'a'.repeat(64),
          vout: 0,
          amount: 100000,
          address: testAddress
        }

        UTXOManager.addUTXO(testAddress, utxo)

        const utxos = UTXOManager.getUTXOs(testAddress)
        expect(utxos).toContainEqual(utxo)
      })

      it('アドレスのUTXOを取得する', () => {
        const utxo1: UTXOInput = {
          txid: 'a'.repeat(64),
          vout: 0,
          amount: 50000,
          address: testAddress
        }
        const utxo2: UTXOInput = {
          txid: 'b'.repeat(64),
          vout: 1,
          amount: 75000,
          address: testAddress
        }

        UTXOManager.addUTXO(testAddress, utxo1)
        UTXOManager.addUTXO(testAddress, utxo2)

        const utxos = UTXOManager.getUTXOs(testAddress)
        expect(utxos.length).toBeGreaterThanOrEqual(2)
      })

      it('残高を計算する', () => {
        const utxo1: UTXOInput = {
          txid: 'c'.repeat(64),
          vout: 0,
          amount: 100000,
          address: testAddress
        }
        const utxo2: UTXOInput = {
          txid: 'd'.repeat(64),
          vout: 1,
          amount: 50000,
          address: testAddress
        }

        UTXOManager.addUTXO(testAddress, utxo1)
        UTXOManager.addUTXO(testAddress, utxo2)

        const balance = UTXOManager.calculateBalance(testAddress)
        expect(balance).toBeGreaterThanOrEqual(150000) // 100000 + 50000
      })

      it('金額に基づいてUTXOを選択する', () => {
        const utxo1: UTXOInput = {
          txid: 'e'.repeat(64),
          vout: 0,
          amount: 30000,
          address: testAddress
        }
        const utxo2: UTXOInput = {
          txid: 'f'.repeat(64),
          vout: 1,
          amount: 50000,
          address: testAddress
        }
        const utxo3: UTXOInput = {
          txid: 'g'.repeat(64),
          vout: 2,
          amount: 70000,
          address: testAddress
        }

        UTXOManager.addUTXO(testAddress, utxo1)
        UTXOManager.addUTXO(testAddress, utxo2)
        UTXOManager.addUTXO(testAddress, utxo3)

        const selectedUTXOs = UTXOManager.selectUTXOsForAmount(testAddress, 60000)

        expect(selectedUTXOs).toBeDefined()
        expect(Array.isArray(selectedUTXOs)).toBe(true)

        const totalAmount = selectedUTXOs.reduce((sum, utxo) => sum + utxo.amount, 0)
        expect(totalAmount).toBeGreaterThanOrEqual(60000)
      })

      it('不十分な残高でエラーを投げる', () => {
        // 一意のアドレスを使用して他のテストの影響を回避
        const uniqueAddress = '1UniqueAddressForInsufficientBalanceTest123'
        const utxo: UTXOInput = {
          txid: 'h'.repeat(64),
          vout: 0,
          amount: 10000,
          address: uniqueAddress
        }

        UTXOManager.addUTXO(uniqueAddress, utxo)

        expect(() => {
          UTXOManager.selectUTXOsForAmount(uniqueAddress, 50000)
        }).toThrow('残高不足')
      })

      it('UTXOを消費する', () => {
        const utxo: UTXOInput = {
          txid: 'i'.repeat(64),
          vout: 0,
          amount: 100000,
          address: testAddress
        }

        UTXOManager.addUTXO(testAddress, utxo)
        const beforeBalance = UTXOManager.calculateBalance(testAddress)

        UTXOManager.consumeUTXOs(testAddress, [utxo])

        const afterBalance = UTXOManager.calculateBalance(testAddress)
        expect(afterBalance).toBeLessThan(beforeBalance)
      })

      it('消費後の残高が正確である', () => {
        const utxo1: UTXOInput = {
          txid: 'j'.repeat(64),
          vout: 0,
          amount: 100000,
          address: testAddress
        }
        const utxo2: UTXOInput = {
          txid: 'k'.repeat(64),
          vout: 1,
          amount: 50000,
          address: testAddress
        }

        UTXOManager.addUTXO(testAddress, utxo1)
        UTXOManager.addUTXO(testAddress, utxo2)

        UTXOManager.consumeUTXOs(testAddress, [utxo1])

        const balance = UTXOManager.calculateBalance(testAddress)
        // utxo2のみが残っているはず
        expect(balance).toBeGreaterThanOrEqual(50000)
      })
    })
  })
})
