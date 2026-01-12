import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Auth from './Auth'
import { supabase } from '@/integrations/supabase/client'

// useNavigateのモック
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// useToastのモック
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}))

// Supabaseのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

const renderAuth = () => {
  return render(
    <BrowserRouter>
      <Auth />
    </BrowserRouter>
  )
}

describe('Auth コンポーネント', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    // デフォルトで制限なし
    import.meta.env.VITE_SERVICE_RESTRICTION_MODE = undefined

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('初期表示', () => {
    it('ログインと新規登録のタブが表示される', () => {
      renderAuth()

      expect(screen.getByRole('tab', { name: /ログイン/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /新規登録/i })).toBeInTheDocument()
    })

    it('デフォルトでログインタブが選択されている', () => {
      renderAuth()

      expect(screen.getByRole('tab', { name: /ログイン/i })).toHaveAttribute('data-state', 'active')
    })

    it('必要な入力フィールドが表示される', () => {
      renderAuth()

      expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /ログイン/i })).toBeInTheDocument()
    })
  })

  describe('ログイン機能', () => {
    it('有効な認証情報でログインが成功する', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
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
          },
          session: null,
        },
        error: null,
      })

      renderAuth()

      // フォーム入力
      await user.type(screen.getByLabelText(/メールアドレス/i), 'test@example.com')
      await user.type(screen.getByLabelText(/パスワード/i), 'password123')

      // ログインボタンクリック
      await user.click(screen.getByRole('button', { name: /ログイン/i }))

      await waitFor(() => {
        expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        })
      })

      expect(mockToast).toHaveBeenCalledWith({
        title: 'おかえりなさい！',
        description: '正常にログインしました。',
      })
    })

    it('無効な認証情報でログインが失敗する', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: new Error('Invalid login credentials'),
      })

      renderAuth()

      await user.type(screen.getByLabelText(/メールアドレス/i), 'invalid@example.com')
      await user.type(screen.getByLabelText(/パスワード/i), 'wrongpassword')
      await user.click(screen.getByRole('button', { name: /ログイン/i }))

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'ログインに失敗しました',
          description: 'Invalid login credentials',
          variant: 'destructive',
        })
      })
    })

    it('空のフィールドでログインを試行する（HTML5バリデーションで阻止される）', async () => {
      const user = userEvent.setup()

      renderAuth()

      // HTML5 required属性により、空のフィールドではフォーム送信されない
      await user.click(screen.getByRole('button', { name: /ログイン/i }))

      // signInWithPasswordは呼ばれないことを確認
      expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
    })
  })

  describe('サインアップ機能', () => {
    beforeEach(async () => {
      // 制限なしを明示的に設定
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = undefined

      const user = userEvent.setup()
      renderAuth()
      await user.click(screen.getByRole('tab', { name: /新規登録/i }))
    })

    it('新規登録タブの必要フィールドが表示される', () => {
      expect(screen.getByLabelText(/氏名/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument()
      expect(screen.getByLabelText('パスワード')).toBeInTheDocument()
      expect(screen.getByLabelText(/パスワード確認/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /アカウント作成/i })).toBeInTheDocument()
    })

    it('パスワードが一致しない場合エラーを表示する', async () => {
      const user = userEvent.setup()

      await user.type(screen.getByLabelText(/氏名/i), '山田太郎')
      await user.type(screen.getByLabelText(/メールアドレス/i), 'yamada@example.com')
      await user.type(screen.getByLabelText('パスワード'), 'password123')
      await user.type(screen.getByLabelText(/パスワード確認/i), 'different-password')

      await user.click(screen.getByRole('button', { name: /アカウント作成/i }))

      expect(mockToast).toHaveBeenCalledWith({
        title: 'パスワードが一致しません',
        description: '両方のパスワードが同じであることを確認してください。',
        variant: 'destructive',
      })
    })

    it('有効な情報でサインアップが成功する', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: {
          user: {
            id: 'new-user-id',
            email: 'yamada@example.com',
            created_at: '2023-01-01T00:00:00Z',
            last_sign_in_at: null,
            app_metadata: {},
            user_metadata: { full_name: '山田太郎' },
            aud: 'authenticated',
            confirmation_sent_at: '2023-01-01T00:00:00Z',
            confirmed_at: null,
            email_confirmed_at: null,
            phone: null,
            phone_confirmed_at: null,
            recovery_sent_at: null,
            role: 'authenticated',
            updated_at: '2023-01-01T00:00:00Z',
          },
          session: null,
        },
        error: null,
      })

      await user.type(screen.getByLabelText(/氏名/i), '山田太郎')
      await user.type(screen.getByLabelText(/メールアドレス/i), 'yamada@example.com')
      await user.type(screen.getByLabelText('パスワード'), 'password123')
      await user.type(screen.getByLabelText(/パスワード確認/i), 'password123')

      await user.click(screen.getByRole('button', { name: /アカウント作成/i }))

      await waitFor(() => {
        expect(supabase.auth.signUp).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'yamada@example.com',
            password: 'password123',
            options: expect.objectContaining({
              data: expect.objectContaining({
                full_name: '山田太郎',
              }),
            }),
          })
        )
      })

      expect(mockToast).toHaveBeenCalledWith({
        title: 'アカウントが正常に作成されました！',
        description: 'アカウントを確認するためにメールをチェックしてください。',
      })
    })

    it('サインアップでエラーが発生した場合エラーを表示する', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: null, session: null },
        error: new Error('User already registered'),
      })

      await user.type(screen.getByLabelText(/氏名/i), '山田太郎')
      await user.type(screen.getByLabelText(/メールアドレス/i), 'existing@example.com')
      await user.type(screen.getByLabelText('パスワード'), 'password123')
      await user.type(screen.getByLabelText(/パスワード確認/i), 'password123')

      await user.click(screen.getByRole('button', { name: /アカウント作成/i }))

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: '登録に失敗しました',
          description: 'User already registered',
          variant: 'destructive',
        })
      })
    })
  })

  describe('UI インタラクション', () => {
    beforeEach(() => {
      // 制限なしを明示的に設定
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = undefined
    })

    it('パスワードの表示/非表示を切り替えられる', async () => {
      const user = userEvent.setup()
      renderAuth()

      const passwordInput = screen.getByLabelText(/パスワード/i)
      const toggleButtons = screen.getAllByRole('button')
      const toggleButton = toggleButtons.find(btn => btn.querySelector('svg'))

      expect(toggleButton).toBeDefined()
      expect(passwordInput).toHaveAttribute('type', 'password')

      await user.click(toggleButton!)
      expect(passwordInput).toHaveAttribute('type', 'text')

      await user.click(toggleButton!)
      expect(passwordInput).toHaveAttribute('type', 'password')
    })

    it('ローディング中はボタンが無効化される', async () => {
      const user = userEvent.setup()

      // ログインを遅延させる
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
      vi.mocked(supabase.auth.signInWithPassword).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          data: { user: null, session: null },
          error: null,
        }), 100))
      )

      renderAuth()

      const loginButton = screen.getByRole('button', { name: /ログイン/i })

      await user.type(screen.getByLabelText(/メールアドレス/i), 'test@example.com')
      await user.type(screen.getByLabelText(/パスワード/i), 'password123')

      await user.click(loginButton)

      // ローディング中はボタンが無効化される
      expect(loginButton).toBeDisabled()

      await waitFor(() => {
        expect(loginButton).not.toBeDisabled()
      })
    })
  })

  describe('リダイレクト処理', () => {
    it('既にログインしている場合は自動的にリダイレクトする', async () => {
      const mockSession = {
        access_token: 'test-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        token_type: 'bearer',
        user: {
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
        },
      }

      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      })

      renderAuth()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/redirect')
      })
    })
  })

  describe('サービス制限機能', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
    })

    describe('制限なし（mode: none）', () => {
      beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        // 制限なしモードを設定
        import.meta.env.VITE_SERVICE_RESTRICTION_MODE = undefined
      })

      it('新規登録タブをクリックすると、登録フォームが表示される', async () => {
        const user = userEvent.setup()
        renderAuth()

        await user.click(screen.getByRole('tab', { name: /新規登録/i }))

        await waitFor(() => {
          expect(screen.getByLabelText(/氏名/i)).toBeInTheDocument()
          expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument()
          expect(screen.getByRole('button', { name: /アカウント作成/i })).toBeInTheDocument()
        })
      })

      it('制限メッセージは表示されない', async () => {
        const user = userEvent.setup()
        renderAuth()

        await user.click(screen.getByRole('tab', { name: /新規登録/i }))

        await waitFor(() => {
          expect(screen.queryByText(/システムメンテナンス中/i)).not.toBeInTheDocument()
          expect(screen.queryByText(/新規登録の一時停止/i)).not.toBeInTheDocument()
        })
      })
    })

    describe('制限あり（mode: partial）', () => {
      beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        // 制限ありモードを設定
        import.meta.env.VITE_SERVICE_RESTRICTION_MODE = 'partial'
      })

      it('新規登録タブをクリックすると、制限メッセージが表示される', async () => {
        const user = userEvent.setup()
        renderAuth()

        await user.click(screen.getByRole('tab', { name: /新規登録/i }))

        await waitFor(() => {
          expect(screen.getByText(/新規登録の一時停止/i)).toBeInTheDocument()
          expect(screen.getByText(/システムメンテナンス中/i)).toBeInTheDocument()
        })
      })

      it('新規登録フォームは表示されない', async () => {
        const user = userEvent.setup()
        renderAuth()

        await user.click(screen.getByRole('tab', { name: /新規登録/i }))

        await waitFor(() => {
          expect(screen.queryByLabelText(/氏名/i)).not.toBeInTheDocument()
          expect(screen.queryByRole('button', { name: /アカウント作成/i })).not.toBeInTheDocument()
        })
      })

      it('制限メッセージにエンドユーザー保護の記述がある', async () => {
        const user = userEvent.setup()
        renderAuth()

        await user.click(screen.getByRole('tab', { name: /新規登録/i }))

        await waitFor(() => {
          const userElements = screen.getAllByText(/既存ユーザー/i)
          expect(userElements.length).toBeGreaterThan(0)
          const protectionElements = screen.getAllByText(/保護/i)
          expect(protectionElements.length).toBeGreaterThan(0)
        })
      })
    })

    describe('ログイン機能（制限に影響されない）', () => {
      beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        import.meta.env.VITE_SERVICE_RESTRICTION_MODE = 'partial'
      })

      it('制限あり（mode: partial）の場合でも、ログインフォームは表示される', async () => {
        renderAuth()

        await waitFor(() => {
          expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument()
          expect(screen.getByRole('button', { name: /ログイン/i })).toBeInTheDocument()
        })
      })

      it('制限あり（mode: partial）の場合でも、ログイン処理が実行される', async () => {
        const user = userEvent.setup()

        vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
        vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
          data: {
            user: {
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
            },
            session: null,
          },
          error: null,
        })

        renderAuth()

        await user.type(screen.getByLabelText(/メールアドレス/i), 'test@example.com')
        await user.type(screen.getByLabelText(/パスワード/i), 'password123')
        await user.click(screen.getByRole('button', { name: /ログイン/i }))

        await waitFor(() => {
          expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
            email: 'test@example.com',
            password: 'password123',
          })
        })
      })
    })
  })
})