/**
 * useNotificationTemplates フックの単体テスト
 * 通知テンプレート管理の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotificationTemplates } from '@/hooks/use-notification-templates'
import type { NotificationTemplate } from '@/hooks/use-notification-templates'

// use-async-stateのモック
const mockExecute = vi.fn()
const mockSetData = vi.fn()
const mockAsyncState = {
  data: null as NotificationTemplate[] | null,
  loading: false,
  error: null,
  execute: mockExecute,
  setData: mockSetData,
  reset: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  isIdle: true
}

vi.mock('@/hooks/use-async-state', () => ({
  useAsyncState: () => mockAsyncState
}))

// use-error-handlerのモック
const mockHandleError = vi.fn()
vi.mock('@/hooks/use-error-handler', () => ({
  useErrorHandler: () => ({
    handleError: mockHandleError
  })
}))

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client')

describe('useNotificationTemplates', () => {
  // モックデータ
  const mockTemplateRows = [
    {
      id: 'template-1',
      template_key: 'welcome',
      name: 'ウェルカムメッセージ',
      description: '新規登録ユーザー向けのウェルカムメッセージ',
      title_template: 'ようこそ{{name}}さん',
      message_template: 'ご登録ありがとうございます。',
      notification_type: 'email',
      variables: ['name'],
      active: true,
      manual_send_allowed: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'template-2',
      template_key: 'password_reset',
      name: 'パスワードリセット',
      description: 'パスワードリセット通知',
      title_template: 'パスワードリセット',
      message_template: 'パスワードリセットリンク: {{resetLink}}',
      notification_type: 'email',
      variables: ['resetLink'],
      active: true,
      manual_send_allowed: true,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    }
  ]

  const expectedMappedTemplates: NotificationTemplate[] = [
    {
      id: 'template-1',
      template_key: 'welcome',
      name: 'ウェルカムメッセージ',
      description: '新規登録ユーザー向けのウェルカムメッセージ',
      title_template: 'ようこそ{{name}}さん',
      message_template: 'ご登録ありがとうございます。',
      notification_type: 'email',
      variables: ['name'],
      active: true,
      manual_send_allowed: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'template-2',
      template_key: 'password_reset',
      name: 'パスワードリセット',
      description: 'パスワードリセット通知',
      title_template: 'パスワードリセット',
      message_template: 'パスワードリセットリンク: {{resetLink}}',
      notification_type: 'email',
      variables: ['resetLink'],
      active: true,
      manual_send_allowed: true,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    }
  ]

  let mockFrom: ReturnType<typeof vi.fn>
  let mockSelect: ReturnType<typeof vi.fn>
  let mockEq: ReturnType<typeof vi.fn>
  let mockOrder: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { supabase } = await import('@/integrations/supabase/client')

    // デフォルトのクエリチェーンを設定
    mockOrder = vi.fn(() => Promise.resolve({ data: mockTemplateRows, error: null }))
    mockEq = vi.fn(() => ({ eq: mockEq, order: mockOrder }))
    mockSelect = vi.fn(() => ({ eq: mockEq }))
    mockFrom = vi.fn(() => ({ select: mockSelect }))

    vi.mocked(supabase.from).mockImplementation(mockFrom)

    // モック状態をリセット
    mockAsyncState.data = null
    mockAsyncState.loading = false
    mockAsyncState.error = null
    mockExecute.mockClear()
    mockSetData.mockClear()
    mockHandleError.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => useNotificationTemplates())

      expect(result.current.templates).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('操作関数が提供される', () => {
      const { result } = renderHook(() => useNotificationTemplates())

      expect(result.current.refresh).toBeDefined()
    })

    it('初期化時には自動読み込みしない', () => {
      renderHook(() => useNotificationTemplates())

      // useEffectがないため、executeは呼ばれない
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  describe('loadTemplates', () => {
    it('テンプレートを正しく取得してマッピングする', async () => {
      const { result } = renderHook(() => useNotificationTemplates())

      // refreshを呼んでloadTemplatesを実行
      act(() => {
        result.current.refresh()
      })

      expect(mockExecute).toHaveBeenCalledWith(expect.any(Function))

      const loadFunction = mockExecute.mock.calls[0][0]
      const templates = await loadFunction()

      expect(templates).toEqual(expectedMappedTemplates)
    })

    it('active=trueでフィルターする', async () => {
      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      expect(mockEq).toHaveBeenCalledWith('active', true)
    })

    it('manual_send_allowed=trueでフィルターする', async () => {
      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      expect(mockEq).toHaveBeenCalledWith('manual_send_allowed', true)
    })

    it('name順でソートする', async () => {
      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      expect(mockOrder).toHaveBeenCalledWith('name')
    })

    it('variablesが配列の場合、そのまま使用する', async () => {
      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const templates = await loadFunction()

      expect(templates[0].variables).toEqual(['name'])
      expect(templates[1].variables).toEqual(['resetLink'])
    })

    it('variablesが配列でない場合、空配列にする', async () => {
      const invalidTemplateRow = {
        ...mockTemplateRows[0],
        variables: 'invalid-not-array' as unknown as string[]
      }

      mockOrder.mockResolvedValue({ data: [invalidTemplateRow], error: null })

      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const templates = await loadFunction()

      expect(templates[0].variables).toEqual([])
    })

    it('variablesがnullの場合、空配列にする', async () => {
      const nullVariablesRow = {
        ...mockTemplateRows[0],
        variables: null as unknown as string[]
      }

      mockOrder.mockResolvedValue({ data: [nullVariablesRow], error: null })

      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const templates = await loadFunction()

      expect(templates[0].variables).toEqual([])
    })

    it('空の結果を正しく処理する', async () => {
      mockOrder.mockResolvedValue({ data: [], error: null })

      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const templates = await loadFunction()

      expect(templates).toEqual([])
    })

    it('descriptionがnullの場合を正しく処理する', async () => {
      const nullDescriptionRow = {
        ...mockTemplateRows[0],
        description: null
      }

      mockOrder.mockResolvedValue({ data: [nullDescriptionRow], error: null })

      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const templates = await loadFunction()

      expect(templates[0].description).toBeNull()
    })
  })

  describe('refresh機能', () => {
    it('refreshを呼ぶとloadTemplatesが実行される', () => {
      const { result } = renderHook(() => useNotificationTemplates())

      expect(mockExecute).not.toHaveBeenCalled()

      act(() => {
        result.current.refresh()
      })

      expect(mockExecute).toHaveBeenCalledWith(expect.any(Function))
    })

    it('複数回refreshできる', () => {
      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      expect(mockExecute).toHaveBeenCalledTimes(1)

      act(() => {
        result.current.refresh()
      })

      expect(mockExecute).toHaveBeenCalledTimes(2)
    })
  })

  describe('エラーハンドリング', () => {
    it('テンプレート取得エラーをthrowする', async () => {
      const error = new Error('テンプレート取得エラー')
      mockOrder.mockResolvedValue({ data: null, error })

      const { result } = renderHook(() => useNotificationTemplates())

      act(() => {
        result.current.refresh()
      })

      const loadFunction = mockExecute.mock.calls[0][0]

      await expect(loadFunction()).rejects.toThrow('テンプレート取得エラー')
    })
  })

  describe('状態の公開', () => {
    it('templatesStateのデータを公開する', () => {
      mockAsyncState.data = expectedMappedTemplates

      const { result } = renderHook(() => useNotificationTemplates())

      expect(result.current.templates).toEqual(expectedMappedTemplates)
    })

    it('loadingStateを公開する', () => {
      mockAsyncState.loading = true

      const { result } = renderHook(() => useNotificationTemplates())

      expect(result.current.loading).toBe(true)
    })

    it('errorStateを公開する', () => {
      const mockError: { type: string; message: string } = { type: 'SERVER', message: 'エラー' }
      mockAsyncState.error = mockError

      const { result } = renderHook(() => useNotificationTemplates())

      expect(result.current.error).toEqual(mockError)
    })
  })
})
