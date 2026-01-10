import { useState, useEffect, useCallback, useRef } from 'react';

// 通知タイプ定義
export type NotificationType = 'deposit_detected' | 'deposit_confirmed' | 'deposit_completed' | 'deposit_failed' | 'connection_restored' | 'system_maintenance' | 'system_alert' | 'system_escalation';

// 通知アクション定義（Notification APIのaction属性用）
export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

// 通知設定
export interface NotificationSettings {
  enabled: boolean;
  deposits: {
    newDeposit: boolean;
    confirmationProgress: boolean;
    completion: boolean;
    failures: boolean;
  };
  system: {
    connectionIssues: boolean;
    maintenance: boolean;
    alerts: boolean;
    escalations: boolean;
  };
  sound: boolean;
  vibration: boolean;
  quiet_hours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
  };
}

// 通知メタデータ
export interface NotificationData {
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
  silent?: boolean;
  requireInteraction?: boolean;
}

// 通知権限状態
export type NotificationPermission = 'default' | 'granted' | 'denied';

// 通知統計
export interface NotificationStats {
  sent: number;
  clicked: number;
  dismissed: number;
  lastSent?: Date;
}

// カスタムフックの戻り値
export interface UseNotificationsReturn {
  permission: NotificationPermission;
  isSupported: boolean;
  settings: NotificationSettings;
  stats: NotificationStats;
  requestPermission: () => Promise<NotificationPermission>;
  sendNotification: (data: NotificationData) => Promise<boolean>;
  updateSettings: (newSettings: Partial<NotificationSettings>) => void;
  clearNotifications: (tag?: string) => void;
  testNotification: () => Promise<boolean>;
}

// デフォルト設定
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  deposits: {
    newDeposit: true,
    confirmationProgress: true,
    completion: true,
    failures: true
  },
  system: {
    connectionIssues: true,
    maintenance: true,
    alerts: true,
    escalations: true
  },
  sound: true,
  vibration: true,
  quiet_hours: {
    enabled: false,
    start: "22:00",
    end: "08:00"
  }
};

// 通知アイコンの定義
const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  deposit_detected: '/icons/deposit-detected.png',
  deposit_confirmed: '/icons/deposit-confirmed.png',
  deposit_completed: '/icons/deposit-completed.png',
  deposit_failed: '/icons/deposit-failed.png',
  connection_restored: '/icons/connection.png',
  system_maintenance: '/icons/maintenance.png',
  system_alert: '/icons/alert.png',
  system_escalation: '/icons/escalation.png'
};

// サウンド設定
const NOTIFICATION_SOUNDS: Record<NotificationType, string> = {
  deposit_detected: '/sounds/deposit-detected.mp3',
  deposit_confirmed: '/sounds/confirmation.mp3',
  deposit_completed: '/sounds/completion.mp3',
  deposit_failed: '/sounds/error.mp3',
  connection_restored: '/sounds/connection.mp3',
  system_maintenance: '/sounds/maintenance.mp3',
  system_alert: '/sounds/alert.mp3',
  system_escalation: '/sounds/escalation.mp3'
};

/**
 * プッシュ通知管理カスタムフック
 * ブラウザのNotification APIを使用したリッチ通知システム
 */
export function useNotifications(): UseNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<NotificationStats>({
    sent: 0,
    clicked: 0,
    dismissed: 0
  });

  // 通知サポート確認
  const isSupported = 'Notification' in window;

  // 通知音声の参照
  const audioRef = useRef<{ [key: string]: HTMLAudioElement }>({});

  // 初期化時に権限状態を取得
  useEffect(() => {
    if (isSupported) {
      setPermission(Notification.permission);

      // ローカルストレージから設定を読み込み
      const savedSettings = localStorage.getItem('notification_settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch (error) {
          console.warn('Failed to parse notification settings:', error);
        }
      }

      // 統計情報を読み込み
      const savedStats = localStorage.getItem('notification_stats');
      if (savedStats) {
        try {
          const parsed = JSON.parse(savedStats);
          setStats({
            sent: parsed.sent || 0,
            clicked: parsed.clicked || 0,
            dismissed: parsed.dismissed || 0,
            lastSent: parsed.lastSent ? new Date(parsed.lastSent) : undefined
          });
        } catch (error) {
          console.warn('Failed to parse notification stats:', error);
        }
      }
    }
  }, [isSupported]);

  // 通知音声の事前読み込み
  useEffect(() => {
    if (settings.sound) {
      Object.entries(NOTIFICATION_SOUNDS).forEach(([type, soundPath]) => {
        if (!audioRef.current[type]) {
          const audio = new Audio(soundPath);
          audio.preload = 'auto';
          audio.volume = 0.7;
          audioRef.current[type] = audio;
        }
      });
    }
  }, [settings.sound]);

  // 設定変更時にローカルストレージに保存
  useEffect(() => {
    localStorage.setItem('notification_settings', JSON.stringify(settings));
  }, [settings]);

  // 統計変更時にローカルストレージに保存
  useEffect(() => {
    localStorage.setItem('notification_stats', JSON.stringify({
      ...stats,
      lastSent: stats.lastSent?.toISOString()
    }));
  }, [stats]);

  // 権限要求
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) {
      console.warn('Notifications are not supported in this browser');
      return 'denied';
    }

    if (permission === 'granted') {
      return 'granted';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (error) {
      console.error('Failed to request notification permission:', error);
      return 'denied';
    }
  }, [isSupported, permission]);

  // クワイエット時間チェック
  const isQuietTime = useCallback((): boolean => {
    if (!settings.quiet_hours.enabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = settings.quiet_hours.start.split(':').map(Number);
    const [endHour, endMin] = settings.quiet_hours.end.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // 日をまたぐ場合の処理
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    } else {
      return currentTime >= startTime && currentTime <= endTime;
    }
  }, [settings.quiet_hours]);

  // 通知設定確認
  const shouldNotify = useCallback((type: NotificationType): boolean => {
    if (!settings.enabled) return false;
    if (isQuietTime()) return false;

    switch (type) {
      case 'deposit_detected':
        return settings.deposits.newDeposit;
      case 'deposit_confirmed':
        return settings.deposits.confirmationProgress;
      case 'deposit_completed':
        return settings.deposits.completion;
      case 'deposit_failed':
        return settings.deposits.failures;
      case 'connection_restored':
        return settings.system.connectionIssues;
      case 'system_maintenance':
        return settings.system.maintenance;
      case 'system_alert':
        return settings.system.alerts;
      case 'system_escalation':
        return settings.system.escalations;
      default:
        return true;
    }
  }, [settings, isQuietTime]);

  // サウンド再生
  const playNotificationSound = useCallback((type: NotificationType) => {
    if (!settings.sound) return;

    const audio = audioRef.current[type];
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(error => {
        console.warn('Failed to play notification sound:', error);
      });
    }
  }, [settings.sound]);

  // バイブレーション実行
  const triggerVibration = useCallback((type: NotificationType) => {
    if (!settings.vibration || !navigator.vibrate) return;

    // 通知タイプに応じたバイブレーションパターン
    const patterns: Record<NotificationType, number | number[]> = {
      deposit_detected: [200, 100, 200],
      deposit_confirmed: [100],
      deposit_completed: [200, 100, 200, 100, 200],
      deposit_failed: [500, 200, 500],
      connection_restored: [100, 50, 100],
      system_maintenance: [300],
      system_alert: [250, 100, 250],
      system_escalation: [500, 200, 500, 200, 500]
    };

    navigator.vibrate(patterns[type] || 200);
  }, [settings.vibration]);

  // 通知送信
  const sendNotification = useCallback(async (data: NotificationData): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Notifications are not supported');
      return false;
    }

    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return false;
    }

    if (!shouldNotify(data.type)) {
      return false;
    }

    try {
      // 通知オプション設定
      const options: NotificationOptions = {
        body: data.body,
        icon: data.icon || NOTIFICATION_ICONS[data.type] || '/icons/default-notification.png',
        badge: data.badge || '/icons/badge.png',
        tag: data.tag || data.type,
        data: data.data || {},
        silent: data.silent || false,
        requireInteraction: data.requireInteraction || false
        // actions: data.actions || [] // actionsはService Worker通知でのみサポートされているため、コメントアウト
      };

      // 通知作成
      const notification = new Notification(data.title, options);

      // イベントリスナー設定
      notification.onclick = (event) => {
        setStats(prev => ({ ...prev, clicked: prev.clicked + 1 }));

        // カスタムクリック処理
        if (data.data?.onClick) {
          data.data.onClick(event);
        }

        // フォーカスを戻す
        window.focus();
        notification.close();
      };

      notification.onclose = () => {
        setStats(prev => ({ ...prev, dismissed: prev.dismissed + 1 }));
      };

      notification.onerror = (error) => {
        console.error('Notification error:', error);
      };

      // サウンドとバイブレーション
      if (!data.silent) {
        playNotificationSound(data.type);
        triggerVibration(data.type);
      }

      // 統計更新
      setStats(prev => ({
        ...prev,
        sent: prev.sent + 1,
        lastSent: new Date()
      }));

      return true;

    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }, [isSupported, permission, shouldNotify, playNotificationSound, triggerVibration]);

  // 設定更新
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  // 通知クリア
  const clearNotifications = useCallback((_tag?: string) => {
    // Service Worker経由で通知をクリア（実装時に追加）
  }, []);

  // テスト通知
  const testNotification = useCallback(async (): Promise<boolean> => {
    const testData: NotificationData = {
      type: 'deposit_detected',
      title: 'テスト通知',
      body: '通知システムが正常に動作しています。',
      tag: 'test_notification',
      data: {
        test: true
      }
    };

    return await sendNotification(testData);
  }, [sendNotification]);

  return {
    permission,
    isSupported,
    settings,
    stats,
    requestPermission,
    sendNotification,
    updateSettings,
    clearNotifications,
    testNotification
  };
}

// 通知データ作成ヘルパー関数
export const createDepositNotification = (
  type: 'detected' | 'confirmed' | 'completed' | 'failed',
  data: {
    amount: number;
    asset: string;
    txHash?: string;
    confirmations?: number;
    required?: number;
  }
): NotificationData => {
  const notificationTypes: Record<typeof type, NotificationType> = {
    detected: 'deposit_detected',
    confirmed: 'deposit_confirmed',
    completed: 'deposit_completed',
    failed: 'deposit_failed'
  };

  const titles: Record<typeof type, string> = {
    detected: '入金を検知しました',
    confirmed: '入金確認が進行中です',
    completed: '入金が完了しました',
    failed: '入金処理でエラーが発生しました'
  };

  const bodies: Record<typeof type, string> = {
    detected: `${data.amount} ${data.asset} の入金を検知しました。確認をお待ちください。`,
    confirmed: `${data.amount} ${data.asset} の入金確認中です。(${data.confirmations}/${data.required})`,
    completed: `${data.amount} ${data.asset} の入金が完了し、残高に反映されました。`,
    failed: `${data.amount} ${data.asset} の入金処理中にエラーが発生しました。`
  };

  return {
    type: notificationTypes[type],
    title: titles[type],
    body: bodies[type],
    tag: `deposit_${data.txHash || Date.now()}`,
    data: {
      amount: data.amount,
      asset: data.asset,
      txHash: data.txHash,
      confirmations: data.confirmations,
      required: data.required
    },
    requireInteraction: type === 'completed' || type === 'failed'
  };
};

// システムアラート通知データ作成ヘルパー関数
export const createSystemNotification = (
  type: 'alert' | 'escalation',
  data: {
    alertName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    value?: number;
    threshold?: number;
    category?: 'system' | 'performance' | 'business' | 'security';
  }
): NotificationData => {
  const notificationTypes: Record<typeof type, NotificationType> = {
    alert: 'system_alert',
    escalation: 'system_escalation'
  };

  const severityLabels: Record<typeof data.severity, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '重要'
  };

  const titles: Record<typeof type, string> = {
    alert: `システムアラート（${severityLabels[data.severity]}）`,
    escalation: 'アラートエスカレーション'
  };

  const getBodies = (): Record<typeof type, string> => {
    const valueText = data.value !== undefined && data.threshold !== undefined
      ? ` (現在値: ${data.value.toFixed(2)}, 閾値: ${data.threshold})`
      : '';

    return {
      alert: `${data.alertName}${valueText}`,
      escalation: `未対応のアラート「${data.alertName}」がエスカレートされました。${valueText}`
    };
  };

  const bodies = getBodies();

  const requireInteraction = data.severity === 'critical' || type === 'escalation';

  return {
    type: notificationTypes[type],
    title: titles[type],
    body: bodies[type],
    tag: `system_${type}_${data.alertName.replace(/\s+/g, '_').toLowerCase()}`,
    data: {
      alertName: data.alertName,
      severity: data.severity,
      value: data.value,
      threshold: data.threshold,
      category: data.category
    },
    requireInteraction,
    silent: false
  };
};

export default useNotifications;