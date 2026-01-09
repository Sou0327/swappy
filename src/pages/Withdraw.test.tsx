import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import Withdraw from './Withdraw'
import { supabase } from '@/integrations/supabase/client'

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
  }),
}))

// Supabaseのモック
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: { available: 100 },
            error: null
          })),
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

      expect(screen.getByText(/出金/i)).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /通貨を選択/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/出金先アドレス/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/出金数量/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /出金申請/i })).toBeInTheDocument()
    })

    it('対応通貨の一覧が表示される', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      const coinSelect = screen.getByRole('combobox', { name: /通貨を選択/i })
      await user.click(coinSelect)

      expect(screen.getByRole('option', { name: /USDT/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Bitcoin \(BTC\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Ethereum \(ETH\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Tron \(TRX\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Ripple \(XRP\)/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Cardano \(ADA\)/i })).toBeInTheDocument()
    })

    it('デフォルトでTRXが選択されている', () => {
      renderWithdraw()

      expect(screen.getByDisplayValue('TRX')).toBeInTheDocument()
    })
  })

  describe('残高表示', () => {
    it('選択した通貨の利用可能残高を表示する', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 150.5 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 150.50 TRX/i)).toBeInTheDocument()
      })
    })

    it('残高が0の場合は適切に表示する', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 0 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 0.00 TRX/i)).toBeInTheDocument()
      })
    })
  })

  describe('フォーム入力検証', () => {
    it('最小出金額以下では出金できない', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 100 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      // TRXの最小出金額は1なので、0.5を入力
      const amountInput = screen.getByLabelText(/出金数量/i)
      await user.clear(amountInput)
      await user.type(amountInput, '0.5')

      const addressInput = screen.getByLabelText(/出金先アドレス/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      expect(mockToast).toHaveBeenCalledWith({
        title: '入力エラー',
        description: '最小出金額は 1 TRX です',
        variant: 'destructive',
      })
    })

    it('利用可能残高を超える場合は出金できない', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 50 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 50.00 TRX/i)).toBeInTheDocument()
      })

      const amountInput = screen.getByLabelText(/出金数量/i)
      await user.clear(amountInput)
      await user.type(amountInput, '100')

      const addressInput = screen.getByLabelText(/出金先アドレス/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      expect(mockToast).toHaveBeenCalledWith({
        title: '入力エラー',
        description: '利用可能残高を超えています',
        variant: 'destructive',
      })
    })

    it('アドレスが空の場合は出金できない', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 100 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      const amountInput = screen.getByLabelText(/出金数量/i)
      await user.clear(amountInput)
      await user.type(amountInput, '10')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      expect(mockToast).toHaveBeenCalledWith({
        title: '入力エラー',
        description: '出金先アドレスを入力してください',
        variant: 'destructive',
      })
    })
  })

  describe('XRP特有の機能', () => {
    it('XRP選択時はメモタグフィールドが表示される', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      const coinSelect = screen.getByRole('combobox', { name: /通貨を選択/i })
      await user.click(coinSelect)
      await user.click(screen.getByRole('option', { name: /Ripple \(XRP\)/i }))

      expect(screen.getByLabelText(/メモタグ/i)).toBeInTheDocument()
    })

    it('XRP以外ではメモタグフィールドが表示されない', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      const coinSelect = screen.getByRole('combobox', { name: /通貨を選択/i })
      await user.click(coinSelect)
      await user.click(screen.getByRole('option', { name: /Bitcoin \(BTC\)/i }))

      expect(screen.queryByLabelText(/メモタグ/i)).not.toBeInTheDocument()
    })
  })

  describe('割合ボタン機能', () => {
    it('25%ボタンで残高の25%が入力される', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 100 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 100.00 TRX/i)).toBeInTheDocument()
      })

      const percent25Button = screen.getByRole('button', { name: /25%/i })
      await user.click(percent25Button)

      const amountInput = screen.getByLabelText(/出金数量/i) as HTMLInputElement
      expect(amountInput.value).toBe('25.00')
    })

    it('50%ボタンで残高の50%が入力される', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 200 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 200.00 TRX/i)).toBeInTheDocument()
      })

      const percent50Button = screen.getByRole('button', { name: /50%/i })
      await user.click(percent50Button)

      const amountInput = screen.getByLabelText(/出金数量/i) as HTMLInputElement
      expect(amountInput.value).toBe('100.00')
    })

    it('MAXボタンで残高の100%が入力される', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 75.5 },
              error: null
            })),
          })),
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 75.50 TRX/i)).toBeInTheDocument()
      })

      const maxButton = screen.getByRole('button', { name: /MAX/i })
      await user.click(maxButton)

      const amountInput = screen.getByLabelText(/出金数量/i) as HTMLInputElement
      expect(amountInput.value).toBe('75.50')
    })
  })

  describe('出金申請処理', () => {
    it('有効な情報で出金申請が成功する', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 100 },
              error: null
            })),
          })),
        })),
        insert: vi.fn(() => Promise.resolve({
          data: [{ id: 'withdrawal-id' }],
          error: null
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 100.00 TRX/i)).toBeInTheDocument()
      })

      const addressInput = screen.getByLabelText(/出金先アドレス/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const amountInput = screen.getByLabelText(/出金数量/i)
      await user.clear(amountInput)
      await user.type(amountInput, '50')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('withdrawals')
      })

      expect(mockToast).toHaveBeenCalledWith({
        title: '出金申請を受け付けました',
        description: '処理には時間がかかる場合があります。',
      })
    })

    it('出金申請でエラーが発生した場合エラーを表示する', async () => {
      const user = userEvent.setup()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 100 },
              error: null
            })),
          })),
        })),
        insert: vi.fn(() => Promise.resolve({
          data: null,
          error: new Error('Database connection failed')
        })),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 100.00 TRX/i)).toBeInTheDocument()
      })

      const addressInput = screen.getByLabelText(/出金先アドレス/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const amountInput = screen.getByLabelText(/出金数量/i)
      await user.clear(amountInput)
      await user.type(amountInput, '50')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'エラー',
          description: '出金申請に失敗しました: Database connection failed',
          variant: 'destructive',
        })
      })
    })
  })

  describe('ネットワーク選択', () => {
    it('USDTを選択すると複数のネットワークオプションが表示される', async () => {
      const user = userEvent.setup()
      renderWithdraw()

      const coinSelect = screen.getByRole('combobox', { name: /通貨を選択/i })
      await user.click(coinSelect)
      await user.click(screen.getByRole('option', { name: /USDT/i }))

      expect(screen.getByText(/ネットワーク/i)).toBeInTheDocument()

      const networkSelect = screen.getByRole('combobox', { name: /ネットワークを選択/i })
      await user.click(networkSelect)

      expect(screen.getByRole('option', { name: /ERC20/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /TRC20/i })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /BEP20/i })).toBeInTheDocument()
    })
  })

  describe('ローディング状態', () => {
    it('出金申請中はボタンが無効化される', async () => {
      const user = userEvent.setup()

      // 出金申請を遅延させる
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: { available: 100 },
              error: null
            })),
          })),
        })),
        insert: vi.fn(() =>
          new Promise(resolve => setTimeout(() => resolve({
            data: [{ id: 'withdrawal-id' }],
            error: null
          }), 100))
        ),
      } as ReturnType<typeof supabase.from>)

      renderWithdraw()

      await waitFor(() => {
        expect(screen.getByText(/利用可能: 100.00 TRX/i)).toBeInTheDocument()
      })

      const addressInput = screen.getByLabelText(/出金先アドレス/i)
      await user.type(addressInput, 'TValidAddress123456789')

      const amountInput = screen.getByLabelText(/出金数量/i)
      await user.clear(amountInput)
      await user.type(amountInput, '50')

      const submitButton = screen.getByRole('button', { name: /出金申請/i })
      await user.click(submitButton)

      // ローディング中はボタンが無効化される
      expect(submitButton).toBeDisabled()

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled()
      })
    })
  })
})