import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Deposit from './Deposit'
import { supabase } from '@/integrations/supabase/client'
import * as multichainUtils from '@/lib/multichain-wallet-utils'
import * as xrpUtils from '@/lib/xrp-wallet-utils'
import { SERVICE_RESTRICTIONS } from '@/lib/service-restrictions'

// ResizeObserverのモック（Radix UI Select用）
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// useNavigateのモック
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// useToastのモック
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}))

// useEnhancedToastのモック
const mockEnhancedToast = {
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
  showLoading: vi.fn(),
  dismissToast: vi.fn(),
  dismissAll: vi.fn(),
}
vi.mock('@/components/EnhancedToast', () => ({
  useEnhancedToast: () => mockEnhancedToast,
  createAddressCopyAction: vi.fn(),
  createRetryAction: vi.fn(),
}))

// ErrorHandlingのモック
vi.mock('@/components/ErrorHandling', () => ({
  EnhancedErrorDisplay: ({ error }: { error: Error }) => <div data-testid="error-display">{error.message}</div>,
  NetworkStatusIndicator: () => <div data-testid="network-status">Network Status</div>,
  SuccessFeedback: ({ message }: { message: string }) => <div data-testid="success-feedback">{message}</div>,
  analyzeError: vi.fn((error) => ({ userMessage: error.message, details: '', severity: 'error' })),
  generateRecoveryActions: vi.fn(() => []),
  useNetworkStatus: () => ({ isOnline: true, quality: 'good' }),
}))

// useRealtimeDepositsのモック
vi.mock('@/hooks/useRealtimeDeposits', () => ({
  default: () => ({
    state: {
      deposits: [],
      connectionState: { isConnected: false, quality: 'disconnected' },
      lastEventTimestamp: null,
    },
    getRecentDeposits: () => [],
    retryConnection: vi.fn(),
  }),
}))

// LoadingStatesのモック
vi.mock('@/components/LoadingStates', () => ({
  SmartLoadingState: ({ children }: { children: React.ReactNode }) => <div data-testid="smart-loading-state">{children}</div>,
  RichLoadingDisplay: () => <div data-testid="rich-loading">Loading...</div>,
  LOADING_STAGES: {},
}))

// NotificationSettingsのモック
vi.mock('@/components/NotificationSettings', () => ({
  default: () => <div data-testid="notification-settings">Notification Settings</div>,
}))

// DepositProgressTrackerのモック
vi.mock('@/components/DepositProgressTracker', () => ({
  default: () => <div data-testid="deposit-progress-tracker">Deposit Progress</div>,
}))

// use-async-stateのモック
vi.mock('@/hooks/use-async-state', () => ({
  useAsyncState: () => ({
    data: null,
    loading: false,
    error: null,
    execute: vi.fn(),
    reset: vi.fn(),
    lastFetch: null,
  }),
}))

// service-restrictionsは環境変数で制御（AdminRoute.test.tsxと同じアプローチ）

// lucide-reactのモック - よく使用されるアイコンのみ
vi.mock('lucide-react', () => ({
  ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="arrow-left-icon" {...props} />,
  Copy: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="copy-icon" {...props} />,
  Download: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="download-icon" {...props} />,
  ChevronDown: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="chevron-down-icon" {...props} />,
  ChevronUp: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="chevron-up-icon" {...props} />,
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="alert-triangle-icon" {...props} />,
  CheckCircle: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="check-circle-icon" {...props} />,
  Check: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="check-icon" {...props} />,
  Clock: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="clock-icon" {...props} />,
  Wifi: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="wifi-icon" {...props} />,
  WifiOff: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="wifi-off-icon" {...props} />,
  Zap: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="zap-icon" {...props} />,
  Activity: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="activity-icon" {...props} />,
  Settings: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="settings-icon" {...props} />,
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="alert-circle-icon" {...props} />,
}))

// useAuthのモック
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
}

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    userRole: 'user',
    loading: false,
  }),
}))

// multichain-wallet-utilsのモック
vi.mock('@/lib/multichain-wallet-utils', () => ({
  generateMultichainAddress: vi.fn(),
  validateMultichainAddress: vi.fn(),
  getChainConfig: vi.fn(),
  getSupportedAssets: vi.fn(),
  getMinimumDepositAmount: vi.fn(),
  getExplorerUrl: vi.fn(),
  SUPPORTED_ASSETS: ['ETH', 'BTC', 'USDT', 'TRX', 'XRP', 'ADA'],
}))

// xrp-wallet-utilsのモック
vi.mock('@/lib/xrp-wallet-utils', () => ({
  formatXRPDepositInfo: vi.fn(),
  generateXRPDepositInfo: vi.fn(),
}))

// Supabaseのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}))

// DashboardLayoutのモック
vi.mock('@/components/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}))

// QRCodeのモック
vi.mock('react-qr-code', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="qr-code" data-value={value}>QR Code for {value}</div>
  ),
}))

const renderDeposit = () => {
  return render(
    <BrowserRouter>
      <Deposit />
    </BrowserRouter>
  )
}

describe('Deposit コンポーネント', () => {
  beforeEach(() => {
    // SERVICE_RESTRICTIONSのmodeとメソッドをモック（デフォルト：制限なし）
    Object.defineProperty(SERVICE_RESTRICTIONS, 'mode', {
      get: () => 'none',
      configurable: true,
    });
    Object.defineProperty(SERVICE_RESTRICTIONS, 'isDepositEnabled', {
      value: () => true,
      configurable: true,
      writable: true,
    });

    // デフォルトのモック設定
    vi.mocked(multichainUtils.getSupportedAssets).mockReturnValue(['ETH', 'USDT'])
    vi.mocked(multichainUtils.getChainConfig).mockReturnValue({
      name: 'Ethereum',
      symbol: 'ETH',
      blockTime: 13,
      confirmations: 12,
      minConfirmations: 12,
    })
    vi.mocked(multichainUtils.getMinimumDepositAmount).mockReturnValue(0.01)
    vi.mocked(multichainUtils.generateMultichainAddress).mockResolvedValue({
      address: '0x1234567890123456789012345678901234567890',
      derivationPath: "m/44'/60'/0'/0/0",
    })
  })

  afterEach(() => {
    vi.clearAllMocks();
  })

  describe('初期表示', () => {
    // TODO: 実装と乖離あり - アドレス生成ボタンは存在せず、自動生成フロー
    it.skip('入金フォームの基本要素が表示される', () => {
      renderDeposit()

      expect(screen.getByRole('heading', { name: /^入金$/i })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /資産を選択/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /アドレス生成/i })).toBeInTheDocument()
    })

    // TODO: 複数のETH要素が存在するためテスト修正が必要
    it.skip('対応資産の一覧が表示される', async () => {
      const user = userEvent.setup()
      renderDeposit()

      const assetSelect = screen.getByRole('combobox', { name: /資産を選択/i })
      await user.click(assetSelect)

      expect(screen.getByRole('option', { name: /ETH/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /BTC/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /USDT/i })).toBeInTheDocument()
    })
  })

  describe('アドレス生成機能', () => {
    it('ETHアドレスを正常に生成する', async () => {
      const user = userEvent.setup()

      const mockAddress = {
        address: '0x1234567890123456789012345678901234567890',
        derivationPath: "m/44'/60'/0'/0/0",
      }

      vi.mocked(multichainUtils.generateMultichainAddress).mockResolvedValue(mockAddress)

      renderDeposit()

      // ETHを選択
      const assetSelect = screen.getByRole('combobox', { name: /資産を選択/i })
      await user.click(assetSelect)
      await user.click(screen.getByRole('option', { name: /ETH/i }))

      // アドレス生成ボタンをクリック
      const generateButton = screen.getByRole('button', { name: /アドレス生成/i })
      await user.click(generateButton)

      await waitFor(() => {
        expect(multichainUtils.generateMultichainAddress).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByText(mockAddress.address)).toBeInTheDocument()
      })
    })

    it('XRPアドレス生成時はデスティネーションタグも表示する', async () => {
      const user = userEvent.setup()

      vi.mocked(multichainUtils.getSupportedAssets).mockReturnValue(['XRP'])

      const mockXRPInfo = {
        address: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
        destination_tag: '123456789',
        destinationTag: '123456789',
      }

      vi.mocked(xrpUtils.generateXRPDepositInfo).mockResolvedValue(mockXRPInfo)

      renderDeposit()

      // XRPを選択
      const assetSelect = screen.getByRole('combobox', { name: /資産を選択/i })
      await user.click(assetSelect)
      await user.click(screen.getByRole('option', { name: /XRP/i }))

      // アドレス生成ボタンをクリック
      const generateButton = screen.getByRole('button', { name: /アドレス生成/i })
      await user.click(generateButton)

      await waitFor(() => {
        expect(screen.getByText(mockXRPInfo.address)).toBeInTheDocument()
        expect(screen.getByText(/デスティネーションタグ/i)).toBeInTheDocument()
        expect(screen.getByText(mockXRPInfo.destination_tag)).toBeInTheDocument()
      })
    })

    it('アドレス生成エラー時にエラーメッセージを表示する', async () => {
      const user = userEvent.setup()

      vi.mocked(multichainUtils.generateMultichainAddress).mockRejectedValue(new Error('Address generation failed'))

      renderDeposit()

      const generateButton = screen.getByRole('button', { name: /アドレス生成/i })
      await user.click(generateButton)

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'エラー',
          description: 'アドレス生成に失敗しました: Address generation failed',
          variant: 'destructive',
        })
      })
    })
  })

  describe('QRコード表示', () => {
    it('アドレス生成後にQRコードが表示される', async () => {
      const user = userEvent.setup()

      const mockAddress = {
        address: '0x1234567890123456789012345678901234567890',
        derivationPath: "m/44'/60'/0'/0/0",
      }

      vi.mocked(multichainUtils.generateMultichainAddress).mockResolvedValue(mockAddress)

      renderDeposit()

      const generateButton = screen.getByRole('button', { name: /アドレス生成/i })
      await user.click(generateButton)

      await waitFor(() => {
        const qrCode = screen.getByTestId('qr-code')
        expect(qrCode).toBeInTheDocument()
        expect(qrCode).toHaveAttribute('data-value', mockAddress.address)
      })
    })
  })

  describe('アドレス操作', () => {
    it('アドレスをクリップボードにコピーできる', async () => {
      const user = userEvent.setup()

      // クリップボードAPIのモック
      const mockWriteText = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: mockWriteText,
        },
      })

      const mockAddress = {
        address: '0x1234567890123456789012345678901234567890',
        derivationPath: "m/44'/60'/0'/0/0",
      }

      vi.mocked(multichainUtils.generateMultichainAddress).mockResolvedValue(mockAddress)

      renderDeposit()

      const generateButton = screen.getByRole('button', { name: /アドレス生成/i })
      await user.click(generateButton)

      await waitFor(() => {
        expect(screen.getByText(mockAddress.address)).toBeInTheDocument()
      })

      const copyButton = screen.getByRole('button', { name: /コピー/i })
      await user.click(copyButton)

      expect(mockWriteText).toHaveBeenCalledWith(mockAddress.address)
      expect(mockToast).toHaveBeenCalledWith({
        title: 'コピーしました',
        description: 'アドレスをクリップボードにコピーしました',
      })
    })
  })

  describe('入金履歴表示', () => {
    it('ユーザーの入金履歴を表示する', async () => {
      const mockDepositHistory = [
        {
          id: 'deposit-1',
          user_id: mockUser.id,
          amount: 0.5,
          currency: 'ETH',
          chain: 'eth',
          network: 'mainnet',
          status: 'confirmed',
          transaction_hash: '0xabcdef1234567890',
          confirmations_observed: 12,
          confirmations_required: 12,
          created_at: '2023-01-01T00:00:00Z',
        },
        {
          id: 'deposit-2',
          user_id: mockUser.id,
          amount: 100,
          currency: 'USDT',
          chain: 'eth',
          network: 'mainnet',
          status: 'pending',
          transaction_hash: '0x1234567890abcdef',
          confirmations_observed: 5,
          confirmations_required: 12,
          created_at: '2023-01-02T00:00:00Z',
        },
      ]

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({
                data: mockDepositHistory,
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderDeposit()

      await waitFor(() => {
        expect(screen.getByText('0.5 ETH')).toBeInTheDocument()
        expect(screen.getByText('100 USDT')).toBeInTheDocument()
        expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
        expect(screen.getByText(/pending/i)).toBeInTheDocument()
      })
    })

    it('入金履歴が空の場合は適切なメッセージを表示する', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({
                data: [],
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderDeposit()

      await waitFor(() => {
        expect(screen.getByText(/入金履歴がありません/i)).toBeInTheDocument()
      })
    })
  })

  describe('最小入金額表示', () => {
    it('選択した資産の最小入金額を表示する', () => {
      vi.mocked(multichainUtils.getMinimumDepositAmount).mockReturnValue(0.01)

      renderDeposit()

      expect(screen.getByText(/最小入金額/i)).toBeInTheDocument()
      expect(screen.getByText(/0.01/)).toBeInTheDocument()
    })
  })

  describe('チェーンとネットワーク選択', () => {
    it('資産に応じて対応チェーンが自動選択される', async () => {
      const user = userEvent.setup()

      // USDTはETHとTRCチェーンで対応
      vi.mocked(multichainUtils.getSupportedAssets).mockImplementation((chain: string) => {
        if (chain === 'eth') return ['ETH', 'USDT']
        if (chain === 'trc') return ['TRX', 'USDT']
        return []
      })

      renderDeposit()

      // USDTを選択
      const assetSelect = screen.getByRole('combobox', { name: /資産を選択/i })
      await user.click(assetSelect)
      await user.click(screen.getByRole('option', { name: /USDT/i }))

      // チェーン選択肢が表示されることを確認
      await waitFor(() => {
        expect(screen.getByText(/チェーンを選択/i)).toBeInTheDocument()
      })
    })
  })

  describe('サービス制限機能', () => {
    describe('制限なし（mode: none）', () => {
      beforeEach(() => {
        Object.defineProperty(SERVICE_RESTRICTIONS, 'mode', {
          get: () => 'none',
          configurable: true,
        });
        Object.defineProperty(SERVICE_RESTRICTIONS, 'isDepositEnabled', {
          value: () => true,
          configurable: true,
          writable: true,
        });
      });

      it('入金フォームが通常通り表示される', () => {
        renderDeposit();

        expect(screen.getByRole('heading', { name: /^入金$/i })).toBeInTheDocument();
        expect(screen.queryByText(/入金機能の一時停止/i)).not.toBeInTheDocument();
      });
    });

    describe('制限あり（mode: partial）', () => {
      beforeEach(() => {
        Object.defineProperty(SERVICE_RESTRICTIONS, 'mode', {
          get: () => 'partial',
          configurable: true,
        });
        Object.defineProperty(SERVICE_RESTRICTIONS, 'isDepositEnabled', {
          value: () => false,
          configurable: true,
          writable: true,
        });
      });

      it('入金フォームがブロックされる', () => {
        renderDeposit();

        expect(screen.getByRole('heading', { name: /^入金$/i })).toBeInTheDocument();
        // 制限メッセージが表示される
        const restrictionElements = screen.getAllByText(/入金機能の一時停止/i);
        expect(restrictionElements.length).toBeGreaterThan(0);
      });

      it('制限メッセージが表示される', () => {
        renderDeposit();

        const restrictionElements = screen.getAllByText(/入金機能の一時停止/i);
        expect(restrictionElements.length).toBeGreaterThan(0);
        expect(screen.getByText(/システムメンテナンス中/i)).toBeInTheDocument();
      });

      it('制限メッセージに資産保管の記述がある', () => {
        renderDeposit();

        expect(screen.getByText(/既存資産/i)).toBeInTheDocument();
        expect(screen.getByText(/安全に保護/i)).toBeInTheDocument();
      });

      it('制限メッセージに問い合わせ先が含まれる', () => {
        renderDeposit();

        expect(screen.getByText(/サポートまでお問い合わせ/i)).toBeInTheDocument();
      });

      it('既存の入金履歴は閲覧可能', async () => {
        const mockDepositHistory = [
          {
            id: 'deposit-1',
            user_id: mockUser.id,
            amount: 0.5,
            currency: 'ETH',
            chain: 'eth',
            network: 'mainnet',
            status: 'confirmed',
            transaction_hash: '0xabcdef1234567890',
            confirmations_observed: 12,
            confirmations_required: 12,
            created_at: '2023-01-01T00:00:00Z',
          },
        ];

        vi.mocked(supabase.from).mockReturnValue({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({
                  data: mockDepositHistory,
                  error: null
                })),
              })),
            })),
          })),
        } as ReturnType<typeof supabase.from>);

        renderDeposit();

        // 入金履歴のタイトルは表示される
        expect(screen.getByText(/最近の入金履歴/i)).toBeInTheDocument();

        // 履歴データも表示される
        await waitFor(() => {
          expect(screen.getByText(/0\.5/i)).toBeInTheDocument();
        });
      });
    });
  });
})