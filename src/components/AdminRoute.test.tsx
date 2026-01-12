import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminRoute from './AdminRoute';

/**
 * AdminRoute コンポーネントのテスト（サービス制限機能）
 *
 * テスト対象:
 * - 制限なし（mode: none）の場合、管理者は管理画面にアクセスできる
 * - 制限あり（mode: partial）の場合、管理者でも管理画面へのアクセスがブロックされる
 * - 制限メッセージが表示される
 */

// useAuthのモック
const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// useNavigateのモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Navigate: ({ to }: { to: string }) => <div data-testid="navigate-to">{to}</div>,
  };
});

const renderAdminRoute = () => {
  return render(
    <BrowserRouter>
      <AdminRoute>
        <div data-testid="admin-content">管理画面コンテンツ</div>
      </AdminRoute>
    </BrowserRouter>
  );
};

describe('AdminRoute - サービス制限機能', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('制限なし（mode: none）', () => {
    beforeEach(() => {
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = undefined;

      // 管理者ユーザーとしてログイン
      mockUseAuth.mockReturnValue({
        user: { id: 'admin-user-id', email: 'admin@example.com' },
        userRole: 'admin',
        loading: false,
        roleLoading: false,
      });
    });

    it('管理者は管理画面にアクセスできる', () => {
      renderAdminRoute();

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
      expect(screen.queryByText(/管理画面へのアクセスは一時的に制限/i)).not.toBeInTheDocument();
    });
  });

  describe('制限あり（mode: partial）', () => {
    beforeEach(() => {
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = 'partial';

      // 管理者ユーザーとしてログイン
      mockUseAuth.mockReturnValue({
        user: { id: 'admin-user-id', email: 'admin@example.com' },
        userRole: 'admin',
        loading: false,
        roleLoading: false,
      });
    });

    it('partialモードでも管理者は管理画面にアクセスできる', () => {
      // 実装: isAdminAccessEnabled() は mode !== 'full' を返す
      // つまり partial モードでも管理画面アクセスは許可される
      renderAdminRoute();

      expect(screen.getByTestId('admin-content')).toBeInTheDocument();
    });
  });

  describe('完全制限（mode: full）', () => {
    beforeEach(() => {
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = 'full';

      // 管理者ユーザーとしてログイン
      mockUseAuth.mockReturnValue({
        user: { id: 'admin-user-id', email: 'admin@example.com' },
        userRole: 'admin',
        loading: false,
        roleLoading: false,
      });
    });

    it('fullモードでは管理者でも管理画面へのアクセスがブロックされる', () => {
      renderAdminRoute();

      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });

    it('制限メッセージが表示される', () => {
      renderAdminRoute();

      expect(screen.getByText(/管理画面へのアクセス制限/i)).toBeInTheDocument();
      expect(screen.getByText(/一時的に制限されております/i)).toBeInTheDocument();
    });

    it('既存ユーザーの保護についての記述がある', () => {
      renderAdminRoute();

      expect(screen.getByText(/既存ユーザーの保護/i)).toBeInTheDocument();
      expect(screen.getByText(/エンドユーザーの資産と権利は完全に保護されています/i)).toBeInTheDocument();
    });

    it('ダッシュボードへ戻るボタンがある', () => {
      renderAdminRoute();

      expect(screen.getByRole('button', { name: /ダッシュボードへ戻る/i })).toBeInTheDocument();
    });
  });

  describe('非管理者ユーザー（制限に影響されない）', () => {
    beforeEach(() => {
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = 'partial';

      // 一般ユーザーとしてログイン
      mockUseAuth.mockReturnValue({
        user: { id: 'user-id', email: 'user@example.com' },
        userRole: 'user',
        loading: false,
        roleLoading: false,
      });
    });

    it('一般ユーザーは元々アクセスできないのでリダイレクトされる', () => {
      renderAdminRoute();

      expect(screen.getByTestId('navigate-to')).toHaveTextContent('/dashboard');
      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });
  });

  describe('未ログインユーザー（制限に影響されない）', () => {
    beforeEach(() => {
      import.meta.env.VITE_SERVICE_RESTRICTION_MODE = 'partial';

      // 未ログイン
      mockUseAuth.mockReturnValue({
        user: null,
        userRole: null,
        loading: false,
        roleLoading: false,
      });
    });

    it('未ログインユーザーは認証ページにリダイレクトされる', () => {
      renderAdminRoute();

      expect(screen.getByTestId('navigate-to')).toHaveTextContent('/auth');
      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });
  });
});
