import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Withdraw from './Withdraw'
import { supabase } from '@/integrations/supabase/client'

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
    isDemoMode: false,
  }),
}))

// Supabaseのモック - .eq().eq().maybeSingle() チェーンをサポート
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { balance: 100, locked_balance: 0 },
              error: null
            })),
          })),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: { id: 'withdrawal-id' }, error: null })),
  },
}))

// DashboardLayoutのモック
vi.mock('@/components/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}))

// DemoRestrictionNoticeのモック
vi.mock('@/components/DemoRestrictionNotice', () => ({
  DemoRestrictionNotice: () => null,
}))

const renderWithdraw = () => {
  return render(
    <BrowserRouter>
      <Withdraw />
    </BrowserRouter>
  )
}

describe('Withdraw コンポーネント', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期表示', () => {
    it('出金フォームの基本要素が表示される', () => {
      renderWithdraw()

      // h1要素で「出金」タイトルを確認
      expect(screen.getByRole('heading', { level: 1, name: /出金/i })).toBeInTheDocument()
      // コイン選択のcomboboxが存在することを確認
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBeGreaterThan(0)
      // 出金先アドレスのラベルが存在することを確認
      expect(screen.getByText(/出金先アドレス/i)).toBeInTheDocument()
      // 出金数量のラベルが存在することを確認
      expect(screen.getByText(/出金数量/i)).toBeInTheDocument()
      // 出金申請ボタンが存在することを確認
      expect(screen.getByRole('button', { name: /出金申請/i })).toBeInTheDocument()
    })

    it('対応通貨の一覧が表示される', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      // 最初のcombobox（通貨選択）をクリック
      const comboboxes = screen.getAllByRole('combobox')
      await user.click(comboboxes[0])

      // オプションが表示されることを確認
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /USDT/i })).toBeInTheDocument()
      })
      expect(screen.getByRole('option', { name: /Bitcoin \(BTC\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Ethereum \(ETH\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Tron \(TRX\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Ripple \(XRP\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Cardano \(ADA\)/i })).toBeInTheDocument()
    })

    it('デフォルトでTRXが選択されている', () => {
      renderWithdraw()

      // TRXがバッジとして表示されていることを確認
      expect(screen.getByText('TRX')).toBeInTheDocument()
    })
  })

  describe('残高表示', () => {
    it('選択した通貨の利用可能残高を表示する', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 150.5, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*150\.50.*TRX/i)).toBeInTheDocument()
      })
    })

    it('残高が0の場合は適切に表示する', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 0, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*0\.00.*TRX/i)).toBeInTheDocument()
      })
    })
  })

  describe('フォーム入力検証', () => {
    it('最小出金額以下では出金できない', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 100, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      // TRXの最小出金額は1なので、0.5を入力
      const amountInput = screen.getByPlaceholderText(/数量を入力/i)
      await user.clear(amountInput)
      await user.type(amountInput, '0.5')

      const addressInput = screen.getByPlaceholderText(/出金先アドレスを入力/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      // 最小出金額未満のため、ボタンは無効化されている
      expect(submitButton).toBeDisabled()
    })

    it('利用可能残高を超える場合は出金できない', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 50, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*50\.00.*TRX/i)).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText(/数量を入力/i)
      await user.clear(amountInput)
      await user.type(amountInput, '100')

      const addressInput = screen.getByPlaceholderText(/出金先アドレスを入力/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      // 残高超過のため、ボタンは無効化されている
      expect(submitButton).toBeDisabled()
    })

    it('アドレスが空の場合は出金できない', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 100, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      const amountInput = screen.getByPlaceholderText(/数量を入力/i)
      await user.clear(amountInput)
      await user.type(amountInput, '10')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      // アドレスが空のため、ボタンは無効化されている
      expect(submitButton).toBeDisabled()
    })
  })

  describe('XRP特有の機能', () => {
    it('XRP選択時はメモタグフィールドが表示される', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      // 最初のcombobox（通貨選択）をクリック
      const comboboxes = screen.getAllByRole('combobox')
      await user.click(comboboxes[0])
      await user.click(screen.getByRole('option', { name: /Ripple \(XRP\)/i }))

      // タグ/メモのラベルが表示される
      expect(screen.getByText(/タグ.*メモ/i)).toBeInTheDocument()
    })

    it('XRP以外ではメモタグフィールドが表示されない', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      // 最初のcombobox（通貨選択）をクリック
      const comboboxes = screen.getAllByRole('combobox')
      await user.click(comboboxes[0])
      await user.click(screen.getByRole('option', { name: /Bitcoin \(BTC\)/i }))

      // タグ/メモのラベルが表示されない
      expect(screen.queryByText(/タグ.*メモ/i)).not.toBeInTheDocument()
    })
  })

  describe('割合ボタン機能', () => {
    it('25%ボタンで残高の25%が入力される', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 100, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*100\.00.*TRX/i)).toBeInTheDocument()
      })

      const percent25Button = screen.getByRole('button', { name: /25%/i })
      await user.click(percent25Button)

      const amountInput = screen.getByPlaceholderText(/数量を入力/i) as HTMLInputElement
      expect(amountInput.value).toBe('25.00')
    })

    it('50%ボタンで残高の50%が入力される', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 200, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*200\.00.*TRX/i)).toBeInTheDocument()
      })

      const percent50Button = screen.getByRole('button', { name: /50%/i })
      await user.click(percent50Button)

      const amountInput = screen.getByPlaceholderText(/数量を入力/i) as HTMLInputElement
      expect(amountInput.value).toBe('100.00')
    })

    it('MAXボタンで残高の100%が入力される', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 75.5, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*75\.50.*TRX/i)).toBeInTheDocument()
      })

      const maxButton = screen.getByRole('button', { name: /MAX/i })
      await user.click(maxButton)

      const amountInput = screen.getByPlaceholderText(/数量を入力/i) as HTMLInputElement
      expect(amountInput.value).toBe('75.5')
    })
  })

  describe('出金申請処理', () => {
    it('有効な情報で出金申請が成功する', async () => {
      const user = userEvent.setup()

      const mockRpc = vi.fn().mockResolvedValue({ data: { id: 'withdrawal-id' }, error: null })
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 100, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)
      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*100\.00.*TRX/i)).toBeInTheDocument()
      })

      const addressInput = screen.getByPlaceholderText(/出金先アドレスを入力/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const amountInput = screen.getByPlaceholderText(/数量を入力/i)
      await user.clear(amountInput)
      await user.type(amountInput, '50')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('request_withdrawal', expect.objectContaining({
          p_currency: 'TRX',
          p_amount: 50,
        }))
      })

      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: expect.stringMatching(/出金/i),
      }))
    })

    it('出金申請でエラーが発生した場合エラーを表示する', async () => {
      const user = userEvent.setup()

      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } })
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 100, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)
      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*100\.00.*TRX/i)).toBeInTheDocument()
      })

      const addressInput = screen.getByPlaceholderText(/出金先アドレスを入力/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const amountInput = screen.getByPlaceholderText(/数量を入力/i)
      await user.clear(amountInput)
      await user.type(amountInput, '50')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          variant: 'destructive',
        }))
      })
    })
  })

  describe('ネットワーク選択', () => {
    it('USDTを選択すると複数のネットワークオプションが表示される', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      // 最初のcombobox（通貨選択）をクリック
      const comboboxes = screen.getAllByRole('combobox')
      await user.click(comboboxes[0])
      await user.click(screen.getByRole('option', { name: /USDT/i }))

      // ネットワークラベルが表示されることを確認（複数マッチを考慮）
      const networkLabels = screen.getAllByText(/ネットワーク/i)
      expect(networkLabels.length).toBeGreaterThan(0)

      // 2番目のcombobox（ネットワーク選択）をクリック
      const networkComboboxes = screen.getAllByRole('combobox')
      await user.click(networkComboboxes[1])

      expect(screen.getByRole('option', { name: /ERC20/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /TRC20/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /BEP20/i })).toBeInTheDocument()
    })
  })

  describe('ローディング状態', () => {
    it('出金申請中はボタンが無効化され、完了後にRPCが呼ばれる', async () => {
      const user = userEvent.setup()

      // 出金申請を遅延させる
      const mockRpc = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          data: { id: 'withdrawal-id' },
          error: null
        }), 100))
      )
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { balance: 100, locked_balance: 0 },
                error: null
              })),
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)
      vi.spyOn(supabase, 'rpc').mockImplementation(mockRpc)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能残高.*100\.00.*TRX/i)).toBeInTheDocument()
      })

      const addressInput = screen.getByPlaceholderText(/出金先アドレスを入力/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const amountInput = screen.getByPlaceholderText(/数量を入力/i)
      await user.clear(amountInput)
      await user.type(amountInput, '50')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      // ローディング中はボタンが無効化される
      expect(submitButton).toBeDisabled()

      // RPC呼び出しが完了するまで待機（ローディング完了の確認）
      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('request_withdrawal', expect.objectContaining({
          p_currency: 'TRX',
          p_amount: 50,
        }))
      })
    })
  })
})