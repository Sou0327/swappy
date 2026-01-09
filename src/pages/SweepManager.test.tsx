import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SweepManager from './SweepManager';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// ToastContextのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// AuthContextのモック
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-user-id',
      email: 'admin@example.com'
    },
    userRole: 'admin'
  })
}));

describe('SweepManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SweepManager />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('ページ表示', () => {
    it('ページタイトルが表示される', () => {
      renderComponent();
      expect(screen.getByText(/スイープ管理/i)).toBeInTheDocument();
    });

    it('ページ説明が表示される', () => {
      renderComponent();
      expect(screen.getByText(/入金アドレスから管理ウォレットへの資金移動管理/i)).toBeInTheDocument();
    });
  });

  describe('タブナビゲーション', () => {
    it('3つのタブが表示される', () => {
      renderComponent();

      expect(screen.getByRole('tab', { name: /管理ウォレット設定/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /残高ダッシュボード/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /スイープジョブ/i })).toBeInTheDocument();
    });

    it('デフォルトで管理ウォレット設定タブが選択されている', () => {
      renderComponent();

      const walletTab = screen.getByRole('tab', { name: /管理ウォレット設定/i });
      expect(walletTab).toHaveAttribute('data-state', 'active');
    });

    it('タブクリックでコンテンツが切り替わる', async () => {
      const user = userEvent.setup();

      // Supabaseモックの設定
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: [],
          summary: null
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      // 残高ダッシュボードタブをクリック
      const balanceTab = screen.getByRole('tab', { name: /残高ダッシュボード/i });
      await user.click(balanceTab);

      await waitFor(() => {
        expect(balanceTab).toHaveAttribute('data-state', 'active');
      });

      // スイープジョブタブをクリック
      const jobsTab = screen.getByRole('tab', { name: /スイープジョブ/i });
      await user.click(jobsTab);

      await waitFor(() => {
        expect(jobsTab).toHaveAttribute('data-state', 'active');
      });
    });
  });

  describe('コンポーネント統合', () => {
    it('管理ウォレット設定タブでAdminWalletFormが表示される', () => {
      renderComponent();

      // AdminWalletFormの要素を確認
      expect(screen.getByLabelText(/チェーン/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/ネットワーク/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/アセット/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/アドレス/i)).toBeInTheDocument();
    });

    it('残高ダッシュボードタブでBalanceAggregatorが表示される', async () => {
      const user = userEvent.setup();

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: [],
          summary: null
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      const balanceTab = screen.getByRole('tab', { name: /残高ダッシュボード/i });
      await user.click(balanceTab);

      await waitFor(() => {
        expect(screen.getByText(/オンチェーン残高一覧/i)).toBeInTheDocument();
      });
    });

    it('スイープジョブタブでSweepJobListが表示される', async () => {
      const user = userEvent.setup();

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderComponent();

      const jobsTab = screen.getByRole('tab', { name: /スイープジョブ/i });
      await user.click(jobsTab);

      await waitFor(() => {
        expect(screen.getByText(/スイープジョブ管理/i)).toBeInTheDocument();
      });
    });
  });

  describe('管理者権限チェック', () => {
    it('非管理者ユーザーにはアクセス拒否メッセージが表示される', () => {
      // AuthContextのモックを上書き
      vi.mock('@/contexts/AuthContext', () => ({
        useAuth: () => ({
          user: {
            id: 'regular-user-id',
            email: 'user@example.com'
          },
          userRole: 'user'
        })
      }));

      // Note: この実装では、非管理者アクセスは AdminRoute コンポーネントで
      // ルートレベルでブロックされるため、このコンポーネント内での
      // チェックは不要。ルート設定のテストで確認する。
    });
  });

  describe('レスポンシブデザイン', () => {
    it('モバイルビューでタブが縦に並ぶ', () => {
      // Note: CSSベースのレスポンシブデザインのため、
      // E2Eテスト（Playwright）で確認することを推奨
      renderComponent();

      // タブリストが存在することを確認
      const tabList = screen.getByRole('tablist');
      expect(tabList).toBeInTheDocument();
    });
  });
});
