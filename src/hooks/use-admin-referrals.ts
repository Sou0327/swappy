import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AdminReferralStats {
  totalCodes: number;
  totalReferrals: number;
  activeReferrals: number;
}

export interface ReferralDetail {
  id: string;
  referrerEmail: string;
  referrerHandle: string | null;
  refereeEmail: string;
  refereeHandle: string | null;
  referralCode: string;
  createdAt: string;
}

export interface TopReferrer {
  userId: string;
  email: string;
  userHandle: string | null;
  referralCode: string;
  referralCount: number;
}

/**
 * 管理者向け紹介コード管理フック
 */
export const useAdminReferrals = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralDetail[]>([]);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. 統計データ取得
      const [
        { count: totalCodes },
        { count: totalReferrals }
      ] = await Promise.all([
        supabase
          .from('referral_codes')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('referrals')
          .select('*', { count: 'exact', head: true })
      ]);

      setStats({
        totalCodes: totalCodes || 0,
        totalReferrals: totalReferrals || 0,
        activeReferrals: totalReferrals || 0 // シンプル実装ではactiveとtotalは同じ
      });

      setTotalCount(totalReferrals || 0);

      // 2. 紹介一覧取得（ページネーション対応）
      const offset = (currentPage - 1) * pageSize;
      const { data: referralData, error: referralError } = await supabase
        .from('referrals')
        .select(`
          id,
          created_at,
          referrer:profiles!referrals_referrer_id_fkey(email, user_handle),
          referee:profiles!referrals_referee_id_fkey(email, user_handle),
          referral_code:referral_codes!referrals_referral_code_id_fkey(code)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (referralError) throw referralError;

      interface ReferralDataItem {
        id: string;
        created_at: string;
        referrer?: { email: string; user_handle: string | null } | null;
        referee?: { email: string; user_handle: string | null } | null;
        referral_code?: { code: string } | null;
      }

      const mappedReferrals = (referralData || []).map((item: ReferralDataItem) => ({
        id: item.id,
        referrerEmail: item.referrer?.email || '',
        referrerHandle: item.referrer?.user_handle || null,
        refereeEmail: item.referee?.email || '',
        refereeHandle: item.referee?.user_handle || null,
        referralCode: item.referral_code?.code || '',
        createdAt: item.created_at
      }));

      setReferrals(mappedReferrals);

      // 3. トップ紹介者取得
      const { data: allReferralsForRanking, error: rankingError } = await supabase
        .from('referrals')
        .select(`
          referrer_id,
          referrer:profiles!referrals_referrer_id_fkey(email, user_handle),
          referral_code:referral_codes!referrals_referral_code_id_fkey(code)
        `);

      if (rankingError) throw rankingError;

      // 紹介者ごとにグループ化してカウント
      const referrerMap = new Map<string, { email: string; userHandle: string | null; code: string; count: number }>();

      interface RankingDataItem {
        referrer_id: string | null;
        referrer?: { email: string; user_handle: string | null } | null;
        referral_code?: { code: string } | null;
      }

      (allReferralsForRanking || []).forEach((item: RankingDataItem) => {
        const referrerId = item.referrer_id;
        if (!referrerId) return;

        if (referrerMap.has(referrerId)) {
          referrerMap.get(referrerId)!.count++;
        } else {
          referrerMap.set(referrerId, {
            email: item.referrer?.email || '',
            userHandle: item.referrer?.user_handle || null,
            code: item.referral_code?.code || '',
            count: 1
          });
        }
      });

      // TOP10を抽出
      const topReferrersList: TopReferrer[] = Array.from(referrerMap.entries())
        .map(([userId, data]) => ({
          userId,
          email: data.email,
          userHandle: data.userHandle,
          referralCode: data.code,
          referralCount: data.count
        }))
        .sort((a, b) => b.referralCount - a.referralCount)
        .slice(0, 10);

      setTopReferrers(topReferrersList);

    } catch (err) {
      console.error('Failed to load admin referral data:', err);
      const errorMessage = err instanceof Error ? err.message : '紹介データの読み込みに失敗しました';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  // 初期データ読み込み
  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.ceil(totalCount / pageSize);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const changePageSize = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // ページサイズ変更時は最初のページに戻る
  };

  return {
    stats,
    referrals,
    topReferrers,
    loading,
    error,
    refresh: loadData,
    // ページネーション関連
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    goToPage,
    changePageSize
  };
};
