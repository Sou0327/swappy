/**
 * useUserRole フックの単体テスト
 * ロールベースアクセス制御の中核機能をテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUserRole, UserRole } from '@/hooks/useUserRole'
import { testUsers } from '@/test/fixtures/comprehensive-fixtures'
import * as AuthContext from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client')

describe('useUserRole', () => {
  let mockUseAuth: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockUseAuth = vi.fn()
    vi.spyOn(AuthContext, 'useAuth').mockImplementation(mockUseAuth)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ヘルパー関数: Supabaseモックのセットアップ
  const setupSupabaseMock = (userId: string, role: UserRole | null, error: { message: string; code: string } | null = null) => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: role ? { role } : null,
      error
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

    vi.mocked(supabase.from).mockImplementation(mockFrom)
  }

  describe('未ログイン状態', () => {
    it('userがnullの場合、roleもnullでloadingがfalseになる', async () => {
      mockUseAuth.mockReturnValue({ user: null })

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBeNull()
    })
  })

  describe('ログイン状態 - 正常系', () => {
    it('adminロールのユーザーの場合、role: "admin"を返す', async () => {
      const mockUser = { id: testUsers.adminUser.id, email: testUsers.adminUser.email }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, 'admin')

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBe('admin')
    })

    it('moderatorロールのユーザーの場合、role: "moderator"を返す', async () => {
      const mockUser = { id: testUsers.moderatorUser.id, email: testUsers.moderatorUser.email }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, 'moderator')

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBe('moderator')
    })

    it('通常ユーザーの場合、role: "user"を返す', async () => {
      const mockUser = { id: testUsers.normalUser.id, email: testUsers.normalUser.email }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, 'user')

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBe('user')
    })
  })

  describe('エラーハンドリング', () => {
    it('データベースエラー時、デフォルトで"user"ロールを返す', async () => {
      const mockUser = { id: 'error-user-id', email: 'error@example.com' }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, null, { message: 'Database error', code: 'DB_ERROR' })

      // console.errorをモック
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBe('user')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching user role:',
        expect.objectContaining({ message: 'Database error' })
      )

      consoleErrorSpy.mockRestore()
    })

    it('user_rolesレコードが存在しない場合、デフォルトで"user"ロールを返す', async () => {
      const mockUser = { id: 'no-role-user-id', email: 'norole@example.com' }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, null, { message: 'No rows found', code: 'PGRST116' })

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBe('user')
      consoleErrorSpy.mockRestore()
    })

    it('予期しない例外が発生した場合も、デフォルトで"user"ロールを返す', async () => {
      const mockUser = { id: 'exception-user-id', email: 'exception@example.com' }
      mockUseAuth.mockReturnValue({ user: mockUser })

      // 例外を投げるモックを設定
      const mockSingle = vi.fn().mockRejectedValue(new Error('Unexpected error'))
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

      vi.mocked(supabase.from).mockImplementation(mockFrom)

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { result } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.role).toBe('user')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching user role:',
        expect.any(Error)
      )

      consoleErrorSpy.mockRestore()
    })
  })

  describe('ローディング状態', () => {
    it('初期状態でloadingがtrueである', () => {
      const mockUser = { id: testUsers.normalUser.id, email: testUsers.normalUser.email }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, 'user')

      const { result } = renderHook(() => useUserRole())

      expect(result.current.loading).toBe(true)
    })

    it('データ取得完了後、loadingがfalseになる', async () => {
      const mockUser = { id: testUsers.normalUser.id, email: testUsers.normalUser.email }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, 'user')

      const { result } = renderHook(() => useUserRole())

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })
  })

  describe('userの変更検知', () => {
    it('userが変更された際、新しいロールを再取得する', async () => {
      const firstUser = { id: testUsers.normalUser.id, email: testUsers.normalUser.email }
      const secondUser = { id: testUsers.adminUser.id, email: testUsers.adminUser.email }

      mockUseAuth.mockReturnValue({ user: firstUser })
      setupSupabaseMock(firstUser.id, 'user')

      const { result, rerender } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.role).toBe('user')
      })

      // 2番目のユーザー用のモックを設定
      setupSupabaseMock(secondUser.id, 'admin')

      // userを変更
      mockUseAuth.mockReturnValue({ user: secondUser })
      rerender()

      await waitFor(() => {
        expect(result.current.role).toBe('admin')
      })
    })

    it('userがnullに変更された際、roleもnullになる', async () => {
      const mockUser = { id: testUsers.normalUser.id, email: testUsers.normalUser.email }
      mockUseAuth.mockReturnValue({ user: mockUser })
      setupSupabaseMock(mockUser.id, 'user')

      const { result, rerender } = renderHook(() => useUserRole())

      await waitFor(() => {
        expect(result.current.role).toBe('user')
      })

      // ログアウト
      mockUseAuth.mockReturnValue({ user: null })
      rerender()

      await waitFor(() => {
        expect(result.current.role).toBeNull()
        expect(result.current.loading).toBe(false)
      })
    })
  })
})
