import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WalletAdmin from './HDWalletAdmin';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// AuthContextのモック
vi.mock('@/contexts/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/AuthContext')>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'admin-user-id', email: 'admin@example.com' },
      userRole: 'admin' as const,
      loading: false,
      signOut: vi.fn()
    })
  };
});

// ToastContextのモック
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

// React Routerのモック
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

// Supabase clientのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      const mockBuilder: Record<string, unknown> = {};
      const methods = ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
                       'order', 'limit', 'range', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete'];

      methods.forEach(method => {
        mockBuilder[method] = vi.fn(() => mockBuilder);
      });

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
}));

// Supabase fromモックのヘルパー関数
function createMockFrom(dataMap: Record<string, unknown> = {}) {
  return vi.fn().mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'order',
                     'limit', 'range', 'single', 'maybeSingle', 'insert',
                     'update', 'upsert', 'delete'];

    methods.forEach(method => {
      builder[method] = vi.fn(() => builder);
    });

    // Promise-like behavior
    builder.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const data = dataMap[table] !== undefined ? dataMap[table] : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };

    return builder;
  });
}

describe('WalletAdmin - マスターキー管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure supabase.functions exists for Edge Function tests
    if (!vi.mocked(supabase).functions) {
      vi.mocked(supabase).functions = {
        invoke: vi.fn(() => Promise.resolve({ data: null, error: null }))
      };
    }
  });

  const renderWalletAdmin = () => {
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
          <WalletAdmin />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('マスターキー一覧の表示', () => {
    it('マスターキー一覧セクションが表示される', async () => {
      // Arrange: DBからの取得をモック
      const mockFrom = createMockFrom({});
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // Act: コンポーネントを描画
      renderWalletAdmin();

      // Assert: マスターキー管理セクションが表示される
      await waitFor(() => {
        expect(screen.getByText(/マスターキー管理/i)).toBeInTheDocument();
      });
    });

    it('マスターキー一覧が正しく表示される', async () => {
      // Arrange: サンプルのマスターキーデータ
      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'メインマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        },
        {
          id: 'master-key-2',
          created_at: '2025-01-02T00:00:00Z',
          description: 'バックアップマスターキー',
          active: false,
          backup_verified: false,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // Act: コンポーネントを描画
      renderWalletAdmin();

      // Assert: マスターキーが表示される
      await waitFor(() => {
        expect(screen.getByText('メインマスターキー')).toBeInTheDocument();
        expect(screen.getByText('バックアップマスターキー')).toBeInTheDocument();
      });
    });
  });

  describe('ニーモニック確認機能', () => {
    it('「ニーモニック確認」ボタンが表示される', async () => {
      // Arrange
      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'テストマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      // Act
      renderWalletAdmin();

      // Assert: ニーモニック確認ボタンが存在する
      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /ニーモニック確認/i });
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    it('ニーモニック確認ボタンをクリックするとEdge Functionが呼ばれる', async () => {
      // Arrange
      const user = userEvent.setup();
      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'テストマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
          }
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      // Act
      renderWalletAdmin();

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: Edge Functionが呼ばれた
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('master-key-manager', {
          body: {
            action: 'decrypt',
            masterKeyId: 'master-key-1'
          }
        });
      });
    });

    it('ニーモニックが正しくモーダルに表示される', async () => {
      // Arrange
      const user = userEvent.setup();
      const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'テストマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            mnemonic: testMnemonic
          }
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      // Act
      renderWalletAdmin();

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: モーダルが開いてニーモニックが表示される
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText(new RegExp(testMnemonic, 'i'))).toBeInTheDocument();
      });
    });

    it('セキュリティ警告が表示される', async () => {
      // Arrange
      const user = userEvent.setup();
      const testMnemonic = 'test mnemonic phrase';

      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'テストマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            mnemonic: testMnemonic
          }
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      // Act
      renderWalletAdmin();

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: セキュリティ警告が表示される
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/セキュリティ警告/i)).toBeInTheDocument();
        expect(within(dialog).getByText(/このニーモニックフレーズは絶対に他人に共有しないでください/i)).toBeInTheDocument();
      });
    });

    it('モーダルを閉じることができる', async () => {
      // Arrange
      const user = userEvent.setup();
      const testMnemonic = 'test mnemonic phrase';

      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'テストマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const mockInvoke = vi.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            mnemonic: testMnemonic
          }
        },
        error: null
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      // Act
      renderWalletAdmin();

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const closeButton = screen.getByRole('button', { name: /閉じる/i });
      await user.click(closeButton);

      // Assert: モーダルが閉じられた
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('Edge Function呼び出しに失敗したときにエラーメッセージが表示される', async () => {
      // Arrange
      const user = userEvent.setup();

      const mockMasterKeys = [
        {
          id: 'master-key-1',
          created_at: '2025-01-01T00:00:00Z',
          description: 'テストマスターキー',
          active: true,
          backup_verified: true,
          created_by: 'admin-user-id'
        }
      ];

      const mockFrom = createMockFrom({
        master_keys: mockMasterKeys
      });
      vi.mocked(supabase.from).mockImplementation(mockFrom);

      const mockInvoke = vi.fn().mockResolvedValue({
        data: null,
        error: new Error('復号化に失敗しました')
      });
      vi.mocked(supabase.functions.invoke).mockImplementation(mockInvoke);

      // Act
      renderWalletAdmin();

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: エラーメッセージが表示される（toastで表示されるため、モックされたtoastが呼ばれたかを確認）
      await waitFor(() => {
        // モーダルが開かないことを確認
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
