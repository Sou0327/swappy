/**
 * crypto-utils の単体テスト
 * CryptoJSラッパー関数の包括的テスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sha256, hashTo32BitInt, randomHex } from '@/lib/crypto-utils'

// CryptoJSのモック
vi.mock('crypto-js', () => {
  const mockSHA256 = vi.fn((data: string) => ({
    toString: () => {
      // 決定論的なハッシュ生成（テスト用）
      let hash = 0
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i)
        hash = hash & hash
      }
      return Math.abs(hash).toString(16).padStart(64, '0')
    },
    words: [Math.abs(data.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))]
  }))

  const mockWordArray = {
    random: vi.fn((byteLength: number) => ({
      toString: () => {
        // 決定論的なランダム文字列生成（テスト用）
        return 'a'.repeat(byteLength * 2)
      }
    }))
  }

  return {
    default: {
      SHA256: mockSHA256,
      lib: {
        WordArray: mockWordArray
      }
    },
    SHA256: mockSHA256,
    lib: {
      WordArray: mockWordArray
    }
  }
})

describe('crypto-utils', () => {
  describe('sha256', () => {
    it('文字列からSHA256ハッシュを生成する', () => {
      const input = 'test-data'
      const hash = sha256(input)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    it('同じ入力に対して同じハッシュを返す', () => {
      const input = 'consistent-data'
      const hash1 = sha256(input)
      const hash2 = sha256(input)

      expect(hash1).toBe(hash2)
    })

    it('異なる入力に対して異なるハッシュを返す', () => {
      const hash1 = sha256('input1')
      const hash2 = sha256('input2')

      expect(hash1).not.toBe(hash2)
    })

    it('空文字列のハッシュを生成する', () => {
      const hash = sha256('')

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
    })

    it('長い文字列のハッシュを生成する', () => {
      const longString = 'a'.repeat(10000)
      const hash = sha256(longString)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
    })

    it('特殊文字を含む文字列のハッシュを生成する', () => {
      const input = 'test!@#$%^&*(){}[]|\\:";\'<>?,./'
      const hash = sha256(input)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
    })

    it('日本語文字列のハッシュを生成する', () => {
      const input = 'テストデータ123'
      const hash = sha256(input)

      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
    })
  })

  describe('hashTo32BitInt', () => {
    it('文字列から32bit整数ハッシュを生成する', () => {
      const input = 'test-data'
      const hash = hashTo32BitInt(input)

      expect(typeof hash).toBe('number')
      expect(Number.isInteger(hash)).toBe(true)
    })

    it('32bit整数の範囲内の値を返す', () => {
      const input = 'range-test'
      const hash = hashTo32BitInt(input)

      // 32bit整数の最大値: 2^31 - 1 = 2147483647
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(2147483647)
    })

    it('正の整数を返す', () => {
      const input = 'positive-test'
      const hash = hashTo32BitInt(input)

      expect(hash).toBeGreaterThanOrEqual(0)
    })

    it('同じ入力に対して同じハッシュを返す', () => {
      const input = 'consistent'
      const hash1 = hashTo32BitInt(input)
      const hash2 = hashTo32BitInt(input)

      expect(hash1).toBe(hash2)
    })

    it('異なる入力に対して異なるハッシュを返す', () => {
      const hash1 = hashTo32BitInt('input1')
      const hash2 = hashTo32BitInt('input2')

      expect(hash1).not.toBe(hash2)
    })

    it('空文字列から整数ハッシュを生成する', () => {
      const hash = hashTo32BitInt('')

      expect(typeof hash).toBe('number')
      expect(Number.isInteger(hash)).toBe(true)
      expect(hash).toBeGreaterThanOrEqual(0)
    })
  })

  describe('randomHex', () => {
    it('指定された長さの16進文字列を生成する', () => {
      const length = 32
      const hex = randomHex(length)

      expect(hex).toBeDefined()
      expect(typeof hex).toBe('string')
      expect(hex.length).toBe(length)
    })

    it('16進文字のみを含む文字列を生成する', () => {
      const hex = randomHex(64)

      expect(hex).toMatch(/^[a-f0-9]+$/i)
    })

    it('短い長さの16進文字列を生成する', () => {
      const length = 8
      const hex = randomHex(length)

      expect(hex.length).toBe(length)
      expect(hex).toMatch(/^[a-f0-9]+$/i)
    })

    it('長い16進文字列を生成する', () => {
      const length = 256
      const hex = randomHex(length)

      expect(hex.length).toBe(length)
      expect(hex).toMatch(/^[a-f0-9]+$/i)
    })

    it('奇数長の16進文字列を生成する', () => {
      const length = 33
      const hex = randomHex(length)

      expect(hex.length).toBe(length)
      expect(hex).toMatch(/^[a-f0-9]+$/i)
    })

    it('1文字の16進文字列を生成する', () => {
      const length = 1
      const hex = randomHex(length)

      expect(hex.length).toBe(length)
      expect(hex).toMatch(/^[a-f0-9]$/i)
    })
  })
})
