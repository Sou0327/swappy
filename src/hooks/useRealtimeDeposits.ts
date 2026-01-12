import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getRealtimeDepositClient,
  destroyRealtimeDepositClient,
  type DepositEventData,
  type DepositEventCallbacks,
  type ConnectionState
} from '@/lib/realtime-deposit-client';
import useNotifications, { createDepositNotification } from '@/hooks/useNotifications';

// リアルタイム入金状態管理
export interface RealtimeDepositState {
  deposits: DepositEventData[];
  connectionState: ConnectionState;
  isSubscribed: boolean;
  error: Error | null;
  lastEventTimestamp: Date | null;
  eventCounts: {
    new: number;
    updates: number;
    statusChanges: number;
    confirmations: number;
  };
}

// フックのオプション設定
export interface UseRealtimeDepositsOptions {
  userId: string;
  autoSubscribe?: boolean; // 自動購読開始
  maxEvents?: number; // 保持する最大イベント数
  eventRetention?: number; // イベント保持時間（ミリ秒）
  onConnectionChange?: (connected: boolean, quality: 'good' | 'poor' | 'disconnected') => void;
  onError?: (error: Error) => void;
  enableEventHistory?: boolean; // イベント履歴を保持するか
  enableNotifications?: boolean; // プッシュ通知を有効にするか
}

// フックの戻り値
export interface UseRealtimeDepositsReturn {
  state: RealtimeDepositState;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  retryConnection: () => Promise<void>;
  clearHistory: () => void;
  getDepositById: (depositId: string) => DepositEventData | undefined;
  getRecentDeposits: (limit?: number) => DepositEventData[];
}

/**
 * リアルタイム入金監視カスタムフック
 * RealtimeDepositClientをReactコンポーネントで使いやすくラップ
 */
export function useRealtimeDeposits(
  options: UseRealtimeDepositsOptions
): UseRealtimeDepositsReturn {
  const {
    userId,
    autoSubscribe = true,
    maxEvents = 100,
    eventRetention = 24 * 60 * 60 * 1000, // 24時間
    onConnectionChange,
    onError,
    enableEventHistory = true,
    enableNotifications = true
  } = options;

  // プッシュ通知システム
  const { sendNotification, permission } = useNotifications();

  // 状態管理
  const [state, setState] = useState<RealtimeDepositState>({
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
  });

  // クライアント参照
  const clientRef = useRef(getRealtimeDepositClient(userId));
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // イベント履歴クリーンアップ
  const cleanupOldEvents = useCallback(() => {
    if (!enableEventHistory) return;

    const now = new Date();
    setState(prev => ({
      ...prev,
      deposits: prev.deposits.filter(deposit =>
        now.getTime() - deposit.timestamp.getTime() < eventRetention
      )
    }));
  }, [eventRetention, enableEventHistory]);

  // 定期クリーンアップの設定
  useEffect(() => {
    if (enableEventHistory && eventRetention > 0) {
      cleanupIntervalRef.current = setInterval(cleanupOldEvents, 60000); // 1分ごと
    }

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [cleanupOldEvents, enableEventHistory, eventRetention]);

  // 新規入金イベント処理
  const handleNewDeposit = useCallback((data: DepositEventData) => {
    console.log('🆕 新規入金検知:', data);
    setState(prev => {
      const newDeposits = enableEventHistory
        ? [data, ...prev.deposits].slice(0, maxEvents)
        : [data];

      return {
        ...prev,
        deposits: newDeposits,
        lastEventTimestamp: data.timestamp,
        eventCounts: {
          ...prev.eventCounts,
          new: prev.eventCounts.new + 1,
          updates: prev.eventCounts.updates + 1
        }
      };
    });

    // プッシュ通知送信
    if (enableNotifications && permission === 'granted' && data.new_record) {
      const notificationData = createDepositNotification('detected', {
        amount: data.new_record.amount || 0,
        asset: data.new_record.asset || data.new_record.currency || 'Unknown',
        txHash: data.new_record.transaction_hash
      });

      sendNotification(notificationData).catch(error => {
        console.warn('プッシュ通知送信失敗:', error);
      });
    }
  }, [enableEventHistory, maxEvents, enableNotifications, permission, sendNotification]);

  // 入金更新イベント処理
  const handleDepositUpdate = useCallback((data: DepositEventData) => {
    console.log('🔄 入金状態更新:', data);
    setState(prev => {
      const updatedDeposits = enableEventHistory
        ? [data, ...prev.deposits].slice(0, maxEvents)
        : prev.deposits.map(deposit =>
            deposit.new_record?.id === data.new_record?.id ? data : deposit
          );

      return {
        ...prev,
        deposits: updatedDeposits,
        lastEventTimestamp: data.timestamp,
        eventCounts: {
          ...prev.eventCounts,
          updates: prev.eventCounts.updates + 1
        }
      };
    });
  }, [enableEventHistory, maxEvents]);

  // ステータス変更イベント処理
  const handleStatusChange = useCallback((data: DepositEventData & { oldStatus?: string; newStatus: string }) => {
    console.log('📈 入金ステータス変更:', data);
    setState(prev => ({
      ...prev,
      eventCounts: {
        ...prev.eventCounts,
        statusChanges: prev.eventCounts.statusChanges + 1
      }
    }));

    // ステータス変更時のプッシュ通知
    if (enableNotifications && permission === 'granted' && data.new_record) {
      if (data.newStatus === 'confirmed') {
        const notificationData = createDepositNotification('completed', {
          amount: data.new_record.amount || 0,
          asset: data.new_record.asset || data.new_record.currency || 'Unknown',
          txHash: data.new_record.transaction_hash
        });

        sendNotification(notificationData).catch(error => {
          console.warn('入金完了通知送信失敗:', error);
        });
      } else if (data.newStatus === 'failed') {
        const notificationData = createDepositNotification('failed', {
          amount: data.new_record.amount || 0,
          asset: data.new_record.asset || data.new_record.currency || 'Unknown',
          txHash: data.new_record.transaction_hash
        });

        sendNotification(notificationData).catch(error => {
          console.warn('入金失敗通知送信失敗:', error);
        });
      }
    }
  }, [enableNotifications, permission, sendNotification]);

  // 確認数更新イベント処理
  const handleConfirmationUpdate = useCallback((data: DepositEventData & { oldConfirmations?: number; newConfirmations: number }) => {
    console.log('✅ 確認数更新:', data);
    setState(prev => ({
      ...prev,
      eventCounts: {
        ...prev.eventCounts,
        confirmations: prev.eventCounts.confirmations + 1
      }
    }));

    // 確認数更新時のプッシュ通知（最終確認のみ）
    if (enableNotifications && permission === 'granted' && data.new_record) {
      const required = data.new_record.confirmations_required || 1;
      const current = data.newConfirmations;

      // 最終確認に到達した場合のみ通知
      if (current >= required && (data.oldConfirmations || 0) < required) {
        const notificationData = createDepositNotification('confirmed', {
          amount: data.new_record.amount || 0,
          asset: data.new_record.asset || data.new_record.currency || 'Unknown',
          txHash: data.new_record.transaction_hash,
          confirmations: current,
          required: required
        });

        sendNotification(notificationData).catch(error => {
          console.warn('確認完了通知送信失敗:', error);
        });
      }
    }
  }, [enableNotifications, permission, sendNotification]);

  // エラーイベント処理
  const handleError = useCallback((error: Error) => {
    console.error('❌ リアルタイム入金監視エラー:', error);

    setState(prev => ({
      ...prev,
      error
    }));

    onError?.(error);
  }, [onError]);

  // 接続変更イベント処理
  const handleConnectionChange = useCallback((connected: boolean, quality: 'good' | 'poor' | 'disconnected') => {
    console.log('📡 接続状態変更:', { connected, quality });
    setState(prev => ({
      ...prev,
      connectionState: {
        ...prev.connectionState,
        isConnected: connected,
        quality,
        lastUpdate: new Date()
      }
    }));

    onConnectionChange?.(connected, quality);
  }, [onConnectionChange]);

  // 購読開始
  const subscribe = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      const callbacks: DepositEventCallbacks = {
        onNewDeposit: handleNewDeposit,
        onDepositUpdate: handleDepositUpdate,
        onStatusChange: handleStatusChange,
        onConfirmationUpdate: handleConfirmationUpdate,
        onError: handleError,
        onConnectionChange: handleConnectionChange
      };

      await clientRef.current.subscribe(callbacks);

      console.log('🔔 リアルタイム入金監視開始');

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        connectionState: clientRef.current.getConnectionState()
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error('購読開始に失敗しました');
      handleError(err);
    }
  }, [handleNewDeposit, handleDepositUpdate, handleStatusChange, handleConfirmationUpdate, handleError, handleConnectionChange]);

  // 購読停止
  const unsubscribe = useCallback(async () => {
    try {
      await clientRef.current.unsubscribe();
      console.log('🔕 リアルタイム入金監視停止');

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        connectionState: {
          ...prev.connectionState,
          isConnected: false,
          quality: 'disconnected'
        }
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error('購読停止に失敗しました');
      handleError(err);
    }
  }, [handleError]);

  // 手動再接続
  const retryConnection = useCallback(async () => {
    try {
      console.log('🔄 手動再接続実行');
      setState(prev => ({ ...prev, error: null }));
      await clientRef.current.retryConnection();

      setState(prev => ({
        ...prev,
        connectionState: clientRef.current.getConnectionState()
      }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error('再接続に失敗しました');
      handleError(err);
    }
  }, [handleError]);

  // 履歴クリア
  const clearHistory = useCallback(() => {
    setState(prev => ({
      ...prev,
      deposits: [],
      eventCounts: {
        new: 0,
        updates: 0,
        statusChanges: 0,
        confirmations: 0
      }
    }));
  }, []);

  // ID による入金検索
  const getDepositById = useCallback((depositId: string): DepositEventData | undefined => {
    return state.deposits.find(deposit =>
      deposit.new_record?.id === depositId || deposit.old_record?.id === depositId
    );
  }, [state.deposits]);

  // 最新入金取得
  const getRecentDeposits = useCallback((limit: number = 10): DepositEventData[] => {
    return state.deposits
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }, [state.deposits]);

  // 自動購読開始
  useEffect(() => {
    if (autoSubscribe && userId) {
      subscribe();
    }

    // クリーンアップ
    return () => {
      if (state.isSubscribed) {
        unsubscribe();
      }
    };
  }, [userId, autoSubscribe]); // subscribeとunsubscribeは依存配列から除外してループを防ぐ

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      destroyRealtimeDepositClient(userId);
    };
  }, [userId]);

  return {
    state,
    subscribe,
    unsubscribe,
    retryConnection,
    clearHistory,
    getDepositById,
    getRecentDeposits
  };
}

export default useRealtimeDeposits;