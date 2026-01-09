/**
 * useAnnouncements フックの単体テスト
 * お知らせシステム管理機能の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAnnouncements } from '@/hooks/use-announcements'
import type { Announcement } from '@/hooks/use-announcements'

// use-async-stateのモック
const mockExecute = vi.fn()
const mockSetData = vi.fn()
const mockAsyncState = {
  data: null as Announcement[] | null,
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

describe('useAnnouncements', () => {
  let mockFrom: ReturnType<typeof vi.fn>

  // モックAnnouncementデータ（DB形式: snake_case）
  const mockAnnouncementsData = [
    {
      id: 'ann-1',
      title: 'システムメンテナンスのお知らせ',
      content: '2024/01/15にメンテナンスを実施します。',
      category: 'maintenance',
      importance: 'high',
      published: true,
      publish_at: '2024-01-01T00:00:00Z',
      expire_at: '2024-01-20T00:00:00Z',
      target_user_role: 'all',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'ann-2',
      title: '新機能リリース',
      content: '新しい取引機能を追加しました。',
      category: 'feature',
      importance: 'normal',
      published: true,
      publish_at: '2024-01-02T00:00:00Z',
      expire_at: null,
      target_user_role: 'all',
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    }
  ]

  // 期待される変換後データ（camelCase）
  const expectedAnnouncements: Announcement[] = [
    {
      id: 'ann-1',
      title: 'システムメンテナンスのお知らせ',
      content: '2024/01/15にメンテナンスを実施します。',
      category: 'maintenance',
      importance: 'high',
      published: true,
      publishAt: '2024-01-01T00:00:00Z',
      expireAt: '2024-01-20T00:00:00Z',
      targetUserRole: 'all',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 'ann-2',
      title: '新機能リリース',
      content: '新しい取引機能を追加しました。',
      category: 'feature',
      importance: 'normal',
      published: true,
      publishAt: '2024-01-02T00:00:00Z',
      expireAt: null,
      targetUserRole: 'all',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z'
    }
  ]

  beforeEach(async () => {
    const { supabase } = await import('@/integrations/supabase/client')

    // デフォルトの成功モック
    mockFrom = vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({
            data: mockAnnouncementsData,
            error: null
          }))
        }))
      }))
    }))

    vi.mocked(supabase.from).mockImplementation(mockFrom)

    mockExecute.mockClear()
    mockSetData.mockClear()
    mockHandleError.mockClear()
    mockAsyncState.data = null
    mockAsyncState.loading = false
    mockAsyncState.error = null
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => useAnnouncements())

      expect(result.current.announcements).toBeNull()
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('操作関数が提供される', () => {
      const { result } = renderHook(() => useAnnouncements())

      expect(result.current.refresh).toBeDefined()
      expect(typeof result.current.refresh).toBe('function')
    })

    it('初期化時にexecuteが呼ばれる', async () => {
      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            context: 'お知らせ一覧の読み込み',
            showErrorToast: true
          })
        )
      })
    })
  })

  describe('データ読み込み', () => {
    it('お知らせ一覧を取得する', async () => {
      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      // executeに渡された関数を取得して実行
      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result).toEqual(expectedAnnouncements)
    })

    it('announcementsテーブルから正しいクエリで取得', async () => {
      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      // loadFunctionを実行してSupabase呼び出しをトリガー
      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      expect(mockFrom).toHaveBeenCalledWith('announcements')

      const fromCall = mockFrom.mock.results[0].value
      expect(fromCall.select).toHaveBeenCalledWith('*')
    })

    it('created_atで降順ソートする', async () => {
      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      // loadFunctionを実行してSupabase呼び出しをトリガー
      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      const fromCall = mockFrom.mock.results[0].value
      const selectCall = fromCall.select.mock.results[0].value

      expect(selectCall.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('デフォルトで50件制限を設定', async () => {
      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      // loadFunctionを実行してSupabase呼び出しをトリガー
      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      const fromCall = mockFrom.mock.results[0].value
      const selectCall = fromCall.select.mock.results[0].value
      const orderCall = selectCall.order.mock.results[0].value

      expect(orderCall.limit).toHaveBeenCalledWith(50)
    })

    it('データを正しくcamelCaseに変換する', async () => {
      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      // snake_case → camelCaseの変換を確認
      expect(result[0].publishAt).toBe(mockAnnouncementsData[0].publish_at)
      expect(result[0].expireAt).toBe(mockAnnouncementsData[0].expire_at)
      expect(result[0].targetUserRole).toBe(mockAnnouncementsData[0].target_user_role)
      expect(result[0].createdAt).toBe(mockAnnouncementsData[0].created_at)
      expect(result[0].updatedAt).toBe(mockAnnouncementsData[0].updated_at)
    })

    it('空のデータを処理できる', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const emptyMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: [],
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(emptyMockFrom)

      const { result } = renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const emptyResult = await loadFunction()

      expect(emptyResult).toEqual([])
    })
  })

  describe('カテゴリと重要度の型', () => {
    it('全カテゴリタイプを正しく変換する', async () => {
      const allCategoriesData = [
        { ...mockAnnouncementsData[0], category: 'maintenance' },
        { ...mockAnnouncementsData[0], id: 'ann-3', category: 'feature' },
        { ...mockAnnouncementsData[0], id: 'ann-4', category: 'warning' },
        { ...mockAnnouncementsData[0], id: 'ann-5', category: 'info' },
        { ...mockAnnouncementsData[0], id: 'ann-6', category: 'event' }
      ]

      const { supabase } = await import('@/integrations/supabase/client')

      const categoryMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: allCategoriesData,
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(categoryMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result[0].category).toBe('maintenance')
      expect(result[1].category).toBe('feature')
      expect(result[2].category).toBe('warning')
      expect(result[3].category).toBe('info')
      expect(result[4].category).toBe('event')
    })

    it('全重要度タイプを正しく変換する', async () => {
      const allImportancesData = [
        { ...mockAnnouncementsData[0], importance: 'low' },
        { ...mockAnnouncementsData[0], id: 'ann-7', importance: 'normal' },
        { ...mockAnnouncementsData[0], id: 'ann-8', importance: 'high' },
        { ...mockAnnouncementsData[0], id: 'ann-9', importance: 'critical' }
      ]

      const { supabase } = await import('@/integrations/supabase/client')

      const importanceMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: allImportancesData,
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(importanceMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result[0].importance).toBe('low')
      expect(result[1].importance).toBe('normal')
      expect(result[2].importance).toBe('high')
      expect(result[3].importance).toBe('critical')
    })
  })

  describe('エラーハンドリング', () => {
    it('データ取得エラーをthrowする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const testError = new Error('Failed to fetch announcements')

      const errorMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: null,
              error: testError
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(errorMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]

      await expect(loadFunction()).rejects.toThrow('Failed to fetch announcements')
    })

    it('executeのエラーはuseAsyncStateが処理する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const testError = new Error('Database error')

      const errorMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: null,
              error: testError
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(errorMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      // エラーは useAsyncState が処理するため、ここでは throw されることを確認
      const loadFunction = mockExecute.mock.calls[0][0]
      await expect(loadFunction()).rejects.toThrow('Database error')
    })
  })

  describe('refresh機能', () => {
    it('refresh関数でデータを再読み込みできる', () => {
      const { result } = renderHook(() => useAnnouncements())

      // 初期executeをクリア
      mockExecute.mockClear()

      act(() => {
        result.current.refresh()
      })

      expect(mockExecute).toHaveBeenCalledWith(expect.any(Function))
    })

    it('refreshでも50件制限を使用', async () => {
      const { result } = renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      mockExecute.mockClear()
      mockFrom.mockClear()

      act(() => {
        result.current.refresh()
      })

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      await loadFunction()

      const fromCall = mockFrom.mock.results[0].value
      const selectCall = fromCall.select.mock.results[0].value
      const orderCall = selectCall.order.mock.results[0].value

      expect(orderCall.limit).toHaveBeenCalledWith(50)
    })
  })

  describe('useAsyncState連携', () => {
    it('announcementsStateのデータを公開する', () => {
      mockAsyncState.data = expectedAnnouncements

      const { result } = renderHook(() => useAnnouncements())

      expect(result.current.announcements).toEqual(expectedAnnouncements)
    })

    it('loadingStateを公開する', () => {
      mockAsyncState.loading = true

      const { result } = renderHook(() => useAnnouncements())

      expect(result.current.loading).toBe(true)
    })

    it('errorStateを公開する', () => {
      const mockError: { type: string; message: string } = { type: 'SERVER', message: 'エラー' }
      mockAsyncState.error = mockError

      const { result } = renderHook(() => useAnnouncements())

      expect(result.current.error).toEqual(mockError)
    })
  })

  describe('データ変換の詳細', () => {
    it('null値を正しく保持する', async () => {
      const dataWithNulls = [
        {
          ...mockAnnouncementsData[0],
          publish_at: null,
          expire_at: null
        }
      ]

      const { supabase } = await import('@/integrations/supabase/client')

      const nullMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: dataWithNulls,
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(nullMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result[0].publishAt).toBeNull()
      expect(result[0].expireAt).toBeNull()
    })

    it('targetUserRoleの全パターンを処理する', async () => {
      const allRolesData = [
        { ...mockAnnouncementsData[0], target_user_role: 'all' },
        { ...mockAnnouncementsData[0], id: 'ann-10', target_user_role: 'user' },
        { ...mockAnnouncementsData[0], id: 'ann-11', target_user_role: 'moderator' },
        { ...mockAnnouncementsData[0], id: 'ann-12', target_user_role: 'admin' }
      ]

      const { supabase } = await import('@/integrations/supabase/client')

      const roleMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: allRolesData,
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(roleMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result[0].targetUserRole).toBe('all')
      expect(result[1].targetUserRole).toBe('user')
      expect(result[2].targetUserRole).toBe('moderator')
      expect(result[3].targetUserRole).toBe('admin')
    })
  })

  describe('エッジケース', () => {
    it('publishedがfalseのデータも処理できる', async () => {
      const unpublishedData = [
        {
          ...mockAnnouncementsData[0],
          published: false
        }
      ]

      const { supabase } = await import('@/integrations/supabase/client')

      const unpublishedMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: unpublishedData,
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(unpublishedMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result[0].published).toBe(false)
    })

    it('大量データ（50件）を処理できる', async () => {
      const largeData = Array.from({ length: 50 }, (_, i) => ({
        ...mockAnnouncementsData[0],
        id: `ann-${i}`,
        title: `お知らせ${i}`
      }))

      const { supabase } = await import('@/integrations/supabase/client')

      const largeMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({
              data: largeData,
              error: null
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(largeMockFrom)

      renderHook(() => useAnnouncements())

      await waitFor(() => {
        expect(mockExecute).toHaveBeenCalled()
      })

      const loadFunction = mockExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result).toHaveLength(50)
      expect(result[0].title).toBe('お知らせ0')
      expect(result[49].title).toBe('お知らせ49')
    })
  })
})
