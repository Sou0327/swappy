/**
 * テストユーティリティ
 * React Testing Libraryの拡張とカスタムレンダー関数
 */

import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { vi } from 'vitest'

// テスト用QueryClient設定
export const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
      gcTime: Infinity
    },
    mutations: {
      retry: false
    }
  },
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
})

// カスタムレンダーのプロバイダー設定
interface AllTheProvidersProps {
  children: React.ReactNode
}

function AllTheProviders({ children }: AllTheProvidersProps) {
  const queryClient = createTestQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            {children}
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

// カスタムレンダー関数
export function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options })
}

// 認証付きレンダー（特定ユーザーでテスト）
interface RenderWithAuthOptions extends Omit<RenderOptions, 'wrapper'> {
  user?: {
    id: string
    email: string
    role?: string
  }
}

export function renderWithAuth(
  ui: ReactElement,
  { user, ...options }: RenderWithAuthOptions = {}
) {
  // AuthContextのモックを設定
  if (user) {
    vi.mock('@/contexts/AuthContext', () => ({
      useAuth: () => ({
        user,
        userRole: user.role || 'user',
        loading: false
      }),
      AuthProvider: ({ children }: { children: React.ReactNode }) => children
    }))
  }

  return customRender(ui, options)
}

// 待機ヘルパー
export const waitFor = async (callback: () => void, timeout = 3000) => {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    try {
      callback()
      return
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  throw new Error('Timeout waiting for condition')
}

// 非同期状態の待機
export const waitForLoadingToFinish = async () => {
  const { waitFor } = await import('@testing-library/react')
  await waitFor(() => {
    const loadingElements = document.querySelectorAll('[data-loading="true"]')
    if (loadingElements.length > 0) {
      throw new Error('Still loading')
    }
  })
}

// エラーバウンダリのテストヘルパー
export class TestErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <div data-testid="error-boundary">Error: {this.state.error?.message}</div>
    }

    return this.props.children
  }
}

// フォーム入力ヘルパー
export const fillForm = async (fields: Record<string, string>) => {
  const { fireEvent } = await import('@testing-library/react')

  for (const [name, value] of Object.entries(fields)) {
    const input = document.querySelector(`[name="${name}"]`) as HTMLInputElement
    if (input) {
      fireEvent.change(input, { target: { value } })
    }
  }
}

// モック関数のリセット
export const resetAllMocks = () => {
  vi.clearAllMocks()
  vi.resetAllMocks()
  vi.restoreAllMocks()
}

// ローカルストレージモック
export const mockLocalStorage = () => {
  const storage: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key]
    }),
    clear: vi.fn(() => {
      for (const key in storage) {
        delete storage[key]
      }
    })
  }
}

// セッションストレージモック
export const mockSessionStorage = mockLocalStorage

// タイムアウト処理のヘルパー
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 再エクスポート
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
