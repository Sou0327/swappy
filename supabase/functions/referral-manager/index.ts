// 紹介コード管理Edge Function
// 紹介コードの検証、紹介関係の記録、統計情報の取得を提供

// @ts-expect-error Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase JS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ReferralManagerRequest {
  action: 'validate_code' | 'apply_referral' | 'get_stats' | 'list_referrals' | 'list_rewards';
  code?: string;
  referral_code?: string;
}

interface ReferralCode {
  id: string;
  user_id: string;
  code: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
}

interface ReferralStats {
  total_referrals: number;
  active_referrals: number;
  pending_referrals: number;
  total_rewards: { currency: string; amount: number }[];
  pending_rewards: { currency: string; amount: number }[];
}

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ message: 'referral-manager', version: '1.0.0' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 認証チェック
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    // ユーザー認証確認
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // リクエストボディの解析
    const request: ReferralManagerRequest = await req.json();
    console.log('[referral-manager] Request:', JSON.stringify(request));

    // アクション別処理
    switch (request.action) {
      case 'validate_code':
        if (!request.code) {
          return new Response(
            JSON.stringify({ error: 'Code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleValidateCode(supabase, request.code, user.id);

      case 'apply_referral':
        if (!request.referral_code) {
          return new Response(
            JSON.stringify({ error: 'Referral code is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleApplyReferral(supabase, user.id, request.referral_code);

      case 'get_stats':
        return await handleGetStats(supabase, user.id);

      case 'list_referrals':
        return await handleListReferrals(supabase, user.id);

      case 'list_rewards':
        return await handleListRewards(supabase, user.id);

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[referral-manager] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * 紹介コードの検証
 */
// @ts-expect-error Supabase client type from CDN import
async function handleValidateCode(supabase: ReturnType<typeof createClient>, code: string, currentUserId: string): Promise<Response> {
  // コードの存在確認
  const { data: referralCode, error } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (error || !referralCode) {
    return new Response(
      JSON.stringify({ valid: false, message: '紹介コードが見つかりません' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const codeData = referralCode as ReferralCode;

  // 自分のコードは使用不可
  if (codeData.user_id === currentUserId) {
    return new Response(
      JSON.stringify({ valid: false, message: '自分の紹介コードは使用できません' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 有効性チェック
  if (!codeData.is_active) {
    return new Response(
      JSON.stringify({ valid: false, message: 'この紹介コードは現在無効です' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 使用上限チェック
  if (codeData.max_uses !== null && codeData.current_uses >= codeData.max_uses) {
    return new Response(
      JSON.stringify({ valid: false, message: 'この紹介コードは使用上限に達しています' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 有効期限チェック
  if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ valid: false, message: 'この紹介コードは有効期限切れです' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ valid: true, message: '有効な紹介コードです' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 紹介関係の記録
 */
// @ts-expect-error Supabase client type from CDN import
async function handleApplyReferral(supabase: ReturnType<typeof createClient>, referredId: string, referralCode: string): Promise<Response> {
  // コードの検証
  const { data: codeData, error: codeError } = await supabase
    .from('referral_codes')
    .select('user_id, is_active, max_uses, current_uses, expires_at')
    .eq('code', referralCode.toUpperCase())
    .single();

  if (codeError || !codeData) {
    return new Response(
      JSON.stringify({ error: '無効な紹介コードです' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 自己紹介チェック
  if (codeData.user_id === referredId) {
    return new Response(
      JSON.stringify({ error: '自分の紹介コードは使用できません' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 既に紹介関係が存在するかチェック
  const { data: existing } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_id', referredId)
    .single();

  if (existing) {
    return new Response(
      JSON.stringify({ error: '既に他の紹介コードを使用しています' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // referralsテーブルに挿入
  const { data: referral, error: referralError } = await supabase
    .from('referrals')
    .insert({
      referrer_id: codeData.user_id,
      referred_id: referredId,
      referral_code: referralCode.toUpperCase(),
      status: 'pending'
    })
    .select()
    .single();

  if (referralError) {
    return new Response(
      JSON.stringify({ error: referralError.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // current_usesをインクリメント
  await supabase
    .from('referral_codes')
    .update({ current_uses: codeData.current_uses + 1 })
    .eq('code', referralCode.toUpperCase());

  return new Response(
    JSON.stringify({ success: true, data: referral }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * ユーザーの紹介統計取得
 */
// @ts-expect-error Supabase client type from CDN import
async function handleGetStats(supabase: ReturnType<typeof createClient>, userId: string): Promise<Response> {
  // 紹介人数の集計
  const { data: referralCounts } = await supabase
    .from('referrals')
    .select('status')
    .eq('referrer_id', userId);

  const totalReferrals = referralCounts?.length || 0;
  const activeReferrals = referralCounts?.filter((r: { status: string }) => r.status === 'active').length || 0;
  const pendingReferrals = referralCounts?.filter((r: { status: string }) => r.status === 'pending').length || 0;

  // 報酬の集計
  const { data: rewards } = await supabase
    .from('referral_rewards')
    .select('currency, amount, status')
    .eq('user_id', userId);

  // 通貨別の総報酬
  // @ts-expect-error Dynamic currency accumulation
  const rewardsByCurrency = rewards?.reduce((acc: Record<string, number>, reward: { status: string; currency: string; amount: string }) => {
    if (reward.status === 'awarded') {
      if (!acc[reward.currency]) {
        acc[reward.currency] = 0;
      }
      acc[reward.currency] += parseFloat(reward.amount);
    }
    return acc;
  }, {}) || {};

  const totalRewards = Object.entries(rewardsByCurrency).map(([currency, amount]) => ({
    currency,
    amount: amount as number
  }));

  // 保留中の報酬
  // @ts-expect-error Dynamic currency accumulation
  const pendingRewardsByCurrency = rewards?.reduce((acc: Record<string, number>, reward: { status: string; currency: string; amount: string }) => {
    if (reward.status === 'pending') {
      if (!acc[reward.currency]) {
        acc[reward.currency] = 0;
      }
      acc[reward.currency] += parseFloat(reward.amount);
    }
    return acc;
  }, {}) || {};

  const pendingRewards = Object.entries(pendingRewardsByCurrency).map(([currency, amount]) => ({
    currency,
    amount: amount as number
  }));

  const stats: ReferralStats = {
    total_referrals: totalReferrals,
    active_referrals: activeReferrals,
    pending_referrals: pendingReferrals,
    total_rewards: totalRewards,
    pending_rewards: pendingRewards
  };

  return new Response(
    JSON.stringify({ success: true, data: stats }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 紹介したユーザー一覧
 */
// @ts-expect-error Supabase client type from CDN import
async function handleListReferrals(supabase: ReturnType<typeof createClient>, userId: string): Promise<Response> {
  const { data: referrals, error } = await supabase
    .from('referrals')
    .select(`
      id,
      referred_id,
      referral_code,
      status,
      created_at,
      completed_at,
      profiles:referred_id (
        user_handle
      )
    `)
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // プライバシー保護：user_handleの一部を隠す
  // @ts-expect-error Dynamic referral data structure
  const maskedReferrals = referrals?.map((ref: { profiles?: { user_handle?: string }; [key: string]: unknown }) => ({
    ...ref,
    user_handle: ref.profiles?.user_handle
      ? ref.profiles.user_handle.substring(0, 3) + '***'
      : '匿名ユーザー',
    profiles: undefined // プロフィール情報は削除
  }));

  return new Response(
    JSON.stringify({ success: true, data: maskedReferrals }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 報酬履歴取得
 */
// @ts-expect-error Supabase client type from CDN import
async function handleListRewards(supabase: ReturnType<typeof createClient>, userId: string): Promise<Response> {
  const { data: rewards, error } = await supabase
    .from('referral_rewards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data: rewards }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}