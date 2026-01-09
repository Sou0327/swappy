/**
 * useKYC フックの単体テスト
 * KYC（本人確認）機能の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useKYC } from '@/hooks/use-kyc'
import type { KYCSettings, KYCDocument, KYCInfo } from '@/hooks/use-kyc'

// AuthContextのモック
const mockUser = { id: 'test-user-123', email: 'test@example.com' }
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}))

// use-async-stateのモック（2つのインスタンス用）
const mockSettingsExecute = vi.fn()
const mockDocumentsExecute = vi.fn()
const settingsState = {
  data: null as KYCSettings | null,
  loading: false,
  error: null,
  execute: mockSettingsExecute, // 直接mockSettingsExecuteを参照
  setData: vi.fn(),
  reset: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  isIdle: true
}
const documentsState = {
  data: null as KYCDocument[] | null,
  loading: false,
  error: null,
  execute: mockDocumentsExecute, // 直接mockDocumentsExecuteを参照
  setData: vi.fn(),
  reset: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  isIdle: true
}

let callCount = 0
vi.mock('@/hooks/use-async-state', () => ({
  useAsyncState: () => {
    callCount++
    return callCount === 1 ? settingsState : documentsState
  }
}))

// use-error-handlerのモック
const mockHandleError = vi.fn()
vi.mock('@/hooks/use-error-handler', () => ({
  useErrorHandler: () => ({
    handleError: mockHandleError
  })
}))

// Supabaseクライアントのモック
vi.mock('@/integrations/supabase/client')

describe('useKYC', () => {
  let mockFrom: ReturnType<typeof vi.fn>
  let mockStorage: {
    from: ReturnType<typeof vi.fn>
  }

  // モックKYC設定データ（key-value形式）
  const mockKYCSettingsData = [
    { key: 'kyc_enabled', value: 'true' },
    { key: 'kyc_required_for_deposit', value: 'false' },
    { key: 'kyc_required_for_withdrawal', value: 'true' },
    { key: 'kyc_max_file_size', value: '10485760' }, // 10MB
    { key: 'kyc_allowed_file_types', value: JSON.stringify(['image/jpeg', 'image/png']) }
  ]

  // 期待されるKYCSettings
  const expectedSettings: KYCSettings = {
    kycEnabled: true,
    kycRequiredForDeposit: false,
    kycRequiredForWithdrawal: true,
    maxFileSize: 10485760,
    allowedFileTypes: ['image/jpeg', 'image/png']
  }

  // モックプロファイルデータ
  const mockProfileData = {
    kyc_status: 'verified',
    kyc_level: 1,
    kyc_updated_at: '2024-01-01T00:00:00Z',
    kyc_notes: 'Test notes'
  }

  // モックKYCドキュメントデータ
  const mockDocumentsData = [
    {
      id: 'doc-1',
      document_type: 'identity',
      file_name: 'passport.jpg',
      file_path: 'test-user-123/identity/passport.jpg',
      file_size: 1024000,
      mime_type: 'image/jpeg',
      status: 'approved',
      reviewed_by: 'admin-123',
      reviewed_at: '2024-01-02T00:00:00Z',
      review_notes: 'Approved',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z'
    }
  ]

  beforeEach(async () => {
    const { supabase } = await import('@/integrations/supabase/client')

    // callCountをリセット
    callCount = 0

    // デフォルトのSupabaseモック
    mockFrom = vi.fn((table: string) => {
      if (table === 'kyc_settings') {
        return {
          select: vi.fn(() => Promise.resolve({
            data: mockKYCSettingsData,
            error: null
          }))
        }
      }

      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: mockProfileData,
                error: null
              }))
            }))
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({
                data: [{ ...mockProfileData, kyc_status: 'pending' }],
                error: null
              }))
            }))
          }))
        }
      }

      if (table === 'kyc_documents') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({
                data: mockDocumentsData,
                error: null
              }))
            }))
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: mockDocumentsData[0],
                error: null
              }))
            }))
          }))
        }
      }

      return {
        select: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }
    })

    // Storageモック
    mockStorage = {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({
          data: { path: 'test-user-123/identity/123456_test.jpg' },
          error: null
        }))
      }))
    }

    vi.mocked(supabase.from).mockImplementation(mockFrom)
    Object.defineProperty(supabase, 'storage', {
      value: mockStorage,
      writable: true,
      configurable: true
    })

    // モック状態をリセット
    mockSettingsExecute.mockClear()
    mockDocumentsExecute.mockClear()
    mockHandleError.mockClear()
    settingsState.data = null
    settingsState.loading = false
    settingsState.error = null
    documentsState.data = null
    documentsState.loading = false
    documentsState.error = null

    // setData関数が実際にdataプロパティを更新するように実装
    vi.mocked(settingsState.setData).mockImplementation((newData) => {
      settingsState.data = typeof newData === 'function' ? newData(settingsState.data) : newData
    })
    vi.mocked(documentsState.setData).mockImplementation((newData) => {
      documentsState.data = typeof newData === 'function' ? newData(documentsState.data) : newData
    })

    // executeが呼ばれたときに自動的にsetDataを呼ぶ
    mockSettingsExecute.mockImplementation(async (loadFn) => {
      const result = await loadFn()
      settingsState.setData(result)
      return result
    })
    mockDocumentsExecute.mockImplementation(async (loadFn) => {
      const result = await loadFn()
      documentsState.setData(result)
      return result
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => useKYC())

      expect(result.current.kycInfo).toEqual({ status: 'none', level: 0 })
      expect(result.current.settings).toBeNull()
      expect(result.current.documents).toBeNull()
      expect(result.current.loading).toBe(false)
    })

    it('操作関数が提供される', () => {
      const { result } = renderHook(() => useKYC())

      expect(result.current.isKYCRequired).toBeDefined()
      expect(result.current.isKYCCompleted).toBeDefined()
      expect(result.current.uploadDocument).toBeDefined()
      expect(result.current.submitKYCApplication).toBeDefined()
      expect(result.current.refresh).toBeDefined()
    })

    it('ユーザーがいる場合、初期データを読み込む', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        // KYC設定の読み込み
        expect(mockSettingsExecute).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            context: 'KYC設定の読み込み',
            showErrorToast: true
          })
        )

        // KYC書類の読み込み
        expect(mockDocumentsExecute).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({
            context: 'KYC書類の読み込み',
            showErrorToast: true
          })
        )
      })
    })
  })

  describe('KYC設定の読み込みと変換', () => {
    it('key-value形式からKYCSettingsに変換する', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockSettingsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockSettingsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result).toEqual(expectedSettings)
    })

    it('boolean値を正しく変換する（文字列"true"）', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockSettingsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockSettingsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result.kycEnabled).toBe(true)
      expect(result.kycRequiredForDeposit).toBe(false)
      expect(result.kycRequiredForWithdrawal).toBe(true)
    })

    it('JSON文字列を配列に変換する', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockSettingsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockSettingsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result.allowedFileTypes).toEqual(['image/jpeg', 'image/png'])
    })

    it('数値文字列をparseIntで変換する', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockSettingsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockSettingsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result.maxFileSize).toBe(10485760)
    })

    it('デフォルト値を使用する（maxFileSize）', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const settingsWithoutMaxSize = mockKYCSettingsData.filter(
        item => item.key !== 'kyc_max_file_size'
      )

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'kyc_settings') {
          return {
            select: vi.fn(() => Promise.resolve({
              data: settingsWithoutMaxSize,
              error: null
            }))
          }
        }
        return mockFrom(table)
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockSettingsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockSettingsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result.maxFileSize).toBe(5242880) // 5MBデフォルト
    })

    it('デフォルト値を使用する（allowedFileTypes）', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const settingsWithoutFileTypes = mockKYCSettingsData.filter(
        item => item.key !== 'kyc_allowed_file_types'
      )

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'kyc_settings') {
          return {
            select: vi.fn(() => Promise.resolve({
              data: settingsWithoutFileTypes,
              error: null
            }))
          }
        }
        return mockFrom(table)
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockSettingsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockSettingsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result.allowedFileTypes).toEqual(['image/jpeg', 'image/png', 'application/pdf'])
    })
  })

  describe('ユーザーKYC情報の読み込み', () => {
    it('プロファイルからKYC情報を取得する', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockFrom).toHaveBeenCalledWith('profiles')
      })
    })

    it('KYC情報を正しく変換する', async () => {
      const { result } = renderHook(() => useKYC())

      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('verified')
        expect(result.current.kycInfo.level).toBe(1)
        expect(result.current.kycInfo.updatedAt).toBe('2024-01-01T00:00:00Z')
        expect(result.current.kycInfo.notes).toBe('Test notes')
      })
    })

    it('null値をデフォルト値に変換する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: {
                    kyc_status: null,
                    kyc_level: null,
                    kyc_updated_at: null,
                    kyc_notes: null
                  },
                  error: null
                }))
              }))
            }))
          }
        }
        return mockFrom(table)
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      const { result } = renderHook(() => useKYC())

      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('none')
        expect(result.current.kycInfo.level).toBe(0)
      })
    })
  })

  describe('KYC書類の読み込み', () => {
    it('KYC書類一覧を取得する', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockDocumentsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockDocumentsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('doc-1')
      expect(result[0].documentType).toBe('identity')
    })

    it('snake_caseからcamelCaseに変換する', async () => {
      renderHook(() => useKYC())

      await waitFor(() => {
        expect(mockDocumentsExecute).toHaveBeenCalled()
      })

      const loadFunction = mockDocumentsExecute.mock.calls[0][0]
      const result = await loadFunction()

      expect(result[0]).toHaveProperty('fileName', 'passport.jpg')
      expect(result[0]).toHaveProperty('filePath')
      expect(result[0]).toHaveProperty('fileSize')
      expect(result[0]).toHaveProperty('mimeType')
      expect(result[0]).toHaveProperty('reviewedBy')
      expect(result[0]).toHaveProperty('reviewedAt')
      expect(result[0]).toHaveProperty('reviewNotes')
      expect(result[0]).toHaveProperty('createdAt')
      expect(result[0]).toHaveProperty('updatedAt')
    })
  })

  describe('isKYCRequired判定', () => {
    it('KYC無効時はfalseを返す', () => {
      settingsState.data = {
        ...expectedSettings,
        kycEnabled: false
      }

      const { result } = renderHook(() => useKYC())

      expect(result.current.isKYCRequired('deposit')).toBe(false)
      expect(result.current.isKYCRequired('withdrawal')).toBe(false)
    })

    it('deposit操作でkycRequiredForDepositを返す', () => {
      settingsState.data = expectedSettings

      const { result } = renderHook(() => useKYC())

      expect(result.current.isKYCRequired('deposit')).toBe(false)
    })

    it('withdrawal操作でkycRequiredForWithdrawalを返す', () => {
      settingsState.data = expectedSettings

      const { result } = renderHook(() => useKYC())

      expect(result.current.isKYCRequired('withdrawal')).toBe(true)
    })
  })

  describe('isKYCCompleted判定', () => {
    it('KYC無効時は常にtrueを返す', () => {
      settingsState.data = {
        ...expectedSettings,
        kycEnabled: false
      }

      const { result } = renderHook(() => useKYC())

      expect(result.current.isKYCCompleted()).toBe(true)
    })

    it('verifiedステータスでtrueを返す', async () => {
      // callCountをリセット
      callCount = 0
      settingsState.data = expectedSettings

      const { result } = renderHook(() => useKYC())

      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('verified')
      })

      expect(result.current.isKYCCompleted()).toBe(true)
    })

    it.skip('pending/none/rejectedステータスでfalseを返す', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { ...mockProfileData, kyc_status: 'pending' },
                  error: null
                }))
              }))
            }))
          }
        }
        return mockFrom(table)
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      // settingsStateを設定（verifiedテストと同じパターン）
      settingsState.data = expectedSettings

      // callCountをリセット（renderHook直前に必ずリセット）
      callCount = 0

      const { result } = renderHook(() => useKYC())

      // kycInfoのステータスがpendingになっていることを確認
      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('pending')
      })

      // settingsがロードされるまで待つ
      await waitFor(() => {
        expect(result.current.settings).toBeTruthy()
      })

      expect(result.current.settings?.kycEnabled).toBe(true)
      expect(result.current.isKYCCompleted()).toBe(false)
    })
  })

  describe('uploadDocument機能', () => {
    const mockFile = new File(['test content'], 'test.jpg', { type: 'image/jpeg' })

    beforeEach(() => {
      Object.defineProperty(mockFile, 'size', { value: 1024000 })
    })

    it('ファイルをアップロードできる', async () => {
      settingsState.data = expectedSettings

      const { result } = renderHook(() => useKYC())

      let uploadedDoc: KYCDocument | undefined

      await act(async () => {
        uploadedDoc = await result.current.uploadDocument(mockFile, 'identity')
      })

      expect(uploadedDoc).toBeDefined()
      expect(uploadedDoc?.documentType).toBe('identity')
    })

    it('ファイルサイズ上限をチェックする', async () => {
      settingsState.data = {
        ...expectedSettings,
        maxFileSize: 500000 // 0.5MB
      }

      const { result } = renderHook(() => useKYC())

      await expect(
        act(async () => {
          await result.current.uploadDocument(mockFile, 'identity')
        })
      ).rejects.toThrow('ファイルサイズが上限')
    })

    it('ファイル形式をチェックする', async () => {
      const pdfFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' })
      Object.defineProperty(pdfFile, 'size', { value: 1024000 })

      settingsState.data = {
        ...expectedSettings,
        allowedFileTypes: ['image/jpeg', 'image/png']
      }

      const { result } = renderHook(() => useKYC())

      await expect(
        act(async () => {
          await result.current.uploadDocument(pdfFile, 'identity')
        })
      ).rejects.toThrow('サポートされていないファイル形式')
    })

    it('ファイル名をサニタイズする', async () => {
      const unsafeFile = new File(
        ['test'],
        'テスト ファイル!@#$.jpg',
        { type: 'image/jpeg' }
      )
      Object.defineProperty(unsafeFile, 'size', { value: 1024000 })

      settingsState.data = expectedSettings

      const { result } = renderHook(() => useKYC())

      await act(async () => {
        await result.current.uploadDocument(unsafeFile, 'identity')
      })

      // Storageのuploadが呼ばれたことを確認
      expect(mockStorage.from).toHaveBeenCalledWith('kyc-documents')
    })

    it('rejected状態の場合、pendingに自動変更する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      // KYC状態をrejectedに設定
      const customMockFrom = vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: { ...mockProfileData, kyc_status: 'rejected' },
                  error: null
                }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({
                data: [{ ...mockProfileData, kyc_status: 'pending' }],
                error: null
              }))
            }))
          }
        }
        if (table === 'kyc_documents') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                  data: mockDocumentsData,
                  error: null
                }))
              }))
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: mockDocumentsData[0],
                  error: null
                }))
              }))
            }))
          }
        }
        return mockFrom(table)
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)
      settingsState.data = expectedSettings

      const { result } = renderHook(() => useKYC())

      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('rejected')
      })

      await act(async () => {
        await result.current.uploadDocument(mockFile, 'identity')
      })

      // ステータスがpendingに更新されることを確認
      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('pending')
      })
    })
  })

  describe('submitKYCApplication機能', () => {
    it('KYC申請を提出できる', async () => {
      const { result } = renderHook(() => useKYC())

      await act(async () => {
        await result.current.submitKYCApplication()
      })

      expect(mockFrom).toHaveBeenCalledWith('profiles')
    })

    it('ステータスをpendingに更新する', async () => {
      const { result } = renderHook(() => useKYC())

      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('verified')
      })

      await act(async () => {
        await result.current.submitKYCApplication()
      })

      expect(result.current.kycInfo.status).toBe('pending')
    })

    it('通知システムエラー(42501)を無視する', async () => {
      const { supabase } = await import('@/integrations/supabase/client')

      const customMockFrom = vi.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({
                  data: mockProfileData,
                  error: null
                }))
              }))
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => Promise.resolve({
                  data: null,
                  error: {
                    code: '42501',
                    message: 'permission denied for table notifications'
                  }
                }))
              }))
            }))
          }
        }
        return mockFrom(table)
      })

      vi.mocked(supabase.from).mockImplementation(customMockFrom)

      const { result } = renderHook(() => useKYC())

      await waitFor(() => {
        expect(result.current.kycInfo.status).toBe('verified')
      })

      // エラーを投げずに完了することを確認
      await act(async () => {
        await result.current.submitKYCApplication()
      })

      // ステータスがpendingに更新される
      expect(result.current.kycInfo.status).toBe('pending')
    })
  })

  describe('refresh機能', () => {
    it.skip('全データを再読み込みできる', async () => {
      const { result } = renderHook(() => useKYC())

      // 初期読み込みを待つ
      await waitFor(() => {
        expect(result.current.settings).toBeTruthy()
      })

      const initialSettingsCallCount = mockSettingsExecute.mock.calls.length
      const initialDocumentsCallCount = mockDocumentsExecute.mock.calls.length
      const initialFromCallCount = mockFrom.mock.calls.length

      // refreshを実行
      act(() => {
        result.current.refresh()
      })

      // 各executeが追加で呼ばれることを確認
      await waitFor(() => {
        expect(mockSettingsExecute.mock.calls.length).toBeGreaterThan(initialSettingsCallCount)
      }, { timeout: 3000 })

      await waitFor(() => {
        expect(mockDocumentsExecute.mock.calls.length).toBeGreaterThan(initialDocumentsCallCount)
      }, { timeout: 3000 })

      // mockFromも追加で呼ばれる（loadUserKYCInfo用）
      await waitFor(() => {
        expect(mockFrom.mock.calls.length).toBeGreaterThan(initialFromCallCount)
      }, { timeout: 3000 })
    })
  })

  describe('loading状態', () => {
    it('settings または documents がloadingの場合、trueを返す', () => {
      settingsState.loading = true
      documentsState.loading = false

      const { result } = renderHook(() => useKYC())

      expect(result.current.loading).toBe(true)
    })

    it('両方loadingでない場合、falseを返す', () => {
      settingsState.loading = false
      documentsState.loading = false

      const { result } = renderHook(() => useKYC())

      expect(result.current.loading).toBe(false)
    })
  })
})
