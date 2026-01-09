/**
 * use-admin-referrals フックの単体テスト
 * 管理者向け紹介コード管理の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAdminReferrals } from '@/hooks/use-admin-referrals'
import type { AdminReferralStats, ReferralDetail, TopReferrer } from '@/hooks/use-admin-referrals'

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client')

describe('useAdminReferrals', () => {
  // モック統計データ
  const mockStats: AdminReferralStats = {
    totalCodes: 150,
    totalReferrals: 200,
    activeReferrals: 200
  }

  // モック紹介一覧データ（DB形式）
  const mockReferralRows = [
    {
      id: 'ref-1',
      created_at: '2024-01-01T00:00:00Z',
      referrer: { email: 'referrer1@example.com', user_handle: 'ref1' },
      referee: { email: 'referee1@example.com', user_handle: 'new1' },
      referral_code: { code: 'CODE123' }
    },
    {
      id: 'ref-2',
      created_at: '2024-01-02T00:00:00Z',
      referrer: { email: 'referrer2@example.com', user_handle: 'ref2' },
      referee: { email: 'referee2@example.com', user_handle: null },
      referral_code: { code: 'CODE456' }
    }
  ]

  // モック紹介一覧データ（マッピング後）
  const expectedReferrals: ReferralDetail[] = [
    {
      id: 'ref-1',
      referrerEmail: 'referrer1@example.com',
      referrerHandle: 'ref1',
      refereeEmail: 'referee1@example.com',
      refereeHandle: 'new1',
      referralCode: 'CODE123',
      createdAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 'ref-2',
      referrerEmail: 'referrer2@example.com',
      referrerHandle: 'ref2',
      refereeEmail: 'referee2@example.com',
      refereeHandle: null,
      referralCode: 'CODE456',
      createdAt: '2024-01-02T00:00:00Z'
    }
  ]

  // モックトップ紹介者データ（全referrals）
  const mockAllReferralsForRanking = [
    {
      referrer_id: 'user-1',
      referrer: { email: 'top1@example.com', user_handle: 'top1' },
      referral_code: { code: 'TOP1CODE' }
    },
    {
      referrer_id: 'user-1',
      referrer: { email: 'top1@example.com', user_handle: 'top1' },
      referral_code: { code: 'TOP1CODE' }
    },
    {
      referrer_id: 'user-1',
      referrer: { email: 'top1@example.com', user_handle: 'top1' },
      referral_code: { code: 'TOP1CODE' }
    },
    {
      referrer_id: 'user-2',
      referrer: { email: 'top2@example.com', user_handle: 'top2' },
      referral_code: { code: 'TOP2CODE' }
    },
    {
      referrer_id: 'user-2',
      referrer: { email: 'top2@example.com', user_handle: 'top2' },
      referral_code: { code: 'TOP2CODE' }
    }
  ]

  // 期待されるトップ紹介者（カウント後、降順ソート）
  const expectedTopReferrers: TopReferrer[] = [
    {
      userId: 'user-1',
      email: 'top1@example.com',
      userHandle: 'top1',
      referralCode: 'TOP1CODE',
      referralCount: 3
    },
    {
      userId: 'user-2',
      email: 'top2@example.com',
      userHandle: 'top2',
      referralCode: 'TOP2CODE',
      referralCount: 2
    }
  ]

  let mockFrom: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    const { supabase } = await import('@/integrations/supabase/client')

    // referralsテーブルへのselect呼び出しカウント
    let referralsSelectCallCount = 0

    // デフォルトのモック設定
    mockFrom = vi.fn((tableName: string) => {
      if (tableName === 'referral_codes') {
        return {
          select: vi.fn(() => Promise.resolve({ count: mockStats.totalCodes, error: null }))
        }
      } else if (tableName === 'referrals') {
        return {
          select: vi.fn((query?: string) => {
            // 統計用（count query - 1回目）
            if (!query || query === '*') {
              return Promise.resolve({ count: mockStats.totalReferrals, error: null })
            }

            // selectが呼ばれるたびにカウント
            referralsSelectCallCount++
            const currentCall = referralsSelectCallCount

            // 紹介一覧用（JOIN query - 2回目）
            if (currentCall === 1 && query.includes('referrer:profiles')) {
              return {
                order: vi.fn(() => ({
                  range: vi.fn(() => Promise.resolve({ data: mockReferralRows, error: null }))
                }))
              }
            }

            // トップ紹介者用（ランキングクエリ - 3回目）
            if (currentCall === 2 && query.includes('referrer:profiles')) {
              return Promise.resolve({ data: mockAllReferralsForRanking, error: null })
            }

            // デフォルト
            return Promise.resolve({ data: [], error: null })
          })
        }
      }
      return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
    })

    vi.mocked(supabase.from).mockImplementation(mockFrom)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => useAdminReferrals())

      expect(result.current.loading).toBe(true)
      expect(result.current.error).toBeNull()
      expect(result.current.stats).toBeNull()
      expect(result.current.referrals).toEqual([])
      expect(result.current.topReferrers).toEqual([])
      expect(result.current.currentPage).toBe(1)
      expect(result.current.pageSize).toBe(50)
      expect(result.current.totalCount).toBe(0)
    })

    it('操作関数が提供される', () => {
      const { result } = renderHook(() => useAdminReferrals())

      expect(result.current.refresh).toBeDefined()
      expect(result.current.goToPage).toBeDefined()
      expect(result.current.changePageSize).toBeDefined()
    })

    it('初期化時にloadDataが呼ばれる', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // データが読み込まれていることを確認
      expect(result.current.stats).toEqual(mockStats)
    })
  })

  describe('loadData - 統計データ取得', () => {
    it('referral_codesとreferralsの統計を並列取得する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockFrom).toHaveBeenCalledWith('referral_codes')
      expect(mockFrom).toHaveBeenCalledWith('referrals')
      expect(result.current.stats).toEqual({
        totalCodes: 150,
        totalReferrals: 200,
        activeReferrals: 200
      })
    })

    it('統計データがnullの場合、0として扱う', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: null, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn(() => Promise.resolve({ count: null, error: null }))
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.stats).toEqual({
        totalCodes: 0,
        totalReferrals: 0,
        activeReferrals: 0
      })
      expect(result.current.totalCount).toBe(0)
    })
  })

  describe('loadData - 紹介一覧取得', () => {
    it('紹介一覧をページネーション付きで取得する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referrals).toEqual(expectedReferrals)
    })

    it('JOINデータを正しくマッピングする', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const firstReferral = result.current.referrals[0]
      expect(firstReferral.referrerEmail).toBe('referrer1@example.com')
      expect(firstReferral.referrerHandle).toBe('ref1')
      expect(firstReferral.refereeEmail).toBe('referee1@example.com')
      expect(firstReferral.refereeHandle).toBe('new1')
      expect(firstReferral.referralCode).toBe('CODE123')
    })

    it('null値を適切に処理する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const secondReferral = result.current.referrals[1]
      expect(secondReferral.refereeHandle).toBeNull()
    })

    it('空データの場合、空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 0, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 0, error: null })
              }
              if (query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: [], error: null }))
                  }))
                }
              }
              return Promise.resolve({ data: [], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referrals).toEqual([])
    })

    it('referrer/referee/referral_codeがnullの場合、空文字/nullとして扱う', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const incompleteReferralRow = {
        id: 'ref-3',
        created_at: '2024-01-03T00:00:00Z',
        referrer: null,
        referee: null,
        referral_code: null
      }

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 1, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 1, error: null })
              }
              if (query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: [incompleteReferralRow], error: null }))
                  }))
                }
              }
              return Promise.resolve({ data: [{ referrer_id: null }], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.referrals[0]).toEqual({
        id: 'ref-3',
        referrerEmail: '',
        referrerHandle: null,
        refereeEmail: '',
        refereeHandle: null,
        referralCode: '',
        createdAt: '2024-01-03T00:00:00Z'
      })
    })
  })

  describe('loadData - トップ紹介者取得', () => {
    it('全紹介データからトップ紹介者を集計する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.topReferrers).toEqual(expectedTopReferrers)
    })

    it('紹介者をカウント降順でソートする', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const counts = result.current.topReferrers.map(r => r.referralCount)
      expect(counts).toEqual([3, 2])
    })

    it('トップ10を抽出する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // 15人の紹介者データを作成
      const manyReferrers = Array.from({ length: 15 }, (_, i) => ({
        referrer_id: `user-${i}`,
        referrer: { email: `user${i}@example.com`, user_handle: `user${i}` },
        referral_code: { code: `CODE${i}` }
      }))

      let selectCallCount = 0

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 15, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 15, error: null })
              }

              selectCallCount++
              const currentCall = selectCallCount

              if (currentCall === 1 && query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: [], error: null }))
                  }))
                }
              }

              // トップ紹介者クエリ（2回目）
              if (currentCall === 2 && query.includes('referrer:profiles')) {
                return Promise.resolve({ data: manyReferrers, error: null })
              }

              return Promise.resolve({ data: [], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.topReferrers.length).toBe(10)
    })

    it('referrer_idがnullの紹介は除外する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const referralsWithNull = [
        {
          referrer_id: 'user-1',
          referrer: { email: 'valid@example.com', user_handle: 'valid' },
          referral_code: { code: 'VALIDCODE' }
        },
        {
          referrer_id: null,
          referrer: null,
          referral_code: null
        }
      ]

      let selectCallCount = 0

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 2, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 2, error: null })
              }

              selectCallCount++
              const currentCall = selectCallCount

              if (currentCall === 1 && query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: [], error: null }))
                  }))
                }
              }

              // トップ紹介者クエリ（2回目）
              if (currentCall === 2 && query.includes('referrer:profiles')) {
                return Promise.resolve({ data: referralsWithNull, error: null })
              }

              return Promise.resolve({ data: [], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.topReferrers.length).toBe(1)
      expect(result.current.topReferrers[0].userId).toBe('user-1')
    })

    it('トップ紹介者データが空の場合、空配列を返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 0, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 0, error: null })
              }
              if (query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: [], error: null }))
                  }))
                }
              }
              return Promise.resolve({ data: [], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.topReferrers).toEqual([])
    })
  })

  describe('ページネーション', () => {
    it('currentPage変更時にoffsetが計算される', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // ページ2に移動
      act(() => {
        result.current.goToPage(2)
      })

      expect(result.current.currentPage).toBe(2)
    })

    it('rangeメソッドにoffsetとlimitが渡される', async () => {
      let capturedRange: [number, number] | null = null

      const { supabase } = await import('@/integrations/supabase/client')

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 100, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 100, error: null })
              }
              if (query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn((start: number, end: number) => {
                      capturedRange = [start, end]
                      return Promise.resolve({ data: mockReferralRows, error: null })
                    })
                  }))
                }
              }
              return Promise.resolve({ data: mockAllReferralsForRanking, error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 初期ページ（1）: offset = 0, limit = 50
      expect(capturedRange).toEqual([0, 49])

      // ページ2に移動: offset = 50, limit = 50
      act(() => {
        result.current.goToPage(2)
      })

      await waitFor(() => {
        expect(capturedRange).toEqual([50, 99])
      })
    })

    it('totalPagesが正しく計算される', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // totalCount: 200, pageSize: 50 → totalPages: 4
      expect(result.current.totalPages).toBe(4)
    })

    it('goToPage: 有効範囲内のページに移動できる', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.goToPage(3)
      })

      expect(result.current.currentPage).toBe(3)
    })

    it('goToPage: 範囲外（<1）の場合、ページを変更しない', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.goToPage(0)
      })

      expect(result.current.currentPage).toBe(1)
    })

    it('goToPage: 範囲外（>totalPages）の場合、ページを変更しない', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.goToPage(10)
      })

      expect(result.current.currentPage).toBe(1)
    })

    it('changePageSize: ページサイズを変更する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.changePageSize(100)
      })

      expect(result.current.pageSize).toBe(100)
    })

    it('changePageSize: currentPageを1にリセットする', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // まずページ3に移動
      act(() => {
        result.current.goToPage(3)
      })

      expect(result.current.currentPage).toBe(3)

      // ページサイズ変更
      act(() => {
        result.current.changePageSize(100)
      })

      expect(result.current.currentPage).toBe(1)
    })
  })

  describe('refresh機能', () => {
    it('refreshを呼ぶとloadDataが再実行される', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 初回読み込み完了
      expect(result.current.stats).toEqual(mockStats)

      act(() => {
        result.current.refresh()
      })

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.stats).toEqual(mockStats)
    })
  })

  describe('エラーハンドリング', () => {
    it('紹介一覧取得エラーをキャッチする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const referralError = new Error('紹介一覧取得エラー')

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 10, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 10, error: null })
              }
              if (query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: null, error: referralError }))
                  }))
                }
              }
              return Promise.resolve({ data: [], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('紹介一覧取得エラー')
    })

    it('トップ紹介者取得エラーをキャッチする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const rankingError = new Error('ランキング取得エラー')

      let selectCallCount = 0

      vi.mocked(supabase.from).mockImplementation((tableName: string) => {
        if (tableName === 'referral_codes') {
          return {
            select: vi.fn(() => Promise.resolve({ count: 10, error: null }))
          }
        } else if (tableName === 'referrals') {
          return {
            select: vi.fn((query?: string) => {
              if (!query || query === '*') {
                return Promise.resolve({ count: 10, error: null })
              }

              selectCallCount++
              const currentCall = selectCallCount

              if (currentCall === 1 && query.includes('referrer:profiles')) {
                return {
                  order: vi.fn(() => ({
                    range: vi.fn(() => Promise.resolve({ data: mockReferralRows, error: null }))
                  }))
                }
              }

              // トップ紹介者クエリでエラー（2回目）
              if (currentCall === 2 && query.includes('referrer:profiles')) {
                return Promise.resolve({ data: null, error: rankingError })
              }

              return Promise.resolve({ data: [], error: null })
            })
          }
        }
        return { select: vi.fn(() => Promise.resolve({ data: [], error: null })) }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('ランキング取得エラー')
    })

    it('エラー時もloadingをfalseにする', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      vi.mocked(supabase.from).mockImplementation(() => {
        return {
          select: vi.fn(() => Promise.reject(new Error('DB接続エラー')))
        }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeTruthy()
    })

    it('エラーメッセージがない場合、デフォルトメッセージを使用する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      vi.mocked(supabase.from).mockImplementation(() => {
        return {
          select: vi.fn(() => Promise.reject({}))
        }
      })

      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('紹介データの読み込みに失敗しました')
    })
  })

  describe('状態の公開', () => {
    it('stats, referrals, topReferrersを公開する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.stats).toEqual(mockStats)
      expect(result.current.referrals).toEqual(expectedReferrals)
      expect(result.current.topReferrers).toEqual(expectedTopReferrers)
    })

    it('loading, errorを公開する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBeNull()
    })

    it('ページネーション関連の状態を公開する', async () => {
      const { result } = renderHook(() => useAdminReferrals())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.currentPage).toBe(1)
      expect(result.current.pageSize).toBe(50)
      expect(result.current.totalCount).toBe(200)
      expect(result.current.totalPages).toBe(4)
    })
  })
})
