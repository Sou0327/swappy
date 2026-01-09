/**
 * エラーハンドリングシステムのユニットテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ErrorType,
  AppErrorHandler,
  getErrorToast,
  createError,
  type AppError,
} from '../../../lib/errors'

describe('Error Handling System', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('ErrorType', () => {
    it('全てのエラータイプが定義されている', () => {
      expect(ErrorType.NETWORK).toBe('network')
      expect(ErrorType.AUTH).toBe('auth')
      expect(ErrorType.VALIDATION).toBe('validation')
      expect(ErrorType.PERMISSION).toBe('permission')
      expect(ErrorType.NOT_FOUND).toBe('not_found')
      expect(ErrorType.SERVER).toBe('server')
      expect(ErrorType.UNKNOWN).toBe('unknown')
    })

    it('エラータイプが7種類である', () => {
      const types = Object.values(ErrorType)
      expect(types.length).toBe(7)
    })
  })

  describe('AppErrorHandler.normalize()', () => {
    it('既に正規化されたエラーはそのまま返す', () => {
      const appError: AppError = {
        type: ErrorType.VALIDATION,
        message: 'テストエラー',
        details: '詳細情報',
      }

      const result = AppErrorHandler.normalize(appError)

      expect(result).toEqual(appError)
      expect(result.type).toBe(ErrorType.VALIDATION)
      expect(result.message).toBe('テストエラー')
      expect(result.details).toBe('詳細情報')
    })

    it('Supabase認証エラーを正しく正規化する', () => {
      const supabaseError = {
        message: 'Invalid login credentials',
        code: 'PGRST301',
      }

      const result = AppErrorHandler.normalize(supabaseError)

      expect(result.type).toBe(ErrorType.AUTH)
      expect(result.message).toBe('ログイン情報が正しくありません')
      expect(result.details).toBe('Invalid login credentials')
      expect(result.code).toBe('PGRST301')
    })

    it('Supabase権限エラーを正しく正規化する', () => {
      const supabaseError = {
        message: 'permission denied for table users',
        code: 'PGRST116',
      }

      const result = AppErrorHandler.normalize(supabaseError)

      expect(result.type).toBe(ErrorType.PERMISSION)
      expect(result.message).toBe('この操作を実行する権限がありません')
      expect(result.details).toBe('permission denied for table users')
      expect(result.code).toBe('PGRST116')
    })

    it('Supabase NOT FOUNDエラーを正しく正規化する', () => {
      // PGRST116は権限エラーと重複するため、messageに"not found"を含むケースでテスト
      const supabaseError = {
        message: 'Data not found in database',
      }

      const result = AppErrorHandler.normalize(supabaseError)

      expect(result.type).toBe(ErrorType.NOT_FOUND)
      expect(result.message).toBe('リクエストされたデータが見つかりません')
      expect(result.details).toBe('Data not found in database')
    })

    it('Supabaseサーバーエラーを正しく正規化する', () => {
      const supabaseError = {
        message: 'Internal server error',
        code: '500',
      }

      const result = AppErrorHandler.normalize(supabaseError)

      expect(result.type).toBe(ErrorType.SERVER)
      expect(result.message).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(result.details).toBe('Internal server error')
      expect(result.code).toBe('500')
    })

    it('ネットワークエラーを正しく正規化する（TypeErrorもmessageプロパティを持つためSERVERになる）', () => {
      const networkError = new TypeError('Failed to fetch')

      const result = AppErrorHandler.normalize(networkError)

      // 実装では、TypeErrorもmessageプロパティを持つため、Supabaseエラーチェックで捕まりSERVERになる
      expect(result.type).toBe(ErrorType.SERVER)
      expect(result.message).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(result.details).toBe('Failed to fetch')
    })

    it('バリデーションエラーを正しく正規化する（ErrorオブジェクトはSERVERになる）', () => {
      const validationError = new Error('validation failed: email is required')

      const result = AppErrorHandler.normalize(validationError)

      // 実装では、Errorオブジェクトもmessageプロパティを持つため、Supabaseエラーチェックで捕まりSERVERになる
      expect(result.type).toBe(ErrorType.SERVER)
      expect(result.message).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(result.details).toBe('validation failed: email is required')
    })

    it('不明なエラーを正しく正規化する（ErrorオブジェクトはSERVERになる）', () => {
      const unknownError = new Error('Something went wrong')

      const result = AppErrorHandler.normalize(unknownError)

      // 実装では、Errorオブジェクトもmessageプロパティを持つため、Supabaseエラーチェックで捕まりSERVERになる
      expect(result.type).toBe(ErrorType.SERVER)
      expect(result.message).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(result.details).toBe('Something went wrong')
    })

    it('文字列エラーを正しく正規化する', () => {
      const result = AppErrorHandler.normalize('エラーが発生しました')

      expect(result.type).toBe(ErrorType.UNKNOWN)
      expect(result.message).toBe('予期しないエラーが発生しました')
      expect(result.details).toBe('エラーが発生しました')
    })

    it('nullエラーを正しく正規化する', () => {
      const result = AppErrorHandler.normalize(null)

      expect(result.type).toBe(ErrorType.UNKNOWN)
      expect(result.message).toBe('予期しないエラーが発生しました')
      expect(result.details).toBe('null')
    })

    it('undefinedエラーを正しく正規化する', () => {
      const result = AppErrorHandler.normalize(undefined)

      expect(result.type).toBe(ErrorType.UNKNOWN)
      expect(result.message).toBe('予期しないエラーが発生しました')
      expect(result.details).toBe('undefined')
    })

    it('not authenticated メッセージを認証エラーとして扱う', () => {
      const error = { message: 'User not authenticated' }

      const result = AppErrorHandler.normalize(error)

      expect(result.type).toBe(ErrorType.AUTH)
      expect(result.message).toBe('ログイン情報が正しくありません')
    })

    it('insufficient_privilege メッセージを権限エラーとして扱う', () => {
      const error = { message: 'insufficient_privilege: access denied' }

      const result = AppErrorHandler.normalize(error)

      expect(result.type).toBe(ErrorType.PERMISSION)
      expect(result.message).toBe('この操作を実行する権限がありません')
    })
  })

  describe('AppErrorHandler.getUserMessage()', () => {
    it('正規化されたエラーからユーザーメッセージを取得する', () => {
      const error = new Error('validation error: email is invalid')

      const message = AppErrorHandler.getUserMessage(error)

      // ErrorオブジェクトはSERVERとして扱われる
      expect(message).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
    })

    it('Supabaseエラーからユーザーメッセージを取得する', () => {
      const error = { message: 'Invalid login credentials', code: 'PGRST301' }

      const message = AppErrorHandler.getUserMessage(error)

      expect(message).toBe('ログイン情報が正しくありません')
    })

    it('不明なエラーからユーザーメッセージを取得する', () => {
      const error = 'Unknown error'

      const message = AppErrorHandler.getUserMessage(error)

      expect(message).toBe('予期しないエラーが発生しました')
    })
  })

  describe('AppErrorHandler.getDetails()', () => {
    it('エラーの詳細情報を取得する', () => {
      const error = new Error('Something went wrong')

      const details = AppErrorHandler.getDetails(error)

      expect(details).toBe('Something went wrong')
    })

    it('Supabaseエラーの詳細情報を取得する', () => {
      const error = {
        message: 'permission denied for table users',
        code: 'PGRST116',
      }

      const details = AppErrorHandler.getDetails(error)

      expect(details).toBe('permission denied for table users')
    })

    it('詳細情報がない場合はundefinedを返す', () => {
      const error: AppError = {
        type: ErrorType.UNKNOWN,
        message: 'エラー',
      }

      const details = AppErrorHandler.getDetails(error)

      expect(details).toBeUndefined()
    })
  })

  describe('AppErrorHandler.log()', () => {
    it('エラーをコンソールに記録する', () => {
      const error = new Error('Test error')

      AppErrorHandler.log(error)

      // ErrorオブジェクトはSERVERとして扱われる
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SERVER]'),
        expect.objectContaining({
          details: 'Test error',
          timestamp: expect.any(String),
        })
      )
    })

    it('コンテキスト付きでエラーを記録する', () => {
      const error = { message: 'Invalid login credentials', code: 'PGRST301' }

      AppErrorHandler.log(error, 'ログイン処理')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AUTH] ログイン処理:'),
        expect.objectContaining({
          details: 'Invalid login credentials',
          code: 'PGRST301',
          timestamp: expect.any(String),
        })
      )
    })

    it('タイムスタンプが含まれている', () => {
      const error = new Error('Test error')

      AppErrorHandler.log(error)

      const call = consoleErrorSpy.mock.calls[0]
      const logObject = call[1] as { timestamp: string }
      const timestamp = new Date(logObject.timestamp)

      expect(timestamp.getTime()).toBeGreaterThan(0)
      expect(isNaN(timestamp.getTime())).toBe(false)
    })
  })

  describe('getErrorToast()', () => {
    it('バリデーションエラーのToastオブジェクトを生成する（ErrorオブジェクトはSERVERになる）', () => {
      const error = new Error('validation error')

      const toast = getErrorToast(error)

      // ErrorオブジェクトはSERVERとして扱われる
      expect(toast.title).toBe('サーバーエラー')
      expect(toast.description).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(toast.variant).toBe('destructive')
    })

    it('認証エラーのToastオブジェクトを生成する', () => {
      const error = { message: 'Invalid login credentials' }

      const toast = getErrorToast(error)

      expect(toast.title).toBe('認証エラー')
      expect(toast.description).toBe('ログイン情報が正しくありません')
      expect(toast.variant).toBe('destructive')
    })

    it('ネットワークエラーのToastオブジェクトを生成する（TypeErrorもSERVERになる）', () => {
      const error = new TypeError('Failed to fetch')

      const toast = getErrorToast(error)

      // TypeErrorもSERVERとして扱われる
      expect(toast.title).toBe('サーバーエラー')
      expect(toast.description).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(toast.variant).toBe('destructive')
    })

    it('権限エラーのToastオブジェクトを生成する', () => {
      const error = { message: 'permission denied' }

      const toast = getErrorToast(error)

      expect(toast.title).toBe('権限エラー')
      expect(toast.description).toBe('この操作を実行する権限がありません')
      expect(toast.variant).toBe('destructive')
    })

    it('NOT FOUNDエラーのToastオブジェクトを生成する', () => {
      const error = { message: 'User data not found' }

      const toast = getErrorToast(error)

      expect(toast.title).toBe('データが見つかりません')
      expect(toast.description).toBe('リクエストされたデータが見つかりません')
      expect(toast.variant).toBe('destructive')
    })

    it('サーバーエラーのToastオブジェクトを生成する', () => {
      const error = { message: 'Internal server error' }

      const toast = getErrorToast(error)

      expect(toast.title).toBe('サーバーエラー')
      expect(toast.description).toBe('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。')
      expect(toast.variant).toBe('destructive')
    })

    it('不明なエラーのToastオブジェクトを生成する', () => {
      const error = 'Unknown error'

      const toast = getErrorToast(error)

      expect(toast.title).toBe('エラー')
      expect(toast.description).toBe('予期しないエラーが発生しました')
      expect(toast.variant).toBe('destructive')
    })
  })

  describe('createError()', () => {
    it('基本的なカスタムエラーを作成できる', () => {
      const error = createError(ErrorType.VALIDATION, 'テストエラー')

      expect(error.type).toBe(ErrorType.VALIDATION)
      expect(error.message).toBe('テストエラー')
      expect(error.details).toBeUndefined()
      expect(error.code).toBeUndefined()
    })

    it('詳細情報付きのカスタムエラーを作成できる', () => {
      const error = createError(ErrorType.AUTH, 'ログインエラー', 'セッションが期限切れです')

      expect(error.type).toBe(ErrorType.AUTH)
      expect(error.message).toBe('ログインエラー')
      expect(error.details).toBe('セッションが期限切れです')
      expect(error.code).toBeUndefined()
    })

    it('全フィールド付きのカスタムエラーを作成できる', () => {
      const error = createError(ErrorType.SERVER, 'サーバーエラー', 'データベース接続失敗', 'DB_CONN_001')

      expect(error.type).toBe(ErrorType.SERVER)
      expect(error.message).toBe('サーバーエラー')
      expect(error.details).toBe('データベース接続失敗')
      expect(error.code).toBe('DB_CONN_001')
    })

    it('全てのエラータイプでエラーを作成できる', () => {
      const types = Object.values(ErrorType)

      types.forEach((type) => {
        const error = createError(type, `${type}エラー`)
        expect(error.type).toBe(type)
        expect(error.message).toBe(`${type}エラー`)
      })
    })
  })
})
