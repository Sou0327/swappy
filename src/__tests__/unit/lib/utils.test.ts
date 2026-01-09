/**
 * utils の単体テスト
 * Tailwind CSS クラス結合ユーティリティのテスト
 */

import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('utils', () => {
  describe('cn', () => {
    it('単一のクラス名を返す', () => {
      expect(cn('text-red-500')).toBe('text-red-500')
    })

    it('複数のクラス名を結合する', () => {
      const result = cn('text-red-500', 'bg-blue-500', 'p-4')

      expect(result).toContain('text-red-500')
      expect(result).toContain('bg-blue-500')
      expect(result).toContain('p-4')
    })

    it('条件付きクラスを処理する', () => {
      const isActive = true
      const result = cn('base-class', isActive && 'active-class')

      expect(result).toContain('base-class')
      expect(result).toContain('active-class')
    })

    it('falseの条件付きクラスを除外する', () => {
      const isActive = false
      const result = cn('base-class', isActive && 'active-class')

      expect(result).toContain('base-class')
      expect(result).not.toContain('active-class')
    })

    it('Tailwindの競合クラスを解決する', () => {
      // twMergeは後のクラスを優先する
      const result = cn('p-4', 'p-8')

      expect(result).toBe('p-8')
    })

    it('配列形式のクラスを処理する', () => {
      const result = cn(['text-red-500', 'bg-blue-500'])

      expect(result).toContain('text-red-500')
      expect(result).toContain('bg-blue-500')
    })

    it('オブジェクト形式のクラスを処理する', () => {
      const result = cn({
        'text-red-500': true,
        'bg-blue-500': false,
        'p-4': true
      })

      expect(result).toContain('text-red-500')
      expect(result).not.toContain('bg-blue-500')
      expect(result).toContain('p-4')
    })

    it('空の入力で空文字列を返す', () => {
      expect(cn()).toBe('')
    })

    it('undefined と null を無視する', () => {
      const result = cn('text-red-500', undefined, null, 'p-4')

      expect(result).toContain('text-red-500')
      expect(result).toContain('p-4')
    })

    it('複雑な組み合わせを処理する', () => {
      const isActive = true
      const result = cn(
        'base-class',
        ['array-class-1', 'array-class-2'],
        {
          'object-class-1': true,
          'object-class-2': false
        },
        isActive && 'conditional-class',
        'p-2',
        'p-4' // Tailwind競合
      )

      expect(result).toContain('base-class')
      expect(result).toContain('array-class-1')
      expect(result).toContain('array-class-2')
      expect(result).toContain('object-class-1')
      expect(result).not.toContain('object-class-2')
      expect(result).toContain('conditional-class')
      expect(result).toBe('base-class array-class-1 array-class-2 object-class-1 conditional-class p-4')
    })
  })
})
