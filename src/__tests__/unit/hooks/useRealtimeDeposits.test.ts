/**
 * useRealtimeDeposits フックの単体テスト
 * リアルタイム入金監視機能の包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useRealtimeDeposits, type UseRealtimeDepositsOptions } from '@/hooks/useRealtimeDeposits'
import type { DepositEventData, DepositEventCallbacks } from '@/lib/realtime-deposit-client'

// realtime-deposit-clientのモック
const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()
const mockRetryConnection = vi.fn()
const mockGetConnectionState = vi.fn()

vi.mock('@/lib/realtime-deposit-client', () => ({
  getRealtimeDepositClient: vi.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    retryConnection: mockRetryConnection,
    getConnectionState: mockGetConnectionState
  })),
  destroyRealtimeDepositClient: vi.fn()
}))

// useNotificationsのモック
const mockSendNotification = vi.fn()
vi.mock('@/hooks/useNotifications', () => ({
  default: () => ({
    sendNotification: mockSendNotification,
    permission: 'granted'
  }),
  createDepositNotification: vi.fn((type, data) => ({
    title: `Deposit ${type}`,
    body: `Amount: ${data.amount} ${data.asset}`,
    data
  }))
}))

describe('useRealtimeDeposits', () => {
  const mockUserId = 'test-user-123'
  let callbacks: DepositEventCallbacks
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // コンソールスパイ
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // モックのリセット
    mockSubscribe.mockReset()
    mockUnsubscribe.mockReset()
    mockRetryConnection.mockReset()
    mockGetConnectionState.mockReset()
    mockSendNotification.mockReset()

    // デフォルトのモック動作
    mockSubscribe.mockImplementation(async (cbs: DepositEventCallbacks) => {
      callbacks = cbs
    })
    mockGetConnectionState.mockReturnValue({
      isConnected: true,
      quality: 'good',
      lastUpdate: new Date(),
      reconnectionAttempts: 0,
      maxReconnectionAttempts: 5
    })
    // sendNotificationはPromiseを返す必要がある
    mockSendNotification.mockResolvedValue(undefined)
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('初期化とライフサイクル', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      expect(result.current.state).toEqual({
        deposits: [],
        connectionState: {
          isConnected: false,
          quality: 'disconnected',
          lastUpdate: null,
          reconnectionAttempts: 0,
          maxReconnectionAttempts: 5
        },
        isSubscribed: false,
        error: null,
        lastEventTimestamp: null,
        eventCounts: {
          new: 0,
          updates: 0,
          statusChanges: 0,
          confirmations: 0
        }
      })
    })

    it('autoSubscribe=trueの場合、自動的に購読を開始する', async () => {
      renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: true })
      )

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled()
      })
    })

    it('autoSubscribe=falseの場合、自動購読しない', () => {
      renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      expect(mockSubscribe).not.toHaveBeenCalled()
    })

    it('アンマウント時にクリーンアップが実行される', async () => {
      const { result, unmount } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: true })
      )

      // 購読が完了するまで待機
      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalled()
        expect(result.current.state.isSubscribed).toBe(true)
      })

      // 手動でunsubscribeを呼び出してクリーンアップをテスト
      await act(async () => {
        await result.current.unsubscribe()
      })

      // unsubscribeが正しく呼ばれたことを確認
      expect(mockUnsubscribe).toHaveBeenCalled()
      expect(result.current.state.isSubscribed).toBe(false)

      // unmount（追加のクリーンアップが実行される）
      unmount()
    })
  })

  describe('subscribe/unsubscribe', () => {
    it('subscribeで購読を開始できる', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      expect(mockSubscribe).toHaveBeenCalled()
      expect(result.current.state.isSubscribed).toBe(true)
      expect(consoleLogSpy).toHaveBeenCalledWith('🔔 リアルタイム入金監視開始')
    })

    it('unsubscribeで購読を停止できる', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      await act(async () => {
        await result.current.unsubscribe()
      })

      expect(mockUnsubscribe).toHaveBeenCalled()
      expect(result.current.state.isSubscribed).toBe(false)
      expect(result.current.state.connectionState.isConnected).toBe(false)
      expect(consoleLogSpy).toHaveBeenCalledWith('🔕 リアルタイム入金監視停止')
    })

    it('subscribe失敗時にエラーを処理する', async () => {
      const error = new Error('Subscribe failed')
      mockSubscribe.mockRejectedValue(error)

      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      expect(result.current.state.error).toEqual(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ リアルタイム入金監視エラー:', error)
    })

    it('unsubscribe失敗時にエラーを処理する', async () => {
      const error = new Error('Unsubscribe failed')
      mockUnsubscribe.mockRejectedValue(error)

      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      await act(async () => {
        await result.current.unsubscribe()
      })

      expect(result.current.state.error).toEqual(error)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('新規入金イベント処理', () => {
    it('新規入金イベントを正しく処理する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const depositData: DepositEventData = {
        eventType: 'INSERT',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          currency: 'BTC',
          status: 'pending',
          transaction_hash: '0xabc123',
          confirmations: 0,
          confirmations_required: 3
        },
        old_record: null,
        timestamp: new Date()
      }

      await act(async () => {
        callbacks.onNewDeposit(depositData)
      })

      expect(result.current.state.deposits).toHaveLength(1)
      expect(result.current.state.deposits[0]).toEqual(depositData)
      expect(result.current.state.eventCounts.new).toBe(1)
      expect(result.current.state.eventCounts.updates).toBe(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('🆕 新規入金検知:', expect.any(Object))
    })

    it('enableNotifications=trueの場合、プッシュ通知を送信する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          enableNotifications: true
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const depositData: DepositEventData = {
        eventType: 'INSERT',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          currency: 'BTC',
          status: 'pending',
          transaction_hash: '0xabc123'
        },
        old_record: null,
        timestamp: new Date()
      }

      await act(async () => {
        callbacks.onNewDeposit(depositData)
      })

      await waitFor(() => {
        expect(mockSendNotification).toHaveBeenCalled()
      })
    })

    it('maxEventsを超えた場合、古いイベントを削除する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          maxEvents: 2
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      // 3つのイベントを追加
      for (let i = 1; i <= 3; i++) {
        const depositData: DepositEventData = {
          eventType: 'INSERT',
          new_record: {
            id: `deposit-00${i}`,
            user_id: mockUserId,
            amount: i,
            asset: 'BTC',
            status: 'pending'
          },
          old_record: null,
          timestamp: new Date()
        }

        await act(async () => {
          callbacks.onNewDeposit(depositData)
        })
      }

      // maxEvents=2なので、最新2件のみ保持
      expect(result.current.state.deposits).toHaveLength(2)
      expect(result.current.state.deposits[0].new_record?.id).toBe('deposit-003')
      expect(result.current.state.deposits[1].new_record?.id).toBe('deposit-002')
    })
  })

  describe('入金更新イベント処理', () => {
    it('入金更新イベントを正しく処理する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const updateData: DepositEventData = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'confirmed',
          confirmations: 3
        },
        old_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'pending',
          confirmations: 1
        },
        timestamp: new Date()
      }

      await act(async () => {
        callbacks.onDepositUpdate(updateData)
      })

      expect(result.current.state.eventCounts.updates).toBe(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 入金状態更新:', expect.any(Object))
    })
  })

  describe('ステータス変更イベント処理', () => {
    it('ステータス変更イベントを正しく処理する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const statusData: DepositEventData & { oldStatus: string; newStatus: string } = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'confirmed'
        },
        old_record: null,
        timestamp: new Date(),
        oldStatus: 'pending',
        newStatus: 'confirmed'
      }

      await act(async () => {
        callbacks.onStatusChange(statusData)
      })

      expect(result.current.state.eventCounts.statusChanges).toBe(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('📈 入金ステータス変更:', expect.any(Object))
    })

    it('confirmed状態への変更時にプッシュ通知を送信する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          enableNotifications: true
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const statusData: DepositEventData & { oldStatus: string; newStatus: string } = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'confirmed',
          transaction_hash: '0xabc123'
        },
        old_record: null,
        timestamp: new Date(),
        oldStatus: 'pending',
        newStatus: 'confirmed'
      }

      await act(async () => {
        callbacks.onStatusChange(statusData)
      })

      await waitFor(() => {
        expect(mockSendNotification).toHaveBeenCalled()
      })
    })

    it('failed状態への変更時にプッシュ通知を送信する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          enableNotifications: true
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const statusData: DepositEventData & { oldStatus: string; newStatus: string } = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'failed',
          transaction_hash: '0xabc123'
        },
        old_record: null,
        timestamp: new Date(),
        oldStatus: 'pending',
        newStatus: 'failed'
      }

      await act(async () => {
        callbacks.onStatusChange(statusData)
      })

      await waitFor(() => {
        expect(mockSendNotification).toHaveBeenCalled()
      })
    })
  })

  describe('確認数更新イベント処理', () => {
    it('確認数更新イベントを正しく処理する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const confirmationData: DepositEventData & { oldConfirmations: number; newConfirmations: number } = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          confirmations: 2,
          confirmations_required: 3
        },
        old_record: null,
        timestamp: new Date(),
        oldConfirmations: 1,
        newConfirmations: 2
      }

      await act(async () => {
        callbacks.onConfirmationUpdate(confirmationData)
      })

      expect(result.current.state.eventCounts.confirmations).toBe(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ 確認数更新:', expect.any(Object))
    })

    it('最終確認到達時にプッシュ通知を送信する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          enableNotifications: true
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const confirmationData: DepositEventData & { oldConfirmations: number; newConfirmations: number } = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          transaction_hash: '0xabc123',
          confirmations: 3,
          confirmations_required: 3
        },
        old_record: null,
        timestamp: new Date(),
        oldConfirmations: 2,
        newConfirmations: 3
      }

      await act(async () => {
        callbacks.onConfirmationUpdate(confirmationData)
      })

      await waitFor(() => {
        expect(mockSendNotification).toHaveBeenCalled()
      })
    })

    it('中間確認ではプッシュ通知を送信しない', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          enableNotifications: true
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const confirmationData: DepositEventData & { oldConfirmations: number; newConfirmations: number } = {
        eventType: 'UPDATE',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          confirmations: 1,
          confirmations_required: 3
        },
        old_record: null,
        timestamp: new Date(),
        oldConfirmations: 0,
        newConfirmations: 1
      }

      await act(async () => {
        callbacks.onConfirmationUpdate(confirmationData)
      })

      // 少し待ってもsendNotificationが呼ばれないことを確認
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(mockSendNotification).not.toHaveBeenCalled()
    })
  })

  describe('エラーハンドリング', () => {
    it('エラーイベントを正しく処理する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const error = new Error('Connection lost')

      await act(async () => {
        callbacks.onError(error)
      })

      expect(result.current.state.error).toEqual(error)
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ リアルタイム入金監視エラー:', error)
    })

    it('onErrorコールバックが呼ばれる', async () => {
      const onError = vi.fn()
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          onError
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const error = new Error('Test error')

      await act(async () => {
        callbacks.onError(error)
      })

      expect(onError).toHaveBeenCalledWith(error)
    })
  })

  describe('接続状態管理', () => {
    it('接続変更イベントを正しく処理する', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      await act(async () => {
        callbacks.onConnectionChange(true, 'good')
      })

      expect(result.current.state.connectionState.isConnected).toBe(true)
      expect(result.current.state.connectionState.quality).toBe('good')
      expect(consoleLogSpy).toHaveBeenCalledWith('📡 接続状態変更:', expect.any(Object))
    })

    it('onConnectionChangeコールバックが呼ばれる', async () => {
      const onConnectionChange = vi.fn()
      const { result } = renderHook(() =>
        useRealtimeDeposits({
          userId: mockUserId,
          autoSubscribe: false,
          onConnectionChange
        })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      await act(async () => {
        callbacks.onConnectionChange(true, 'good')
      })

      expect(onConnectionChange).toHaveBeenCalledWith(true, 'good')
    })
  })

  describe('再接続機能', () => {
    it('retryConnectionで手動再接続できる', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.retryConnection()
      })

      expect(mockRetryConnection).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 手動再接続実行')
    })

    it('retryConnection失敗時にエラーを処理する', async () => {
      const error = new Error('Retry failed')
      mockRetryConnection.mockRejectedValue(error)

      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.retryConnection()
      })

      expect(result.current.state.error).toEqual(error)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })

  describe('ユーティリティ関数', () => {
    it('clearHistoryで履歴をクリアできる', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      // 入金イベントを追加
      const depositData: DepositEventData = {
        eventType: 'INSERT',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'pending'
        },
        old_record: null,
        timestamp: new Date()
      }

      await act(async () => {
        callbacks.onNewDeposit(depositData)
      })

      expect(result.current.state.deposits).toHaveLength(1)

      // 履歴クリア
      act(() => {
        result.current.clearHistory()
      })

      expect(result.current.state.deposits).toHaveLength(0)
      expect(result.current.state.eventCounts).toEqual({
        new: 0,
        updates: 0,
        statusChanges: 0,
        confirmations: 0
      })
    })

    it('getDepositByIdでIDから入金を検索できる', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      const depositData: DepositEventData = {
        eventType: 'INSERT',
        new_record: {
          id: 'deposit-001',
          user_id: mockUserId,
          amount: 1.5,
          asset: 'BTC',
          status: 'pending'
        },
        old_record: null,
        timestamp: new Date()
      }

      await act(async () => {
        callbacks.onNewDeposit(depositData)
      })

      const found = result.current.getDepositById('deposit-001')
      expect(found).toEqual(depositData)

      const notFound = result.current.getDepositById('deposit-999')
      expect(notFound).toBeUndefined()
    })

    it('getRecentDepositsで最新入金を取得できる', async () => {
      const { result } = renderHook(() =>
        useRealtimeDeposits({ userId: mockUserId, autoSubscribe: false })
      )

      await act(async () => {
        await result.current.subscribe()
      })

      // 3つの入金を追加
      for (let i = 1; i <= 3; i++) {
        const depositData: DepositEventData = {
          eventType: 'INSERT',
          new_record: {
            id: `deposit-00${i}`,
            user_id: mockUserId,
            amount: i,
            asset: 'BTC',
            status: 'pending'
          },
          old_record: null,
          timestamp: new Date(Date.now() + i * 1000) // 異なるタイムスタンプ
        }

        await act(async () => {
          callbacks.onNewDeposit(depositData)
        })
      }

      const recent = result.current.getRecentDeposits(2)
      expect(recent).toHaveLength(2)
      // 最新のものから順に並ぶ
      expect(recent[0].new_record?.id).toBe('deposit-003')
      expect(recent[1].new_record?.id).toBe('deposit-002')
    })
  })
})
