/**
 * useNotifications フックの単体テスト
 * ブラウザ通知システムの包括的テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNotifications, createDepositNotification, createSystemNotification } from '@/hooks/useNotifications'
import type { NotificationData } from '@/hooks/useNotifications'

describe('useNotifications', () => {
  // モックストレージ
  let mockStorage: { [key: string]: string } = {}

  // モックNotification
  interface MockNotificationInstance {
    close: ReturnType<typeof vi.fn>
    onclick: ((event: Event) => void) | null
    onclose: (() => void) | null
    onerror: ((event: Event) => void) | null
  }

  let mockNotificationInstance: MockNotificationInstance
  let mockNotificationConstructor: {
    (title: string, options?: NotificationOptions): MockNotificationInstance
    requestPermission: ReturnType<typeof vi.fn>
    permission: NotificationPermission
  }

  beforeEach(() => {
    // localStorageモック
    mockStorage = {}
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return mockStorage[key] || null
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      mockStorage[key] = value
    })

    // Notification APIモック
    mockNotificationInstance = {
      close: vi.fn(),
      onclick: null,
      onclose: null,
      onerror: null
    }

    mockNotificationConstructor = vi.fn(() => mockNotificationInstance)

    // Notification.requestPermissionのモック
    mockNotificationConstructor.requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
    mockNotificationConstructor.permission = 'default'

    global.Notification = mockNotificationConstructor as unknown as typeof Notification

    // Audio APIモック
    global.Audio = vi.fn().mockImplementation((src: string) => ({
      src,
      preload: '',
      volume: 0,
      currentTime: 0,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })) as unknown as typeof Audio

    // Vibration APIモック
    global.navigator.vibrate = vi.fn()

    // window.focusモック
    global.window.focus = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('初期化', () => {
    it('初期状態が正しく設定される', () => {
      const { result } = renderHook(() => useNotifications())

      expect(result.current.permission).toBe('default')
      expect(result.current.isSupported).toBe(true)
      expect(result.current.settings.enabled).toBe(true)
      expect(result.current.stats.sent).toBe(0)
      expect(result.current.stats.clicked).toBe(0)
      expect(result.current.stats.dismissed).toBe(0)
    })

    it('Notification APIがサポートされているかを確認する', () => {
      const { result } = renderHook(() => useNotifications())

      expect(result.current.isSupported).toBe(true)
    })

    it('Notification.permissionから初期権限状態を取得する', () => {
      global.Notification.permission = 'granted'

      const { result } = renderHook(() => useNotifications())

      expect(result.current.permission).toBe('granted')
    })

    it('localStorageから保存された設定を読み込む', async () => {
      const savedSettings = {
        enabled: false,
        deposits: {
          newDeposit: false,
          confirmationProgress: true,
          completion: true,
          failures: false
        }
      }

      mockStorage['notification_settings'] = JSON.stringify(savedSettings)

      const { result } = renderHook(() => useNotifications())

      await waitFor(() => {
        expect(result.current.settings.enabled).toBe(false)
        expect(result.current.settings.deposits.newDeposit).toBe(false)
      })
    })

    it('localStorageから統計情報を読み込む', async () => {
      const savedStats = {
        sent: 10,
        clicked: 5,
        dismissed: 3,
        lastSent: '2024-01-01T00:00:00Z'
      }

      mockStorage['notification_stats'] = JSON.stringify(savedStats)

      const { result } = renderHook(() => useNotifications())

      await waitFor(() => {
        expect(result.current.stats.sent).toBe(10)
        expect(result.current.stats.clicked).toBe(5)
        expect(result.current.stats.dismissed).toBe(3)
        expect(result.current.stats.lastSent).toBeInstanceOf(Date)
      })
    })

    it('不正なJSON設定を無視してデフォルト設定を使用する', () => {
      mockStorage['notification_settings'] = 'invalid-json'

      const { result } = renderHook(() => useNotifications())

      expect(result.current.settings.enabled).toBe(true)
    })
  })

  describe('requestPermission', () => {
    it('権限要求に成功する', async () => {
      mockNotificationConstructor.requestPermission = vi.fn(async () => 'granted')

      const { result } = renderHook(() => useNotifications())

      let permission: string = ''
      await act(async () => {
        permission = await result.current.requestPermission()
      })

      expect(permission).toBe('granted')
      expect(result.current.permission).toBe('granted')
    })

    it('既に権限が付与されている場合は再要求しない', async () => {
      global.Notification.permission = 'granted'
      mockNotificationConstructor.requestPermission = vi.fn()

      const { result } = renderHook(() => useNotifications())

      let permission: string = ''
      await act(async () => {
        permission = await result.current.requestPermission()
      })

      expect(permission).toBe('granted')
      expect(mockNotificationConstructor.requestPermission).not.toHaveBeenCalled()
    })

    it('権限が拒否される', async () => {
      mockNotificationConstructor.requestPermission = vi.fn(async () => 'denied')

      const { result } = renderHook(() => useNotifications())

      let permission: string = ''
      await act(async () => {
        permission = await result.current.requestPermission()
      })

      expect(permission).toBe('denied')
      expect(result.current.permission).toBe('denied')
    })
  })

  describe('sendNotification', () => {
    const mockNotificationData: NotificationData = {
      type: 'deposit_detected',
      title: 'テスト通知',
      body: 'テスト本文',
      tag: 'test'
    }

    beforeEach(() => {
      global.Notification.permission = 'granted'
    })

    it('通知を正しく送信する', async () => {
      const { result } = renderHook(() => useNotifications())

      let success = false
      await act(async () => {
        success = await result.current.sendNotification(mockNotificationData)
      })

      expect(success).toBe(true)
      expect(mockNotificationConstructor).toHaveBeenCalledWith(
        'テスト通知',
        expect.objectContaining({
          body: 'テスト本文',
          tag: 'test'
        })
      )
    })

    it('権限がない場合は送信しない', async () => {
      global.Notification.permission = 'denied'

      const { result } = renderHook(() => useNotifications())

      let success = false
      await act(async () => {
        success = await result.current.sendNotification(mockNotificationData)
      })

      expect(success).toBe(false)
      expect(mockNotificationConstructor).not.toHaveBeenCalled()
    })

    it('設定で無効化されている場合は送信しない', async () => {
      const { result } = renderHook(() => useNotifications())

      // 通知を無効化
      act(() => {
        result.current.updateSettings({ enabled: false })
      })

      let success = false
      await act(async () => {
        success = await result.current.sendNotification(mockNotificationData)
      })

      expect(success).toBe(false)
      expect(mockNotificationConstructor).not.toHaveBeenCalled()
    })

    it('クリックイベントを処理する', async () => {
      const { result } = renderHook(() => useNotifications())

      await act(async () => {
        await result.current.sendNotification(mockNotificationData)
      })

      // クリックイベントをシミュレート
      act(() => {
        if (mockNotificationInstance.onclick) {
          mockNotificationInstance.onclick({})
        }
      })

      expect(result.current.stats.clicked).toBe(1)
      expect(mockNotificationInstance.close).toHaveBeenCalled()
      expect(global.window.focus).toHaveBeenCalled()
    })

    it('クローズイベントを処理する', async () => {
      const { result } = renderHook(() => useNotifications())

      await act(async () => {
        await result.current.sendNotification(mockNotificationData)
      })

      // クローズイベントをシミュレート
      act(() => {
        if (mockNotificationInstance.onclose) {
          mockNotificationInstance.onclose()
        }
      })

      expect(result.current.stats.dismissed).toBe(1)
    })

    it('送信統計を更新する', async () => {
      const { result } = renderHook(() => useNotifications())

      await act(async () => {
        await result.current.sendNotification(mockNotificationData)
      })

      expect(result.current.stats.sent).toBe(1)
      expect(result.current.stats.lastSent).toBeInstanceOf(Date)
    })
  })

  describe('updateSettings', () => {
    it('設定を部分的に更新する', () => {
      const { result } = renderHook(() => useNotifications())

      act(() => {
        result.current.updateSettings({
          sound: false,
          vibration: false
        })
      })

      expect(result.current.settings.sound).toBe(false)
      expect(result.current.settings.vibration).toBe(false)
      expect(result.current.settings.enabled).toBe(true) // 他の設定は保持
    })

    it('更新された設定をlocalStorageに保存する', async () => {
      const { result } = renderHook(() => useNotifications())

      act(() => {
        result.current.updateSettings({ enabled: false })
      })

      await waitFor(() => {
        const saved = mockStorage['notification_settings']
        expect(saved).toBeDefined()
        const parsed = JSON.parse(saved)
        expect(parsed.enabled).toBe(false)
      })
    })
  })

  describe('testNotification', () => {
    beforeEach(() => {
      global.Notification.permission = 'granted'
    })

    it('テスト通知を送信する', async () => {
      const { result } = renderHook(() => useNotifications())

      let success = false
      await act(async () => {
        success = await result.current.testNotification()
      })

      expect(success).toBe(true)
      expect(mockNotificationConstructor).toHaveBeenCalledWith(
        'テスト通知',
        expect.objectContaining({
          body: '通知システムが正常に動作しています。'
        })
      )
    })
  })

  describe('clearNotifications', () => {
    it('clearNotificationsを呼び出せる', () => {
      const { result } = renderHook(() => useNotifications())

      // 実装がconsole.logのみなので、エラーなく呼び出せることを確認
      expect(() => {
        act(() => {
          result.current.clearNotifications()
        })
      }).not.toThrow()
    })

    it('タグ指定でclearNotificationsを呼び出せる', () => {
      const { result } = renderHook(() => useNotifications())

      expect(() => {
        act(() => {
          result.current.clearNotifications('test-tag')
        })
      }).not.toThrow()
    })
  })

  describe('ヘルパー関数', () => {
    describe('createDepositNotification', () => {
      it('deposit_detected通知データを作成する', () => {
        const data = createDepositNotification('detected', {
          amount: 100,
          asset: 'BTC',
          txHash: '0x123'
        })

        expect(data.type).toBe('deposit_detected')
        expect(data.title).toBe('入金を検知しました')
        expect(data.body).toContain('100 BTC')
        expect(data.tag).toBe('deposit_0x123')
      })

      it('deposit_confirmed通知データを作成する', () => {
        const data = createDepositNotification('confirmed', {
          amount: 50,
          asset: 'ETH',
          confirmations: 5,
          required: 10
        })

        expect(data.type).toBe('deposit_confirmed')
        expect(data.title).toBe('入金確認が進行中です')
        expect(data.body).toContain('50 ETH')
        expect(data.body).toContain('(5/10)')
      })

      it('deposit_completed通知データを作成する', () => {
        const data = createDepositNotification('completed', {
          amount: 200,
          asset: 'USDT'
        })

        expect(data.type).toBe('deposit_completed')
        expect(data.title).toBe('入金が完了しました')
        expect(data.requireInteraction).toBe(true)
      })

      it('deposit_failed通知データを作成する', () => {
        const data = createDepositNotification('failed', {
          amount: 10,
          asset: 'DAI'
        })

        expect(data.type).toBe('deposit_failed')
        expect(data.title).toBe('入金処理でエラーが発生しました')
        expect(data.requireInteraction).toBe(true)
      })
    })

    describe('createSystemNotification', () => {
      it('system_alert通知データを作成する', () => {
        const data = createSystemNotification('alert', {
          alertName: 'CPU使用率',
          severity: 'high',
          value: 95.5,
          threshold: 80
        })

        expect(data.type).toBe('system_alert')
        expect(data.title).toContain('システムアラート')
        expect(data.title).toContain('高')
        expect(data.body).toContain('CPU使用率')
        expect(data.body).toContain('95.50')
        expect(data.body).toContain('80')
      })

      it('system_escalation通知データを作成する（critical）', () => {
        const data = createSystemNotification('escalation', {
          alertName: 'メモリ不足',
          severity: 'critical'
        })

        expect(data.type).toBe('system_escalation')
        expect(data.title).toBe('アラートエスカレーション')
        expect(data.body).toContain('メモリ不足')
        expect(data.requireInteraction).toBe(true)
      })

      it('値と閾値なしで通知データを作成する', () => {
        const data = createSystemNotification('alert', {
          alertName: 'ディスク容量',
          severity: 'low'
        })

        expect(data.body).toBe('ディスク容量')
        expect(data.body).not.toContain('現在値')
      })
    })
  })
})
