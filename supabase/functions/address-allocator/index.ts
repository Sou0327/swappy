// Deno型定義の追加
declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

// @ts-expect-error - Deno runtime imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error - Deno runtime imports
import { HDNodeWallet, getAddress, computeAddress, keccak256 } from 'https://esm.sh/ethers@6.7.1';
// @ts-expect-error - Deno runtime imports
import { HDKey } from 'https://esm.sh/@scure/bip32@1.3.1';
// @ts-expect-error - Deno runtime imports
import { bech32 } from 'https://esm.sh/bech32@2.0.0';
type CardanoWasmModuleType = {
  [key: string]: unknown;
  default?: () => Promise<unknown>;
  init?: () => Promise<unknown>;
  __wbg_init?: () => Promise<unknown>;
  load?: () => Promise<unknown>;
};

let cardanoWasmPromise: Promise<CardanoWasmModuleType> | null = null;

async function loadCardanoWasm(): Promise<CardanoWasmModuleType> {
  if (!cardanoWasmPromise) {
    cardanoWasmPromise = (async () => {
      try {
        const module = await import('https://esm.sh/@emurgo/cardano-serialization-lib-browser@11.4.0/cardano_serialization_lib.js?target=deno');

        const candidateInits = [module.default, module.init, module.__wbg_init, module.load];
        for (const initFn of candidateInits) {
          if (typeof initFn === 'function') {
            await initFn();
            break;
          }
        }

        return module as CardanoWasmModuleType;
      } catch (error) {
        cardanoWasmPromise = null;
        console.error('[loadCardanoWasm] Cardano WASM初期化エラー:', error);
        throw error;
      }
    })();
  }
  return cardanoWasmPromise;
}

const CardanoWasm = await loadCardanoWasm();
// 純粋なJS Base58実装（ライブラリ依存除去）
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(data: Uint8Array): string {
  const alphabet = BASE58_ALPHABET;
  let encoded = '';

  // Convert to big integer representation
  let num = BigInt(0);
  for (let i = 0; i < data.length; i++) {
    num = num * BigInt(256) + BigInt(data[i]);
  }

  // Convert to base58
  while (num > 0) {
    const remainder = num % BigInt(58);
    encoded = alphabet[Number(remainder)] + encoded;
    num = num / BigInt(58);
  }

  // Handle leading zeros
  for (let i = 0; i < data.length && data[i] === 0; i++) {
    encoded = alphabet[0] + encoded;
  }

  return encoded;
}

async function sha256Hash(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuffer);
}

async function base58CheckEncode(data: Uint8Array): Promise<string> {
  // Calculate double SHA256 checksum
  const firstHash = await sha256Hash(data);
  const secondHash = await sha256Hash(firstHash);
  const checksum = secondHash.slice(0, 4);

  // Append checksum to data
  const dataWithChecksum = new Uint8Array(data.length + 4);
  dataWithChecksum.set(data);
  dataWithChecksum.set(checksum, data.length);

  return base58Encode(dataWithChecksum);
}
// Pure-JS RIPEMD-160 implementation for Deno compatibility
const RIPEMD160_H = [
  0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0
];

const RIPEMD160_R = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13
];

const RIPEMD160_S = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6
];

function ripemd160(data: Uint8Array): Uint8Array {
  const msgLen = data.length;
  const paddedLen = msgLen + 1 + ((64 - ((msgLen + 9) & 63)) & 63) + 8;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, msgLen * 8, true);

  let h0 = RIPEMD160_H[0], h1 = RIPEMD160_H[1], h2 = RIPEMD160_H[2], h3 = RIPEMD160_H[3], h4 = RIPEMD160_H[4];

  for (let i = 0; i < paddedLen; i += 64) {
    const w = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, true);
    }

    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

    for (let j = 0; j < 80; j++) {
      let tl = (al + w[RIPEMD160_R[j]] + ((j < 16) ? (bl ^ cl ^ dl) : (j < 32) ? ((bl & cl) | (~bl & dl)) : (j < 48) ? ((bl | ~cl) ^ dl) : (j < 64) ? ((bl & dl) | (cl & ~dl)) : (bl ^ (cl | ~dl)))) >>> 0;
      if (j >= 16) tl += (j < 32) ? 0x5a827999 : (j < 48) ? 0x6ed9eba1 : (j < 64) ? 0x8f1bbcdc : 0xa953fd4e;
      tl = ((tl << RIPEMD160_S[j]) | (tl >>> (32 - RIPEMD160_S[j]))) + el;
      al = el; el = dl; dl = ((cl << 10) | (cl >>> 22)) >>> 0; cl = bl; bl = tl >>> 0;

      let tr = (ar + w[RIPEMD160_R[79-j]] + ((j < 16) ? (br ^ (cr | ~dr)) : (j < 32) ? ((br & dr) | (cr & ~dr)) : (j < 48) ? ((br | ~cr) ^ dr) : (j < 64) ? ((br & cr) | (~br & dr)) : (br ^ cr ^ dr))) >>> 0;
      if (j >= 16) tr += (j < 32) ? 0x50a28be6 : (j < 48) ? 0x5c4dd124 : (j < 64) ? 0x6d703ef3 : 0x7a6d76e9;
      tr = ((tr << RIPEMD160_S[79-j]) | (tr >>> (32 - RIPEMD160_S[79-j]))) + er;
      ar = er; er = dr; dr = ((cr << 10) | (cr >>> 22)) >>> 0; cr = br; br = tr >>> 0;
    }

    const t = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = t;
  }

  const result = new Uint8Array(20);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, h0, true);
  resultView.setUint32(4, h1, true);
  resultView.setUint32(8, h2, true);
  resultView.setUint32(12, h3, true);
  resultView.setUint32(16, h4, true);

  return result;
}

// Blake2b hash function for Cardano
const BLAKE2B_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
];

// 本格のBlake2b実装（RFC 7693準拠）
function blake2b(data: Uint8Array, options: { dkLen: number } = { dkLen: 64 }): Uint8Array {
  const outlen = options.dkLen;
  if (outlen < 1 || outlen > 64) {
    throw new Error('Blake2b output length must be between 1 and 64 bytes');
  }

  // 初期ハッシュ値の設定
  const h = [...BLAKE2B_IV];
  h[0] ^= BigInt(0x01010000 ^ outlen);

  let t = 0n; // 処理済みバイト数
  let pos = 0;

  // データを128バイトブロックに分けて処理
  while (pos < data.length) {
    const blockSize = Math.min(128, data.length - pos);
    const block = new Uint8Array(128);
    block.set(data.slice(pos, pos + blockSize));
    t += BigInt(blockSize);

    const isLast = pos + blockSize >= data.length;

    // Blake2b圧縮関数の呼び出し
    blake2bCompress(h, block, t, isLast);

    pos += blockSize;
  }

  // 出力の生成
  const result = new Uint8Array(outlen);
  const view = new DataView(result.buffer);
  for (let i = 0; i < Math.min(8, Math.ceil(outlen / 8)); i++) {
    view.setBigUint64(i * 8, h[i], true);
  }

  return result.slice(0, outlen);
}

// Blake2b圧縮関数（RFC 7693準拠）
function blake2bCompress(h: bigint[], block: Uint8Array, t: bigint, isLast: boolean): void {
  // ローカル作業変数
  const v = new Array(16);

  // 初期化
  for (let i = 0; i < 8; i++) {
    v[i] = h[i];
  }
  for (let i = 8; i < 16; i++) {
    v[i] = BLAKE2B_IV[i - 8];
  }

  // カウンタとフラグの設定
  v[12] ^= t & 0xffffffffffffffffn;
  v[13] ^= t >> 64n;
  if (isLast) {
    v[14] ^= 0xffffffffffffffffn;
  }

  // メッセージスケジューリング
  const m = new Array(16);
  const dataView = new DataView(block.buffer);
  for (let i = 0; i < 16; i++) {
    m[i] = dataView.getBigUint64(i * 8, true);
  }

  // Blake2bのσ（シグマ）配列
  const sigma = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
    [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
    [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
    [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
    [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3]
  ];

  // 12ラウンドの処理
  for (let round = 0; round < 12; round++) {
    const s = sigma[round % 10];

    // G関数の4回適用
    blake2bG(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
    blake2bG(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
    blake2bG(v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
    blake2bG(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);

    blake2bG(v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
    blake2bG(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
    blake2bG(v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
    blake2bG(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
  }

  // ハッシュ値の更新
  for (let i = 0; i < 8; i++) {
    h[i] = h[i] ^ v[i] ^ v[i + 8];
  }
}

// Blake2b G関数（RFC 7693準拠）
function blake2bG(v: bigint[], a: number, b: number, c: number, d: number, x: bigint, y: bigint): void {
  // 右ローテーション関数
  const rotr64 = (w: bigint, c: number): bigint => {
    return (w >> BigInt(c)) | ((w << BigInt(64 - c)) & 0xffffffffffffffffn);
  };

  v[a] = (v[a] + v[b] + x) & 0xffffffffffffffffn;
  v[d] = rotr64(v[d] ^ v[a], 32);
  v[c] = (v[c] + v[d]) & 0xffffffffffffffffn;
  v[b] = rotr64(v[b] ^ v[c], 24);
  v[a] = (v[a] + v[b] + y) & 0xffffffffffffffffn;
  v[d] = rotr64(v[d] ^ v[a], 16);
  v[c] = (v[c] + v[d]) & 0xffffffffffffffffn;
  v[b] = rotr64(v[b] ^ v[c], 63);
}

/*
  アドレス割当（本番向け）
  - 入力: { chain, network, asset }
  - 出力: deposit_addresses のUPSERT結果（address等）
  - 仕様: EVM(xpub)対応。BTCは今後追加予定。
  - セキュリティ: RLSでユーザーとして deposit_addresses に書き込み。
                  wallet_roots 参照は service role で実施。
*/

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? undefined;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? undefined;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;

type RequestBody = {
  chain: 'evm' | 'btc' | 'xrp' | 'trc' | 'ada';
  network: string; // evm: 'ethereum' | 'sepolia', btc: 'mainnet' | 'testnet'
  asset: string;   // 'ETH' | 'USDT' | 'BTC' | '...'
  idempotency_key: string; // 冪等性キー（必須）
};

function normalizeKeys(chain: string, network: string) {
  // UIから来る 'eth/mainnet' を 'evm/ethereum' に正規化する場合はここで
  // 今回は既に正規化されたキーを前提にする
  return { chain, network };
}

async function withServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function withUserClient(authHeader: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
}

async function allocateEvmAddress(
  svc: ReturnType<typeof createClient>,
  userScoped: ReturnType<typeof createClient>,
  userId: string,
  network: 'ethereum' | 'sepolia',
  asset: 'ETH' | 'USDT'
) {
  // 既存アドレスの再利用（EVM系はチェーン単位でアドレス共有）
  // 注意: assetフィルタを削除 - ETH/USDTなどで同じアドレスを再利用
  // 理由: EVMでは1つのアドレスで全アセットを管理できる
  const { data: existing } = await userScoped
    .from('deposit_addresses')
    .select('id, address, derivation_path, address_index, xpub, destination_tag')
    .eq('user_id', userId)
    .eq('chain', 'evm')
    .eq('network', network)
    .eq('active', true)
    .maybeSingle();
  if (existing?.address) return existing;

  // HDウォレット対応: ユーザー個別xpubを取得（新システムのみ）
  // 注意: wallet_rootsは (user_id, chain, network) で一意 - assetフィルタは不要
  console.log('[address-allocator] Querying wallet_roots with params:', { chain: 'evm', network, userId });

  const { data: root, error: rootError } = await svc
    .from('wallet_roots')
    .select('*')
    .eq('chain', 'evm')
    .eq('network', network)
    .eq('active', true)
    .eq('auto_generated', true)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle();

  console.log('[address-allocator] Query result:', {
    root: root ? {
      id: root.id,
      chain: root.chain,
      network: root.network,
      asset: root.asset,
      derivation_path: root.derivation_path,
      derivation_template: root.derivation_template
    } : null,
    rootError
  });

  if (rootError) {
    console.error('[address-allocator] Database query error:', rootError);
    throw new Error(`データベースクエリエラー: ${rootError.message}`);
  }

  if (!root?.xpub) {
    console.error('[address-allocator] No wallet root found for:', { chain: 'evm', network, asset, userId });
    throw new Error('wallet_rootsにEVMのxpubが設定されていません。ウォレットを作成してください。');
  }

  // 原子的にnext_indexを取得・インクリメント（競合制御）
  const { data: nextIndexData, error: rpcError } = await svc
    .rpc('allocate_next_address_index', { p_wallet_root_id: root.id });

  if (rpcError) {
    console.error('[address-allocator] Failed to allocate address index:', rpcError);
    throw new Error(`アドレスインデックス割り当てエラー: ${rpcError.message}`);
  }

  const nextIndex = nextIndexData as number;
  const childPath = (root.derivation_template as string || '0/{index}').replace('{index}', String(nextIndex));

  // xpubから子鍵を導出（非ハードン）→ 公開鍵からアドレス
  const hd = HDKey.fromExtendedKey(root.xpub);
  // 相対導出（xpub基準）: '0/{index}' を段階的に
  const parts = childPath.split('/').map((p) => parseInt(p, 10));
  let derived: HDKey | null = hd;
  for (const n of parts) {
    if (Number.isNaN(n)) throw new Error('invalid derivation path template');
    derived = derived!.deriveChild(n);
  }
  if (!derived?.publicKey) throw new Error('Failed to derive child from xpub');

  const address = evmAddressFromPubkey(derived.publicKey);

  // BIP44: m/44'/60'/0'/0/{index}
  const derivationPath = `${root.derivation_path || "m/44'/60'/0'"}/0/${nextIndex}`;

  // deposit_addresses にUPSERT（ユーザー権限下）
  const { data: inserted, error: upsertErr } = await userScoped
    .from('deposit_addresses')
    .upsert({
      user_id: userId,
      chain: 'evm',
      network,
      asset,
      address,
      derivation_path: derivationPath,
      address_index: nextIndex,
      xpub: root.xpub,
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,chain,network,asset' })
    .select('id, address, derivation_path, address_index, xpub, destination_tag')
    .maybeSingle();

  if (upsertErr) throw upsertErr;
  return inserted;
}

async function btcBech32AddressFromPubkey(pubkey: Uint8Array, network: 'mainnet' | 'testnet'): Promise<string> {
  const sha256HashResult = await sha256Hash(pubkey);
  const hash160 = ripemd160(sha256HashResult);
  const words = bech32.toWords(hash160);
  words.unshift(0x00); // witness v0
  const prefix = network === 'mainnet' ? 'bc' : 'tb';
  return bech32.encode(prefix, words);
}

function evmAddressFromPubkey(pubkey: Uint8Array): string {
  // Ethereum アドレス生成: 正しい keccak256 ハッシュを使用
  if (pubkey.length !== 33 && pubkey.length !== 65) {
    throw new Error('Invalid public key length for Ethereum address generation');
  }

  try {
    // 公開鍵をhex文字列に変換（0x04プレフィックス付きで展開形式）
    let pubkeyHex: string;

    if (pubkey.length === 33) {
      // 圧縮公開鍵の場合、展開が必要だが ethers の computeAddress で自動処理される
      pubkeyHex = '0x' + Array.from(pubkey).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // 非圧縮公開鍵（65バイト）の場合
      pubkeyHex = '0x' + Array.from(pubkey).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ethers の computeAddress を使用して正しい keccak256 ベースのアドレス生成
    const address = computeAddress(pubkeyHex);

    console.log(`[evmAddressFromPubkey] Generated address: ${address} from pubkey: ${pubkeyHex.slice(0, 20)}...`);
    return address;
  } catch (error) {
    console.error('[evmAddressFromPubkey] Failed to generate EVM address:', error);
    throw new Error(`Failed to generate EVM address: ${error}`);
  }
}

async function trcAddressFromPubkey(pubkey: Uint8Array, network: 'mainnet' | 'nile'): Promise<string> {
  try {
    // 公開キーが圧縮形式（33バイト）の場合、非圧縮形式に変換
    let uncompressedPubkey: Uint8Array;

    if (pubkey.length === 33) {
      // HDKeyを使用して非圧縮形式に変換
      const hdKey = HDKey.fromPublicKey(pubkey, new Uint8Array(32)); // チェーンコードは一時的
      uncompressedPubkey = hdKey.publicKeyUncompressed || pubkey;
    } else if (pubkey.length === 65) {
      uncompressedPubkey = pubkey;
    } else {
      throw new Error('Invalid public key length for Tron address generation');
    }

    // 最初の1バイト（0x04）を除いた64バイトを使用
    const pubKeyBytes = uncompressedPubkey.slice(1);

    // Keccak256ハッシュを適用
    const hash = keccak256(pubKeyBytes);

    // keccak256は"0x..."形式の文字列を返すので、プレフィックスを除去
    const hashHex = typeof hash === 'string' ? hash.replace(/^0x/, '') : hash;

    // 16進数文字列からUint8Arrayに変換
    const hashBytes = new Uint8Array(hashHex.length / 2);
    for (let i = 0; i < hashHex.length; i += 2) {
      hashBytes[i / 2] = parseInt(hashHex.substring(i, i + 2), 16);
    }

    // 最後の20バイトを取得
    const addressBytes = hashBytes.slice(-20);

    // Tronアドレスプレフィックスを追加
    const prefix = network === 'mainnet' ? 0x41 : 0xa0;
    const addressWithPrefix = new Uint8Array(21);
    addressWithPrefix[0] = prefix;
    addressWithPrefix.set(addressBytes, 1);

    // Base58Checkエンコーディング（純粋JS実装）
    const tronAddress = await base58CheckEncode(addressWithPrefix);

    console.log(`[trcAddressFromPubkey] Generated address: ${tronAddress} for network: ${network}`);
    return tronAddress;
  } catch (error) {
    console.error('[trcAddressFromPubkey] Error generating Tron address:', error);
    throw new Error(`Failed to generate Tron address: ${error}`);
  }
}

async function xrpAddressFromPubkey(pubkey: Uint8Array): Promise<string> {
  try {
    // SHA256 + RIPEMD160 でハッシュ化
    const sha256HashResult = await sha256Hash(pubkey);
    const hash160 = ripemd160(sha256HashResult);

    // XRPアドレスプレフィックス（0x00）を追加
    const addressBytes = new Uint8Array(21);
    addressBytes[0] = 0x00; // XRP Classic Address prefix
    addressBytes.set(hash160, 1);

    // Base58Checkエンコーディング（純粋JS実装）
    const xrpAddress = await base58CheckEncode(addressBytes);

    console.log(`[xrpAddressFromPubkey] Generated address: ${xrpAddress}`);
    return xrpAddress;
  } catch (error) {
    console.error('[xrpAddressFromPubkey] Error generating XRP address:', error);
    throw new Error(`Failed to generate XRP address: ${error}`);
  }
}

function cardanoAddressFromPubkey(pubkey: Uint8Array): string {
  console.warn('[cardanoAddressFromPubkey] 警告: この関数は非推奨です。');
  console.warn('[cardanoAddressFromPubkey] Cardanoアドレスは現在wallet-root-managerで事前生成され、');
  console.warn('[cardanoAddressFromPubkey] 個別アドレス導出は実装されていません。');

  throw new Error(
    'Cardanoアドレス生成は現在無効化されています。' +
    'BaseAddressは整備済みのwallet-root-managerで事前生成され、' +
    '現在の実装では個別アドレス導出はサポートされていません。'
  );
}

async function allocateBtcAddress(
  svc: ReturnType<typeof createClient>,
  userScoped: ReturnType<typeof createClient>,
  userId: string,
  network: 'mainnet' | 'testnet'
) {
  // BIP84 Native SegWit: m/84'/0'/0'/0/{index} -> bech32 (bc1...)
  const { data: existing } = await userScoped
    .from('deposit_addresses')
    .select('id, address, derivation_path, address_index, xpub')
    .eq('user_id', userId)
    .eq('chain', 'btc')
    .eq('network', network)
    .eq('asset', 'BTC')
    .eq('active', true)
    .maybeSingle();
  if (existing?.address) return existing;

  // HDウォレット対応: ユーザー個別xpubを取得（BIP84）
  // 注意: wallet_rootsは (user_id, chain, network) で一意 - assetフィルタは不要
  console.log('[address-allocator] BTC: Querying wallet_roots with params:', { chain: 'btc', network, userId });

  const { data: root, error: rootError } = await svc
    .from('wallet_roots')
    .select('*')
    .eq('chain', 'btc')
    .eq('network', network)
    .eq('active', true)
    .eq('auto_generated', true)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle();

  console.log('[address-allocator] BTC: Query result:', {
    root: root ? { id: root.id, derivation_path: root.derivation_path } : null,
    error: rootError?.message
  });

  if (!root?.xpub) {
    throw new Error('wallet_rootsにBTCのxpubが設定されていません。ウォレットを作成してください。');
  }

  // 原子的にnext_indexを取得・インクリメント（競合制御）
  const { data: nextIndexData, error: rpcError } = await svc
    .rpc('allocate_next_address_index', { p_wallet_root_id: root.id });

  if (rpcError) {
    console.error('[address-allocator] BTC: Failed to allocate address index:', rpcError);
    throw new Error(`アドレスインデックス割り当てエラー: ${rpcError.message}`);
  }

  const nextIndex = nextIndexData as number;
  const childPath = (root.derivation_template as string || '0/{index}').replace('{index}', String(nextIndex));

  // xpubから非ハードンで導出 (BIP84: m/84'/0'/0'/0/{index})
  const hd = HDKey.fromExtendedKey(root.xpub);
  // 相対導出（xpub基準）: '0/{index}' を段階的に
  const parts = childPath.split('/').map((p) => parseInt(p, 10));
  let derived: HDKey | null = hd;
  for (const n of parts) {
    if (Number.isNaN(n)) throw new Error('invalid derivation path template');
    derived = derived!.deriveChild(n);
  }
  if (!derived?.publicKey) throw new Error('Failed to derive child from xpub');

  const address = await btcBech32AddressFromPubkey(derived.publicKey, network);

  // BIP84: m/84'/0'/0'/0/{index}
  const derivationPath = `${root.derivation_path || "m/84'/0'/0'"}/0/${nextIndex}`;

  const { data: inserted, error } = await userScoped
    .from('deposit_addresses')
    .upsert({
      user_id: userId,
      chain: 'btc',
      network,
      asset: 'BTC',
      address,
      derivation_path: derivationPath,
      address_index: nextIndex,
      xpub: root.xpub,
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,chain,network,asset' })
    .select('id, address, derivation_path, address_index, xpub')
    .maybeSingle();
  if (error) throw error;
  return inserted;
}

async function allocateTrcAddress(
  svc: ReturnType<typeof createClient>,
  userScoped: ReturnType<typeof createClient>,
  userId: string,
  network: 'mainnet' | 'nile',
  asset: 'TRX' | 'USDT'
) {
  // 既存アドレスの再利用（TRC系もチェーン単位でアドレス共有）
  // 注意: assetフィルタを削除 - TRX/USDTなどで同じアドレスを再利用
  // 理由: TRONでも1つのアドレスで全アセットを管理できる
  const { data: existing } = await userScoped
    .from('deposit_addresses')
    .select('id, address, derivation_path, address_index, xpub')
    .eq('user_id', userId)
    .eq('chain', 'trc')
    .eq('network', network)
    .eq('active', true)
    .maybeSingle();

  if (existing) {
    console.log('[allocateTrcAddress] Reusing existing address:', existing.address);
    return existing;
  }

  // HDウォレット対応: ユーザー個別xpubを取得（新システムのみ）
  // 注意: wallet_rootsは (user_id, chain, network) で一意 - assetフィルタは不要
  console.log('[allocateTrcAddress] Querying wallet_roots with params:', { chain: 'trc', network, userId });

  const { data: root, error: rootError } = await svc
    .from('wallet_roots')
    .select('id, xpub, next_index, derivation_template, derivation_path')
    .eq('chain', 'trc')
    .eq('network', network)
    .eq('auto_generated', true)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  console.log('[allocateTrcAddress] Query result:', {
    root: root ? { id: root.id } : null,
    error: rootError?.message
  });

  if (!root?.xpub) {
    throw new Error('wallet_rootsにTronのxpubが設定されていません。ウォレットを作成してください。');
  }

  // 原子的にnext_indexを取得・インクリメント（競合制御）
  const { data: nextIndexData, error: rpcError } = await svc
    .rpc('allocate_next_address_index', { p_wallet_root_id: root.id });

  if (rpcError) {
    console.error('[allocateTrcAddress] Failed to allocate address index:', rpcError);
    throw new Error(`アドレスインデックス割り当てエラー: ${rpcError.message}`);
  }

  const nextIndex = nextIndexData as number;
  const template = (root.derivation_template as string) || '0/{index}';
  const childPath = template.replace('{index}', String(nextIndex));

  const hdNode = HDKey.fromExtendedKey(root.xpub);
  const segments = childPath.split('/').map((segment) => parseInt(segment, 10));

  let derivedNode: HDKey | null = hdNode;
  for (const segment of segments) {
    if (Number.isNaN(segment)) {
      throw new Error('invalid derivation path template');
    }
    derivedNode = derivedNode!.deriveChild(segment);
  }

  if (!derivedNode?.publicKey) {
    throw new Error('派生公開鍵の取得に失敗しました');
  }

  const address = await trcAddressFromPubkey(derivedNode.publicKey, network);
  const derivationPath = `${root.derivation_path || "m/44'/195'/0'"}/${childPath}`;
  const addressIndex = nextIndex;

  const { data: inserted, error } = await userScoped
    .from('deposit_addresses')
    .upsert({
      user_id: userId,
      chain: 'trc',
      network,
      asset,
      address,
      derivation_path: derivationPath,
      address_index: addressIndex,
      xpub: root.xpub,
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,chain,network,asset' })
    .select('id, address, derivation_path, address_index, xpub')
    .maybeSingle();

  if (error) throw error;
  return inserted;
}


async function allocateXrpAddress(
  svc: ReturnType<typeof createClient>,
  userScoped: ReturnType<typeof createClient>,
  userId: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
) {
  // P0-④: Destination Tag方式に変更
  console.log('[allocateXrpAddress] Using Destination Tag routing for user:', userId);

  // Step 1: 既存のルートをチェック
  const { data: existingRoute } = await userScoped
    .from('deposit_routes')
    .select(`
      id,
      destination_tag,
      master_address_id,
      xrp_master_addresses!inner(address, network)
    `)
    .eq('user_id', userId)
    .eq('chain', 'xrp')
    .eq('network', network)
    .eq('is_active', true)
    .maybeSingle();

  if (existingRoute) {
    const routeWithMaster = existingRoute as typeof existingRoute & {
      xrp_master_addresses?: { address: string };
    };
    const masterAddress = routeWithMaster.xrp_master_addresses?.address;
    console.log('[allocateXrpAddress] Reusing existing route:', {
      address: masterAddress,
      tag: existingRoute.destination_tag
    });

    return {
      id: existingRoute.id,
      address: masterAddress,
      destination_tag: existingRoute.destination_tag,
      routing_type: 'destination_tag',
      network: network
    };
  }

  // Step 2: アクティブなマスターアドレスを取得
  const { data: masterAddressData, error: masterError } = await svc
    .rpc('get_active_xrp_master_address', { p_network: network });

  type MasterAddressRpc = Array<{
    id: string;
    address: string;
    network: string;
    next_tag: number;
    max_tag: number;
  }>;

  const masterAddresses = masterAddressData as unknown as MasterAddressRpc;

  if (masterError || !masterAddressData || masterAddresses.length === 0) {
    throw new Error(
      `アクティブなXRPマスターアドレスが見つかりません（network: ${network}）。` +
      'Admin画面でマスターアドレスを設定してください。'
    );
  }

  const masterAddress = masterAddresses[0];
  console.log('[allocateXrpAddress] Using master address:', {
    id: masterAddress.id,
    address: masterAddress.address,
    next_tag: masterAddress.next_tag
  });

  // Step 3: Destination Tagを原子的に割り当て
  const { data: destinationTag, error: tagError } = await svc
    .rpc('allocate_next_destination_tag', {
      p_master_address_id: masterAddress.id
    });

  if (tagError) {
    console.error('[allocateXrpAddress] Failed to allocate destination tag:', tagError);
    throw new Error(`Destination Tag割り当てエラー: ${tagError.message}`);
  }

  console.log('[allocateXrpAddress] Allocated destination tag:', destinationTag);

  // Step 4: deposit_routesに記録
  const { data: route, error: routeError } = await userScoped
    .from('deposit_routes')
    .insert({
      user_id: userId,
      chain: 'xrp',
      network: network,
      routing_type: 'destination_tag',
      master_address_id: masterAddress.id,
      destination_tag: destinationTag as number,
      is_active: true
    })
    .select('id, destination_tag')
    .single();

  if (routeError) {
    console.error('[allocateXrpAddress] Failed to create route:', routeError);
    throw new Error(`ルート作成エラー: ${routeError.message}`);
  }

  console.log('[allocateXrpAddress] Successfully allocated XRP destination tag:', {
    user_id: userId,
    address: masterAddress.address,
    tag: destinationTag,
    route_id: route.id
  });

  return {
    id: route.id,
    address: masterAddress.address,
    destination_tag: destinationTag as number,
    routing_type: 'destination_tag',
    network: network
  };
}


async function allocateAdaAddress(
  svc: ReturnType<typeof createClient>,
  userScoped: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: existing } = await userScoped
    .from('deposit_addresses')
    .select('id, address, derivation_path, address_index, xpub, role, address_version')
    .eq('user_id', userId)
    .eq('chain', 'ada')
    .eq('network', 'mainnet')
    .eq('asset', 'ADA')
    .eq('active', true)
    .maybeSingle();

  if (existing) {
    console.log('[allocateAdaAddress] Reusing existing address:', existing.address);
    return existing;
  }

  // HDウォレット対応: ユーザー個別xpubを取得（新システムのみ）
  // 注意: wallet_rootsは (user_id, chain, network) で一意 - assetフィルタは不要
  console.log('[allocateAdaAddress] Querying wallet_roots with params:', { chain: 'ada', network: 'mainnet', userId });

  const { data: root, error: rootError } = await svc
    .from('wallet_roots')
    .select('id, xpub, external_chain_xpub, stake_chain_xpub, next_index, derivation_template, derivation_path')
    .eq('chain', 'ada')
    .eq('network', 'mainnet')
    .eq('auto_generated', true)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  console.log('[allocateAdaAddress] Query result:', {
    root: root ? { id: root.id, hasExternalChain: !!root.external_chain_xpub, hasStakeChain: !!root.stake_chain_xpub } : null,
    error: rootError?.message
  });

  if (!root?.xpub) {
    throw new Error('wallet_rootsにCardanoのアカウント情報が設定されていません。ウォレットを作成してください。');
  }

  // 原子的にnext_indexを取得・インクリメント（競合制御）
  const { data: nextIndexData, error: rpcError } = await svc
    .rpc('allocate_next_address_index', { p_wallet_root_id: root.id });

  if (rpcError) {
    console.error('[allocateAdaAddress] Failed to allocate address index:', rpcError);
    throw new Error(`アドレスインデックス割り当てエラー: ${rpcError.message}`);
  }

  const nextIndex = nextIndexData as number;

  // P0-⑤: CIP-1852 role-based derivation
  let externalChainPubKey: ReturnType<typeof CardanoWasm.Bip32PublicKey.from_bech32> | undefined;
  let stakeChainPubKey: ReturnType<typeof CardanoWasm.Bip32PublicKey.from_bech32> | undefined;
  let paymentPubKey: ReturnType<typeof CardanoWasm.Bip32PublicKey.prototype.derive> | undefined;
  let stakePubKey: ReturnType<typeof CardanoWasm.Bip32PublicKey.prototype.derive> | undefined;
  let paymentKey: ReturnType<typeof CardanoWasm.Bip32PublicKey.prototype.to_raw_key> | undefined;
  let stakeKey: ReturnType<typeof CardanoWasm.Bip32PublicKey.prototype.to_raw_key> | undefined;
  let networkInfo: ReturnType<typeof CardanoWasm.NetworkInfo.mainnet> | undefined;
  let paymentCredential: ReturnType<typeof CardanoWasm.StakeCredential.from_keyhash> | undefined;
  let stakeCredential: ReturnType<typeof CardanoWasm.StakeCredential.from_keyhash> | undefined;
  let baseAddress: ReturnType<typeof CardanoWasm.BaseAddress.new> | undefined;
  let rewardAddress: ReturnType<typeof CardanoWasm.RewardAddress.new> | undefined;

  let address: string;
  let stakeAddress: string | undefined;
  let derivationPath: string;
  const addressIndex = nextIndex;

  try {
    // P0-⑤: Chain xpubsが存在する場合はrole-based derivation (address_version=2)
    if (root.external_chain_xpub && root.stake_chain_xpub) {
      console.log('[allocateAdaAddress] Using CIP-1852 role-based derivation (address_version=2)');

      // External chain (role=0) からpayment key導出
      externalChainPubKey = CardanoWasm.Bip32PublicKey.from_bech32(root.external_chain_xpub);
      paymentPubKey = externalChainPubKey.derive(nextIndex);
      paymentKey = paymentPubKey.to_raw_key();

      // Stake chain (role=2) からstake key導出（固定index 0）
      stakeChainPubKey = CardanoWasm.Bip32PublicKey.from_bech32(root.stake_chain_xpub);
      stakePubKey = stakeChainPubKey.derive(0);
      stakeKey = stakePubKey.to_raw_key();

      // BaseAddress構築（payment + stake credentials）
      networkInfo = CardanoWasm.NetworkInfo.mainnet();
      paymentCredential = CardanoWasm.StakeCredential.from_keyhash(paymentKey.hash());
      stakeCredential = CardanoWasm.StakeCredential.from_keyhash(stakeKey.hash());
      baseAddress = CardanoWasm.BaseAddress.new(networkInfo.network_id(), paymentCredential, stakeCredential);

      address = baseAddress.to_address().to_bech32('addr');

      // Stake address（reward address）も生成
      rewardAddress = CardanoWasm.RewardAddress.new(networkInfo.network_id(), stakeCredential);
      stakeAddress = rewardAddress.to_address().to_bech32('stake');

      // CIP-1852準拠の導出パス: m/1852'/1815'/0'/0/{index} (external), m/1852'/1815'/0'/2/0 (stake)
      derivationPath = `${root.derivation_path || "m/1852'/1815'/0'"}/0/${nextIndex}`;

    } else {
      // Legacy: account xpubから直接導出 (address_version=1)
      console.log('[allocateAdaAddress] Using legacy derivation (address_version=1)');

      const accountPublicKey = CardanoWasm.Bip32PublicKey.from_bech32(root.xpub);
      const externalChain = accountPublicKey.derive(0);
      const stakeChain = accountPublicKey.derive(2);

      paymentPubKey = externalChain.derive(nextIndex);
      paymentKey = paymentPubKey.to_raw_key();

      stakePubKey = stakeChain.derive(0);
      stakeKey = stakePubKey.to_raw_key();

      networkInfo = CardanoWasm.NetworkInfo.mainnet();
      paymentCredential = CardanoWasm.StakeCredential.from_keyhash(paymentKey.hash());
      stakeCredential = CardanoWasm.StakeCredential.from_keyhash(stakeKey.hash());
      baseAddress = CardanoWasm.BaseAddress.new(networkInfo.network_id(), paymentCredential, stakeCredential);

      address = baseAddress.to_address().to_bech32('addr');

      const template = (root.derivation_template as string) || '0/{index}';
      const childPath = template.replace('{index}', String(nextIndex));
      derivationPath = `${root.derivation_path || "m/1852'/1815'/0'"}/${childPath}`;

      // Legacy導出のクリーンアップ
      externalChain?.free();
      stakeChain?.free();
      accountPublicKey?.free();
    }
  } catch (error) {
    console.error('[allocateAdaAddress] Cardano address generation failed:', error);
    throw new Error(`Cardanoアドレスの生成に失敗しました: ${error}`);
  } finally {
    // P0-⑤: 新しいオブジェクトのクリーンアップ
    rewardAddress?.free();
    baseAddress?.free();
    paymentCredential?.free();
    stakeCredential?.free();
    networkInfo?.free();
    paymentKey?.free();
    stakeKey?.free();
    stakePubKey?.free();
    paymentPubKey?.free();
    stakeChainPubKey?.free();
    externalChainPubKey?.free();
  }

  // P0-⑤: address_version=2, role=0 (external) で保存
  const addressVersion = (root.external_chain_xpub && root.stake_chain_xpub) ? 2 : 1;
  const role = (root.external_chain_xpub && root.stake_chain_xpub) ? 0 : null;

  const { data: inserted, error } = await userScoped
    .from('deposit_addresses')
    .upsert({
      user_id: userId,
      chain: 'ada',
      network: 'mainnet',
      asset: 'ADA',
      address,
      derivation_path: derivationPath,
      address_index: addressIndex,
      xpub: root.xpub,
      role: role, // P0-⑤: 0=external (受信用)
      address_version: addressVersion, // P0-⑤: 2=CIP-1852, 1=legacy
      stake_address: stakeAddress, // P0-⑤: Stake address（reward address）
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,chain,network,asset' })
    .select('id, address, derivation_path, address_index, xpub, role, address_version, stake_address')
    .maybeSingle();

  if (error) throw error;
  return inserted;
}


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

Deno.serve(async (req) => {
  // 動的CORS設定（リクエストオリジンに基づく）
  const origin = req.headers.get('Origin') ?? undefined;
  const corsHeaders = getCorsHeaders(origin);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ message: 'address-allocator', supports: ['evm'], version: '0.1' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders
  });

  try {
    console.log('[address-allocator] Starting request processing...');

    const auth = req.headers.get('Authorization');
    if (!auth) {
      console.log('[address-allocator] No Authorization header found');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const body: RequestBody = await req.json();
    console.log('[address-allocator] Request body:', JSON.stringify(body));

    const { chain, network } = normalizeKeys(body.chain, body.network);
    const asset = body.asset;
    const idempotencyKey = body.idempotency_key;

    // idempotency_keyのバリデーション
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'idempotency_keyは必須です'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log('[address-allocator] Normalized params:', { chain, network, asset, idempotencyKey });

    // user-scoped client（RLS対象）
    const userScoped = withUserClient(auth);
    // service client（管理テーブル参照）
    const svc = await withServiceClient();

    // 呼び出しユーザー
    console.log('[address-allocator] Attempting to get user...');
    const { data: profile, error: authError } = await userScoped.auth.getUser();

    if (authError) {
      console.error('[address-allocator] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Auth failed', details: authError.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (!profile?.user?.id) {
      console.log('[address-allocator] No user profile found');
      return new Response(JSON.stringify({ error: 'Auth required', profile: profile }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const userId = profile.user.id;
    console.log('[address-allocator] User authenticated:', userId);

    // ========================================
    // Step 1: 冪等性チェック＆レート制限チェック
    // ========================================
    console.log('[address-allocator] Checking idempotency and rate limits...');
    const { data: idempotencyResult, error: idempotencyError } = await svc.rpc(
      'allocate_address_with_idempotency',
      {
        p_user_id: userId,
        p_currency: asset,
        p_network: network,
        p_idempotency_key: idempotencyKey
      }
    );

    if (idempotencyError) {
      console.error('[address-allocator] Idempotency check failed:', idempotencyError);
      return new Response(JSON.stringify({
        success: false,
        error: '冪等性チェックエラー',
        details: idempotencyError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    type IdempotencyRpc = Array<{
      success: boolean;
      request_id: string;
      deposit_address_id: string | null;
      status: string;
      message: string;
    }>;

    const idempotencyArray = idempotencyResult as unknown as IdempotencyRpc;
    const idempotencyData = idempotencyArray?.[0];

    if (!idempotencyData) {
      return new Response(JSON.stringify({
        success: false,
        error: '冪等性チェック結果が取得できませんでした'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log('[address-allocator] Idempotency check result:', idempotencyData);

    // 既に処理済みの場合、その結果を返す
    if (idempotencyData.status === 'completed') {
      // deposit_addressesから完了済みアドレスを取得
      const { data: existingAddress, error: fetchError } = await userScoped
        .from('deposit_addresses')
        .select('*')
        .eq('id', idempotencyData.deposit_address_id)
        .single();

      if (fetchError) {
        console.error('[address-allocator] Failed to fetch existing address:', fetchError);
      }

      return new Response(JSON.stringify({
        success: true,
        data: existingAddress,
        message: idempotencyData.message
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 失敗済みの場合、エラーを返す
    if (idempotencyData.status === 'failed') {
      return new Response(JSON.stringify({
        success: false,
        error: idempotencyData.message
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // 処理中の場合（通常は発生しないが念のため）
    if (idempotencyData.status === 'pending' && !idempotencyData.success) {
      return new Response(JSON.stringify({
        success: false,
        error: idempotencyData.message
      }), {
        status: 409, // Conflict
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ========================================
    // Step 2: 新規リクエスト - 実際のアドレス割り当て処理
    // ========================================
    const requestId = idempotencyData.request_id;
    let allocatedAddress;
    let allocationError: Error | null = null;

    try {
      if (chain === 'evm' && (network === 'ethereum' || network === 'sepolia') && (asset === 'ETH' || asset === 'USDT')) {
        allocatedAddress = await allocateEvmAddress(svc, userScoped, userId, network as 'ethereum' | 'sepolia', asset as 'ETH' | 'USDT');
      } else if (chain === 'btc' && (network === 'mainnet' || network === 'testnet') && asset === 'BTC') {
        allocatedAddress = await allocateBtcAddress(svc, userScoped, userId, network as 'mainnet' | 'testnet');
      } else if (chain === 'trc' && (network === 'mainnet' || network === 'nile') && (asset === 'TRX' || asset === 'USDT')) {
        allocatedAddress = await allocateTrcAddress(svc, userScoped, userId, network as 'mainnet' | 'nile', asset as 'TRX' | 'USDT');
      } else if (chain === 'xrp' && (network === 'mainnet' || network === 'testnet') && asset === 'XRP') {
        allocatedAddress = await allocateXrpAddress(svc, userScoped, userId, network as 'mainnet' | 'testnet');
      } else if (chain === 'ada' && network === 'mainnet' && asset === 'ADA') {
        allocatedAddress = await allocateAdaAddress(svc, userScoped, userId);
      } else {
        throw new Error('Unsupported chain/network/asset');
      }

      // ========================================
      // Step 3: 成功 - リクエストを完了状態に更新
      // ========================================
      console.log('[address-allocator] Address allocated successfully, completing request...');

      // P0-④ 修正: XRPの場合はdeposit_address_id = null（deposit_routesで管理）
      const depositAddressId = (chain === 'xrp') ? null : allocatedAddress.id;

      await svc.rpc('complete_address_request', {
        p_request_id: requestId,
        p_deposit_address_id: depositAddressId,
        p_success: true
      });

      return new Response(JSON.stringify({
        success: true,
        data: allocatedAddress
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });

    } catch (error) {
      allocationError = error as Error;
      console.error('[address-allocator] Address allocation failed:', allocationError);

      // ========================================
      // Step 4: 失敗 - リクエストを失敗状態に更新
      // ========================================
      await svc.rpc('complete_address_request', {
        p_request_id: requestId,
        p_success: false,
        p_error_message: allocationError.message || String(allocationError)
      });

      return new Response(JSON.stringify({
        success: false,
        error: allocationError.message || String(allocationError)
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

  } catch (e) {
    console.error('[address-allocator] error:', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
