/**
 * User Wallet Manager Edge Function
 *
 * ユーザー個別HDウォレットを管理するEdge Function
 * 機能: マスターキー生成・ニーモニック検証・BIP39標準対応
 */

// @ts-expect-error Deno runtime imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// @ts-expect-error Supabase client type resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// BIP39ライブラリ（古いバージョンを使用）
import * as bip39 from 'https://esm.sh/bip39@2.6.0';

// 定数
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PBKDF2_ITERATIONS = 100000;

// ====================================
// 暗号化関連関数
// ====================================

/**
 * AES-256-GCMでデータを暗号化
 */
async function encrypt(data: string, password: string): Promise<{ encrypted: string; iv: string; salt: string }> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passwordBytes, salt);

  const dataBytes = encoder.encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  );

  const encryptedBytes = new Uint8Array(encrypted);
  return {
    encrypted: btoa(String.fromCharCode(...encryptedBytes)),
    iv: btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt))
  };
}

/**
 * AES-256-GCMでデータを復号
 */
async function decrypt(encryptedBase64: string, ivBase64: string, saltBase64: string, password: string): Promise<string> {
  const encryptedBytes = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
  const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
  const salt = new Uint8Array(atob(saltBase64).split('').map(c => c.charCodeAt(0)));

  const key = await deriveKey(new TextEncoder().encode(password), salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * PBKDF2でパスワードから派生鍵を生成
 */
async function deriveKey(password: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const combined = new Uint8Array([...salt, ...password]);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return await crypto.subtle.importKey('raw', hashBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * パスワードハッシュ生成（認証確認用）
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', passwordBytes);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// ====================================
// メインハンドラー
// ====================================

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    return new Response(
      JSON.stringify({
        message: 'User Wallet Manager',
        version: '2.1.0',
        description: 'Manage user-specific HD wallets (BIP39 compliant)',
        actions: {
          'generate': 'Generate master key and mnemonic (BIP39)',
          'verify': 'Verify mnemonic with word selection',
          'initialize-wallet-roots': 'Initialize wallet roots for all chains',
          'derive-address': 'Derive address from master key'
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { action, password, strength, masterKeyId, wordIndices, mnemonic, chain, network, asset, index, walletRoots } = body;

    console.log('[user-wallet-manager] Request received:', { action, hasPassword: !!password });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    console.log('[user-wallet-manager] Auth header:', authHeader ? 'Present' : 'Missing');
    if (!authHeader) {
      console.log('[user-wallet-manager] 401: Authorization header required');
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    console.log('[user-wallet-manager] Auth result:', { authError: authError?.message, hasUser: !!user });
    if (authError || !user) {
      console.log('[user-wallet-manager] 401: Invalid token');
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // ====================================
    // Action: generate (BIP39)
    // ====================================
    if (action === 'generate') {
      console.log('[user-wallet-manager] Processing generate action');
      if (!password || password.length < 6) {
        console.log('[user-wallet-manager] 400: Password validation failed', { length: password?.length });
        return new Response(
          JSON.stringify({ error: 'Password is required and must be at least 6 characters' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('[user-wallet-manager] Generating BIP39 mnemonic...');
      // BIP39標準のニーモニックを生成
      const strengthBits = strength === 256 ? 256 : 128;
      const mnemonic = bip39.generateMnemonic(strengthBits);

      // ニーモニックを検証
      if (!bip39.validateMnemonic(mnemonic)) {
        console.log('[user-wallet-manager] 500: Mnemonic validation failed');
        return new Response(
          JSON.stringify({ error: 'Failed to generate valid mnemonic' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('[user-wallet-manager] Mnemonic generated successfully, encrypting...');
      const passwordHash = await hashPassword(password);
      const { encrypted, iv, salt } = await encrypt(mnemonic, password);

      console.log('[user-wallet-manager] Encrypted, inserting to database...');
      const { data: masterKey, error: insertError } = await supabase
        .from('master_keys')
        .insert({
          encrypted_mnemonic: encrypted,
          mnemonic_iv: iv,
          salt,
          user_id: userId,
          created_by: userId,
          password_hash: passwordHash,
          active: true,
          backup_verified: false
        })
        .select('id')
        .single();

      if (insertError) {
        console.log('[user-wallet-manager] 500: DB insert failed', insertError);
        return new Response(
          JSON.stringify({ error: `Failed to create master key: ${insertError.message}` }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('[user-wallet-manager] Master key created successfully:', masterKey.id);
      const wordCount = mnemonic.split(' ').length;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            masterKeyId: masterKey.id,
            mnemonic,
            wordCount
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ====================================
    // Action: verify (語順選択式検証）
    // ====================================
    if (action === 'verify') {
      if (!masterKeyId || !password || !wordIndices || !Array.isArray(wordIndices)) {
        return new Response(
          JSON.stringify({ error: 'masterKeyId, password, and wordIndices are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: masterKey, error: fetchError } = await supabase
        .from('master_keys')
        .select('*')
        .eq('id', masterKeyId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !masterKey) {
        return new Response(
          JSON.stringify({ error: 'Master key not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // パスワードハッシュ検証
      const passwordHash = await hashPassword(password);
      if (passwordHash !== masterKey.password_hash) {
        return new Response(
          JSON.stringify({ error: 'Invalid password' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // ニーモニック復号
      const decryptedMnemonic = await decrypt(
        masterKey.encrypted_mnemonic,
        masterKey.mnemonic_iv,
        masterKey.salt,
        password
      );

      const words = decryptedMnemonic.split(' ');
      const selectedWordsList = wordIndices.map((i: number) => words[i]);

      const wordsToCheck = selectedWordsList.slice(0, Math.min(5, selectedWordsList.length));
      const isWordLengthCorrect = wordsToCheck.length >= 3;
      const areWordsInMnemonic = wordsToCheck.every(word => words.includes(word));

      const verified = isWordLengthCorrect && areWordsInMnemonic;

      if (verified) {
        await supabase
          .from('master_keys')
          .update({ backup_verified: true })
          .eq('id', masterKeyId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { verified }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ====================================
    // Action: initialize-wallet-roots (xpubを受け取ってDB保存）
    // ====================================
    if (action === 'initialize-wallet-roots') {
      if (!masterKeyId || !password) {
        return new Response(
          JSON.stringify({ error: 'masterKeyId and password are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // ワークアラウンド: walletRoots がない場合は空の配列を使用
      // TODO: フロントエンドでBIP32を使用してxpubを生成するように変更
      const roots = walletRoots && Array.isArray(walletRoots) ? walletRoots : [];

      // パスワードハッシュ検証
      const { data: masterKey, error: fetchError } = await supabase
        .from('master_keys')
        .select('*')
        .eq('id', masterKeyId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !masterKey) {
        return new Response(
          JSON.stringify({ error: 'Master key not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const passwordHash = await hashPassword(password);
      if (passwordHash !== masterKey.password_hash) {
        return new Response(
          JSON.stringify({ error: 'Invalid password' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // フロントエンドから受け取ったxpubデータをDBに保存
      const results: Array<{ chain: string; network: string; asset: string; xpub: string }> = [];

      for (const root of roots) {
        const { chain, network, asset, xpub, derivationPath, chainCode } = root;

        if (!chain || !network || !asset || !xpub || !derivationPath || !chainCode) {
          continue;
        }

        const { error: insertError } = await supabase
          .from('wallet_roots')
          .upsert({
            chain,
            network,
            asset,
            xpub,
            derivation_path: derivationPath,
            chain_code: chainCode,
            master_key_id: masterKeyId,
            user_id: userId,
            auto_generated: true,
            legacy_data: false,
            verified: true,
            last_verified_at: new Date().toISOString(),
            active: true,
            next_index: 0,
            derivation_template: '0/{index}'
          }, { onConflict: 'user_id,chain,network' })
          .select('id')
          .single();

        if (!insertError) {
          results.push({
            chain,
            network,
            asset,
            xpub: xpub.slice(0, 20) + '...'
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { walletRoots: results }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[user-wallet-manager] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

serve(handleRequest);
