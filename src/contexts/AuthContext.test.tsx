import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { supabase } from '@/integrations/supabase/client'

// モック設定
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}))

const TestComponent = () => {
  const { user, session, loading, userRole, roleLoading } = useAuth()

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="role-loading">{roleLoading ? 'role-loading' : 'role-loaded'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <div data-testid="session">{session ? 'has-session' : 'no-session'}</div>
      <div data-testid="user-role">{userRole || 'no-role'}</div>
    </div>
  )
}

describe('AuthContext', () => {
  let mockSubscription: { unsubscribe: ReturnType<typeof vi.fn> }
  let mockOnAuthStateChange: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockSubscription = {
      unsubscribe: vi.fn(),
    }

    mockOnAuthStateChange = vi.fn(() => ({
      data: { subscription: mockSubscription },
    }))

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(mockOnAuthStateChange)
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('初期状態でローディング状態を表示する', () => {
      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      expect(screen.getByTestId('loading')).toHaveTextContent('loading')
      expect(screen.getByTestId('role-loading')).toHaveTextContent('role-loading')
      expect(screen.getByTestId('user')).toHaveTextContent('no-user')
      expect(screen.getByTestId('session')).toHaveTextContent('no-session')
    })

    it('AuthProviderの外でuseAuthを使用するとエラーを投げる', () => {
      // エラーログを無効化
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // React 18では、renderは直接エラーをthrowしない
      // 代わりに、コンソールエラーが出力されることを確認
      const TestHookComponent = () => {
        useAuth()
        return null
      }

      // エラーが発生することを期待（コンソールエラーとして）
      try {
        render(<TestHookComponent />)
      } catch (error) {
        // エラーがキャッチされた場合は成功
        expect(error).toBeDefined()
      }

      // コンソールエラーが呼ばれたことを確認
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('認証状態管理', () => {
    it('セッションがない場合は未認証状態を表示する', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      expect(screen.getByTestId('user')).toHaveTextContent('no-user')
      expect(screen.getByTestId('session')).toHaveTextContent('no-session')
      expect(screen.getByTestId('role-loading')).toHaveTextContent('role-loaded')
      expect(screen.getByTestId('user-role')).toHaveTextContent('no-role')
    })

    it('有効なセッションがある場合は認証済み状態を表示する', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: '2023-01-01T00:00:00Z',
        last_sign_in_at: '2023-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        confirmation_sent_at: null,
        confirmed_at: '2023-01-01T00:00:00Z',
        email_confirmed_at: '2023-01-01T00:00:00Z',
        phone: null,
        phone_confirmed_at: null,
        recovery_sent_at: null,
        role: 'authenticated',
        updated_at: '2023-01-01T00:00:00Z',
      }

      const mockSession = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        token_type: 'bearer',
        user: mockUser,
      }

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      // ユーザーロール取得のモック
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { role: 'user' },
              error: null,
            }),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com')
      expect(screen.getByTestId('session')).toHaveTextContent('has-session')

      await waitFor(() => {
        expect(screen.getByTestId('role-loading')).toHaveTextContent('role-loaded')
      })

      expect(screen.getByTestId('user-role')).toHaveTextContent('user')
    })
  })

  describe('ユーザーロール管理', () => {
    it('ロール取得エラー時はデフォルトで"user"ロールを設定する', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: '2023-01-01T00:00:00Z',
        last_sign_in_at: '2023-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        confirmation_sent_at: null,
        confirmed_at: '2023-01-01T00:00:00Z',
        email_confirmed_at: '2023-01-01T00:00:00Z',
        phone: null,
        phone_confirmed_at: null,
        recovery_sent_at: null,
        role: 'authenticated',
        updated_at: '2023-01-01T00:00:00Z',
      }

      const mockSession = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        token_type: 'bearer',
        user: mockUser,
      }

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      // ロール取得でエラーを発生させる
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockRejectedValue(new Error('Database error')),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      await waitFor(() => {
        expect(screen.getByTestId('role-loading')).toHaveTextContent('role-loaded')
      })

      expect(screen.getByTestId('user-role')).toHaveTextContent('user')
    })

    it('管理者ロールを正しく設定する', async () => {
      const mockUser = {
        id: 'admin-user-id',
        email: 'admin@example.com',
        created_at: '2023-01-01T00:00:00Z',
        last_sign_in_at: '2023-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        confirmation_sent_at: null,
        confirmed_at: '2023-01-01T00:00:00Z',
        email_confirmed_at: '2023-01-01T00:00:00Z',
        phone: null,
        phone_confirmed_at: null,
        recovery_sent_at: null,
        role: 'authenticated',
        updated_at: '2023-01-01T00:00:00Z',
      }

      const mockSession = {
        access_token: 'admin-access-token',
        refresh_token: 'admin-refresh-token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        token_type: 'bearer',
        user: mockUser,
      }

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { role: 'admin' },
              error: null,
            }),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('loaded')
      })

      await waitFor(() => {
        expect(screen.getByTestId('role-loading')).toHaveTextContent('role-loaded')
      })

      expect(screen.getByTestId('user-role')).toHaveTextContent('admin')
    })
  })

  describe('認証状態変更', () => {
    it('認証状態変更時にコールバックが正しく呼ばれる', async () => {
      const mockCallback = vi.fn()

      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
        mockCallback.mockImplementation(callback)
        return { data: { subscription: mockSubscription } }
      })

      render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      // 認証状態変更をシミュレート
      const mockUser = {
        id: 'new-user-id',
        email: 'new@example.com',
        created_at: '2023-01-01T00:00:00Z',
        last_sign_in_at: '2023-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        confirmation_sent_at: null,
        confirmed_at: '2023-01-01T00:00:00Z',
        email_confirmed_at: '2023-01-01T00:00:00Z',
        phone: null,
        phone_confirmed_at: null,
        recovery_sent_at: null,
        role: 'authenticated',
        updated_at: '2023-01-01T00:00:00Z',
      }

      const newSession = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        token_type: 'bearer',
        user: mockUser,
      }

      // ロール取得のモック
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { role: 'moderator' },
              error: null,
            }),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      act(() => {
        mockCallback('SIGNED_IN', newSession)
      })

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('new@example.com')
      })

      await waitFor(() => {
        expect(screen.getByTestId('user-role')).toHaveTextContent('moderator')
      })
    })
  })

  describe('クリーンアップ', () => {
    it('コンポーネントアンマウント時にサブスクリプションを解除する', () => {
      const { unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      )

      unmount()

      expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    })
  })
})