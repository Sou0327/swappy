import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BalanceAggregator from './BalanceAggregator';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    }
  }
}));

// ToastContextのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

describe('BalanceAggregator', () => {
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
          <BalanceAggregator />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('初期表示', () => {
    it('ローディング状態が表示される', () => {
      const mockInvoke = vi.fn().mockImplementation(() => new Promise(() => {})); // 永続的にpending
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });

    it('最新化ボタンが表示される', async () => {
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

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /最新化/i })).toBeInTheDocument();
      });
    });
  });

  describe('Edge Function呼び出し', () => {
    it('balance-aggregator Edge Functionを呼び出す', async () => {
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

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('balance-aggregator', {
          body: expect.objectContaining({
            chain: 'evm',
            network: 'ethereum',
            asset: 'ETH'
          })
        });
      });
    });
  });

  describe('残高データ表示', () => {
    it('残高データがテーブルに表示される', async () => {
      const mockBalances = [
        {
          address: '0x1234567890123456789012345678901234567890',
          balance: '1.5',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          user_id: 'user-1'
        },
        {
          address: '0x2345678901234567890123456789012345678901',
          balance: '0.8',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          user_id: 'user-2'
        }
      ];

      const mockSummary = {
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        totalBalance: '2.3',
        addressCount: 2
      };

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: mockBalances,
          summary: mockSummary
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('0x1234...7890')).toBeInTheDocument();
        expect(screen.getByText('1.5 ETH')).toBeInTheDocument();
        expect(screen.getByText('0x2345...8901')).toBeInTheDocument();
        expect(screen.getByText('0.8 ETH')).toBeInTheDocument();
      });
    });

    it('サマリー情報が表示される', async () => {
      const mockSummary = {
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        totalBalance: '10.5',
        addressCount: 5
      };

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: [],
          summary: mockSummary
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/合計残高/i)).toBeInTheDocument();
        expect(screen.getByText('10.5 ETH')).toBeInTheDocument();
        expect(screen.getByText(/5.*アドレス/i)).toBeInTheDocument();
      });
    });

    it('残高0のアドレスも表示される', async () => {
      const mockBalances = [
        {
          address: '0x1234567890123456789012345678901234567890',
          balance: '0',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          user_id: 'user-1'
        }
      ];

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: mockBalances,
          summary: {
            chain: 'evm',
            network: 'ethereum',
            asset: 'ETH',
            totalBalance: '0',
            addressCount: 1
          }
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('0x1234...7890')).toBeInTheDocument();
        // "0 ETH" が複数存在するため、少なくとも1つ存在することを確認
        expect(screen.getAllByText('0 ETH').length).toBeGreaterThan(0);
      });
    });
  });

  describe('フィルタリング機能', () => {
    it('フィルタUIが表示される', async () => {
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

      // フィルタラベルの存在確認（複数存在する場合があるため、最低1つ存在することを確認）
      await waitFor(() => {
        expect(screen.getAllByText(/チェーン/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/ネットワーク/i)).toBeInTheDocument();
        expect(screen.getByText(/アセット/i)).toBeInTheDocument();
      });

      // 初回Edge Function呼び出しの確認
      expect(mockInvoke).toHaveBeenCalledWith('balance-aggregator', {
        body: expect.objectContaining({
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH'
        })
      });
    });
  });

  describe('最新化機能', () => {
    it('最新化ボタンクリックでデータを再取得する', async () => {
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

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /最新化/i })).toBeInTheDocument();
      });

      const refreshButton = screen.getByRole('button', { name: /最新化/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledTimes(2); // 初回 + 最新化
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('Edge Function呼び出し失敗時にエラーメッセージが表示される', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('Network error')
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('残高取得エラーがある場合、エラー情報が表示される', async () => {
      const mockBalances = [
        {
          address: '0x1234567890123456789012345678901234567890',
          balance: '0',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          user_id: 'user-1',
          error: 'RPC connection failed'
        }
      ];

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: mockBalances,
          summary: null
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/RPC connection failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('空データ処理', () => {
    it('残高データが空の場合、適切なメッセージが表示される', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          balances: [],
          summary: null,
          message: 'No deposit addresses found'
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/入金アドレスが見つかりません/i)).toBeInTheDocument();
      });
    });
  });
});
