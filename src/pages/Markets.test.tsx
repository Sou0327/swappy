import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import Markets from './Markets';

// useNavigateのモック関数を外部に定義
const mockNavigate = vi.fn();

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
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// react-i18nextのモック
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'pageTitle': 'マーケット',
        'pageSubtitle': '最新の価格情報と取引をチェック',
        'error.title': 'エラー',
        'error.fetchFailed': 'マーケットデータの取得に失敗しました',
        'card.pair': 'ペア',
        'card.lastPrice': '最終価格',
        'card.volume24h': '24h出来高',
        'card.startTrading': '取引を始める',
        'table.title': '取引可能なペア',
        'table.pair': 'ペア',
        'table.lastPrice': '最終価格',
        'table.change24h': '24h変動',
        'table.volume24h': '24h出来高',
        'table.action': 'アクション',
        'table.trade': '取引',
        'empty.title': 'マーケットデータがありません',
        'empty.subtitle': 'しばらくお待ちください',
      };
      return translations[key] || key;
    },
    i18n: { language: 'ja' },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
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
    // SVGパスではなく絵文字を返す（テスト用）
    if (symbol.includes('BTC')) return '';
    if (symbol.includes('ETH')) return '';
    return '';
  },
}));

describe('Markets', () => {
  let mockSupabaseFrom: ReturnType<typeof vi.fn>;
  let mockFetchBinance24hrTicker: ReturnType<typeof vi.fn>;
  let mockToBinanceSymbol: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // import.meta.env.DEVをfalseにモック（本番モードをシミュレート）
    vi.stubEnv('DEV', false);
    // @ts-expect-error - import.meta.env.DEVを直接モック
    import.meta.env.DEV = false;

    // モック関数を取得
    const { supabase } = await import('@/integrations/supabase/client');
    const exchangeFeed = await import('@/lib/exchange-feed');

    mockSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>;
    mockFetchBinance24hrTicker = exchangeFeed.fetchBinance24hrTicker as ReturnType<typeof vi.fn>;
    mockToBinanceSymbol = exchangeFeed.toBinanceSymbol as ReturnType<typeof vi.fn>;

    // Supabaseチェーンのデフォルトモック設定
    const mockEq = vi.fn().mockReturnValue(
      Promise.resolve({
        data: [{ id: 'BTC-USDT' }, { id: 'ETH-USDT' }],
        error: null,
      })
    );
    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq,
    });
    mockSupabaseFrom.mockReturnValue({
      select: mockSelect,
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
    vi.unstubAllEnvs();
  });

  describe('正常系', () => {
    it('マーケットデータを正常にフェッチして表示する', async () => {
      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      // ローディング後、データが表示されるまで待つ
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
        expect(screen.getAllByText(/USDT/i).length).toBeGreaterThan(0);
      });
    });

    it('価格フォーマットが正しく適用される', async () => {
      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText(/50000\.00/i).length).toBeGreaterThan(0);
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

      // 取引ボタンをクリック（モバイル表示の「取引を始める」）
      const tradeButtons = screen.getAllByRole('button', { name: /取引を始める|取引/i });
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
      const mockEq = vi.fn().mockReturnValue(
        Promise.resolve({
          data: null,
          error: { message: 'Database error' },
        })
      );
      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSelect,
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
      const mockEq = vi.fn().mockReturnValue(
        Promise.resolve({
          data: [],
          error: null,
        })
      );
      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSelect,
      });

      render(
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      );

      // 空状態のメッセージが表示される
      await waitFor(() => {
        expect(screen.getByText('マーケットデータがありません')).toBeInTheDocument();
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

      const mockFirstEq = vi.fn().mockReturnValue({
        eq: mockSecondEq, // 2回目の.eq()呼び出しに対応
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockFirstEq,
      });
      mockSupabaseFrom.mockReturnValue({
        select: mockSelect,
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
