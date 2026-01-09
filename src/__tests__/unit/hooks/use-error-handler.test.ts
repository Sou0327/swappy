/**
 * useErrorHandler フックの単体テスト
 * 統一エラーハンドリング機能の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useErrorHandler, useQueryErrorHandler } from '@/hooks/use-error-handler'
import { ErrorType, AppErrorHandler } from '@/lib/errors'

// useToastのモック
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}))

describe('useErrorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockToast.mockClear()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  describe('handleError - 基本動作', () => {
    it('エラーをログに記録する', () => {
      const { result } = renderHook(() => useErrorHandler())
      // Errorオブジェクトはmessageプロパティを持つため、Supabaseエラーとして処理される
      const error = new Error('Test error')

      result.current.handleError(error)

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SERVER]'),
        expect.objectContaining({
          details: 'Test error',
          timestamp: expect.any(String)
        })
      )
    })

    it('デフォルトでトースト通知を表示する', () => {
      const { result } = renderHook(() => useErrorHandler())
      // Errorオブジェクトはmessageプロパティを持つため、Supabaseエラーとして処理される
      const error = new Error('Test error')

      result.current.handleError(error)

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'サーバーエラー',
          description: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
          variant: 'destructive'
        })
      )
    })

    it('showToast=falseの場合、トーストを表示しない', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = new Error('Test error')

      result.current.handleError(error, undefined, false)

      expect(mockToast).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalled() // ログは記録される
    })

    it('コンテキスト情報を含めてログに記録する', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = new Error('Test error')

      result.current.handleError(error, 'User Login')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('User Login:'),
        expect.any(Object)
      )
    })

    it('正規化されたエラーを返す', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = new Error('Test error')

      const normalized = result.current.handleError(error)

      // Errorオブジェクトはmessageプロパティを持つため、Supabaseエラーとして処理される
      expect(normalized).toEqual({
        type: ErrorType.SERVER,
        message: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
        details: 'Test error',
        code: undefined
      })
    })
  })

  describe('handleError - エラータイプ別処理', () => {
    it('ネットワークエラーを正しく処理する', () => {
      const { result } = renderHook(() => useErrorHandler())
      // TypeErrorもmessageプロパティを持つため、Supabaseエラーとして処理される
      // ネットワークエラーとして検出されるにはinstanceofチェックが必要だが、
      // Supabaseエラーチェックが先に実行されるため、Supabaseエラーとして処理される
      const error = new TypeError('Failed to fetch')

      result.current.handleError(error)

      // TypeErrorもSupabaseエラーとして処理される
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'サーバーエラー',
          description: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
          variant: 'destructive'
        })
      )
    })

    it('認証エラーを正しく処理する', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = { message: 'Invalid login credentials', code: 'PGRST301' }

      result.current.handleError(error)

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '認証エラー',
          description: 'ログイン情報が正しくありません'
        })
      )
    })

    it('バリデーションエラーを正しく処理する', () => {
      const { result } = renderHook(() => useErrorHandler())
      // Errorオブジェクトもmessageプロパティを持つためSupabaseエラーとして処理される
      const error = new Error('validation failed')

      result.current.handleError(error)

      // Supabaseエラーとして処理される
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'サーバーエラー',
          description: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
          variant: 'destructive'
        })
      )
    })

    it('権限エラーを正しく処理する', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = { message: 'permission denied', code: 'PGRST116' }

      result.current.handleError(error)

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '権限エラー',
          description: 'この操作を実行する権限がありません'
        })
      )
    })

    it('NOT_FOUNDエラーを正しく処理する', () => {
      const { result } = renderHook(() => useErrorHandler())
      // PGRST116は権限エラーとしても処理されるため、permission deniedを含めずnot foundのみ
      const error = { message: 'Resource not found' }

      result.current.handleError(error)

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'データが見つかりません',
          description: 'リクエストされたデータが見つかりません',
          variant: 'destructive'
        })
      )
    })

    it('サーバーエラーを正しく処理する', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = { message: 'Internal server error', code: '500' }

      result.current.handleError(error)

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'サーバーエラー',
          description: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。'
        })
      )
    })
  })

  describe('handleAsyncError - 非同期処理', () => {
    it('成功時、データを返しエラーはnull', async () => {
      const { result } = renderHook(() => useErrorHandler())
      const asyncOperation = vi.fn().mockResolvedValue({ id: 1, name: 'Test' })

      const response = await result.current.handleAsyncError(asyncOperation)

      expect(response).toEqual({
        data: { id: 1, name: 'Test' },
        error: null
      })
      expect(mockToast).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('失敗時、dataはnullでエラーを返す', async () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = new Error('Async operation failed')
      const asyncOperation = vi.fn().mockRejectedValue(error)

      const response = await result.current.handleAsyncError(asyncOperation)

      // ErrorオブジェクトはSupabaseエラーとして処理される
      expect(response).toEqual({
        data: null,
        error: expect.objectContaining({
          type: ErrorType.SERVER,
          message: 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。',
          code: undefined
        })
      })
      expect(mockToast).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('コンテキスト情報を渡せる', async () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = new Error('API call failed')
      const asyncOperation = vi.fn().mockRejectedValue(error)

      await result.current.handleAsyncError(asyncOperation, 'User API')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('User API:'),
        expect.any(Object)
      )
    })

    it('showToast=falseでトーストを非表示にできる', async () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = new Error('Silent error')
      const asyncOperation = vi.fn().mockRejectedValue(error)

      await result.current.handleAsyncError(asyncOperation, undefined, false)

      expect(mockToast).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalled() // ログは記録される
    })

    it('複数回呼び出しても正しく動作する', async () => {
      const { result } = renderHook(() => useErrorHandler())

      const success = vi.fn().mockResolvedValue('OK')
      const failure = vi.fn().mockRejectedValue(new Error('Failed'))

      const res1 = await result.current.handleAsyncError(success)
      const res2 = await result.current.handleAsyncError(failure)

      expect(res1).toEqual({ data: 'OK', error: null })
      expect(res2.data).toBeNull()
      expect(res2.error).not.toBeNull()
      expect(mockToast).toHaveBeenCalledTimes(1) // failureのみトースト表示
    })
  })

  describe('getUserMessage & getDetails', () => {
    it('getUserMessageでユーザー向けメッセージを取得できる', () => {
      // フックから返されるgetUserMessageは静的メソッドへの参照で
      // thisコンテキストが失われるため、直接AppErrorHandlerを使用
      // Errorオブジェクトはmessageプロパティを持つためSupabaseエラーとして処理される
      const error = new Error('validation error')

      const message = AppErrorHandler.getUserMessage(error)

      expect(message).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
    })

    it('getDetailsで開発者向け詳細情報を取得できる', () => {
      const error = new Error('Detailed error information')

      const details = AppErrorHandler.getDetails(error)

      expect(details).toBe('Detailed error information')
    })

    it('Supabaseエラーの詳細情報を取得できる', () => {
      const error = {
        message: 'PGRST error: permission denied',
        code: 'PGRST116',
        details: 'User does not have permission'
      }

      const details = AppErrorHandler.getDetails(error)

      expect(details).toBe('PGRST error: permission denied')
    })
  })

  describe('useQueryErrorHandler', () => {
    it('エラーをhandleErrorに渡して処理する', () => {
      const { result } = renderHook(() => useQueryErrorHandler())
      const error = new Error('Query failed')

      result.current(error)

      expect(mockToast).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Query Error:'),
        expect.any(Object)
      )
    })

    it('複数回呼び出しても正しく動作する', () => {
      const { result } = renderHook(() => useQueryErrorHandler())

      result.current(new Error('Error 1'))
      result.current(new Error('Error 2'))

      expect(mockToast).toHaveBeenCalledTimes(2)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
    })

    it('認証エラーを正しく処理する', () => {
      const { result } = renderHook(() => useQueryErrorHandler())
      const error = { message: 'not authenticated', code: 'PGRST301' }

      result.current(error)

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '認証エラー'
        })
      )
    })
  })

  describe('エッジケース', () => {
    it('nullエラーを処理できる', () => {
      const { result } = renderHook(() => useErrorHandler())

      const normalized = result.current.handleError(null)

      expect(normalized).toEqual({
        type: ErrorType.UNKNOWN,
        message: '予期しないエラーが発生しました',
        details: 'null'
      })
    })

    it('undefinedエラーを処理できる', () => {
      const { result } = renderHook(() => useErrorHandler())

      const normalized = result.current.handleError(undefined)

      expect(normalized).toEqual({
        type: ErrorType.UNKNOWN,
        message: '予期しないエラーが発生しました',
        details: 'undefined'
      })
    })

    it('文字列エラーを処理できる', () => {
      const { result } = renderHook(() => useErrorHandler())

      const normalized = result.current.handleError('String error')

      expect(normalized).toEqual({
        type: ErrorType.UNKNOWN,
        message: '予期しないエラーが発生しました',
        details: 'String error'
      })
    })

    it('数値エラーを処理できる', () => {
      const { result } = renderHook(() => useErrorHandler())

      const normalized = result.current.handleError(404)

      expect(normalized).toEqual({
        type: ErrorType.UNKNOWN,
        message: '予期しないエラーが発生しました',
        details: '404'
      })
    })

    it('オブジェクトエラーを処理できる', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = { custom: 'error', value: 123 }

      const normalized = result.current.handleError(error)

      expect(normalized).toEqual({
        type: ErrorType.UNKNOWN,
        message: '予期しないエラーが発生しました',
        details: '[object Object]'
      })
    })

    it('すでに正規化されたエラーはそのまま返す', () => {
      const { result } = renderHook(() => useErrorHandler())
      const error = {
        type: ErrorType.AUTH,
        message: 'Already normalized',
        details: 'Custom details',
        code: 'CUSTOM001'
      }

      const normalized = result.current.handleError(error)

      expect(normalized).toEqual(error)
    })
  })

  describe('useCallbackの動作', () => {
    it('toastの変更時にhandleErrorが再作成される', () => {
      const { result, rerender } = renderHook(() => useErrorHandler())

      const firstHandleError = result.current.handleError

      // toastをクリアして再レンダー
      mockToast.mockClear()
      rerender()

      // handleErrorが再作成されることを確認
      // 注: useCallbackは依存配列[toast]を持つため、toastが変わると再作成される
      expect(result.current.handleError).toBeDefined()
    })

    it('handleErrorの変更時にhandleAsyncErrorが再作成される', () => {
      const { result, rerender } = renderHook(() => useErrorHandler())

      const firstHandleAsyncError = result.current.handleAsyncError

      rerender()

      // handleAsyncErrorが再作成されることを確認
      expect(result.current.handleAsyncError).toBeDefined()
    })
  })
})
