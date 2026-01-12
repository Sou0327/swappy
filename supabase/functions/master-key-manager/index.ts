// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-expect-error - Deno runtime imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error - Deno runtime imports
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from 'https://esm.sh/@scure/bip39@1.2.1';
// @ts-expect-error - Deno runtime imports
import { wordlist } from 'https://esm.sh/@scure/bip39@1.2.1/wordlists/english';
// @ts-expect-error - Deno runtime imports
import { HDKey } from 'https://esm.sh/@scure/bip32@1.3.1';

/*
  Swappy HDウォレット・マスターキー管理システム
  Layer 1: マスターキー生成・管理層

  機能:
  - BIP39準拠ニーモニック生成
  - AES-256-GCM暗号化・復号化
  - PBKDF2キー導出
  - バックアップ検証

  セキュリティ:
  - Admin権限必須
  - 監査ログ記録
  - 暗号化キー環境変数管理
*/

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MASTER_ENCRYPTION_KEY = Deno.env.get('MASTER_ENCRYPTION_KEY');

if (!MASTER_ENCRYPTION_KEY) {
  throw new Error('MASTER_ENCRYPTION_KEY environment variable is required');
}

type RequestBody = {
  action: 'generate' | 'decrypt' | 'verify' | 'list' | 'deactivate';
  masterKeyId?: string;
  mnemonic?: string;
  strength?: 128 | 256;
  description?: string;
};

type MasterKeyResponse = {
  id: string;
  mnemonic?: string;
  encrypted: string;
  created_at: string;
  description?: string;
  backup_verified: boolean;
};

type EncryptionContext = {
  key_version: number;
  user_id?: string;
  chain?: string;
  timestamp: string;
  aad?: string;
  [key: string]: unknown;
};

const ENCRYPTION_CONTEXT_KEY_ORDER = ['key_version', 'user_id', 'chain', 'timestamp'] as const;
const ENCRYPTION_CONTEXT_EXCLUDED_KEYS = new Set(['aad', 'raw']);

function createEncryptionContext(
  keyVersion: number,
  meta?: { userId?: string; chain?: string; timestamp?: string }
): EncryptionContext {
  const context: EncryptionContext = {
    key_version: keyVersion,
    timestamp: meta?.timestamp ?? new Date().toISOString()
  };

  if (meta?.userId) {
    context.user_id = meta.userId;
  }

  if (meta?.chain) {
    context.chain = meta.chain;
  }

  return context;
}

function serializeEncryptionContext(context: EncryptionContext | Record<string, unknown> | null | undefined): string | undefined {
  if (!context || typeof context !== 'object') {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};
  const record = context as Record<string, unknown>;

  for (const key of ENCRYPTION_CONTEXT_KEY_ORDER) {
    if (key in record && record[key] !== undefined) {
      normalized[key] = record[key];
    }
  }

  for (const key of Object.keys(record)) {
    if (ENCRYPTION_CONTEXT_EXCLUDED_KEYS.has(key)) {
      continue;
    }
    if (!ENCRYPTION_CONTEXT_KEY_ORDER.includes(key as (typeof ENCRYPTION_CONTEXT_KEY_ORDER)[number]) && record[key] !== undefined) {
      normalized[key] = record[key];
    }
  }

  if (Object.keys(normalized).length === 0) {
    return undefined;
  }

  return JSON.stringify(normalized);
}

function getAadCandidates(context: unknown): (string | undefined)[] {
  const candidates: (string | undefined)[] = [];

  if (context && typeof context === 'object') {
    const record = context as Record<string, unknown>;

    const raw = record.aad ?? record.raw;
    if (typeof raw === 'string' && raw.length > 0) {
      candidates.push(raw);
    }

    const serialized = serializeEncryptionContext(record);
    if (serialized && !candidates.includes(serialized)) {
      candidates.push(serialized);
    }
  }

  return candidates;
}

// ====================================
// 暗号化・復号化機能
// ====================================

async function deriveEncryptionKey(
  password: string,
  salt: ArrayBuffer,
  iterations: number = 720000 // P0-③: OWASP推奨以上（デフォルト720k）
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMnemonic(
  mnemonic: string,
  additionalData?: { userId?: string; chain?: string }
): Promise<{
  encrypted: string;
  iv: string;
  salt: string;
  key_version: number;
  aad?: string;
  context: EncryptionContext;
}> {
  const encoder = new TextEncoder();
  const data = encoder.encode(mnemonic);

  const keyVersion = 2; // P0-③: 新規データはバージョン2（720k iterations）
  const iterations = 720000;

  // 32バイトソルト生成
  const saltBytes = crypto.getRandomValues(new Uint8Array(32));
  const saltBuffer = saltBytes.buffer;

  // 12バイトIV生成（GCMモード用）
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const ivBuffer = ivBytes.buffer;

  // AAD（Additional Authenticated Data）の構築
  const context = createEncryptionContext(keyVersion, {
    userId: additionalData?.userId,
    chain: additionalData?.chain
  });
  const aadString = serializeEncryptionContext(context);
  const aadBuffer = aadString ? encoder.encode(aadString).buffer : undefined;
  const contextForStorage = aadString
    ? { ...context, aad: aadString }
    : context;

  // PBKDF2でキー導出（720k iterations）
  const encryptionKey = await deriveEncryptionKey(MASTER_ENCRYPTION_KEY!, saltBuffer, iterations);

  // AES-256-GCM暗号化（AAD付き）
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBuffer,
      additionalData: aadBuffer
    },
    encryptionKey,
    data
  );

  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...new Uint8Array(ivBuffer))),
    salt: btoa(String.fromCharCode(...saltBytes)),
    key_version: keyVersion,
    aad: aadString,
    context: contextForStorage
  };
}

async function decryptMnemonic(
  encryptedData: string,
  ivData: string,
  saltData: string,
  keyVersion: number = 1, // P0-③: デフォルトはレガシーバージョン（後方互換性）
  aadString?: string
): Promise<string> {
  try {
    // Base64デコード
    const encrypted = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    const ivBytes = Uint8Array.from(atob(ivData), c => c.charCodeAt(0));
    const ivBuffer = ivBytes.buffer;
    const saltBytes = Uint8Array.from(atob(saltData), c => c.charCodeAt(0));
    const saltBuffer = saltBytes.buffer;

    // key_versionに応じた反復回数を決定
    const iterations = keyVersion === 1 ? 100000 : 720000;

    // AADの復元
    const encoder = new TextEncoder();
    let aadBuffer: ArrayBuffer | undefined;
    if (aadString) {
      aadBuffer = encoder.encode(aadString).buffer;
    }

    // PBKDF2でキー導出（バージョンに応じた反復回数）
    const encryptionKey = await deriveEncryptionKey(MASTER_ENCRYPTION_KEY!, saltBuffer, iterations);

    // AES-256-GCM復号化（AAD付き）
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBuffer,
        additionalData: aadBuffer
      },
      encryptionKey,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error(`復号化に失敗しました: ${error}`);
  }
}

// ====================================
// Admin権限チェック
// ====================================

async function checkAdminPermission(authHeader: string): Promise<string> {
  // サービスロールキーでクライアントを作成
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const jwt = authHeader.replace('Bearer ', '');

  // Edge Function間内部通信の場合（Service Role Key認証）
  if (jwt === SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[checkAdminPermission] Internal Edge Function authentication verified');
    return 'system'; // システム内部用の特別なユーザーID
  }

  // JWTトークンからユーザー情報を取得
  const { data: userData, error: jwtError } = await adminClient.auth.getUser(jwt);

  if (jwtError || !userData?.user?.id) {
    console.log('[checkAdminPermission] JWT validation failed:', jwtError);
    throw new Error('認証が必要です');
  }

  const userId = userData.user.id;
  console.log('[checkAdminPermission] User ID:', userId);

  // Admin権限チェック
  const { data: userRole, error: roleError } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (roleError) {
    console.log('[checkAdminPermission] Role check error:', roleError);
    throw new Error('権限チェックに失敗しました');
  }

  if (!userRole) {
    console.log('[checkAdminPermission] User does not have admin role');
    throw new Error('Admin権限が必要です');
  }

  console.log('[checkAdminPermission] Admin permission verified for user:', userId);
  return userId;
}

// ====================================
// Wallet Roots自動初期化
// ====================================

async function initializeWalletRootsAsync(masterKeyId: string): Promise<void> {
  try {
    console.log(`[initializeWalletRootsAsync] Starting auto-initialization for master key: ${masterKeyId}`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/wallet-root-manager`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      },
      body: JSON.stringify({
        action: 'initialize',
        masterKeyId: masterKeyId,
        force: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`Wallet roots initialization failed: ${result.error}`);
    }

    console.log(`[initializeWalletRootsAsync] Successfully initialized ${result.data.length} wallet roots`);
  } catch (error) {
    // エラーが発生してもマスターキー生成は成功として扱う
    console.error(`[initializeWalletRootsAsync] Auto-initialization failed:`, error);
    console.log(`[initializeWalletRootsAsync] Note: Master key generation succeeded, but wallet roots need manual initialization`);
  }
}

// ====================================
// 監査ログ記録
// ====================================

async function logAuditEvent(
  userId: string,
  action: string,
  masterKeyId?: string,
  details?: Record<string, unknown>
) {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 簡易監査ログ（実際の実装では専用テーブルを作成）
  console.log('[AUDIT]', {
    timestamp: new Date().toISOString(),
    user_id: userId,
    action,
    master_key_id: masterKeyId,
    details,
    ip_address: 'TODO: IP address capture'
  });

  // TODO: 専用audit_logsテーブルに記録
}

// ====================================
// マスターキー操作
// ====================================

async function generateMasterKey(
  userId: string,
  strength: 128 | 256 = 256,
  description?: string
): Promise<MasterKeyResponse> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // BIP39ニーモニック生成
  const mnemonic = generateMnemonic(wordlist, strength);

  // ニーモニック検証
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('生成されたニーモニックが無効です');
  }

  // 暗号化（P0-③: AAD付き、key_version=2）
  const { encrypted, iv, salt, key_version, context } = await encryptMnemonic(mnemonic, {
    userId: userId
  });

  // 既存のアクティブなマスターキーを無効化
  await serviceClient
    .from('master_keys')
    .update({ active: false })
    .eq('active', true);

  // データベースに保存
  const { data: masterKey, error } = await serviceClient
    .from('master_keys')
    .insert({
      encrypted_mnemonic: encrypted,
      mnemonic_iv: iv,
      salt: salt,
      key_version: key_version, // P0-③: バージョン情報を保存
      encryption_context: context, // P0-③: AADを保存
      created_by: userId,
      description: description,
      active: true,
      backup_verified: false
    })
    .select('id, created_at, description, backup_verified, key_version')
    .single();

  if (error) {
    throw new Error(`マスターキー作成に失敗しました: ${error.message}`);
  }

  // 監査ログ
  await logAuditEvent(userId, 'generate_master_key', masterKey.id, {
    strength,
    description
  });

  // Wallet Roots自動初期化（非ブロッキング）
  initializeWalletRootsAsync(masterKey.id).catch(error => {
    console.error(`[generateMasterKey] Auto-initialization failed:`, error);
  });

  return {
    id: masterKey.id,
    mnemonic, // 一時的に返す（即座にクライアントで保存・削除）
    encrypted,
    created_at: masterKey.created_at,
    description: masterKey.description,
    backup_verified: masterKey.backup_verified
  };
}

async function decryptMasterKey(userId: string, masterKeyId: string): Promise<string> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // マスターキー取得（P0-③: key_versionとencryption_contextも取得）
  const { data: masterKey, error } = await serviceClient
    .from('master_keys')
    .select('encrypted_mnemonic, mnemonic_iv, salt, active, key_version, encryption_context')
    .eq('id', masterKeyId)
    .single();

  if (error || !masterKey) {
    throw new Error('マスターキーが見つかりません');
  }

  if (!masterKey.active) {
    throw new Error('非アクティブなマスターキーです');
  }

  // 復号化（P0-③: key_versionとAADを使用）
  const primaryKeyVersion = masterKey.key_version || 1; // デフォルトはレガシー
  const aadCandidates = getAadCandidates(masterKey.encryption_context);
  if (aadCandidates.length === 0) {
    aadCandidates.push(undefined);
  }

  const keyVersionCandidates: number[] = [primaryKeyVersion];
  if (primaryKeyVersion === 2) {
    keyVersionCandidates.push(1);
  } else if (primaryKeyVersion === 1) {
    keyVersionCandidates.push(2);
  }

  let lastError: unknown = null;
  for (const keyVersion of keyVersionCandidates) {
    for (const aadString of aadCandidates) {
      try {
        const mnemonic = await decryptMnemonic(
          masterKey.encrypted_mnemonic,
          masterKey.mnemonic_iv,
          masterKey.salt,
          keyVersion,
          aadString
        );

        if (keyVersion !== primaryKeyVersion) {
          console.warn('[decryptMasterKey] Fallback key_version used:', keyVersion);
        }
        if (!aadString) {
          console.warn('[decryptMasterKey] Decrypted without AAD context');
        }

        // 監査ログ
        await logAuditEvent(userId, 'decrypt_master_key', masterKeyId);
        return mnemonic;
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new Error(
    `復号化に失敗しました: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

async function verifyBackup(
  userId: string,
  masterKeyId: string,
  userInputMnemonic: string
): Promise<boolean> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 実際のニーモニックを復号化
  const actualMnemonic = await decryptMasterKey(userId, masterKeyId);

  // 照合
  const isValid = userInputMnemonic.trim() === actualMnemonic.trim();

  if (isValid) {
    // バックアップ検証済みフラグを更新
    await serviceClient
      .from('master_keys')
      .update({ backup_verified: true })
      .eq('id', masterKeyId);
  }

  // 監査ログ
  await logAuditEvent(userId, 'verify_backup', masterKeyId, {
    verification_result: isValid
  });

  return isValid;
}

async function listMasterKeys(userId: string): Promise<unknown[]> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: masterKeys, error } = await serviceClient
    .from('master_keys')
    .select('id, created_at, description, active, backup_verified, created_by')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`マスターキー一覧取得に失敗しました: ${error.message}`);
  }

  // 監査ログ
  await logAuditEvent(userId, 'list_master_keys');

  return masterKeys || [];
}

// ====================================
// CORS設定
// ====================================

// CORS設定は共有モジュールから取得
// @ts-expect-error - Deno runtime imports
import { getCorsHeaders as getSharedCorsHeaders } from '../_shared/cors.ts';

// 共有モジュールのCORSヘッダーにMax-Ageを追加
function getCorsHeaders(origin?: string | null): Record<string, string> {
  const headers = getSharedCorsHeaders(origin ?? null);
  // 空オブジェクトの場合はそのまま返す（許可されないオリジン）
  if (Object.keys(headers).length === 0) {
    return headers;
  }
  return {
    ...headers,
    'Access-Control-Max-Age': '86400',
  };
}

// ====================================
// Edge Function Handler
// ====================================

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      service: 'master-key-manager',
      version: '1.0.0',
      status: 'operational',
      security: 'AES-256-GCM + PBKDF2'
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    console.log('[master-key-manager] Request started');

    // 認証チェック
    const auth = req.headers.get('Authorization');
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Admin権限チェック
    const userId = await checkAdminPermission(auth);

    // リクエストボディ解析
    const body: RequestBody = await req.json();
    console.log('[master-key-manager] Action:', body.action);

    let result: unknown;

    switch (body.action) {
      case 'generate':
        result = await generateMasterKey(
          userId,
          body.strength || 256,
          body.description
        );
        break;

      case 'decrypt': {
        if (!body.masterKeyId) {
          throw new Error('masterKeyId is required for decrypt action');
        }
        const mnemonic = await decryptMasterKey(userId, body.masterKeyId);
        result = { mnemonic };
        break;
      }

      case 'verify': {
        if (!body.masterKeyId || !body.mnemonic) {
          throw new Error('masterKeyId and mnemonic are required for verify action');
        }
        const isValid = await verifyBackup(userId, body.masterKeyId, body.mnemonic);
        result = { verified: isValid };
        break;
      }

      case 'list':
        result = await listMasterKeys(userId);
        break;

      case 'deactivate':
        if (!body.masterKeyId) {
          throw new Error('masterKeyId is required for deactivate action');
        }
        // TODO: 実装
        throw new Error('Deactivate action not yet implemented');

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('[master-key-manager] Error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});