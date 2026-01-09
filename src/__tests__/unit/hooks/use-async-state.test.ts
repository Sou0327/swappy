/**
 * useAsyncState フックの単体テスト
 * 非同期操作の統一状態管理機能テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsyncState, useFormSubmit } from '@/hooks/use-async-state'

// useErrorHandlerのモック
const mockHandleError = vi.fn((error) => ({
  type: 'SERVER',
  message: 'エラーが発生しました',
  details: error.message
}))

vi.mock('@/hooks/use-error-handler', () => ({
  useErrorHandler: () => ({
    handleError: mockHandleError
  })
}))

describe('useAsyncState', () => {
  beforeEach(() => {
    mockHandleError.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期状態', () => {
    it('初期値が正しく設定される', () => {
      const { result } = renderHook(() => useAsyncState())

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.lastFetch).toBeUndefined()
      expect(result.current.isIdle).toBe(true)
    })

    it('execute関数が提供される', () => {
      const { result } = renderHook(() => useAsyncState())

      expect(result.current.execute).toBeDefined()
      expect(typeof result.current.execute).toBe('function')
    })

    it('ユーティリティ関数が提供される', () => {
      const { result } = renderHook(() => useAsyncState())

      expect(result.current.reset).toBeDefined()
      expect(result.current.setData).toBeDefined()
      expect(result.current.setLoading).toBeDefined()
      expect(result.current.setError).toBeDefined()
    })
  })

  describe('execute - 成功ケース', () => {
    it('非同期関数を実行してデータを取得できる', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      const asyncFn = vi.fn().mockResolvedValue('成功データ')

      await act(async () => {
        await result.current.execute(asyncFn)
      })

      expect(result.current.data).toBe('成功データ')
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.lastFetch).toBeDefined()
    })

    it('実行中はloadingがtrueになる', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      let resolvePromise: (value: string) => void
      const promise = new Promise<string>(resolve => {
        resolvePromise = resolve
      })

      const asyncFn = vi.fn(() => promise)

      // 非同期実行を開始
      act(() => {
        result.current.execute(asyncFn)
      })

      // loading状態を確認
      await waitFor(() => {
        expect(result.current.loading).toBe(true)
      })

      // Promiseを解決
      await act(async () => {
        resolvePromise!('データ')
        await promise
      })

      expect(result.current.loading).toBe(false)
    })

    it('onSuccessコールバックが呼ばれる', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      const asyncFn = vi.fn().mockResolvedValue('データ')
      const onSuccess = vi.fn()

      await act(async () => {
        await result.current.execute(asyncFn, { onSuccess })
      })

      expect(onSuccess).toHaveBeenCalledWith('データ')
    })

    it('executeが{data, error}を返す', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      const asyncFn = vi.fn().mockResolvedValue('データ')

      let executeResult: { data: string | null; error: unknown }

      await act(async () => {
        executeResult = await result.current.execute(asyncFn)
      })

      expect(executeResult).toEqual({
        data: 'データ',
        error: null
      })
    })

    it('lastFetchタイムスタンプが更新される', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      const beforeTime = Date.now()

      await act(async () => {
        await result.current.execute(async () => 'データ')
      })

      const afterTime = Date.now()

      expect(result.current.lastFetch).toBeDefined()
      expect(result.current.lastFetch!).toBeGreaterThanOrEqual(beforeTime)
      expect(result.current.lastFetch!).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('execute - エラーケース', () => {
    it('エラー発生時にエラー状態が更新される', async () => {
      const { result } = renderHook(() => useAsyncState())

      const error = new Error('テストエラー')
      const asyncFn = vi.fn().mockRejectedValue(error)

      await act(async () => {
        await result.current.execute(asyncFn)
      })

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toEqual({
        type: 'SERVER',
        message: 'エラーが発生しました',
        details: 'テストエラー'
      })
    })

    it('handleErrorが呼ばれる', async () => {
      const { result } = renderHook(() => useAsyncState())

      const error = new Error('エラー')
      const asyncFn = vi.fn().mockRejectedValue(error)

      await act(async () => {
        await result.current.execute(asyncFn, {
          context: 'Test Context'
        })
      })

      expect(mockHandleError).toHaveBeenCalledWith(
        error,
        'Test Context',
        true
      )
    })

    it('showErrorToast=falseの場合、トースト非表示', async () => {
      const { result } = renderHook(() => useAsyncState())

      const error = new Error('エラー')
      const asyncFn = vi.fn().mockRejectedValue(error)

      await act(async () => {
        await result.current.execute(asyncFn, {
          showErrorToast: false
        })
      })

      expect(mockHandleError).toHaveBeenCalledWith(
        error,
        undefined,
        false
      )
    })

    it('onErrorコールバックが呼ばれる', async () => {
      const { result } = renderHook(() => useAsyncState())

      const error = new Error('エラー')
      const asyncFn = vi.fn().mockRejectedValue(error)
      const onError = vi.fn()

      await act(async () => {
        await result.current.execute(asyncFn, { onError })
      })

      expect(onError).toHaveBeenCalledWith({
        type: 'SERVER',
        message: 'エラーが発生しました',
        details: 'エラー'
      })
    })

    it('executeが{data: null, error}を返す', async () => {
      const { result } = renderHook(() => useAsyncState())

      const error = new Error('エラー')
      const asyncFn = vi.fn().mockRejectedValue(error)

      let executeResult: { data: unknown; error: { type: string; message: string; details: string } | null }

      await act(async () => {
        executeResult = await result.current.execute(asyncFn)
      })

      expect(executeResult).toEqual({
        data: null,
        error: {
          type: 'SERVER',
          message: 'エラーが発生しました',
          details: 'エラー'
        }
      })
    })
  })

  describe('AbortSignal統合', () => {
    it('既にキャンセルされたAbortSignalは実行をスキップ', async () => {
      const { result } = renderHook(() => useAsyncState())

      const controller = new AbortController()
      controller.abort()

      const asyncFn = vi.fn().mockResolvedValue('データ')

      await act(async () => {
        await result.current.execute(asyncFn, {
          abortSignal: controller.signal
        })
      })

      expect(asyncFn).not.toHaveBeenCalled()
      expect(result.current.loading).toBe(false)
    })

    it('実行後のキャンセルは結果を破棄', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      const controller = new AbortController()

      let resolvePromise: (value: string) => void
      const promise = new Promise<string>(resolve => {
        resolvePromise = resolve
      })

      const asyncFn = vi.fn(() => promise)

      // 実行開始
      const executePromise = act(async () => {
        return await result.current.execute(asyncFn, {
          abortSignal: controller.signal
        })
      })

      // 実行中にキャンセル
      controller.abort()

      // Promiseを解決
      act(() => {
        resolvePromise!('データ')
      })

      const executeResult = await executePromise

      expect(executeResult.data).toBeNull()
      expect(executeResult.error).toBeDefined()
      expect(result.current.data).toBeNull()
    })

    it('AbortErrorは特別扱いされる', async () => {
      const { result } = renderHook(() => useAsyncState())

      const abortError = new Error('Aborted')
      abortError.name = 'AbortError'

      const asyncFn = vi.fn().mockRejectedValue(abortError)

      await act(async () => {
        await result.current.execute(asyncFn)
      })

      expect(mockHandleError).not.toHaveBeenCalled()
      expect(result.current.loading).toBe(false)
    })
  })

  describe('アンマウント処理', () => {
    it('アンマウント後の状態更新は無視される', async () => {
      const { result, unmount } = renderHook(() => useAsyncState<string>())

      let resolvePromise: (value: string) => void
      const promise = new Promise<string>(resolve => {
        resolvePromise = resolve
      })

      const asyncFn = vi.fn(() => promise)

      // 実行開始
      act(() => {
        result.current.execute(asyncFn)
      })

      // アンマウント
      unmount()

      // Promiseを解決（アンマウント後）
      await act(async () => {
        resolvePromise!('データ')
        await promise
      })

      // 状態は更新されない（unmount済みのため確認できないが、エラーにならないことを確認）
      expect(asyncFn).toHaveBeenCalled()
    })
  })

  describe('ユーティリティ関数', () => {
    it('resetで状態をクリアできる', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      await act(async () => {
        await result.current.execute(async () => 'データ')
      })

      expect(result.current.data).toBe('データ')

      act(() => {
        result.current.reset()
      })

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('setDataでデータを直接設定できる', () => {
      const { result } = renderHook(() => useAsyncState<string>())

      act(() => {
        result.current.setData('新しいデータ')
      })

      expect(result.current.data).toBe('新しいデータ')
    })

    it('setLoadingでloading状態を直接設定できる', () => {
      const { result } = renderHook(() => useAsyncState())

      act(() => {
        result.current.setLoading(true)
      })

      expect(result.current.loading).toBe(true)
    })

    it('setErrorでエラーを直接設定できる', () => {
      const { result } = renderHook(() => useAsyncState())

      const error = new Error('手動エラー')

      act(() => {
        result.current.setError(error)
      })

      expect(result.current.error).toEqual(error)
    })
  })

  describe('isIdle状態', () => {
    it('初期状態でisIdleがtrue', () => {
      const { result } = renderHook(() => useAsyncState())

      expect(result.current.isIdle).toBe(true)
    })

    it('データがある場合isIdleがfalse', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      await act(async () => {
        await result.current.execute(async () => 'データ')
      })

      expect(result.current.isIdle).toBe(false)
    })

    it('エラーがある場合isIdleがfalse', async () => {
      const { result } = renderHook(() => useAsyncState())

      await act(async () => {
        await result.current.execute(async () => {
          throw new Error('エラー')
        })
      })

      expect(result.current.isIdle).toBe(false)
    })

    it('loading中はisIdleがfalse', async () => {
      const { result } = renderHook(() => useAsyncState())

      act(() => {
        result.current.setLoading(true)
      })

      expect(result.current.isIdle).toBe(false)
    })
  })

  describe('複数回実行', () => {
    it('連続実行で前のエラーがクリアされる', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      // 1回目: エラー
      await act(async () => {
        await result.current.execute(async () => {
          throw new Error('エラー1')
        })
      })

      expect(result.current.error).toBeDefined()

      // 2回目: 成功
      await act(async () => {
        await result.current.execute(async () => 'データ')
      })

      expect(result.current.error).toBeNull()
      expect(result.current.data).toBe('データ')
    })

    it('lastFetchが更新される', async () => {
      const { result } = renderHook(() => useAsyncState<string>())

      await act(async () => {
        await result.current.execute(async () => 'データ1')
      })

      const firstFetch = result.current.lastFetch

      // 少し待つ
      await new Promise(resolve => setTimeout(resolve, 10))

      await act(async () => {
        await result.current.execute(async () => 'データ2')
      })

      expect(result.current.lastFetch).toBeGreaterThan(firstFetch!)
    })
  })
})

describe('useFormSubmit', () => {
  beforeEach(() => {
    mockHandleError.mockClear()
  })

  describe('初期状態', () => {
    it('useAsyncStateの機能を継承する', () => {
      const { result } = renderHook(() => useFormSubmit())

      expect(result.current.data).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.isSubmitting).toBe(false)
    })

    it('submitForm関数が提供される', () => {
      const { result } = renderHook(() => useFormSubmit())

      expect(result.current.submitForm).toBeDefined()
      expect(typeof result.current.submitForm).toBe('function')
    })
  })

  describe('フォーム送信', () => {
    it('フォームデータを送信できる', async () => {
      const { result } = renderHook(() => useFormSubmit<string>())

      const formData = { name: 'テスト', email: 'test@example.com' }
      const submitFn = vi.fn().mockResolvedValue('成功')

      await act(async () => {
        await result.current.submitForm(formData, submitFn)
      })

      expect(submitFn).toHaveBeenCalledWith(formData)
      expect(result.current.data).toBe('成功')
    })

    it('送信中はisSubmittingがtrue', async () => {
      const { result } = renderHook(() => useFormSubmit<string>())

      let resolvePromise: (value: string) => void
      const promise = new Promise<string>(resolve => {
        resolvePromise = resolve
      })

      const submitFn = vi.fn(() => promise)
      const formData = { name: 'テスト' }

      act(() => {
        result.current.submitForm(formData, submitFn)
      })

      await waitFor(() => {
        expect(result.current.isSubmitting).toBe(true)
      })

      await act(async () => {
        resolvePromise!('完了')
        await promise
      })

      expect(result.current.isSubmitting).toBe(false)
    })

    it('onSuccessにformDataが渡される', async () => {
      const { result } = renderHook(() => useFormSubmit<string>())

      const formData = { name: 'テスト' }
      const submitFn = vi.fn().mockResolvedValue('成功')
      const onSuccess = vi.fn()

      await act(async () => {
        await result.current.submitForm(formData, submitFn, { onSuccess })
      })

      expect(onSuccess).toHaveBeenCalledWith('成功', formData)
    })

    it('onErrorにformDataが渡される', async () => {
      const { result } = renderHook(() => useFormSubmit())

      const formData = { name: 'テスト' }
      const error = new Error('送信エラー')
      const submitFn = vi.fn().mockRejectedValue(error)
      const onError = vi.fn()

      await act(async () => {
        await result.current.submitForm(formData, submitFn, { onError })
      })

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SERVER',
          message: 'エラーが発生しました'
        }),
        formData
      )
    })

    it('contextが"Form Submit"になる', async () => {
      const { result } = renderHook(() => useFormSubmit())

      const formData = { name: 'テスト' }
      const submitFn = vi.fn().mockRejectedValue(new Error('エラー'))

      await act(async () => {
        await result.current.submitForm(formData, submitFn)
      })

      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        'Form Submit',
        true
      )
    })

    it('カスタムcontextを指定できる', async () => {
      const { result } = renderHook(() => useFormSubmit())

      const formData = { name: 'テスト' }
      const submitFn = vi.fn().mockRejectedValue(new Error('エラー'))

      await act(async () => {
        await result.current.submitForm(formData, submitFn, {
          context: 'Login Form'
        })
      })

      expect(mockHandleError).toHaveBeenCalledWith(
        expect.any(Error),
        'Login Form',
        true
      )
    })
  })

  describe('送信結果', () => {
    it('成功時に{data, error}を返す', async () => {
      const { result } = renderHook(() => useFormSubmit<string>())

      const formData = { name: 'テスト' }
      const submitFn = vi.fn().mockResolvedValue('成功データ')

      let submitResult: { data: string | null; error: unknown }

      await act(async () => {
        submitResult = await result.current.submitForm(formData, submitFn)
      })

      expect(submitResult).toEqual({
        data: '成功データ',
        error: null
      })
    })

    it('失敗時に{data: null, error}を返す', async () => {
      const { result } = renderHook(() => useFormSubmit())

      const formData = { name: 'テスト' }
      const submitFn = vi.fn().mockRejectedValue(new Error('送信失敗'))

      let submitResult: { data: unknown; error: { type: string; message: string } | null }

      await act(async () => {
        submitResult = await result.current.submitForm(formData, submitFn)
      })

      expect(submitResult).toEqual({
        data: null,
        error: expect.objectContaining({
          type: 'SERVER',
          message: 'エラーが発生しました'
        })
      })
    })
  })
})
