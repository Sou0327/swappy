import { useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncState } from './use-async-state';
import { useErrorHandler } from './use-error-handler';

export interface NotificationSendHistory {
  id: string;
  sentBy: string;
  sentByEmail?: string;
  templateKey: string | null;
  templateName?: string;
  title: string;
  message: string;
  notificationType: string;
  category: string | null;
  isBroadcast: boolean;
  targetRole: string | null;
  targetUserIds: string[] | null;
  targetUserEmails?: string[];
  status: 'success' | 'partial' | 'failed';
  notificationsSent: number;
  notificationsFailed: number;
  errorMessage: string | null;
  createdAt: string;
}

interface NotificationSendHistoryRow {
  id: string;
  sent_by: string;
  template_key: string | null;
  title: string;
  message: string;
  notification_type: string;
  category: string | null;
  is_broadcast: boolean;
  target_role: string | null;
  target_user_ids: string | null;
  status: string;
  notifications_sent: number;
  notifications_failed: number;
  error_message: string | null;
  created_at: string;
}

interface HistoryFilters {
  startDate?: string;
  endDate?: string;
  sentBy?: string;
  templateKey?: string;
  status?: 'success' | 'partial' | 'failed';
  limit?: number;
}

/**
 * 通知送信履歴管理フック
 */
export const useNotificationSendHistory = () => {
  const { handleError } = useErrorHandler();

  const historyState = useAsyncState<NotificationSendHistory[]>();

  // 送信履歴を取得
  const loadHistory = useCallback(async (filters?: HistoryFilters): Promise<NotificationSendHistory[]> => {
    // Step 1: 履歴データを取得
    let query = supabase
      .from('notification_send_history')
      .select('*')
      .order('created_at', { ascending: false });

    // フィルター適用
    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate);
    }
    if (filters?.sentBy) {
      query = query.eq('sent_by', filters.sentBy);
    }
    if (filters?.templateKey) {
      query = query.eq('template_key', filters.templateKey);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data: historyData, error: historyError } = await query;

    if (historyError) throw historyError;
    if (!historyData || historyData.length === 0) return [];

    // Step 2: ユーザー情報を取得（sent_byがnullでないものだけ）
    const userIds = [...new Set(historyData.map(h => h.sent_by).filter(Boolean))];
    let userEmails: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      if (!userError && userData) {
        userEmails = Object.fromEntries(
          userData.map(u => [u.id, u.email])
        );
      }
    }

    // Step 3: テンプレート情報を取得（template_keyがnullでないものだけ）
    const templateKeys = [...new Set(historyData.map(h => h.template_key).filter(Boolean))];
    let templateNames: Record<string, string> = {};

    if (templateKeys.length > 0) {
      const { data: templateData, error: templateError } = await supabase
        .from('notification_templates')
        .select('template_key, name')
        .in('template_key', templateKeys);

      if (!templateError && templateData) {
        templateNames = Object.fromEntries(
          templateData.map(t => [t.template_key, t.name])
        );
      }
    }

    // Step 3.5: 送信先ユーザー情報を取得（個別送信のtargetUserIdsから）
    const allTargetUserIds = historyData
      .filter(h => !h.is_broadcast && h.target_user_ids)
      .flatMap(h => {
        try {
          return JSON.parse(h.target_user_ids);
        } catch {
          return [];
        }
      });
    const uniqueTargetUserIds = [...new Set(allTargetUserIds)];
    let targetUserEmailsMap: Record<string, string> = {};

    if (uniqueTargetUserIds.length > 0) {
      const { data: targetUserData, error: targetUserError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', uniqueTargetUserIds);

      if (!targetUserError && targetUserData) {
        targetUserEmailsMap = Object.fromEntries(
          targetUserData.map(u => [u.id, u.email])
        );
      }
    }

    // Step 4: データマッピング
    return historyData.map((item: NotificationSendHistoryRow) => {
      const targetUserIdsArray = item.target_user_ids ? (JSON.parse(item.target_user_ids) as string[]) : null;

      return {
        id: item.id,
        sentBy: item.sent_by,
        sentByEmail: item.sent_by ? (userEmails[item.sent_by] || null) : null,
        templateKey: item.template_key,
        templateName: item.template_key ? (templateNames[item.template_key] || null) : null,
        title: item.title,
        message: item.message,
        notificationType: item.notification_type,
        category: item.category,
        isBroadcast: item.is_broadcast,
        targetRole: item.target_role,
        targetUserIds: targetUserIdsArray,
        targetUserEmails: targetUserIdsArray
          ? targetUserIdsArray.map((userId: string) => targetUserEmailsMap[userId]).filter((email): email is string => Boolean(email))
          : undefined,
        status: item.status as 'success' | 'partial' | 'failed',
        notificationsSent: item.notifications_sent,
        notificationsFailed: item.notifications_failed,
        errorMessage: item.error_message,
        createdAt: item.created_at
      };
    });
  }, []);

  // 初期データ読み込み
  useEffect(() => {
    historyState.execute(
      () => loadHistory({ limit: 50 }), // 最新50件
      {
        context: '送信履歴の読み込み',
        showErrorToast: true
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // 状態
    history: historyState.data,
    loading: historyState.loading,
    error: historyState.error,

    // データ再読み込み
    refresh: (filters?: HistoryFilters) => {
      historyState.execute(() => loadHistory(filters));
    },

    // フィルター適用して再読み込み
    loadWithFilters: (filters: HistoryFilters) => {
      historyState.execute(() => loadHistory(filters));
    }
  };
};
