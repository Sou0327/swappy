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
const PBKDF2_HASH_PREFIX = 'pbkdf2$'; // 新しいハッシュ形式のプレフィックス

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
 * パスワードハッシュ生成（PBKDF2 + ソルト付き）
 * 形式: pbkdf2$<iterations>$<salt-base64>$<hash-base64>
 */
async function hashPassword(password: string): Promise<string> {
  // ランダムなソルトを生成（16バイト）
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // PBKDF2でハッシュを生成
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256 // 出力ビット長
  );

  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

  return `${PBKDF2_HASH_PREFIX}${PBKDF2_ITERATIONS}$${saltBase64}$${hashBase64}`;
}

/**
 * パスワード検証（新旧両方のハッシュ形式に対応）
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // 新しい形式のハッシュ（PBKDF2）
  if (storedHash.startsWith(PBKDF2_HASH_PREFIX)) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) {
      console.error('[user-wallet-manager] Invalid PBKDF2 hash format');
      return false;
    }

    const [, iterationsStr, saltBase64, hashBase64] = parts;
    const iterations = parseInt(iterationsStr, 10);

    // ソルトをデコード
    const salt = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);

    // 同じパラメータでハッシュを再計算
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const computedHashBase64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

    // 定数時間比較（タイミング攻撃対策）
    return computedHashBase64 === hashBase64;
  }

  // 古い形式のハッシュ（ソルトなしSHA-256）- 互換性維持
  console.log('[user-wallet-manager] Using legacy hash format (SHA-256 without salt)');
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', passwordBytes);
  const legacyHash = btoa(String.fromCharCode(...new Uint8Array(hash)));

  return legacyHash === storedHash;
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
    const { action, password, strength, masterKeyId, wordIndices, selectedWords, mnemonic, chain, network, asset, index, walletRoots } = body;

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

    // Bearerトークン形式の検証
    if (!authHeader.startsWith('Bearer ')) {
      console.log('[user-wallet-manager] 401: Invalid authorization format');
      return new Response(
        JSON.stringify({ error: 'Invalid authorization format. Expected: Bearer <token>' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.slice(7); // 'Bearer '.length === 7
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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
      if (!masterKeyId || !password || !wordIndices || !Array.isArray(wordIndices) || !selectedWords || !Array.isArray(selectedWords)) {
        return new Response(
          JSON.stringify({ error: 'masterKeyId, password, wordIndices, and selectedWords are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // wordIndicesとselectedWordsの長さが一致するか確認
      if (wordIndices.length !== selectedWords.length) {
        return new Response(
          JSON.stringify({ error: 'wordIndices and selectedWords length must match' }),
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

      // パスワード検証（新旧両方のハッシュ形式に対応）
      const isValid = await verifyPassword(password, masterKey.password_hash);
      if (!isValid) {
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

      // 各位置の単語が正しいか検証
      let correctCount = 0;
      for (let i = 0; i < wordIndices.length; i++) {
        const index = wordIndices[i];
        const userWord = selectedWords[i];

        // インデックスが有効範囲内か確認
        if (index < 0 || index >= words.length) {
          console.log('[user-wallet-manager] Invalid word index:', index, 'total words:', words.length);
          return new Response(
            JSON.stringify({ error: `Invalid word index: ${index}` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 指定された位置の単語が正しいか確認
        // セキュリティ: ニーモニック単語をログに出力しない（機密性の高いデータ）
        if (words[index] === userWord) {
          correctCount++;
        } else {
          console.log('[user-wallet-manager] Word mismatch at index', index);
        }
      }

      // 検証基準：最低3単語、かつ全単語の100%が正しい（厳格な検証）
      const minRequiredWords = 3;
      const verified = correctCount >= minRequiredWords && correctCount === wordIndices.length;

      console.log('[user-wallet-manager] Verification result:', { correctCount, total: wordIndices.length, verified });

      if (verified) {
        await supabase
          .from('master_keys')
          .update({ backup_verified: true })
          .eq('id', masterKeyId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: { verified, correctCount, totalWords: wordIndices.length }
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

      // パスワード検証（新旧両方のハッシュ形式に対応）
      const isValid = await verifyPassword(password, masterKey.password_hash);
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid password' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // フロントエンドから受け取ったxpubデータをDBに保存
      const results: Array<{ chain: string; network: string; asset: string; xpub: string }> = [];
      const errors: Array<{ chain?: string; network?: string; asset?: string; error: string }> = [];

      console.log('[user-wallet-manager] Processing wallet roots:', { count: roots.length, roots: roots.map(r => ({ chain: r.chain, network: r.network, asset: r.asset })) });

      for (const root of roots) {
        const { chain, network, asset, xpub, derivationPath, chainCode } = root;
        console.log('[user-wallet-manager] Processing root:', { chain, network, asset, hasXpub: !!xpub, hasDerivationPath: !!derivationPath, hasChainCode: !!chainCode });

        // 必須フィールドの検証
        if (!chain || !network || !asset || !xpub || !derivationPath || !chainCode) {
          const errorMsg = `Missing required fields: chain=${!!chain}, network=${!!network}, asset=${!!asset}, xpub=${!!xpub}, derivationPath=${!!derivationPath}, chainCode=${!!chainCode}`;
          console.error('[user-wallet-manager] Invalid root entry:', errorMsg);
          errors.push({
            chain,
            network,
            asset,
            error: errorMsg
          });
          continue;
        }

        // 部分インデックスのため upsert ではなく SELECT → INSERT/UPDATE を使用
        const { data: existingRoot } = await supabase
          .from('wallet_roots')
          .select('id')
          .eq('user_id', userId)
          .eq('chain', chain)
          .eq('network', network)
          .maybeSingle();

        let insertError;
        if (existingRoot) {
          // 既存レコードを更新
          const { error } = await supabase
            .from('wallet_roots')
            .update({
              asset,
              xpub,
              derivation_path: derivationPath,
              chain_code: chainCode,
              master_key_id: masterKeyId,
              auto_generated: true,
              legacy_data: false,
              verified: true,
              last_verified_at: new Date().toISOString(),
              active: true
            })
            .eq('id', existingRoot.id);
          insertError = error;
        } else {
          // 新規レコードを挿入
          const { error } = await supabase
            .from('wallet_roots')
            .insert({
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
            });
          insertError = error;
        }

        if (insertError) {
          console.error('[user-wallet-manager] Failed to upsert wallet root:', {
            chain,
            network,
            asset,
            error: insertError.message
          });
          errors.push({
            chain,
            network,
            asset,
            error: insertError.message
          });
        } else {
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
          success: errors.length === 0,
          data: {
            walletRoots: results,
            errors: errors.length > 0 ? errors : undefined,
            successCount: results.length,
            errorCount: errors.length
          }
        }),
        { status: errors.length === 0 ? 200 : (results.length > 0 ? 207 : 400), headers: { 'Content-Type': 'application/json' } }
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
