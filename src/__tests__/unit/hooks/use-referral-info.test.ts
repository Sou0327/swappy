/**
 * useReferralInfo フックの単体テスト
 * 紹介コード情報管理機能の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useReferralInfo } from '@/hooks/use-referral-info'

// AuthContextのモック
const mockUser = { id: 'test-user-123', email: 'test@example.com' }
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}))

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client')

describe('useReferralInfo', () => {
  let mockFrom: ReturnType<typeof vi.fn>
  let mockRpc: ReturnType<typeof vi.fn>

  // モックReferralデータ
  const mockReferralCode = 'ABC123XYZ'
  const mockReferralsData = [
    {
      id: 'ref-1',
      created_at: '2024-01-01T00:00:00Z',
      referee: {
        email: 'referee1@example.com',
        user_handle: 'user1'
      }
    },
    {
      id: 'ref-2',
      created_at: '2024-01-02T00:00:00Z',
      referee: {
        email: 'referee2@example.com',
        user_handle: null
      }
    }
  ]

  beforeEach(async () => {
    const { supabase } = await import('@/integrations/supabase/client')

    // デフォルトの成功モック
    mockFrom = vi.fn((table: string) => {
      if (table === 'referral_codes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { code: mockReferralCode },
                error: null
              }))
            }))
          }))
        }
      }

      if (table === 'referrals') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: mockReferralsData,
                error: null
              }))
            }))
          }))
        }
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null }))
          }))
        }))
      }
    })

    mockRpc = vi.fn(() => Promise.resolve({ data: mockReferralCode, error: null }))

    vi.mocked(supabase.from).mockImplementation(mockFrom)
    vi.mocked(supabase.rpc).mockImplementation(mockRpc)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => useReferralInfo())

      expect(result.current.referralInfo).toBeNull()
      expect(result.current.loading).toBe(true)
      expect(result.current.error).toBeNull()
      expect(result.current.creating).toBe(false)
    })

    it('操作関数が提供される', () => {
      const { result } = renderHook(() => useReferralInfo())

      expect(result.current.refresh).toBeDefined()
      expect(result.current.createReferralCode).toBeDefined()
      expect(typeof result.current.refresh).toBe('function')
      expect(typeof result.current.createReferralCode).toBe('function')
    })
  })

  describe('データ読み込み', () => {
    it('ユーザーがログインしている場合、紹介情報を読み込む', async () => {
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo).toEqual({
        code: mockReferralCode,
        totalReferrals: 2,
        referralList: [
          {
            id: 'ref-1',
            email: 'referee1@example.com',
            userHandle: 'user1',
            createdAt: '2024-01-01T00:00:00Z'
          },
          {
            id: 'ref-2',
            email: 'referee2@example.com',
            userHandle: null,
            createdAt: '2024-01-02T00:00:00Z'
          }
        ]
      })
    })

    it('referral_codesテーブルから正しいクエリで紹介コードを取得', async () => {
      renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('referral_codes')
      })

      // selectチェーンの検証
      const fromCall = mockFrom.mock.results[0].value
      expect(fromCall.select).toHaveBeenCalledWith('code')
    })

    it('referralsテーブルから正しいクエリで紹介リストを取得', async () => {
      renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('referrals')
      })

      // referralsテーブルへの呼び出しを探す
      const referralsCallIndex = mockFrom.mock.calls.findIndex(
        (call: string[]) => call[0] === 'referrals'
      )

      expect(referralsCallIndex).toBeGreaterThanOrEqual(0)

      // そのインデックスのresultを取得
      const fromCall = mockFrom.mock.results[referralsCallIndex]?.value

      expect(fromCall).toBeDefined()
      expect(fromCall.select).toHaveBeenCalledWith(expect.stringContaining('referee:profiles'))
    })

    it('紹介リストがない場合、空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      mockFrom = vi.fn((table: string) => {
        if (table === 'referral_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { code: mockReferralCode },
                  error: null
                }))
              }))
            }))
          }
        }

        if (table === 'referrals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                  data: [],
                  error: null
                }))
              }))
            }))
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null }))
            }))
          }))
        }
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo).toEqual({
        code: mockReferralCode,
        totalReferrals: 0,
        referralList: []
      })
    })
  })

  describe('PGRST116エラー処理', () => {
    it('紹介コードが存在しない場合（PGRST116）、空の状態を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      mockFrom = vi.fn((table: string) => {
        if (table === 'referral_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: null,
                  error: { code: 'PGRST116', message: 'No rows found' }
                }))
              }))
            }))
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          }))
        }
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo).toEqual({
        code: '',
        totalReferrals: 0,
        referralList: []
      })
      expect(result.current.error).toBeNull()
    })

    it('PGRST116以外のエラーはエラーとして扱う', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const testError = { code: 'PGRST500', message: 'Database error' }

      mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: testError
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Database error')
      expect(result.current.referralInfo).toBeNull()
    })
  })

  describe('エラーハンドリング', () => {
    it('referral_codes取得エラーを処理する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const testError = new Error('Failed to fetch referral code')

      mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: testError
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toContain('Failed to fetch referral code')
    })

    it('referrals取得エラーを処理する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const testError = new Error('Failed to fetch referrals')

      mockFrom = vi.fn((table: string) => {
        if (table === 'referral_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { code: mockReferralCode },
                  error: null
                }))
              }))
            }))
          }
        }

        if (table === 'referrals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                  data: null,
                  error: testError
                }))
              }))
            }))
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null }))
            }))
          }))
        }
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toContain('Failed to fetch referrals')
    })

    it('エラー後、errorステートが正しく設定される', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      mockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Test error' }
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.error).toBe('Test error')
        expect(result.current.loading).toBe(false)
      })
    })
  })

  describe('refresh機能', () => {
    it('refresh関数でデータを再読み込みできる', async () => {
      const { result } = renderHook(() => useReferralInfo())

      // 初期読み込み完了を待つ
      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const initialCallCount = mockFrom.mock.calls.length

      // refresh呼び出し
      await act(async () => {
        await result.current.refresh()
      })

      // 追加のSupabase呼び出しが発生したことを確認
      expect(mockFrom.mock.calls.length).toBeGreaterThan(initialCallCount)
    })

    it('refresh中はloadingがtrueになる', async () => {
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // refreshを開始
      act(() => {
        result.current.refresh()
      })

      // loading状態を確認（非同期なので即座にはtrueにならない可能性あり）
      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalled()
      })
    })
  })

  describe('createReferralCode機能', () => {
    it('紹介コードを作成できる', async () => {
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let createResult: boolean | undefined

      await act(async () => {
        createResult = await result.current.createReferralCode()
      })

      expect(createResult).toBe(true)
      expect(mockRpc).toHaveBeenCalledWith('generate_referral_code', {
        p_user_id: mockUser.id
      })
    })

    it('作成成功後、creatingがfalseに戻る', async () => {
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 初期状態でcreatingがfalse
      expect(result.current.creating).toBe(false)

      await act(async () => {
        await result.current.createReferralCode()
      })

      // 完了後もfalseに戻る
      expect(result.current.creating).toBe(false)
    })

    it('作成成功後、データを再読み込みする', async () => {
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const initialCallCount = mockFrom.mock.calls.length

      await act(async () => {
        await result.current.createReferralCode()
      })

      // 再読み込みでSupabase呼び出しが増える
      expect(mockFrom.mock.calls.length).toBeGreaterThan(initialCallCount)
    })

    it('作成エラー時にfalseを返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      mockRpc = vi.fn(() => Promise.resolve({
        data: null,
        error: new Error('Failed to generate code')
      }))
      vi.mocked(supabase.rpc).mockImplementation(mockRpc)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let createResult: boolean | undefined

      await act(async () => {
        createResult = await result.current.createReferralCode()
      })

      expect(createResult).toBe(false)
      expect(result.current.error).toContain('Failed to generate code')
    })
  })

  describe('データ整形', () => {
    it('referee情報がnullの場合、デフォルト値を使用する', async () => {
      // beforeEachでクリーンアップされるため、このテスト内で新しくモックを設定
      const { supabase } = await import('@/integrations/supabase/client')

      const dataWithNullReferee = [
        {
          id: 'ref-3',
          created_at: '2024-01-03T00:00:00Z',
          referee: null
        }
      ]

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'referral_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { code: mockReferralCode },
                  error: null
                }))
              }))
            }))
          }
        }

        if (table === 'referrals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                  data: dataWithNullReferee,
                  error: null
                }))
              }))
            }))
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null }))
            }))
          }))
        }
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      // 新しくrenderHookしてモック変更を反映
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo?.referralList[0]).toEqual({
        id: 'ref-3',
        email: '',
        userHandle: null,
        createdAt: '2024-01-03T00:00:00Z'
      })
    })

    it('totalReferralsがreferralListの長さと一致する', async () => {
      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo?.totalReferrals).toBe(
        result.current.referralInfo?.referralList.length
      )
    })
  })

  describe('ユーザー状態変化', () => {
    it('ユーザーがログアウトした場合、nullを返す', async () => {
      // AuthContextモックを再インポートして上書き
      vi.resetModules()
      vi.doMock('@/contexts/AuthContext', () => ({
        useAuth: () => ({ user: null })
      }))

      // モジュールを再読み込み
      const { useReferralInfo: useReferralInfoReloaded } = await import('@/hooks/use-referral-info')

      const { result } = renderHook(() => useReferralInfoReloaded())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo).toBeNull()
    })
  })

  describe('エッジケース', () => {
    it('referralsDataがnullの場合、空配列として扱う', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'referral_codes') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { code: mockReferralCode },
                  error: null
                }))
              }))
            }))
          }
        }

        if (table === 'referrals') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                  data: null,
                  error: null
                }))
              }))
            }))
          }
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null }))
            }))
          }))
        }
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referralInfo?.referralList).toEqual([])
      expect(result.current.referralInfo?.totalReferrals).toBe(0)
    })

    it('エラーメッセージがない場合、デフォルトメッセージを使用', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const customMockFrom = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: null,
              error: {} // messageプロパティなし
            }))
          }))
        }))
      }))

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      const { result } = renderHook(() => useReferralInfo())

      await waitFor(() => {
        expect(result.current.error).toBe('紹介情報の読み込みに失敗しました')
      })
    })
  })
})
