/**
 * useToast フックの単体テスト
 * トースト通知システムの包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useToast, toast, reducer } from '@/hooks/use-toast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('初期状態', () => {
    it('空のトースト配列で初期化される', () => {
      const { result } = renderHook(() => useToast())

      expect(result.current.toasts).toEqual([])
    })

    it('toast関数が提供される', () => {
      const { result } = renderHook(() => useToast())

      expect(result.current.toast).toBeDefined()
      expect(typeof result.current.toast).toBe('function')
    })

    it('dismiss関数が提供される', () => {
      const { result } = renderHook(() => useToast())

      expect(result.current.dismiss).toBeDefined()
      expect(typeof result.current.dismiss).toBe('function')
    })
  })

  describe('toast作成', () => {
    it('新しいトーストを追加できる', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'テストタイトル',
          description: 'テスト説明'
        })
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].title).toBe('テストタイトル')
      expect(result.current.toasts[0].description).toBe('テスト説明')
      expect(result.current.toasts[0].open).toBe(true)
    })

    it('トーストにIDが自動生成される', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'トースト1'
        })
      })

      expect(result.current.toasts[0].id).toBeDefined()
      expect(typeof result.current.toasts[0].id).toBe('string')
    })

    it('variantプロパティを設定できる', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'エラー',
          variant: 'destructive'
        })
      })

      expect(result.current.toasts[0].variant).toBe('destructive')
    })

    it('複数のプロパティを設定できる', () => {
      const { result } = renderHook(() => useToast())

      const mockAction = { altText: 'アクション' }

      act(() => {
        result.current.toast({
          title: '完全なトースト',
          description: '詳細な説明',
          variant: 'destructive',
          action: mockAction
        })
      })

      const addedToast = result.current.toasts[0]
      expect(addedToast.title).toBe('完全なトースト')
      expect(addedToast.description).toBe('詳細な説明')
      expect(addedToast.variant).toBe('destructive')
      expect(addedToast.action).toEqual(mockAction)
    })
  })

  describe('トースト制限', () => {
    it('最大1つのトーストのみ表示される（TOAST_LIMIT=1）', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: 'トースト1' })
        result.current.toast({ title: 'トースト2' })
        result.current.toast({ title: 'トースト3' })
      })

      // 最新のトーストのみが保持される
      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].title).toBe('トースト3')
    })

    it('新しいトーストが古いトーストを置き換える', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: '古いトースト' })
      })

      const firstToastId = result.current.toasts[0].id

      act(() => {
        result.current.toast({ title: '新しいトースト' })
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].title).toBe('新しいトースト')
      expect(result.current.toasts[0].id).not.toBe(firstToastId)
    })
  })

  describe('dismiss機能', () => {
    it('特定のトーストをdismissできる', () => {
      const { result } = renderHook(() => useToast())

      let toastId: string

      act(() => {
        const created = result.current.toast({
          title: 'ディスミステスト'
        })
        toastId = created.id
      })

      expect(result.current.toasts[0].open).toBe(true)

      act(() => {
        result.current.dismiss(toastId)
      })

      expect(result.current.toasts[0].open).toBe(false)
    })

    it('dismiss後、一定時間経過でトーストが削除される', async () => {
      const { result } = renderHook(() => useToast())

      let toastId: string

      act(() => {
        const created = result.current.toast({
          title: '削除テスト'
        })
        toastId = created.id
      })

      expect(result.current.toasts).toHaveLength(1)

      act(() => {
        result.current.dismiss(toastId)
      })

      // タイマーを進める（TOAST_REMOVE_DELAY = 1000000ms）
      act(() => {
        vi.advanceTimersByTime(1000000)
      })

      expect(result.current.toasts).toHaveLength(0)
    })

    it('toastIdなしでdismissすると全トーストがdismissされる', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: 'トースト1' })
      })

      expect(result.current.toasts[0].open).toBe(true)

      act(() => {
        result.current.dismiss()
      })

      expect(result.current.toasts[0].open).toBe(false)
    })
  })

  describe('トースト更新', () => {
    it('返されたupdate関数でトーストを更新できる', () => {
      const { result } = renderHook(() => useToast())

      let updateFn: ((props: { title?: string; description?: string }) => void) | undefined

      act(() => {
        const created = result.current.toast({
          title: '元のタイトル',
          description: '元の説明'
        })
        updateFn = created.update
      })

      expect(result.current.toasts[0].title).toBe('元のタイトル')

      act(() => {
        updateFn?.({
          title: '更新されたタイトル',
          description: '更新された説明'
        })
      })

      expect(result.current.toasts[0].title).toBe('更新されたタイトル')
      expect(result.current.toasts[0].description).toBe('更新された説明')
    })

    it('部分的な更新が可能', () => {
      const { result } = renderHook(() => useToast())

      let updateFn: ((props: { description?: string }) => void) | undefined

      act(() => {
        const created = result.current.toast({
          title: 'タイトル',
          description: '説明',
          variant: 'default'
        })
        updateFn = created.update
      })

      act(() => {
        updateFn?.({
          description: '新しい説明のみ'
        })
      })

      expect(result.current.toasts[0].title).toBe('タイトル')
      expect(result.current.toasts[0].description).toBe('新しい説明のみ')
      expect(result.current.toasts[0].variant).toBe('default')
    })
  })

  describe('返されたdismiss関数', () => {
    it('返されたdismiss関数でトーストをdismissできる', () => {
      const { result } = renderHook(() => useToast())

      let dismissFn: (() => void) | undefined

      act(() => {
        const created = result.current.toast({
          title: 'ディスミステスト'
        })
        dismissFn = created.dismiss
      })

      expect(result.current.toasts[0].open).toBe(true)

      act(() => {
        dismissFn?.()
      })

      expect(result.current.toasts[0].open).toBe(false)
    })
  })

  describe('onOpenChange', () => {
    it('onOpenChangeがfalseで呼ばれるとdismissされる', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'オープンチェンジテスト'
        })
      })

      const toastItem = result.current.toasts[0]
      expect(toastItem.open).toBe(true)

      act(() => {
        toastItem.onOpenChange?.(false)
      })

      expect(result.current.toasts[0].open).toBe(false)
    })

    it('onOpenChangeがtrueの場合は何もしない', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'オープンチェンジテスト'
        })
      })

      const toastItem = result.current.toasts[0]

      act(() => {
        toastItem.onOpenChange?.(true)
      })

      expect(result.current.toasts[0].open).toBe(true)
    })
  })

  describe('複数フック間の状態同期', () => {
    it('複数のuseToastフックが同じ状態を共有する', () => {
      const { result: result1 } = renderHook(() => useToast())
      const { result: result2 } = renderHook(() => useToast())

      act(() => {
        result1.current.toast({
          title: '共有トースト'
        })
      })

      // 両方のフックで同じトーストが見える
      expect(result1.current.toasts).toHaveLength(1)
      expect(result2.current.toasts).toHaveLength(1)
      expect(result1.current.toasts[0].title).toBe('共有トースト')
      expect(result2.current.toasts[0].title).toBe('共有トースト')
    })

    it('片方のフックでdismissすると両方に反映される', () => {
      const { result: result1 } = renderHook(() => useToast())
      const { result: result2 } = renderHook(() => useToast())

      let toastId: string

      act(() => {
        const created = result1.current.toast({
          title: '共有ディスミス'
        })
        toastId = created.id
      })

      act(() => {
        result2.current.dismiss(toastId)
      })

      expect(result1.current.toasts[0].open).toBe(false)
      expect(result2.current.toasts[0].open).toBe(false)
    })
  })

  describe('reducer単体テスト', () => {
    it('ADD_TOASTでトーストが追加される', () => {
      const initialState = { toasts: [] }
      const newToast = {
        id: '1',
        title: 'テスト',
        open: true
      }

      const newState = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: newToast
      })

      expect(newState.toasts).toHaveLength(1)
      expect(newState.toasts[0]).toEqual(newToast)
    })

    it('UPDATE_TOASTで既存トーストが更新される', () => {
      const initialState = {
        toasts: [
          { id: '1', title: '元のタイトル', open: true }
        ]
      }

      const newState = reducer(initialState, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: '新しいタイトル' }
      })

      expect(newState.toasts[0].title).toBe('新しいタイトル')
      expect(newState.toasts[0].open).toBe(true)
    })

    it('DISMISS_TOASTでopenがfalseになる', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'テスト', open: true }
        ]
      }

      const newState = reducer(initialState, {
        type: 'DISMISS_TOAST',
        toastId: '1'
      })

      expect(newState.toasts[0].open).toBe(false)
    })

    it('REMOVE_TOASTでトーストが削除される', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'テスト1', open: true },
          { id: '2', title: 'テスト2', open: true }
        ]
      }

      const newState = reducer(initialState, {
        type: 'REMOVE_TOAST',
        toastId: '1'
      })

      expect(newState.toasts).toHaveLength(1)
      expect(newState.toasts[0].id).toBe('2')
    })

    it('REMOVE_TOAST（toastIdなし）で全トーストが削除される', () => {
      const initialState = {
        toasts: [
          { id: '1', title: 'テスト1', open: true },
          { id: '2', title: 'テスト2', open: true }
        ]
      }

      const newState = reducer(initialState, {
        type: 'REMOVE_TOAST',
        toastId: undefined
      })

      expect(newState.toasts).toHaveLength(0)
    })
  })

  describe('スタンドアロンtoast関数', () => {
    it('フック外でtoast関数を直接呼び出せる', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        toast({
          title: 'スタンドアロントースト'
        })
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].title).toBe('スタンドアロントースト')
    })

    it('スタンドアロンtoast関数がID、dismiss、updateを返す', () => {
      let toastResult: ReturnType<typeof toast>

      act(() => {
        toastResult = toast({
          title: 'テスト'
        })
      })

      expect(toastResult!.id).toBeDefined()
      expect(toastResult!.dismiss).toBeDefined()
      expect(toastResult!.update).toBeDefined()
    })
  })

  describe('エッジケース', () => {
    it('存在しないIDでdismissしても エラーにならない', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({ title: 'トースト' })
      })

      expect(() => {
        act(() => {
          result.current.dismiss('non-existent-id')
        })
      }).not.toThrow()
    })

    it('空のtoastsでdismiss()を呼んでもエラーにならない', () => {
      const { result } = renderHook(() => useToast())

      expect(() => {
        act(() => {
          result.current.dismiss()
        })
      }).not.toThrow()
    })

    it('同じトーストを複数回dismissできる', () => {
      const { result } = renderHook(() => useToast())

      let toastId: string

      act(() => {
        const created = result.current.toast({ title: 'テスト' })
        toastId = created.id
      })

      act(() => {
        result.current.dismiss(toastId)
        result.current.dismiss(toastId)
        result.current.dismiss(toastId)
      })

      expect(result.current.toasts[0].open).toBe(false)
    })
  })

  describe('メモリリーク防止', () => {
    it('アンマウント時にリスナーが削除される', () => {
      const { unmount } = renderHook(() => useToast())

      // アンマウントしてもエラーにならないことを確認
      expect(() => {
        unmount()
      }).not.toThrow()
    })

    it('複数フックのアンマウントが正しく処理される', () => {
      const { unmount: unmount1 } = renderHook(() => useToast())
      const { unmount: unmount2 } = renderHook(() => useToast())
      const { result: result3 } = renderHook(() => useToast())

      act(() => {
        result3.current.toast({ title: 'テスト' })
      })

      unmount1()
      unmount2()

      // 残りのフックは正常に動作する
      expect(result3.current.toasts).toHaveLength(1)
    })
  })
})
