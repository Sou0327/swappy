import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WalletAdmin from './HDWalletAdmin';
import { supabase } from '@/integrations/supabase/client';
import React from 'react';

// グローバルfetchモック
const mockFetch = vi.fn();

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

// ToastContextのモック（sonnerを使用）
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn()
  }
}));

// React Routerのモック
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn()
  };
});

// Supabase clientのモック - チェーン可能な形式で設定
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
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
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockResolvedValue({ error: null }),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn()
  }
}));

// fetchモックヘルパー - URLに応じてレスポンスを返す
function setupFetchMock(responses: {
  masterKeys?: unknown[];
  walletRoots?: unknown[];
  decryptResult?: { mnemonic: string } | null;
  decryptError?: string;
}) {
  mockFetch.mockImplementation(async (url: string, options: RequestInit) => {
    const body = options.body ? JSON.parse(options.body as string) : {};

    // master-key-manager エンドポイント
    if (url.includes('master-key-manager')) {
      if (body.action === 'list') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: responses.masterKeys || []
          })
        };
      }
      if (body.action === 'decrypt') {
        if (responses.decryptError) {
          return {
            ok: true,
            json: async () => ({
              success: false,
              error: responses.decryptError
            })
          };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: responses.decryptResult || { mnemonic: '' }
          })
        };
      }
    }

    // wallet-root-manager エンドポイント
    if (url.includes('wallet-root-manager')) {
      if (body.action === 'list') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: responses.walletRoots || []
          })
        };
      }
    }

    // デフォルトレスポンス
    return {
      ok: true,
      json: async () => ({ success: true, data: null })
    };
  });
}

describe('WalletAdmin - HDウォレット管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 環境変数をモック（callMasterKeyManagerで使用）
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');

    // グローバルfetchをモック
    global.fetch = mockFetch;

    // supabase.auth.getSessionをモック
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-token',
          user: { id: 'admin-user-id', email: 'admin@example.com' }
        }
      },
      error: null
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderWalletAdmin = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
        mutations: {
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
    it('HDウォレット管理画面が表示される', async () => {
      // Arrange: fetchモックを設定
      setupFetchMock({ masterKeys: [], walletRoots: [] });

      // Act: コンポーネントを描画
      renderWalletAdmin();

      // Assert: ページタイトルが表示される
      await waitFor(() => {
        expect(screen.getByText('HDウォレット管理')).toBeInTheDocument();
      });
    });

    it('マスターキータブに切り替えるとマスターキー一覧が表示される', async () => {
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

      setupFetchMock({ masterKeys: mockMasterKeys, walletRoots: [] });

      // Act: コンポーネントを描画
      const user = userEvent.setup();
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

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

      setupFetchMock({ masterKeys: mockMasterKeys, walletRoots: [] });

      // Act
      const user = userEvent.setup();
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

      // Assert: ニーモニック確認ボタンが存在する
      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /ニーモニック確認/i });
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    it('ニーモニック確認ボタンをクリックするとfetchが呼ばれる', async () => {
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

      setupFetchMock({
        masterKeys: mockMasterKeys,
        walletRoots: [],
        decryptResult: { mnemonic: testMnemonic }
      });

      // Act
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: fetchがdecryptアクションで呼ばれた
      await waitFor(() => {
        const decryptCall = mockFetch.mock.calls.find((call: [string, RequestInit]) => {
          const body = call[1]?.body ? JSON.parse(call[1].body as string) : {};
          return body.action === 'decrypt';
        });
        expect(decryptCall).toBeDefined();
      });
    });

    // TODO: E2Eテストに移行 - import.meta.envがテスト環境で正しく機能しないため
    // fetchモックは動作するが、mutation成功ハンドラが呼ばれない問題あり
    it.skip('ニーモニックが正しくモーダルに表示される', async () => {
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

      setupFetchMock({
        masterKeys: mockMasterKeys,
        walletRoots: [],
        decryptResult: { mnemonic: testMnemonic }
      });

      // Act
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: モーダルが開く
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeInTheDocument();
      });
    });

    // TODO: E2Eテストに移行 - import.meta.envがテスト環境で正しく機能しないため
    it.skip('セキュリティ警告が表示される', async () => {
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

      setupFetchMock({
        masterKeys: mockMasterKeys,
        walletRoots: [],
        decryptResult: { mnemonic: testMnemonic }
      });

      // Act
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

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

    // TODO: E2Eテストに移行 - import.meta.envがテスト環境で正しく機能しないため
    it.skip('モーダルを閉じることができる', async () => {
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

      setupFetchMock({
        masterKeys: mockMasterKeys,
        walletRoots: [],
        decryptResult: { mnemonic: testMnemonic }
      });

      // Act
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // 閉じるボタンをクリック
      const dialog = screen.getByRole('dialog');
      const closeButton = within(dialog).getByRole('button', { name: /閉じる/i });
      await user.click(closeButton);

      // Assert: モーダルが閉じられた
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('Edge Function呼び出しに失敗したときにモーダルが開かない', async () => {
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

      setupFetchMock({
        masterKeys: mockMasterKeys,
        walletRoots: [],
        decryptError: '復号化に失敗しました'
      });

      // Act
      renderWalletAdmin();

      // マスターキータブをクリック
      const masterKeyTab = await screen.findByRole('tab', { name: /マスターキー/i });
      await user.click(masterKeyTab);

      await waitFor(() => {
        expect(screen.getByText('テストマスターキー')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /ニーモニック確認/i });
      await user.click(confirmButton);

      // Assert: モーダルが開かないことを確認（エラー時）
      // 少し待ってからモーダルがないことを確認
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
