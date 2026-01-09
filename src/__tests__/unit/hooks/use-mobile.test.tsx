/**
 * useIsMobile フックの単体テスト
 * レスポンシブデザインのモバイル検出機能テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '@/hooks/use-mobile'

describe('useIsMobile', () => {
  // matchMediaのモック
  let matchMediaMock: {
    matches: boolean
    media: string
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    addListener: ReturnType<typeof vi.fn> // 非推奨だが互換性のため
    removeListener: ReturnType<typeof vi.fn> // 非推奨だが互換性のため
    dispatchEvent: ReturnType<typeof vi.fn>
  }

  let listeners: Array<(event: MediaQueryListEvent | Record<string, never>) => void> = []

  beforeEach(() => {
    listeners = []

    matchMediaMock = {
      matches: false,
      media: '',
      addEventListener: vi.fn((event, listener) => {
        if (event === 'change') {
          listeners.push(listener)
        }
      }),
      removeEventListener: vi.fn((event, listener) => {
        if (event === 'change') {
          const index = listeners.indexOf(listener)
          if (index > -1) {
            listeners.splice(index, 1)
          }
        }
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => {
        matchMediaMock.media = query
        return matchMediaMock
      })
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('ウィンドウ幅768px未満の場合、trueを返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)
    })

    it('ウィンドウ幅768px以上の場合、falseを返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)
    })

    it('ウィンドウ幅が正確に767pxの場合、trueを返す（境界値）', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 767
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)
    })

    it('ウィンドウ幅が正確に768pxの場合、falseを返す（境界値）', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)
    })
  })

  describe('matchMedia設定', () => {
    it('正しいメディアクエリでmatchMediaを呼び出す', () => {
      renderHook(() => useIsMobile())

      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
    })

    it('changeイベントリスナーを登録する', () => {
      renderHook(() => useIsMobile())

      expect(matchMediaMock.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      )
    })
  })

  describe('リサイズ検出', () => {
    it('ウィンドウリサイズでモバイル→デスクトップに切り替わる', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)

      // ウィンドウ幅を変更
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 1024
        })

        // changeイベントを発火
        listeners.forEach(listener => listener({}))
      })

      expect(result.current).toBe(false)
    })

    it('ウィンドウリサイズでデスクトップ→モバイルに切り替わる', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)

      // ウィンドウ幅を変更
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 600
        })

        // changeイベントを発火
        listeners.forEach(listener => listener({}))
      })

      expect(result.current).toBe(true)
    })

    it('複数回のリサイズイベントに正しく応答する', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)

      // モバイルサイズに変更
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 500
        })
        listeners.forEach(listener => listener({}))
      })

      expect(result.current).toBe(true)

      // デスクトップサイズに戻す
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 1024
        })
        listeners.forEach(listener => listener({}))
      })

      expect(result.current).toBe(false)

      // 再度モバイルサイズに
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 400
        })
        listeners.forEach(listener => listener({}))
      })

      expect(result.current).toBe(true)
    })
  })

  describe('クリーンアップ', () => {
    it('アンマウント時にイベントリスナーを削除する', () => {
      const { unmount } = renderHook(() => useIsMobile())

      unmount()

      expect(matchMediaMock.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      )
    })

    it('アンマウント後のリサイズイベントは無視される', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })

      const { result, unmount } = renderHook(() => useIsMobile())

      const initialValue = result.current

      unmount()

      // アンマウント後にリサイズイベントを発火
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 500
        })
        listeners.forEach(listener => listener({}))
      })

      // 値は変わらない（unmount済みなのでresult.currentは最後の値を保持）
      expect(result.current).toBe(initialValue)
    })
  })

  describe('エッジケース', () => {
    it('非常に小さいウィンドウ幅（320px）でtrueを返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 320
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)
    })

    it('非常に大きいウィンドウ幅（2560px）でfalseを返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 2560
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)
    })

    it('0pxの場合でもクラッシュせずtrueを返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 0
      })

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)
    })
  })

  describe('複数インスタンス', () => {
    it('複数のフックインスタンスが同じ値を返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500
      })

      const { result: result1 } = renderHook(() => useIsMobile())
      const { result: result2 } = renderHook(() => useIsMobile())

      expect(result1.current).toBe(result2.current)
      expect(result1.current).toBe(true)
    })

    it('複数インスタンスが同時にリサイズイベントに応答する', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500
      })

      const { result: result1 } = renderHook(() => useIsMobile())
      const { result: result2 } = renderHook(() => useIsMobile())

      expect(result1.current).toBe(true)
      expect(result2.current).toBe(true)

      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 1024
        })
        listeners.forEach(listener => listener({}))
      })

      expect(result1.current).toBe(false)
      expect(result2.current).toBe(false)
    })
  })

  describe('Boolean変換', () => {
    it('undefinedからboolean値に変換される', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500
      })

      const { result } = renderHook(() => useIsMobile())

      // !!演算子でbooleanに変換されている
      expect(typeof result.current).toBe('boolean')
      expect(result.current).toBe(true)
    })

    it('falseの場合も確実にbooleanを返す', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024
      })

      const { result } = renderHook(() => useIsMobile())

      expect(typeof result.current).toBe('boolean')
      expect(result.current).toBe(false)
    })
  })
})
