import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ReferralInfo {
  code: string;
  totalReferrals: number;
  referralList: Array<{
    id: string;
    email: string;
    userHandle: string | null;
    createdAt: string;
  }>;
}

/**
 * 紹介コード情報管理フック
 * ユーザーの紹介コードと紹介統計を取得
 */
export const useReferralInfo = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [creating, setCreating] = useState(false);

  const loadReferralInfo = useCallback(async () => {
    if (!user) {
      setReferralInfo(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. 紹介コード取得
      const { data: codeData, error: codeError } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', user.id)
        .single();

      if (codeError) {
        // コードが存在しない場合は空の状態を返す
        if (codeError.code === 'PGRST116') {
          setReferralInfo({
            code: '',
            totalReferrals: 0,
            referralList: []
          });
          setLoading(false);
          return;
        }
        throw codeError;
      }

      // 2. 紹介リスト取得
      const { data: referralsData, error: referralsError } = await supabase
        .from('referrals')
        .select(`
          id,
          created_at,
          referee:profiles!referrals_referee_id_fkey(
            email,
            user_handle
          )
        `)
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (referralsError) throw referralsError;

      // 3. データ整形
      interface ReferralItem {
        id: string;
        created_at: string;
        referee?: {
          email?: string;
          user_handle?: string | null;
        } | null;
      }

      const referralList = (referralsData || []).map((item: ReferralItem) => ({
        id: item.id,
        email: item.referee?.email || '',
        userHandle: item.referee?.user_handle || null,
        createdAt: item.created_at
      }));

      setReferralInfo({
        code: codeData.code,
        totalReferrals: referralList.length,
        referralList
      });

    } catch (err) {
      const error = err as Error;
      console.error('Failed to load referral info:', error);
      setError(error.message || '紹介情報の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createReferralCode = useCallback(async () => {
    if (!user) {
      setError('ログインが必要です');
      return false;
    }

    try {
      setCreating(true);
      setError(null);

      // generate_referral_code関数を呼び出し
      const { data, error: rpcError } = await supabase
        .rpc('generate_referral_code', { p_user_id: user.id });

      if (rpcError) {
        throw rpcError;
      }

      // 生成成功後、データを再読み込み
      await loadReferralInfo();
      return true;
    } catch (err) {
      const error = err as Error;
      console.error('Failed to create referral code:', error);
      setError(error.message || '紹介コードの作成に失敗しました');
      return false;
    } finally {
      setCreating(false);
    }
  }, [user, loadReferralInfo]);

  // 初期データ読み込み
  useEffect(() => {
    loadReferralInfo();
  }, [loadReferralInfo]);

  return {
    referralInfo,
    loading,
    error,
    creating,
    refresh: loadReferralInfo,
    createReferralCode
  };
};
