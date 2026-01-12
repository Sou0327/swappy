import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { MarketTable } from './MarketTable';

const { mockNavigate, mockToast } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockToast: vi.fn(),
}));

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
    useNavigate: () => mockNavigate,
  };
});

// useToastのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// format関数のモック
vi.mock('@/lib/format', () => ({
  formatPrice: (price: number | null) => price?.toFixed(2) || '—',
  formatVolume: (volume: number | null) => volume?.toFixed(4) || '—',
  getCryptoIcon: (symbol: string) => {
    if (symbol.includes('BTC')) return '₿';
    if (symbol.includes('ETH')) return 'Ξ';
    if (symbol.includes('XRP')) return '◉';
    return '◎';
  },
}));

describe('MarketTable', () => {
  let mockSupabaseFrom: ReturnType<typeof vi.fn>;
  let mockSupabaseSelect: ReturnType<typeof vi.fn>;
  let mockSupabaseEq: ReturnType<typeof vi.fn>;
  let mockSupabaseLimit: ReturnType<typeof vi.fn>;
  let mockFetchBinance24hrTicker: ReturnType<typeof vi.fn>;
  let mockToBinanceSymbol: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // モック関数を取得
    const { supabase } = await import('@/integrations/supabase/client');
    const exchangeFeed = await import('@/lib/exchange-feed');

    mockSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>;
    mockFetchBinance24hrTicker = exchangeFeed.fetchBinance24hrTicker as ReturnType<typeof vi.fn>;
    mockToBinanceSymbol = exchangeFeed.toBinanceSymbol as ReturnType<typeof vi.fn>;

    // Supabaseチェーンのデフォルトモック設定
    mockSupabaseLimit = vi.fn().mockReturnValue(
      Promise.resolve({
        data: [
          { id: 'BTC-USDT' },
          { id: 'ETH-USDT' },
          { id: 'XRP-USDT' },
        ],
        error: null,
      })
    );
    mockSupabaseEq = vi.fn().mockReturnValue({
      limit: mockSupabaseLimit,
    });
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
    it('マーケットトレンドのタイトルが表示される', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('マーケットトレンド')).toBeInTheDocument();
      });
    });

    it('最大7件のマーケットデータを表示する', async () => {
      // 7件のマーケットデータを設定
      mockSupabaseLimit = vi.fn().mockReturnValue(
        Promise.resolve({
          data: [
            { id: 'BTC-USDT' },
            { id: 'ETH-USDT' },
            { id: 'XRP-USDT' },
            { id: 'BNB-USDT' },
            { id: 'SOL-USDT' },
            { id: 'ADA-USDT' },
            { id: 'TRX-USDT' },
          ],
          error: null,
        })
      );
      mockSupabaseEq = vi.fn().mockReturnValue({
        limit: mockSupabaseLimit,
      });
      mockSupabaseSelect = vi.fn().mockReturnValue({
        eq: mockSupabaseEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSupabaseSelect,
      });

      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      // limit(7)が呼ばれることを確認
      await waitFor(() => {
        expect(mockSupabaseLimit).toHaveBeenCalledWith(7);
      });

      // 7件のデータが表示される（モバイル+デスクトップで複数表示）
      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
        expect(screen.getAllByText('TRX/USDT').length).toBeGreaterThan(0);
      });
    });

    it('quoteCurrencyが正しく表示される', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText(/USDT/).length).toBeGreaterThan(0);
      });
    });

    it('ローディング状態が正しく処理される', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      // 最終的にデータが表示される
      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });
    });

    it('価格フォーマットが正しく適用される', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText(/50000\.00/).length).toBeGreaterThan(0);
      });
    });

    it('変動率が正しく表示される（プラス）', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('+2.50%').length).toBeGreaterThan(0);
      });
    });

    it('変動率が正しく表示される（マイナス）', async () => {
      mockFetchBinance24hrTicker.mockResolvedValue({
        lastPrice: 48000,
        priceChangePercent: -2.5,
        quoteVolume: 900000,
      });

      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('-2.50%').length).toBeGreaterThan(0);
      });
    });

    it('取引ボタンで正しいペアパラメータ付きでナビゲートする', async () => {
      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      // データが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });

      // 取引ボタンをクリック
      const tradeButtons = screen.getAllByText('取引');
      await user.click(tradeButtons[0]);

      expect(mockNavigate).toHaveBeenCalledWith('/trade?pair=BTC/USDT');
    });

    it('マーケットデータのテーブルヘッダーが正しく表示される', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('ペア').length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText('最新価格').length).toBeGreaterThan(0);
      expect(screen.getAllByText('24時間変動').length).toBeGreaterThan(0);
      expect(screen.getAllByText('24時間出来高').length).toBeGreaterThan(0);
      expect(screen.getAllByText('アクション').length).toBeGreaterThan(0);
    });

    it('各ペアに対応するアイコンが表示される', async () => {
      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('₿').length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText('Ξ').length).toBeGreaterThan(0);
      expect(screen.getAllByText('◉').length).toBeGreaterThan(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('Supabaseエラー時にtoast通知が表示される', async () => {
      mockSupabaseLimit = vi.fn().mockReturnValue(
        Promise.resolve({
          data: null,
          error: { message: 'Database error' },
        })
      );
      mockSupabaseEq = vi.fn().mockReturnValue({
        limit: mockSupabaseLimit,
      });
      mockSupabaseSelect = vi.fn().mockReturnValue({
        eq: mockSupabaseEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSupabaseSelect,
      });

      render(
        <BrowserRouter>
          <MarketTable />
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
      // BTC-USDTはエラー、ETH-USDTとXRP-USDTは成功
      mockFetchBinance24hrTicker
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({
          lastPrice: 3000,
          priceChangePercent: 1.5,
          quoteVolume: 500000,
        })
        .mockResolvedValueOnce({
          lastPrice: 0.5,
          priceChangePercent: 0.5,
          quoteVolume: 100000,
        });

      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      // ETH/USDTとXRP/USDTは表示される
      await waitFor(() => {
        expect(screen.getAllByText('ETH/USDT').length).toBeGreaterThan(0);
      });

      expect(screen.getAllByText('XRP/USDT').length).toBeGreaterThan(0);

      // BTC/USDTは表示されない
      expect(screen.queryAllByText('BTC/USDT').length).toBe(0);
    });

    it('空のマーケットリスト時に適切に処理される', async () => {
      mockSupabaseLimit = vi.fn().mockReturnValue(
        Promise.resolve({
          data: [],
          error: null,
        })
      );
      mockSupabaseEq = vi.fn().mockReturnValue({
        limit: mockSupabaseLimit,
      });
      mockSupabaseSelect = vi.fn().mockReturnValue({
        eq: mockSupabaseEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSupabaseSelect,
      });

      render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.queryAllByText('BTC/USDT').length).toBe(0);
      });
    });
  });

  describe('レスポンシブ表示', () => {
    it('デスクトップとモバイル表示の切り替え', async () => {
      const { container } = render(
        <BrowserRouter>
          <MarketTable />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText('BTC/USDT').length).toBeGreaterThan(0);
      });

      // デスクトップテーブル（hidden md:block）
      const desktopTable = container.querySelector('.hidden.md\\:block');
      expect(desktopTable).toBeInTheDocument();

      // モバイルカード（md:hidden）
      const mobileCards = container.querySelector('.md\\:hidden');
      expect(mobileCards).toBeInTheDocument();
    });
  });
});
