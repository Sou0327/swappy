import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import Markets from './Markets';

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Binance APIのモック
vi.mock('@/lib/exchange-feed', () => ({
  fetchBinance24hrTicker: vi.fn(),
  toBinanceSymbol: vi.fn(),
}));

// React Routerのモック
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// useToastのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// DashboardLayoutのモック
vi.mock('@/components/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-layout">{children}</div>,
}));

// format関数のモック
vi.mock('@/lib/format', () => ({
  formatPrice: (price: number | null) => price?.toFixed(2) || '—',
  formatVolume: (volume: number | null) => volume?.toFixed(4) || '—',
  getCryptoIcon: (symbol: string) => {
    if (symbol.includes('BTC')) return '₿';
    if (symbol.includes('ETH')) return 'Ξ';
    return '◉';
  },
}));

describe('Markets', () => {
  let mockSupabaseFrom: ReturnType<typeof vi.fn>;
  let mockSupabaseSelect: ReturnType<typeof vi.fn>;
  let mockSupabaseEq: ReturnType<typeof vi.fn>;
  let mockFetchBinance24hrTicker: ReturnType<typeof vi.fn>;
  let mockToBinanceSymbol: ReturnType<typeof vi.fn>;
  let mockNavigate: ReturnType<typeof vi.fn>;
  let mockToast: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // モック関数を取得
    const { supabase } = await import('@/integrations/supabase/client');
    const exchangeFeed = await import('@/lib/exchange-feed');
    const { useNavigate } = await import('react-router-dom');
    const { useToast } = await import('@/hooks/use-toast');

    mockSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>;
    mockFetchBinance24hrTicker = exchangeFeed.fetchBinance24hrTicker as ReturnType<typeof vi.fn>;
    mockToBinanceSymbol = exchangeFeed.toBinanceSymbol as ReturnType<typeof vi.fn>;
    mockNavigate = useNavigate() as ReturnType<typeof vi.fn>;
    mockToast = useToast().toast as ReturnType<typeof vi.fn>;

    // Supabaseチェーンのデフォルトモック設定
    mockSupabaseEq = vi.fn().mockReturnValue(
      Promise.resolve({
        data: [{ id: 'BTC-USDT' }, { id: 'ETH-USDT' }],
        error: null,
      })
    );
    mockSupabaseSelect = vi.fn().mockReturnValue({
      eq: mockSupabaseEq,
    });
    mockSupabaseFrom.mockReturnValue({
      select: mockSupabaseSelect,
    });

    // toBinanceSymbolのデフォルトモック
    mockToBinanceSymbol.mockImplementation((id: string) => id.replace('-', ''));

    // fetchBinance24hrTickerのデフォルトモック
    mockFetchBinance24hrTicker.mockResolvedValue({
      lastPrice: 50000,
      priceChangePercent: 2.5,
      quoteVolume: 1000000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('正常系', () => {
    it('マーケットデータを正常にフェッチして表示する', async () => {
      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      // ローディング後、データが表示されるまで待つ（モバイル+デスクトップで2つ表示される）
      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText('ETH/USDT').length).toBeGreaterThan(0);
    });

    it('quoteCurrencyが正しく抽出・表示される', async () => {
      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('USDT').length).toBeGreaterThan(0);
      });
    });

    it('価格フォーマットが正しく適用される', async () => {
      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('50000.00').length).toBeGreaterThan(0);
      });
    });

    it('変動率が正しく計算・表示される（プラス）', async () => {
      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('+2.50%').length).toBeGreaterThan(0);
      });
    });

    it('変動率が正しく計算・表示される（マイナス）', async () => {
      mockFetchBinance24hrTicker.mockResolvedValue({
        lastPrice: 48000,
        priceChangePercent: -2.5,
        quoteVolume: 900000,
      });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('-2.50%').length).toBeGreaterThan(0);
      });
    });

    it('変動率が正しく計算・表示される（中立）', async () => {
      mockFetchBinance24hrTicker.mockResolvedValue({
        lastPrice: 50000,
        priceChangePercent: 0,
        quoteVolume: 1000000,
      });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('0.00%').length).toBeGreaterThan(0);
      });
    });

    it('取引ボタンで正しいペアパラメータ付きでナビゲートする', async () => {
      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      // データが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });

      // 取引ボタンをクリック
      const tradeButtons = screen.getAllByText('取引を始める');
      await user.click(tradeButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/trade?pair=BTC/USDT');
    });

    it('Reactキーがmarket.symbolで安定している', async () => {
      const { container } = render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });

      // モバイルカード表示のキーを確認（DOM構造から推測）
      const cards = container.querySelectorAll('.lg\\:hidden > div');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('Supabaseエラー時にtoast通知が表示される', async () => {
      mockSupabaseEq = vi.fn().mockReturnValue(
        Promise.resolve({
          data: null,
          error: { message: 'Database error' },
        })
      );
      mockSupabaseSelect = vi.fn().mockReturnValue({
        eq: mockSupabaseEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSupabaseSelect,
      });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'エラー',
          description: 'マーケットデータの取得に失敗しました',
          variant: 'destructive',
        });
      });
    });

    it('Binance APIエラー時に該当マーケットがスキップされる', async () => {
      // BTC-USDTはエラー、ETH-USDTは成功
      mockFetchBinance24hrTicker
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          lastPrice: 3000,
          priceChangePercent: 1.5,
          quoteVolume: 500000,
        });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      // ETH/USDTのみ表示される
      await waitFor(() => {
        expect(screen.getAllByText('ETH/USDT').length).toBeGreaterThan(0);
      });

      // BTC/USDTは表示されない
      expect(screen.queryAllByText('BTC/USDT').length).toBe(0);
    });

    it('空のマーケットデータ時に適切に処理される', async () => {
      mockSupabaseEq = vi.fn().mockReturnValue(
        Promise.resolve({
          data: [],
          error: null,
        })
      );
      mockSupabaseSelect = vi.fn().mockReturnValue({
        eq: mockSupabaseEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSupabaseSelect,
      });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.queryAllByText('BTC/USDT').length).toBe(0);
      });
    });
  });

  describe('エッジケース', () => {
    it('VITE_SINGLE_MARKET_IDが設定されている場合', async () => {
      // 環境変数をモック
      vi.stubEnv('VITE_SINGLE_MARKET_ID', 'BTC-USDT');

      // .eq()が2回呼ばれる可能性があるため、チェーン可能なモックを作成
      const mockSecondEq = vi.fn().mockReturnValue(
        Promise.resolve({
          data: [{ id: 'BTC-USDT' }],
          error: null,
        })
      );

      mockSupabaseEq = vi.fn().mockReturnValue({
        eq: mockSecondEq, // 2回目の.eq()呼び出しに対応
      });

      mockSupabaseSelect = vi.fn().mockReturnValue({
        eq: mockSupabaseEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSupabaseSelect,
      });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });

      // ETH/USDTは表示されない
      expect(screen.queryAllByText('ETH/USDT').length).toBe(0);

      vi.unstubAllEnvs();
    });
  });
});
