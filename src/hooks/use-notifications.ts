import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncState } from './use-async-state';
import { useErrorHandler } from './use-error-handler';

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'kyc';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 通知システム管理フック
 */
export const useNotifications = () => {
  const { user } = useAuth();
  const { handleError } = useErrorHandler();
  const [unreadCount, setUnreadCount] = useState(0);
  
  const notificationsState = useAsyncState<Notification[]>();

  // 通知一覧を取得
  const loadNotifications = useCallback(async (limit?: number): Promise<Notification[]> => {
    if (!user?.id) throw new Error('ユーザー認証が必要です');

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data as unknown as NotificationRow[]).map((item: NotificationRow) => ({
      id: item.id,
      userId: item.user_id,
      title: item.title,
      message: item.message,
      type: item.type as NotificationType,
      read: item.read,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  }, [user?.id]);

  // 未読通知数を取得
  const loadUnreadCount = useCallback(async (): Promise<number> => {
    if (!user?.id) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) throw error;

    return count || 0;
  }, [user?.id]);

  // 通知を既読にする
  const markAsRead = async (notificationId: string): Promise<void> => {
    const { error } = await supabase.rpc('mark_notification_as_read', {
      notification_id: notificationId
    });

    if (error) throw error;

    // ローカル状態を更新
    if (notificationsState.data) {
      const updatedNotifications = notificationsState.data.map(notification =>
        notification.id === notificationId
          ? { ...notification, read: true, updatedAt: new Date().toISOString() }
          : notification
      );
      notificationsState.setData(updatedNotifications);
    }

    // 未読数を更新
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // 全通知を既読にする
  const markAllAsRead = async (): Promise<void> => {
    const { error } = await supabase.rpc('mark_all_notifications_as_read');

    if (error) throw error;

    // ローカル状態を更新
    if (notificationsState.data) {
      const updatedNotifications = notificationsState.data.map(notification => ({
        ...notification,
        read: true,
        updatedAt: new Date().toISOString()
      }));
      notificationsState.setData(updatedNotifications);
    }

    // 未読数をリセット
    setUnreadCount(0);
  };

  // 初期データ読み込み
  useEffect(() => {
    if (user?.id) {
      // 通知一覧を読み込み
      notificationsState.execute(
        () => loadNotifications(50), // 最新50件
        {
          context: '通知一覧の読み込み',
          showErrorToast: true
        }
      );

      // 未読数を読み込み
      loadUnreadCount()
        .then(setUnreadCount)
        .catch(error => handleError(error, '未読通知数の読み込み'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // リアルタイム通知の監視
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // 新しい通知をリストの先頭に追加
          const newNotification: Notification = {
            id: payload.new.id,
            userId: payload.new.user_id,
            title: payload.new.title,
            message: payload.new.message,
            type: payload.new.type as NotificationType,
            read: payload.new.read,
            createdAt: payload.new.created_at,
            updatedAt: payload.new.updated_at
          };

          if (notificationsState.data) {
            notificationsState.setData([newNotification, ...notificationsState.data]);
          }

          // 未読数を増加
          if (!newNotification.read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          // 更新された通知を反映
          if (notificationsState.data) {
            const updatedNotifications = notificationsState.data.map(notification =>
              notification.id === payload.new.id
                ? {
                    ...notification,
                    read: payload.new.read,
                    updatedAt: payload.new.updated_at
                  }
                : notification
            );
            notificationsState.setData(updatedNotifications);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    // 状態
    notifications: notificationsState.data,
    loading: notificationsState.loading,
    error: notificationsState.error,
    unreadCount,
    
    // 操作関数
    markAsRead,
    markAllAsRead,
    
    // データ再読み込み
    refresh: () => {
      if (user?.id) {
        notificationsState.execute(() => loadNotifications(50));
        loadUnreadCount().then(setUnreadCount).catch(handleError);
      }
    }
  };
};