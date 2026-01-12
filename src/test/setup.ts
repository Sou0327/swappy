import '@testing-library/jest-dom'
import { vi, afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// 各テスト後に自動クリーンアップ（メモリリーク防止）
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// 注意: vi.resetAllMocks()をグローバルで使用すると、テストファイルのbeforeEachで設定した
// モックも上書きされてしまうため、個々のテストファイルで管理すること

// 環境変数のモック（ウォレット関連テスト用）
vi.stubEnv('WALLET_MASTER_PASSWORD', 'test-master-password-for-testing')
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

// 翻訳リソースのインポート（テスト用に必要な名前空間のみ）
import jaAuth from '@/locales/ja/auth.json'
import jaCommon from '@/locales/ja/common.json'
import jaNavigation from '@/locales/ja/navigation.json'
import jaDashboard from '@/locales/ja/dashboard.json'
import jaWallet from '@/locales/ja/wallet.json'
import jaTrade from '@/locales/ja/trade.json'
import jaMessages from '@/locales/ja/messages.json'
import jaMarkets from '@/locales/ja/markets.json'
import jaConvert from '@/locales/ja/convert.json'
import jaTransfer from '@/locales/ja/transfer.json'
import jaDemo from '@/locales/ja/demo.json'
import jaLanding from '@/locales/ja/landing.json'

// i18n初期化（テスト用）
i18n
  .use(initReactI18next)
  .init({
    resources: {
      ja: {
        auth: jaAuth,
        common: jaCommon,
        navigation: jaNavigation,
        dashboard: jaDashboard,
        wallet: jaWallet,
        trade: jaTrade,
        messages: jaMessages,
        markets: jaMarkets,
        convert: jaConvert,
        transfer: jaTransfer,
        demo: jaDemo,
        landing: jaLanding,
      },
    },
    lng: 'ja',
    fallbackLng: 'ja',
    defaultNS: 'common',
    ns: ['auth', 'common', 'navigation', 'dashboard', 'wallet', 'trade', 'messages', 'markets', 'convert', 'transfer', 'demo', 'landing'],
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

// Supabaseのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
      signUp: vi.fn(() => Promise.resolve({ data: { user: null, session: null }, error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: { user: null, session: null }, error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      }))
    },
    from: vi.fn(() => {
      const mockBuilder: Record<string, unknown> = {};
      const methods = ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
                       'order', 'limit', 'range', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete'];

      methods.forEach(method => {
        mockBuilder[method] = vi.fn(() => mockBuilder);
      });

      // Thenable behavior for Promise-like usage
      mockBuilder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      };

      return mockBuilder;
    }),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    channel: vi.fn(() => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockResolvedValue({ error: null }),
        unsubscribe: vi.fn(),
      };
      return mockChannel;
    }),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }
  }
}))

// React Routerのモック
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/test' }),
  }
})

// AuthContextのモック - テストごとに個別に設定するため、グローバルモックは削除

// ResizeObserverのモック（チャートコンポーネント用）
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// matchMediaのモック
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Pointer Events APIのモック（Radix UI / shadcn/ui用）
// jsdomはhasPointerCapture/releasePointerCaptureを完全サポートしていない
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false)
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn()
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn()
}

// scrollIntoViewのモック（jsdom未サポート）
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = vi.fn()
}