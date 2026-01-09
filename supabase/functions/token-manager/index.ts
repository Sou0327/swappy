// トークン管理Edge Function
// 対応トークンのCRUD操作を提供

// @ts-expect-error Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Supabase JS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

type EnvGetter = {
  get(name: string): string | undefined;
};

const denoEnv = 'Deno' in globalThis
  ? (globalThis as typeof globalThis & { Deno: { env: EnvGetter } }).Deno.env
  : undefined;

const processEnv = 'process' in globalThis
  ? (globalThis as typeof globalThis & { process: { env?: Record<string, string | undefined> } }).process.env
  : undefined;

const getEnv = (key: string): string => {
  const value = denoEnv?.get(key) ?? processEnv?.[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

const SUPABASE_URL = getEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

interface TokenManagerRequest {
  action: 'list' | 'get' | 'create' | 'update' | 'delete' | 'toggle_active';
  id?: string;
  filters?: {
    chain?: string;
    network?: string;
    active?: boolean;
    deposit_enabled?: boolean;
    withdraw_enabled?: boolean;
    convert_enabled?: boolean;
  };
  token?: SupportedTokenInput;
  updates?: Partial<SupportedTokenInput>;  // updateで使用
}

interface SupportedTokenInput {
  chain: string;
  network: string;
  asset: string;
  name: string;
  symbol: string;
  decimals: number;
  contract_address?: string;
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  convert_enabled: boolean;
  min_deposit?: number | null;
  min_withdraw?: number | null;
  withdraw_fee?: number | null;
  display_order: number;
  icon_url?: string;
  active: boolean;
  // Phase 4: 新規追加フィールド（chain_configs統合）
  min_confirmations?: number | null;
  explorer_url?: string | null;
  destination_tag_required?: boolean;
  chain_specific_config?: Record<string, unknown>;
}

// Supabase client型定義（統一型）
type SupabaseClient = ReturnType<typeof createClient>;

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ message: 'token-manager', version: '1.0.0' }),
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
    const request: TokenManagerRequest = await req.json();
    console.log('[token-manager] Request:', JSON.stringify(request));

    // アクション別処理
    switch (request.action) {
      case 'list':
        return await handleList(supabase, request.filters);

      case 'get':
        if (!request.id) {
          return new Response(
            JSON.stringify({ error: 'Token ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleGet(supabase, request.id);

      case 'create':
        // 管理者権限チェック
        await checkAdminPermission(supabase, user.id);
        if (!request.token) {
          return new Response(
            JSON.stringify({ error: 'Token data is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleCreate(supabase, request.token);

      case 'update':
        // 管理者権限チェック
        await checkAdminPermission(supabase, user.id);
        if (!request.id || !request.updates) {
          return new Response(
            JSON.stringify({ error: 'Token ID and update data are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleUpdate(supabase, request.id, request.updates);

      case 'delete':
        // 管理者権限チェック
        await checkAdminPermission(supabase, user.id);
        if (!request.id) {
          return new Response(
            JSON.stringify({ error: 'Token ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleDelete(supabase, request.id);

      case 'toggle_active':
        // 管理者権限チェック
        await checkAdminPermission(supabase, user.id);
        if (!request.id) {
          return new Response(
            JSON.stringify({ error: 'Token ID is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await handleToggleActive(supabase, request.id);

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('[token-manager] Unexpected error:', error);
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
 * 管理者権限チェック
 */
async function checkAdminPermission(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (!userRole || !['admin', 'moderator'].includes(userRole.role)) {
    throw new Error('Insufficient permissions');
  }
}

// ==========================================
// バリデーション関数
// ==========================================

/**
 * 必須フィールド検証
 * @param tokenData - 検証対象データ
 * @param isUpdate - 更新モードかどうか
 */
function validateRequiredFields(
  tokenData: SupportedTokenInput | Partial<SupportedTokenInput>,
  isUpdate: boolean = false
): string | null {
  // 更新時も必須フィールドの最終値をチェック
  if (!tokenData.chain || tokenData.chain.trim() === '') {
    return isUpdate
      ? 'chain cannot be empty or removed'
      : 'chain is required';
  }
  if (!tokenData.network || tokenData.network.trim() === '') {
    return isUpdate
      ? 'network cannot be empty or removed'
      : 'network is required';
  }
  if (!tokenData.asset || tokenData.asset.trim() === '') {
    return isUpdate
      ? 'asset cannot be empty or removed'
      : 'asset is required';
  }
  if (!tokenData.name || tokenData.name.trim() === '') {
    return isUpdate
      ? 'name cannot be empty or removed'
      : 'name is required';
  }
  if (!tokenData.symbol || tokenData.symbol.trim() === '') {
    return isUpdate
      ? 'symbol cannot be empty or removed'
      : 'symbol is required';
  }
  if (tokenData.decimals == null) {
    return isUpdate
      ? 'decimals cannot be null or removed'
      : 'decimals is required';
  }
  if (tokenData.deposit_enabled == null) {
    return isUpdate
      ? 'deposit_enabled cannot be null or removed'
      : 'deposit_enabled is required';
  }
  if (tokenData.withdraw_enabled == null) {
    return isUpdate
      ? 'withdraw_enabled cannot be null or removed'
      : 'withdraw_enabled is required';
  }
  if (tokenData.convert_enabled == null) {
    return isUpdate
      ? 'convert_enabled cannot be null or removed'
      : 'convert_enabled is required';
  }
  if (tokenData.active == null) {
    return isUpdate
      ? 'active cannot be null or removed'
      : 'active is required';
  }

  return null;
}

/**
 * 契約アドレス検証
 */
function validateContractAddress(chain: string, address?: string): string | null {
  if (!address) return null;

  if (chain === 'evm') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return 'Invalid EVM contract address format';
    }
  } else if (chain === 'trc') {
    if (!/^T[a-zA-Z0-9]{33}$/.test(address)) {
      return 'Invalid Tron contract address format';
    }
  }

  return null;
}

/**
 * 数値制約検証
 */
function validateAmounts(token: SupportedTokenInput | Partial<SupportedTokenInput>): string | null {
  if (token.min_deposit != null && token.min_deposit < 0) {
    return 'min_deposit must be >= 0';
  }
  if (token.min_withdraw != null && token.min_withdraw < 0) {
    return 'min_withdraw must be >= 0';
  }
  if (token.withdraw_fee != null && token.withdraw_fee < 0) {
    return 'withdraw_fee must be >= 0';
  }

  if (token.min_withdraw != null && token.min_deposit != null) {
    if (token.min_withdraw < token.min_deposit) {
      return 'min_withdraw must be >= min_deposit';
    }
  }

  if (token.withdraw_fee != null && token.min_withdraw != null) {
    if (token.withdraw_fee >= token.min_withdraw) {
      return 'withdraw_fee must be < min_withdraw';
    }
  }

  // Phase 4: 新規フィールドのバリデーション
  if (token.min_confirmations != null && token.min_confirmations < 1) {
    return 'min_confirmations must be >= 1';
  }

  if (token.explorer_url != null && token.explorer_url.length > 0) {
    try {
      new URL(token.explorer_url);
    } catch {
      return 'explorer_url must be a valid URL';
    }
  }

  return null;
}

/**
 * 重複チェック
 */
async function checkDuplicateToken(
  supabase: SupabaseClient,
  chain: string,
  network: string,
  asset: string,
  excludeId?: string
): Promise<boolean> {
  let query = supabase
    .from('supported_tokens')
    .select('id')
    .eq('chain', chain)
    .eq('network', network)
    .eq('asset', asset);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data } = await query;
  return data && data.length > 0;
}

/**
 * 統合バリデーション
 */
async function validateTokenData(
  supabase: SupabaseClient,
  tokenData: SupportedTokenInput | Partial<SupportedTokenInput>,
  excludeId?: string,
  isUpdate: boolean = false
): Promise<string | null> {
  // 1. 必須フィールド検証
  const requiredError = validateRequiredFields(tokenData, isUpdate);
  if (requiredError) return requiredError;

  // 2. 契約アドレス検証
  if (tokenData.chain && tokenData.contract_address) {
    const addressError = validateContractAddress(tokenData.chain, tokenData.contract_address);
    if (addressError) return addressError;
  }

  // 3. 数値制約検証
  const amountError = validateAmounts(tokenData);
  if (amountError) return amountError;

  // 4. 重複チェック
  if (tokenData.chain && tokenData.network && tokenData.asset) {
    const isDuplicate = await checkDuplicateToken(
      supabase,
      tokenData.chain,
      tokenData.network,
      tokenData.asset,
      excludeId
    );
    if (isDuplicate) {
      return `Token already exists: ${tokenData.chain}/${tokenData.network}/${tokenData.asset}`;
    }
  }

  return null;
}

// ==========================================
// CRUD操作関数
// ==========================================

/**
 * トークン一覧取得
 */
async function handleList(supabase: SupabaseClient, filters?: { chain?: string; network?: string; active?: boolean; deposit_enabled?: boolean; withdraw_enabled?: boolean; convert_enabled?: boolean }): Promise<Response> {
  let query = supabase
    .from('supported_tokens')
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  // フィルタ適用
  if (filters) {
    if (filters.chain) {
      query = query.eq('chain', filters.chain);
    }
    if (filters.network) {
      query = query.eq('network', filters.network);
    }
    if (typeof filters.active === 'boolean') {
      query = query.eq('active', filters.active);
    }
    if (typeof filters.deposit_enabled === 'boolean') {
      query = query.eq('deposit_enabled', filters.deposit_enabled);
    }
    if (typeof filters.withdraw_enabled === 'boolean') {
      query = query.eq('withdraw_enabled', filters.withdraw_enabled);
    }
    if (typeof filters.convert_enabled === 'boolean') {
      query = query.eq('convert_enabled', filters.convert_enabled);
    }
  }

  const { data, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * 単一トークン取得
 */
async function handleGet(supabase: SupabaseClient, id: string): Promise<Response> {
  const { data, error } = await supabase
    .from('supported_tokens')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * トークン作成
 */
async function handleCreate(supabase: SupabaseClient, token: SupportedTokenInput): Promise<Response> {
  // バリデーション実行
  const validationError = await validateTokenData(supabase, token, undefined, false);
  if (validationError) {
    return new Response(
      JSON.stringify({ error: validationError }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase
    .from('supported_tokens')
    .insert(token)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * トークン更新
 */
async function handleUpdate(supabase: SupabaseClient, id: string, updates: Partial<SupportedTokenInput>): Promise<Response> {
  // 既存データを取得
  const { data: existing, error: fetchError } = await supabase
    .from('supported_tokens')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return new Response(
      JSON.stringify({ error: 'Token not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 既存データとupdatesをマージ
  const merged: SupportedTokenInput = {
    ...existing,
    ...updates
  };

  // マージ後のデータを検証（isUpdate=true）
  const validationError = await validateTokenData(supabase, merged, id, true);
  if (validationError) {
    return new Response(
      JSON.stringify({ error: validationError }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 更新実行（元のupdatesオブジェクトを使用）
  const { data, error } = await supabase
    .from('supported_tokens')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * トークン削除
 * 削除ガード：同じシンボルを持つトークンに残高がある場合は削除を拒否
 */
async function handleDelete(supabase: SupabaseClient, id: string): Promise<Response> {
  // 削除対象トークンの使用状況を確認
  const { data: usage, error: usageError } = await supabase
    .from('token_usage_summary')
    .select('*')
    .eq('id', id)
    .single();

  if (usageError) {
    return new Response(
      JSON.stringify({ error: 'Token not found or usage data unavailable' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 残高チェック（保守的アプローチ：同じシンボルに残高があれば削除不可）
  if (usage.user_count > 0 && (usage.total_balance > 0 || usage.total_locked_balance > 0)) {
    const warningMessage = `削除できません: シンボル "${usage.symbol}" を使用しているユーザーが ${usage.user_count} 人存在し、` +
      `合計残高 ${usage.total_balance} + ロック残高 ${usage.total_locked_balance} があります。` +
      `\n注意: user_assetsテーブルはchain/network情報を持たないため、異なるチェーンの同名トークン（例：ERC20 USDTとTRC20 USDT）を区別できません。` +
      `\nこのトークン（${usage.chain}/${usage.network}/${usage.asset}）を削除する前に、同じシンボルを持つ全てのトークンの残高がゼロであることを確認してください。`;

    return new Response(
      JSON.stringify({
        error: warningMessage,
        details: {
          symbol: usage.symbol,
          chain: usage.chain,
          network: usage.network,
          asset: usage.asset,
          user_count: usage.user_count,
          total_balance: usage.total_balance,
          total_locked_balance: usage.total_locked_balance
        }
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 削除実行
  const { error } = await supabase
    .from('supported_tokens')
    .delete()
    .eq('id', id);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

/**
 * アクティブ状態切り替え
 */
async function handleToggleActive(supabase: SupabaseClient, id: string): Promise<Response> {
  // 現在の状態を取得
  const { data: currentToken, error: fetchError } = await supabase
    .from('supported_tokens')
    .select('active')
    .eq('id', id)
    .single();

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 状態を切り替え
  const { data, error } = await supabase
    .from('supported_tokens')
    .update({ active: !currentToken.active })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}