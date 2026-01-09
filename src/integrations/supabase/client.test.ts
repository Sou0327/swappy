import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { supabase } from './client'

// Supabaseのモック
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })),
    rpc: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  }))
}))

describe('Supabase Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('認証 API', () => {
    it('ユーザーサインアップが正常に動作する', async () => {
      const mockSignUpResponse = {
        data: {
          user: {
            id: 'new-user-id',
            email: 'newuser@example.com',
            created_at: '2023-01-01T00:00:00Z',
          },
          session: null,
        },
        error: null,
      }

      vi.mocked(supabase.auth.signUp).mockResolvedValue(mockSignUpResponse)

      const result = await supabase.auth.signUp({
        email: 'newuser@example.com',
        password: 'password123',
        options: {
          data: {
            full_name: '新規ユーザー',
          },
        },
      })

      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'password123',
        options: {
          data: {
            full_name: '新規ユーザー',
          },
        },
      })

      expect(result.data.user?.email).toBe('newuser@example.com')
      expect(result.error).toBeNull()
    })

    it('ユーザーサインインが正常に動作する', async () => {
      const mockSignInResponse = {
        data: {
          user: {
            id: 'existing-user-id',
            email: 'user@example.com',
            created_at: '2023-01-01T00:00:00Z',
          },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            user: {
              id: 'existing-user-id',
              email: 'user@example.com',
            },
          },
        },
        error: null,
      }

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue(mockSignInResponse)

      const result = await supabase.auth.signInWithPassword({
        email: 'user@example.com',
        password: 'password123',
      })

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      })

      expect(result.data.user?.email).toBe('user@example.com')
      expect(result.data.session?.access_token).toBe('access-token')
      expect(result.error).toBeNull()
    })

    it('認証エラーを適切にハンドリングする', async () => {
      const mockErrorResponse = {
        data: { user: null, session: null },
        error: new Error('Invalid login credentials'),
      }

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue(mockErrorResponse)

      const result = await supabase.auth.signInWithPassword({
        email: 'invalid@example.com',
        password: 'wrongpassword',
      })

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Invalid login credentials')
      expect(result.data.user).toBeNull()
    })

    it('サインアウトが正常に動作する', async () => {
      const mockSignOutResponse = { error: null }

      vi.mocked(supabase.auth.signOut).mockResolvedValue(mockSignOutResponse)

      const result = await supabase.auth.signOut()

      expect(supabase.auth.signOut).toHaveBeenCalled()
      expect(result.error).toBeNull()
    })

    it('現在のユーザー情報を取得する', async () => {
      const mockUserResponse = {
        data: {
          user: {
            id: 'current-user-id',
            email: 'current@example.com',
            created_at: '2023-01-01T00:00:00Z',
          },
        },
        error: null,
      }

      vi.mocked(supabase.auth.getUser).mockResolvedValue(mockUserResponse)

      const result = await supabase.auth.getUser()

      expect(supabase.auth.getUser).toHaveBeenCalled()
      expect(result.data.user?.email).toBe('current@example.com')
      expect(result.error).toBeNull()
    })

    it('現在のセッション情報を取得する', async () => {
      const mockSessionResponse = {
        data: {
          session: {
            access_token: 'current-access-token',
            refresh_token: 'current-refresh-token',
            expires_in: 3600,
            user: {
              id: 'current-user-id',
              email: 'current@example.com',
            },
          },
        },
        error: null,
      }

      vi.mocked(supabase.auth.getSession).mockResolvedValue(mockSessionResponse)

      const result = await supabase.auth.getSession()

      expect(supabase.auth.getSession).toHaveBeenCalled()
      expect(result.data.session?.access_token).toBe('current-access-token')
      expect(result.error).toBeNull()
    })
  })

  describe('データベース API', () => {
    it('ユーザー残高を取得する', async () => {
      const mockBalanceData = [
        {
          id: 'balance-1',
          user_id: 'test-user-id',
          currency: 'USDT',
          available: 1000.50,
          locked: 50.25,
          total: 1050.75,
        },
      ]

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve({
          data: mockBalanceData,
          error: null,
        })),
      }

      vi.mocked(supabase.from).mockReturnValue(mockChain as ReturnType<typeof supabase.from>)

      const result = await supabase
        .from('user_balances_view')
        .select('*')
        .eq('user_id', 'test-user-id')
        .order('currency')
        .limit(10)

      expect(supabase.from).toHaveBeenCalledWith('user_balances_view')
      expect(mockChain.select).toHaveBeenCalledWith('*')
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
      expect(mockChain.order).toHaveBeenCalledWith('currency')
      expect(mockChain.limit).toHaveBeenCalledWith(10)

      expect(result.data).toEqual(mockBalanceData)
      expect(result.error).toBeNull()
    })

    it('入金履歴を取得する', async () => {
      const mockDepositData = [
        {
          id: 'deposit-1',
          user_id: 'test-user-id',
          amount: 100.5,
          currency: 'ETH',
          chain: 'eth',
          network: 'mainnet',
          status: 'confirmed',
          transaction_hash: '0xabcdef123456789',
          created_at: '2023-01-01T00:00:00Z',
        },
      ]

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve({
          data: mockDepositData,
          error: null,
        })),
      }

      vi.mocked(supabase.from).mockReturnValue(mockChain as ReturnType<typeof supabase.from>)

      const result = await supabase
        .from('deposits')
        .select('*')
        .eq('user_id', 'test-user-id')
        .order('created_at', { ascending: false })
        .limit(20)

      expect(supabase.from).toHaveBeenCalledWith('deposits')
      expect(result.data).toEqual(mockDepositData)
    })

    it('出金申請を作成する', async () => {
      const withdrawalData = {
        user_id: 'test-user-id',
        amount: 50.25,
        currency: 'USDT',
        network: 'TRC20',
        destination_address: 'TValidAddress123456789',
        status: 'pending',
      }

      const mockInsertResponse = {
        data: [{ id: 'withdrawal-1', ...withdrawalData }],
        error: null,
      }

      const mockChain = {
        insert: vi.fn(() => Promise.resolve(mockInsertResponse)),
      }

      vi.mocked(supabase.from).mockReturnValue(mockChain as ReturnType<typeof supabase.from>)

      const result = await supabase
        .from('withdrawals')
        .insert(withdrawalData)

      expect(supabase.from).toHaveBeenCalledWith('withdrawals')
      expect(mockChain.insert).toHaveBeenCalledWith(withdrawalData)
      expect(result.data?.[0]).toMatchObject(withdrawalData)
      expect(result.error).toBeNull()
    })

    it('ユーザーロールを取得する', async () => {
      const mockRoleData = {
        id: 'role-1',
        user_id: 'test-user-id',
        role: 'admin',
        assigned_by: 'super-admin-id',
        assigned_at: '2023-01-01T00:00:00Z',
      }

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({
          data: mockRoleData,
          error: null,
        })),
      }

      vi.mocked(supabase.from).mockReturnValue(mockChain as ReturnType<typeof supabase.from>)

      const result = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', 'test-user-id')
        .single()

      expect(supabase.from).toHaveBeenCalledWith('user_roles')
      expect(mockChain.select).toHaveBeenCalledWith('role')
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
      expect(result.data).toEqual(mockRoleData)
    })

    it('データベースエラーを適切にハンドリングする', async () => {
      const mockErrorResponse = {
        data: null,
        error: new Error('Database connection failed'),
      }

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve(mockErrorResponse)),
      }

      vi.mocked(supabase.from).mockReturnValue(mockChain as ReturnType<typeof supabase.from>)

      const result = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', 'test-user-id')
        .single()

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Database connection failed')
      expect(result.data).toBeNull()
    })
  })

  describe('RPC API', () => {
    it('残高更新 RPC を呼び出す', async () => {
      const mockRpcResponse = {
        data: { success: true, new_balance: 150.75 },
        error: null,
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcResponse)

      const result = await supabase.rpc('update_user_balance', {
        p_user_id: 'test-user-id',
        p_currency: 'USDT',
        p_amount: 100.50,
        p_transaction_type: 'deposit',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('update_user_balance', {
        p_user_id: 'test-user-id',
        p_currency: 'USDT',
        p_amount: 100.50,
        p_transaction_type: 'deposit',
      })

      expect(result.data).toEqual({ success: true, new_balance: 150.75 })
      expect(result.error).toBeNull()
    })

    it('取引履歴集計 RPC を呼び出す', async () => {
      const mockAggregateResponse = {
        data: {
          total_deposits: 5000.00,
          total_withdrawals: 2500.00,
          net_balance: 2500.00,
          transaction_count: 25,
        },
        error: null,
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockAggregateResponse)

      const result = await supabase.rpc('get_transaction_summary', {
        p_user_id: 'test-user-id',
        p_start_date: '2023-01-01',
        p_end_date: '2023-12-31',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('get_transaction_summary', {
        p_user_id: 'test-user-id',
        p_start_date: '2023-01-01',
        p_end_date: '2023-12-31',
      })

      expect(result.data).toMatchObject({
        total_deposits: 5000.00,
        total_withdrawals: 2500.00,
        net_balance: 2500.00,
        transaction_count: 25,
      })
    })

    it('RPC エラーを適切にハンドリングする', async () => {
      const mockRpcError = {
        data: null,
        error: new Error('RPC function not found'),
      }

      vi.mocked(supabase.rpc).mockResolvedValue(mockRpcError)

      const result = await supabase.rpc('non_existent_function', {})

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('RPC function not found')
      expect(result.data).toBeNull()
    })
  })

  describe('リアルタイム機能', () => {
    it('チャンネルを作成してリスニングを開始する', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }

      vi.mocked(supabase.channel).mockReturnValue(mockChannel)

      const callback = vi.fn()

      const channel = supabase
        .channel('balance-updates')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_balances',
          filter: 'user_id=eq.test-user-id',
        }, callback)
        .subscribe()

      expect(supabase.channel).toHaveBeenCalledWith('balance-updates')
      expect(mockChannel.on).toHaveBeenCalledWith('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_balances',
        filter: 'user_id=eq.test-user-id',
      }, callback)
      expect(mockChannel.subscribe).toHaveBeenCalled()
    })

    it('チャンネルのサブスクリプションを解除する', () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      }

      vi.mocked(supabase.channel).mockReturnValue(mockChannel)
      vi.mocked(supabase.removeChannel).mockReturnValue(undefined)

      const channel = supabase.channel('test-channel')
      channel.unsubscribe()
      supabase.removeChannel(channel)

      expect(mockChannel.unsubscribe).toHaveBeenCalled()
      expect(supabase.removeChannel).toHaveBeenCalledWith(channel)
    })
  })

  describe('認証状態監視', () => {
    it('認証状態変更イベントをリスニングする', () => {
      const mockCallback = vi.fn()
      const mockSubscription = { unsubscribe: vi.fn() }

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
        data: { subscription: mockSubscription },
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange(mockCallback)

      expect(supabase.auth.onAuthStateChange).toHaveBeenCalledWith(mockCallback)
      expect(subscription).toBe(mockSubscription)
    })

    it('認証状態変更イベントのサブスクリプションを解除する', () => {
      const mockCallback = vi.fn()
      const mockSubscription = { unsubscribe: vi.fn() }

      vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
        data: { subscription: mockSubscription },
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange(mockCallback)
      subscription.unsubscribe()

      expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    })
  })

  describe('型安全性テスト', () => {
    it('TypeScript 型定義が正しく機能する', async () => {
      // これらのコードはコンパイル時に型チェックされる

      // 認証関連の型安全性
      const authResult = await supabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      })

      if (authResult.data.user) {
        expect(typeof authResult.data.user.id).toBe('string')
        expect(typeof authResult.data.user.email).toBe('string')
      }

      // データベースクエリの型安全性
      const balanceResult = await supabase
        .from('user_balances_view')
        .select('available, currency')
        .eq('user_id', 'test-user-id')

      if (balanceResult.data) {
        expect(Array.isArray(balanceResult.data)).toBe(true)
      }

      // RPC の型安全性
      const rpcResult = await supabase.rpc('get_transaction_summary', {
        p_user_id: 'test-user-id',
        p_start_date: '2023-01-01',
        p_end_date: '2023-12-31',
      })

      if (rpcResult.data) {
        expect(typeof rpcResult.data).toBe('object')
      }
    })
  })
})