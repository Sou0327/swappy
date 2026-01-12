import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SweepJobList from './SweepJobList';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn()
  }
}));

// ToastContextのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

describe('SweepJobList', () => {
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
          <SweepJobList />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('初期表示', () => {
    it('スイープジョブ一覧が表示される', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          from_address: '0x1234567890123456789012345678901234567890',
          to_address: '0x9876543210987654321098765432109876543210',
          planned_amount: 1.5,
          currency: 'ETH',
          status: 'planned',
          created_at: '2025-01-01T00:00:00Z'
        }
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockJobs,
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(/job-1/i)).toBeInTheDocument();
        expect(screen.getByText(/1.5/)).toBeInTheDocument();
      });
    });

    it('ローディング状態が表示される', () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockImplementation(() => new Promise(() => {}))
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderComponent();

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });
  });

  describe('ステータス別フィルタ', () => {
    it('ステータスフィルタが表示される', async () => {
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

      await waitFor(() => {
        expect(screen.getByText(/ステータスフィルタ/i)).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
      });
    });

    it('ステータスでフィルタリングできる', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          status: 'planned',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          from_address: '0x1234567890123456789012345678901234567890',
          to_address: '0x9876543210987654321098765432109876543210',
          planned_amount: 1.5,
          currency: 'ETH',
          created_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 'job-2',
          status: 'signed',
          chain: 'evm',
          network: 'ethereum',
          asset: 'ETH',
          from_address: '0x2345678901234567890123456789012345678901',
          to_address: '0x9876543210987654321098765432109876543210',
          planned_amount: 2.0,
          currency: 'ETH',
          created_at: '2025-01-02T00:00:00Z'
        }
      ];

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockJobs,
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderComponent();

      // 両方のジョブが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText(/job-1/i)).toBeInTheDocument();
        expect(screen.getByText(/job-2/i)).toBeInTheDocument();
      });

      // フィルタ用のcomboboxが存在することを確認
      const statusFilter = screen.getByRole('combobox');
      expect(statusFilter).toBeInTheDocument();

      // Note: Select コンポーネントのドロップダウン操作は
      // @floating-ui/domとjsdomの互換性問題のため、E2Eテストで検証する
    });
  });

  describe('ジョブ詳細表示', () => {
    it('詳細ボタンをクリックするとダイアログが開く', async () => {
      const user = userEvent.setup();
      const mockJob = {
        id: 'job-1',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        from_address: '0x1234567890123456789012345678901234567890',
        to_address: '0x9876543210987654321098765432109876543210',
        planned_amount: 1.5,
        currency: 'ETH',
        status: 'planned',
        unsigned_tx: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x9876543210987654321098765432109876543210',
          value: '0x14d1120d7b160000',
          gas: '0x5208',
          gasPrice: '0x3b9aca00',
          nonce: '0x0',
          chainId: 1
        },
        created_at: '2025-01-01T00:00:00Z'
      };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [mockJob],
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /詳細/i })).toBeInTheDocument();
      });

      const detailButton = screen.getByRole('button', { name: /詳細/i });
      await user.click(detailButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('ダイアログにunsigned transactionが表示される', async () => {
      const user = userEvent.setup();
      const mockJob = {
        id: 'job-1',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        from_address: '0x1234567890123456789012345678901234567890',
        to_address: '0x9876543210987654321098765432109876543210',
        planned_amount: 1.5,
        currency: 'ETH',
        status: 'planned',
        unsigned_tx: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x9876543210987654321098765432109876543210',
          value: '0x14d1120d7b160000',
          gas: '0x5208',
          gasPrice: '0x3b9aca00',
          nonce: '0x0',
          chainId: 1
        },
        created_at: '2025-01-01T00:00:00Z'
      };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [mockJob],
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /詳細/i })).toBeInTheDocument();
      });

      const detailButton = screen.getByRole('button', { name: /詳細/i });
      await user.click(detailButton);

      // まずダイアログが開くのを待つ
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // ダイアログ内のコンテンツを確認
      const dialog = screen.getByRole('dialog');
      const dialogContent = within(dialog);
      // h3タグとして表示されることを確認（li要素の中のテキストと区別）
      expect(dialogContent.getByRole('heading', { name: /Unsigned Transaction/i })).toBeInTheDocument();
      expect(dialogContent.getByText(/0x14d1120d7b160000/i)).toBeInTheDocument();
    });
  });

  describe('コピー機能', () => {
    it('unsigned transactionをコピーできる', async () => {
      const user = userEvent.setup();
      const mockJob = {
        id: 'job-1',
        chain: 'evm',
        network: 'ethereum',
        asset: 'ETH',
        from_address: '0x1234567890123456789012345678901234567890',
        to_address: '0x9876543210987654321098765432109876543210',
        planned_amount: 1.5,
        currency: 'ETH',
        status: 'planned',
        unsigned_tx: {
          from: '0x1234567890123456789012345678901234567890',
          to: '0x9876543210987654321098765432109876543210',
          value: '0x14d1120d7b160000',
          gas: '0x5208',
          gasPrice: '0x3b9aca00',
          nonce: '0x0',
          chainId: 1
        },
        created_at: '2025-01-01T00:00:00Z'
      };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [mockJob],
            error: null
          })
        })
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // クリップボードAPIのモック
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        writable: true,
        value: {
          writeText: mockWriteText
        }
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /詳細/i })).toBeInTheDocument();
      });

      const detailButton = screen.getByRole('button', { name: /詳細/i });
      await user.click(detailButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /コピー/i })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /コピー/i });
      await user.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
      });
    });
  });

  describe('空データ処理', () => {
    it('ジョブが0件の場合、適切なメッセージが表示される', async () => {
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

      await waitFor(() => {
        expect(screen.getByText(/スイープジョブがありません/i)).toBeInTheDocument();
      });
    });
  });
});
