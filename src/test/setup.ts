import '@testing-library/jest-dom'
import { vi } from 'vitest'

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