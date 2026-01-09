import { vi } from 'vitest'

/**
 * Supabase完全モック
 * 全テストで使用可能な包括的なモック定義
 */

// モックデータの型定義
export interface MockUser {
  id: string
  email: string
  role?: string
}

export interface MockSupabaseClient {
  auth: {
    signOut: ReturnType<typeof vi.fn>
    getUser: ReturnType<typeof vi.fn>
    signUp: ReturnType<typeof vi.fn>
    signInWithPassword: ReturnType<typeof vi.fn>
    getSession: ReturnType<typeof vi.fn>
    onAuthStateChange: ReturnType<typeof vi.fn>
    updateUser: ReturnType<typeof vi.fn>
    resetPasswordForEmail: ReturnType<typeof vi.fn>
  }
  from: (table: string) => {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
  rpc: (functionName: string) => Promise<{ data: unknown; error: unknown }>
  channel: (channelName: string) => {
    on: ReturnType<typeof vi.fn>
    unsubscribe: ReturnType<typeof vi.fn>
  }
  removeChannel: ReturnType<typeof vi.fn>
}

// デフォルトモックユーザー
export const mockUser: MockUser = {
  id: 'test-user-id-12345',
  email: 'test@example.com',
  role: 'user'
}

export const mockAdminUser: MockUser = {
  id: 'admin-user-id-12345',
  email: 'admin@example.com',
  role: 'admin'
}

// Supabaseクライアントモック
export const createMockSupabaseClient = (user: MockUser | null = mockUser): MockSupabaseClient => ({
  auth: {
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    getUser: vi.fn(() => Promise.resolve({
      data: { user: user ? { ...user, user_metadata: {} } : null },
      error: null
    })),
    signUp: vi.fn(() => Promise.resolve({
      data: { user, session: user ? { access_token: 'mock-token' } : null },
      error: null
    })),
    signInWithPassword: vi.fn(() => Promise.resolve({
      data: { user, session: user ? { access_token: 'mock-token' } : null },
      error: null
    })),
    getSession: vi.fn(() => Promise.resolve({
      data: { session: user ? { access_token: 'mock-token', user } : null },
      error: null
    })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } }
    })),
    updateUser: vi.fn(() => Promise.resolve({ data: { user }, error: null })),
    resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null }))
  },
  from: vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        })),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      neq: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })),
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      order: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
      })),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      single: vi.fn(() => Promise.resolve({ data: null, error: null }))
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null }))
    })),
    upsert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  })),
  rpc: vi.fn((functionName: string) => Promise.resolve({ data: null, error: null })),
  channel: vi.fn((channelName: string) => ({
    on: vi.fn(() => ({
      subscribe: vi.fn()
    })),
    unsubscribe: vi.fn()
  })),
  removeChannel: vi.fn()
})

// グローバルモックの設定
export const setupSupabaseMock = (user: MockUser | null = mockUser) => {
  const mockClient = createMockSupabaseClient(user)

  vi.mock('@/integrations/supabase/client', () => ({
    supabase: mockClient
  }))

  return mockClient
}
