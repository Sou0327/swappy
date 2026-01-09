import { useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAsyncState } from './use-async-state';
import { useErrorHandler } from './use-error-handler';

export type AnnouncementCategory = 'maintenance' | 'feature' | 'warning' | 'info' | 'event';
export type AnnouncementImportance = 'low' | 'normal' | 'high' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: AnnouncementCategory;
  importance: AnnouncementImportance;
  published: boolean;
  publishAt: string | null;
  expireAt: string | null;
  targetUserRole: 'all' | 'user' | 'moderator' | 'admin';
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  category: string;
  importance: string;
  published: boolean;
  publish_at: string | null;
  expire_at: string | null;
  target_user_role: string;
  created_at: string;
  updated_at: string;
}

/**
 * お知らせシステム管理フック
 */
export const useAnnouncements = () => {
  const { handleError } = useErrorHandler();

  const announcementsState = useAsyncState<Announcement[]>();

  // お知らせ一覧を取得（RLSで自動的に表示可能なお知らせのみ取得）
  const loadAnnouncements = useCallback(async (limit?: number): Promise<Announcement[]> => {
    let query = supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data as unknown as AnnouncementRow[]).map((item: AnnouncementRow) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      category: item.category as AnnouncementCategory,
      importance: item.importance as AnnouncementImportance,
      published: item.published,
      publishAt: item.publish_at,
      expireAt: item.expire_at,
      targetUserRole: item.target_user_role as 'all' | 'user' | 'moderator' | 'admin',
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  }, []);

  // 初期データ読み込み
  useEffect(() => {
    announcementsState.execute(
      () => loadAnnouncements(50), // 最新50件
      {
        context: 'お知らせ一覧の読み込み',
        showErrorToast: true
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // 状態
    announcements: announcementsState.data,
    loading: announcementsState.loading,
    error: announcementsState.error,

    // データ再読み込み
    refresh: () => {
      announcementsState.execute(() => loadAnnouncements(50));
    }
  };
};
