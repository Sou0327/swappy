declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
// Supabase Edge FunctionsではDeno.serveを使用
// @ts-expect-error Deno buffer module type resolution
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts";
// @ts-expect-error Supabase client type resolution
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error BIP39 module type resolution
import { mnemonicToSeedSync, mnemonicToEntropy } from 'https://esm.sh/@scure/bip39@1.2.1';
// @ts-expect-error BIP32 module type resolution
import { HDKey } from 'https://esm.sh/@scure/bip32@1.3.1';
// @ts-expect-error Noble hashes module type resolution
import { keccak_256 } from 'https://esm.sh/@noble/hashes@1.4.0/sha3';
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
        const moduleUrl = 'https://esm.sh/@emurgo/cardano-serialization-lib-browser@11.4.0?target=deno&bundle';
        const module = await import(moduleUrl);

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
        console.error('[loadCardanoWasm] 初期化エラー:', error);
        throw error;
      }
    })();
  }
  return cardanoWasmPromise;
}
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

function toDigestBuffer(view: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
}

async function sha256Hash(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', toDigestBuffer(data));
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

// Pure-JS RIPEMD-160実装（Deno互換、クラスコンストラクタ回避）
function ripemd160(data: Uint8Array): Uint8Array {
  // RIPEMD-160ハッシュ実装
  const h = new Uint32Array([0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]);
  const zl = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                             7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
                             3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
                             1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
                             4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13]);
  const zr = new Uint32Array([5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
                             6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
                             15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
                             8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
                             12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11]);
  const sl = new Uint32Array([11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
                             7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
                             11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
                             11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
                             9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6]);
  const sr = new Uint32Array([8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
                             9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
                             9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
                             15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
                             8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11]);
  const hl = new Uint32Array([0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E]);
  const hr = new Uint32Array([0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000]);

  function f(j: number, x: number, y: number, z: number): number {
    if (j <= 15) return x ^ y ^ z;
    if (j <= 31) return (x & y) | (~x & z);
    if (j <= 47) return (x | ~y) ^ z;
    if (j <= 63) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  }

  function K(j: number): number {
    return j <= 15 ? 0x00000000 : j <= 31 ? 0x5A827999 : j <= 47 ? 0x6ED9EBA1 : j <= 63 ? 0x8F1BBCDC : 0xA953FD4E;
  }

  function Kh(j: number): number {
    return j <= 15 ? 0x50A28BE6 : j <= 31 ? 0x5C4DD124 : j <= 47 ? 0x6D703EF3 : j <= 63 ? 0x7A6D76E9 : 0x00000000;
  }

  function padded(data: Uint8Array): Uint8Array {
    const len = data.length;
    const bitLen = len * 8;
    const padLen = len + 1 + (55 - (len % 64)) % 64 + 8;
    const result = new Uint8Array(padLen);
    result.set(data);
    result[len] = 0x80;
    const view = new DataView(result.buffer);
    view.setUint32(padLen - 8, bitLen, true);
    view.setUint32(padLen - 4, 0, true);
    return result;
  }

  function rotateLeft(n: number, b: number): number {
    return (n << b) | (n >>> (32 - b));
  }

  const paddedData = padded(data);
  const chunks = paddedData.length / 64;

  for (let i = 0; i < chunks; i++) {
    const chunk = paddedData.slice(i * 64, (i + 1) * 64);
    const x = new Uint32Array(16);

    for (let j = 0; j < 16; j++) {
      x[j] = (chunk[j * 4]) | (chunk[j * 4 + 1] << 8) | (chunk[j * 4 + 2] << 16) | (chunk[j * 4 + 3] << 24);
    }

    let al = h[0], bl = h[1], cl = h[2], dl = h[3], el = h[4];
    let ar = h[0], br = h[1], cr = h[2], dr = h[3], er = h[4];

    for (let j = 0; j < 80; j++) {
      let tl = (al + f(j, bl, cl, dl) + x[zl[j]] + K(j)) >>> 0;
      tl = (rotateLeft(tl, sl[j]) + el) >>> 0;
      al = el; el = dl; dl = rotateLeft(cl, 10); cl = bl; bl = tl;

      let tr = (ar + f(79 - j, br, cr, dr) + x[zr[j]] + Kh(j)) >>> 0;
      tr = (rotateLeft(tr, sr[j]) + er) >>> 0;
      ar = er; er = dr; dr = rotateLeft(cr, 10); cr = br; br = tr;
    }

    const t = (h[1] + cl + dr) >>> 0;
    h[1] = (h[2] + dl + er) >>> 0;
    h[2] = (h[3] + el + ar) >>> 0;
    h[3] = (h[4] + al + br) >>> 0;
    h[4] = (h[0] + bl + cr) >>> 0;
    h[0] = t;
  }

  const result = new Uint8Array(20);
  for (let i = 0; i < 5; i++) {
    result[i * 4] = h[i] & 0xFF;
    result[i * 4 + 1] = (h[i] >>> 8) & 0xFF;
    result[i * 4 + 2] = (h[i] >>> 16) & 0xFF;
    result[i * 4 + 3] = (h[i] >>> 24) & 0xFF;
  }
  return result;
}
// Cardano用の暗号化ライブラリ（Deno互換）
// @ts-expect-error secp256k1 module type resolution
import { getPublicKey } from 'https://esm.sh/@noble/secp256k1@1.7.1';

/*
  Swappy HDウォレット・マスターキー管理システム
  Layer 2: xpub導出・wallet_roots管理層

  機能:
  - マスターキーからチェーン固有xpub導出
  - wallet_roots自動初期化
  - 既存データとの整合性検証
  - マルチチェーン対応

  セキュリティ:
  - Admin権限必須
  - マスターキーは一時的にのみメモリに保持
  - 導出パス標準準拠
*/

const SUPABASE_URL = (Deno as { env: { get: (key: string) => string | undefined } }).env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = (Deno as { env: { get: (key: string) => string | undefined } }).env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// BIP44準拠導出パス定義
const DERIVATION_PATHS = {
  'evm/ethereum': "m/44'/60'/0'",
  'evm/sepolia': "m/44'/60'/0'",     // テストネットも同一
  'btc/mainnet': "m/84'/0'/0'",
  'btc/testnet': "m/84'/1'/0'",      // テストネット用 (BIP84)
  'trc/mainnet': "m/44'/195'/0'",    // Tron
  'trc/nile': "m/44'/1'/0'",         // Tron Nile テストネット
  'xrp/mainnet': "m/44'/144'/0'",    // XRP
  'ada/mainnet': "m/1852'/1815'/0'"  // Cardano (CIP-1852)
} as const;

type ChainKey = keyof typeof DERIVATION_PATHS;

type RequestBody = {
  action: 'initialize' | 'derive' | 'validate' | 'list' | 'refresh' | 'test';
  masterKeyId?: string;
  chains?: ChainKey[];
  force?: boolean;
  // Test action specific fields
  mnemonic?: string;
  target_address?: string;
};

type WalletRootData = {
  id: string;
  chain: string;
  network: string;
  asset: string;
  xpub: string;
  derivation_path: string;
  chain_code: string;
  master_key_id: string;
  auto_generated: boolean;
  verified: boolean;
};

// ====================================
// Master Key復号化（一時的）
// ====================================

async function getMasterKeyMnemonic(masterKeyId: string): Promise<string> {
  // master-key-managerから復号化されたニーモニックを取得
  const response = await fetch(`${SUPABASE_URL}/functions/v1/master-key-manager`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      action: 'decrypt',
      masterKeyId
    })
  });

  if (!response.ok) {
    throw new Error(`マスターキー復号化に失敗: ${response.statusText}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`マスターキー復号化エラー: ${result.error}`);
  }

  return result.data.mnemonic;
}

// ====================================
// HDKey導出・xpub生成
// ====================================

async function deriveXpubForChain(
  mnemonic: string,
  chainKey: ChainKey
): Promise<{
  xpub: string;
  derivationPath: string;
  chainCode: string;
}> {
  try {
    // ニーモニックからシード生成
    const seed = mnemonicToSeedSync(mnemonic);

    // マスターキー生成
    const masterKey = HDKey.fromMasterSeed(seed);

    // チェーン固有パスで導出
    const derivationPath = DERIVATION_PATHS[chainKey];
    const derivedKey = masterKey.derive(derivationPath);

    if (!derivedKey.publicExtendedKey) {
      throw new Error(`xpub導出に失敗: ${chainKey}`);
    }

    return {
      xpub: derivedKey.publicExtendedKey,
      derivationPath,
      chainCode: Buffer.from(derivedKey.chainCode!).toString('hex')
    };
  } catch (error) {
    throw new Error(`HDKey導出エラー (${chainKey}): ${error}`);
  }
}

// ====================================
// Tronアドレス生成
// ====================================

async function deriveTronAddress(hdKey: HDKey, network: 'mainnet' | 'nile' = 'mainnet'): Promise<string> {
  try {
    // 秘密キーを取得
    const privateKey = hdKey.privateKey;
    if (!privateKey) {
      throw new Error('秘密キーの取得に失敗しました');
    }

    // @noble/secp256k1のgetPublicKey()を直接使用して非圧縮公開キーを取得
    let uncompressedPubKey: Uint8Array;
    try {
      // getPublicKey(privateKey, compressed = false) で非圧縮形式を取得
      uncompressedPubKey = getPublicKey(privateKey, false);
    } catch (error) {
      throw new Error(`公開キー生成エラー: ${error}`);
    }

    // 最初の1バイト（0x04）を除いた64バイトを使用
    const pubKeyBytes = uncompressedPubKey.slice(1);

    // Keccak256ハッシュを適用
    const hashBytes = keccak_256(pubKeyBytes);

    // 最後の20バイトを取得
    const addressBytes = hashBytes.slice(-20);

    // Tronアドレスプレフィックスを追加
    const prefix = network === 'mainnet' ? 0x41 : 0xa0;
    const addressWithPrefix = new Uint8Array(21);
    addressWithPrefix[0] = prefix;
    addressWithPrefix.set(addressBytes, 1);

    // Base58Checkエンコーディング（純粋JS実装）
    const tronAddress = await base58CheckEncode(addressWithPrefix);

    return tronAddress;
  } catch (error) {
    throw new Error(`Tronアドレス生成エラー: ${error}`);
  }
}

// ====================================
// XRPアドレス生成
// ====================================

async function deriveXrpAddress(hdKey: HDKey): Promise<string> {
  try {
    // 公開キーを取得（33バイト圧縮形式）
    const publicKey = hdKey.publicKey;
    if (!publicKey) {
      throw new Error('公開キーの取得に失敗しました');
    }

    // Web Crypto API でSHA-256ハッシュ化
    const sha256Hash = await crypto.subtle.digest('SHA-256', publicKey);

    // Pure-JS RIPEMD-160でハッシュ化
    const hash160 = ripemd160(new Uint8Array(sha256Hash));

    // XRPアドレスプレフィックス（0x00）を追加
    const addressBytes = new Uint8Array(21);
    addressBytes[0] = 0x00; // XRP Classic Address prefix
    addressBytes.set(hash160, 1);

    // Base58Checkエンコーディング（純粋JS実装）
    const xrpAddress = await base58CheckEncode(addressBytes);

    return xrpAddress;
  } catch (error) {
    throw new Error(`XRPアドレス生成エラー: ${error}`);
  }
}

// ====================================
// Cardanoアドレス生成（cardano-serialization-libを利用）
// ====================================

const CARDANO_HARDENED_THRESHOLD = 0x80000000;

type CardanoAccountDerivationResult = {
  accountXpub: string;
  chainCode: string;
  externalChainXpub: string; // P0-⑤: role=0 (受信用)
  stakeChainXpub: string;    // P0-⑤: role=2 (ステーキング用)
};

async function deriveCardanoAccountPublicKey(
  mnemonic: string,
  accountIndex: number = 0,
  passphrase: string = ''
): Promise<CardanoAccountDerivationResult> {
  const CardanoWasm = await loadCardanoWasm();
  const entropyHex = mnemonicToEntropy(mnemonic);
  const entropyBytes = Buffer.from(entropyHex, 'hex');
  const passphraseBytes = new TextEncoder().encode(passphrase);

  const rootKey = CardanoWasm.Bip32PrivateKey.from_bip39_entropy(entropyBytes, passphraseBytes);

  // Account level: m/1852'/1815'/0'
  const accountKey = rootKey
    .derive(CARDANO_HARDENED_THRESHOLD + 1852)
    .derive(CARDANO_HARDENED_THRESHOLD + 1815)
    .derive(CARDANO_HARDENED_THRESHOLD + accountIndex);

  const accountXpub = accountKey.to_public();
  const accountXpubBech32 = accountXpub.to_bech32('acct_xvk');
  const accountBytes = accountXpub.as_bytes();
  const chainCode = Buffer.from(accountBytes.slice(32)).toString('hex');

  // P0-⑤: Chain xpubs導出（role-based derivation）
  // External chain (role=0): m/1852'/1815'/0'/0
  const externalChainKey = accountKey.derive(0);
  const externalChainXpub = externalChainKey.to_public();
  const externalChainXpubBech32 = externalChainXpub.to_bech32();

  // Stake chain (role=2): m/1852'/1815'/0'/2
  const stakeChainKey = accountKey.derive(2);
  const stakeChainXpub = stakeChainKey.to_public();
  const stakeChainXpubBech32 = stakeChainXpub.to_bech32();

  // メモリ解放
  stakeChainXpub.free();
  stakeChainKey.free();
  externalChainXpub.free();
  externalChainKey.free();
  accountXpub.free();
  accountKey.free();
  rootKey.free();

  return {
    accountXpub: accountXpubBech32,
    chainCode,
    externalChainXpub: externalChainXpubBech32,
    stakeChainXpub: stakeChainXpubBech32
  };
}

type CardanoAddressDerivationResult = {
  address: string;
  paymentKeyHex: string;
  stakeKeyHex: string;
  derivationPath: string;
};

async function deriveCardanoAddressFromAccountXpub(
  accountXpub: string,
  addressIndex: number,
  network: 'mainnet' | 'testnet'
): Promise<CardanoAddressDerivationResult> {
  const CardanoWasm = await loadCardanoWasm();
  const accountPublicKey = CardanoWasm.Bip32PublicKey.from_bech32(accountXpub);
  const externalChain = accountPublicKey.derive(0);
  const stakeChain = accountPublicKey.derive(2);

  const paymentKey = externalChain.derive(addressIndex).to_raw_key();
  const stakeKey = stakeChain.derive(0).to_raw_key();

  const paymentKeyHex = Buffer.from(paymentKey.as_bytes()).toString('hex');
  const stakeKeyHex = Buffer.from(stakeKey.as_bytes()).toString('hex');

  const networkInfo = network === 'mainnet'
    ? CardanoWasm.NetworkInfo.mainnet()
    : CardanoWasm.NetworkInfo.testnet();
  const networkId = networkInfo.network_id();

  const paymentCredential = CardanoWasm.StakeCredential.from_keyhash(paymentKey.hash());
  const stakeCredential = CardanoWasm.StakeCredential.from_keyhash(stakeKey.hash());
  const baseAddress = CardanoWasm.BaseAddress.new(networkId, paymentCredential, stakeCredential);
  const bech32Prefix = network === 'mainnet' ? 'addr' : 'addr_test';
  const bech32Address = baseAddress.to_address().to_bech32(bech32Prefix);

  baseAddress.free();
  paymentCredential.free();
  stakeCredential.free();
  paymentKey.free();
  stakeKey.free();
  externalChain.free();
  stakeChain.free();
  accountPublicKey.free();
  networkInfo.free();

  return {
    address: bech32Address,
    paymentKeyHex,
    stakeKeyHex,
    derivationPath: `m/1852'/1815'/0'/0/${addressIndex}`
  };
}

async function validateCardanoAccountXpubFormat(value: string): Promise<boolean> {
  const CardanoWasm = await loadCardanoWasm();
  try {
    CardanoWasm.Bip32PublicKey.from_bech32(value).free();
    return true;
  } catch {
    return false;
  }
}
// ====================================
// Chain Configuration
// ====================================

function getChainAssetConfig(): Array<{
  chainKey: ChainKey;
  chain: string;
  network: string;
  asset: string;
}> {
  return [
    // Ethereum（ETH/USDT/USDC等の全ERC20トークンはこのアドレスを共有）
    { chainKey: 'evm/ethereum', chain: 'evm', network: 'ethereum', asset: 'ETH' },

    // Ethereum Testnet (Sepolia)
    { chainKey: 'evm/sepolia', chain: 'evm', network: 'sepolia', asset: 'ETH' },

    // Bitcoin
    { chainKey: 'btc/mainnet', chain: 'btc', network: 'mainnet', asset: 'BTC' },
    { chainKey: 'btc/testnet', chain: 'btc', network: 'testnet', asset: 'BTC' },

    // Tron（TRX/TRC20-USDT等の全TRC20トークンはこのアドレスを共有）
    { chainKey: 'trc/mainnet', chain: 'trc', network: 'mainnet', asset: 'TRX' },
    { chainKey: 'trc/nile', chain: 'trc', network: 'nile', asset: 'TRX' },

    // XRP
    { chainKey: 'xrp/mainnet', chain: 'xrp', network: 'mainnet', asset: 'XRP' },

    // Cardano
    { chainKey: 'ada/mainnet', chain: 'ada', network: 'mainnet', asset: 'ADA' }
  ];
}

// ====================================
// Wallet Roots操作
// ====================================

async function initializeWalletRoots(
  masterKeyId: string,
  userId?: string,
  force?: boolean,
  chains?: string[]
): Promise<WalletRootData[]> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // マスターキー存在確認
  const { data: masterKey, error: masterKeyError } = await serviceClient
    .from('master_keys')
    .select('id, active')
    .eq('id', masterKeyId)
    .eq('active', true)
    .single();

  if (masterKeyError || !masterKey) {
    throw new Error('アクティブなマスターキーが見つかりません');
  }

  // ニーモニック取得
  const mnemonic = await getMasterKeyMnemonic(masterKeyId);

  // 対象チェーン決定
  const allConfigs = getChainAssetConfig();
  const targetConfigs = chains
    ? allConfigs.filter(config => chains.includes(config.chainKey))
    : allConfigs;

  const results: WalletRootData[] = [];

  for (const config of targetConfigs) {
    try {
      // 既存データチェック（新しい一意制約: user_id + chain + network）
      if (!force) {
        const { data: existing } = await serviceClient
          .from('wallet_roots')
          .select('id')
          .eq('chain', config.chain)
          .eq('network', config.network)
          .eq('user_id', userId)
          .eq('auto_generated', true)
          .eq('active', true)
          .maybeSingle();

        if (existing) {
          console.log(`[wallet-root-manager] Skipping existing: ${config.chain}/${config.network} for user ${userId}`);
          continue;
        }
      }

      let xpub: string;
      let derivationPath: string;
      let chainCode: string;

      // チェーンタイプによって処理を分岐
      let externalChainXpub: string | undefined;
      let stakeChainXpub: string | undefined;

      if (config.chain === 'ada') {
        const cardanoAccount = await deriveCardanoAccountPublicKey(mnemonic);
        xpub = cardanoAccount.accountXpub;
        derivationPath = DERIVATION_PATHS[config.chainKey];
        chainCode = cardanoAccount.chainCode;
        // P0-⑤: Chain xpubsも保存
        externalChainXpub = cardanoAccount.externalChainXpub;
        stakeChainXpub = cardanoAccount.stakeChainXpub;
      } else {
        const result = await deriveXpubForChain(mnemonic, config.chainKey);
        xpub = result.xpub;
        derivationPath = result.derivationPath;
        chainCode = result.chainCode;
      }

      // wallet_rootsに挿入
      const { data: walletRoot, error: insertError } = await serviceClient
        .from('wallet_roots')
        .upsert({
          chain: config.chain,
          network: config.network,
          asset: config.asset,
          xpub,
          derivation_path: derivationPath,
          chain_code: chainCode,
          external_chain_xpub: externalChainXpub, // P0-⑤: Cardano chain xpubs
          stake_chain_xpub: stakeChainXpub,       // P0-⑤: Cardano chain xpubs
          master_key_id: masterKeyId,
          user_id: userId || null, // ユーザーIDを設定（管理者はNULL）
          auto_generated: true,
          legacy_data: false,
          verified: true,
          last_verified_at: new Date().toISOString(),
          active: true,
          next_index: 0,
          derivation_template: '0/{index}'
        }, {
          onConflict: userId ? 'user_id,chain,network' : 'master_key_id,chain,network'
        })
        .select('*')
        .single();

      if (insertError) {
        console.error(`[wallet-root-manager] Insert error for ${config.chain}/${config.network}/${config.asset}:`, insertError);
        continue;
      }

      results.push(walletRoot);
      console.log(`[wallet-root-manager] Generated xpub for: ${config.chain}/${config.network}/${config.asset}`);

    } catch (error) {
      console.error(`[wallet-root-manager] Error processing ${config.chain}/${config.network}/${config.asset}:`, error);
      // 一つのチェーンでエラーが発生しても他は続行
    }
  }

  return results;
}

async function validateWalletRoots(masterKeyId: string): Promise<{
  valid: number;
  invalid: number;
  details: Array<{ id: string; chain: string; network: string; asset: string; status: string; }>
}> {
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 対象のwallet_roots取得
  const { data: walletRoots, error } = await serviceClient
    .from('wallet_roots')
    .select('*')
    .eq('master_key_id', masterKeyId)
    .eq('auto_generated', true)
    .eq('active', true);

  if (error) {
    throw new Error(`wallet_roots取得エラー: ${error.message}`);
  }

  if (!walletRoots || walletRoots.length === 0) {
    return { valid: 0, invalid: 0, details: [] };
  }

  // マスターキー取得
  const mnemonic = await getMasterKeyMnemonic(masterKeyId);

  let validCount = 0;
  let invalidCount = 0;
  const details: Array<{ id: string; chain: string; network: string; asset: string; status: string; }> = [];

  for (const root of walletRoots) {
    try {
      // チェーンキー構築
      const chainKey = `${root.chain}/${root.network}` as ChainKey;

      if (!DERIVATION_PATHS[chainKey]) {
        details.push({
          id: root.id,
          chain: root.chain,
          network: root.network,
          asset: root.asset,
          status: 'unsupported_chain'
        });
        invalidCount++;
        continue;
      }

      let expectedXpub: string;

      if (root.chain === 'ada') {
        const cardanoAccount = await deriveCardanoAccountPublicKey(mnemonic);
        if (await validateCardanoAccountXpubFormat(root.xpub)) {
          expectedXpub = cardanoAccount.accountXpub;
        } else {
          const cardanoAddress = await deriveCardanoAddressFromAccountXpub(
            cardanoAccount.accountXpub,
            0,
            root.network === 'mainnet' ? 'mainnet' : 'testnet'
          );
          expectedXpub = cardanoAddress.address;
        }
      } else if (root.chain === 'trc') {
        const tronResult = await deriveXpubForChain(mnemonic, chainKey);
        const legacyTronAddress = /^[Tt][1-9A-HJ-NP-Za-km-z]{33}$/u.test(root.xpub);

        if (legacyTronAddress) {
          const seed = mnemonicToSeedSync(mnemonic);
          const masterKey = HDKey.fromMasterSeed(seed);
          const derivedKey = masterKey.derive(DERIVATION_PATHS[chainKey]);
          expectedXpub = await deriveTronAddress(derivedKey, root.network as 'mainnet' | 'nile');
        } else {
          expectedXpub = tronResult.xpub;
        }
      } else if (root.chain === 'xrp') {
        const xrpResult = await deriveXpubForChain(mnemonic, chainKey);
        const legacyXrpAddress = /^r[1-9A-HJ-NP-Za-km-z]{24,40}$/u.test(root.xpub);

        if (legacyXrpAddress) {
          const seed = mnemonicToSeedSync(mnemonic);
          const masterKey = HDKey.fromMasterSeed(seed);
          const derivedKey = masterKey.derive(DERIVATION_PATHS[chainKey]);
          expectedXpub = await deriveXrpAddress(derivedKey);
        } else {
          expectedXpub = xrpResult.xpub;
        }
      } else {
        const result = await deriveXpubForChain(mnemonic, chainKey);
        expectedXpub = result.xpub;
      }

      // 照合
      if (root.xpub === expectedXpub) {
        details.push({
          id: root.id,
          chain: root.chain,
          network: root.network,
          asset: root.asset,
          status: 'valid'
        });
        validCount++;

        // 検証済みフラグ更新
        await serviceClient
          .from('wallet_roots')
          .update({
            verified: true,
            last_verified_at: new Date().toISOString()
          })
          .eq('id', root.id);
      } else {
        details.push({
          id: root.id,
          chain: root.chain,
          network: root.network,
          asset: root.asset,
          status: 'xpub_mismatch'
        });
        invalidCount++;
      }

    } catch (error) {
      details.push({
        id: root.id,
        chain: root.chain,
        network: root.network,
        asset: root.asset,
        status: `error: ${error}`
      });
      invalidCount++;
    }
  }

  return { valid: validCount, invalid: invalidCount, details };
}

// ====================================
// Cardanoアドレス生成テスト機能
// ====================================

async function testCardanoAddressGeneration(
  mnemonic: string,
  targetAddress: string
): Promise<{
  success: boolean;
  generated_address: string;
  target_address: string;
  match: boolean;
  details: {
    payment_key: string;
    stake_key: string;
    network_tag: number;
    derivation_paths: {
      payment: string;
      stake: string;
    };
    raw_address_bytes: string;
    bech32_prefix: string;
  };
  debug_info: {
    account_xpub: string;
    account_chain_code: string;
    derivation_template: string;
  };
}> {
  try {
    console.log(`[testCardanoAddressGeneration] テスト開始`);
    console.log(`[testCardanoAddressGeneration] 提供されたニーモニック: ${mnemonic.split(' ').map((w, i) => i < 3 ? w : '***').join(' ')}...`);
    console.log(`[testCardanoAddressGeneration] 対象アドレス: ${targetAddress}`);

    const CardanoWasm = await loadCardanoWasm();
    const cardanoAccount = await deriveCardanoAccountPublicKey(mnemonic);
    console.log(`[testCardanoAddressGeneration] account_xpub: ${cardanoAccount.accountXpub}`);

    const derivedAddress = await deriveCardanoAddressFromAccountXpub(cardanoAccount.accountXpub, 0, 'mainnet');
    const generatedAddress = derivedAddress.address;

    const addressObj = CardanoWasm.Address.from_bech32(generatedAddress);
    const addressBytes = addressObj.to_bytes();
    const baseAddr = CardanoWasm.BaseAddress.from_address(addressObj);
    const networkTag = baseAddr ? baseAddr.network_id() : addressObj.network_id();
    const bech32Prefix = generatedAddress.startsWith('addr_test') ? 'addr_test' : 'addr';

    const match = generatedAddress === targetAddress;

    console.log(`[testCardanoAddressGeneration] 生成: ${generatedAddress}`);
    console.log(`[testCardanoAddressGeneration] 期待: ${targetAddress}`);
    console.log(`[testCardanoAddressGeneration] アドレス一致: ${match ? 'YES' : 'NO'}`);

    if (!match) {
      console.log(`[testCardanoAddressGeneration] ❌ アドレス不一致`);
    }

    if (baseAddr) {
      baseAddr.free();
    }
    addressObj.free();

    return {
      success: true,
      generated_address: generatedAddress,
      target_address: targetAddress,
      match,
      details: {
        payment_key: derivedAddress.paymentKeyHex,
        stake_key: derivedAddress.stakeKeyHex,
        network_tag: networkTag,
        derivation_paths: {
          payment: "m/1852'/1815'/0'/0/0",
          stake: "m/1852'/1815'/0'/2/0"
        },
        raw_address_bytes: Buffer.from(addressBytes).toString('hex'),
        bech32_prefix: bech32Prefix
      },
      debug_info: {
        account_xpub: cardanoAccount.accountXpub,
        account_chain_code: cardanoAccount.chainCode,
        derivation_template: "0/{index}"
      }
    };
  } catch (error) {
    console.error('[testCardanoAddressGeneration] エラー:', error);
    throw new Error(`Cardanoアドレステストエラー: ${error}`);
  }
}
// ====================================
// Admin権限チェック（簡略版）
// ====================================

async function checkAdminPermission(authHeader: string): Promise<string | null> {
  // サービスロールキーでクライレントを作成
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const jwt = authHeader.replace('Bearer ', '');

  // Edge Function間内部通信の場合（Service Role Key認証）
  // 管理者用ルートは user_id=NULL で作成
  if (jwt === SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[checkAdminPermission] Internal Edge Function authentication verified (user_id=NULL for admin roots)');
    return null;
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

(Deno as { serve: (handler: (req: Request) => Promise<Response>) => void }).serve(async (req) => {
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Health check (no auth required)
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      service: 'wallet-root-manager',
      version: '1.0.0',
      status: 'operational',
      supported_chains: Object.keys(DERIVATION_PATHS),
      features: ['xpub_derivation', 'auto_initialization', 'validation', 'cardano_address_test']
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

  // Parse body（POSTのみ）
  let body: RequestBody;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  // testアクションの場合は認証をスキップ
  console.log('[wallet-root-manager] Request started');
  console.log('[wallet-root-manager] Action:', body.action);

  let userId: string | null = null;

  if (body.action === 'test') {
    console.log('[wallet-root-manager] Test action - skipping all authentication (user_id=null for admin roots)');
  } else {
    try {
      // 認証チェック（testアクション以外）
      const auth = req.headers.get('Authorization');
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Authorization required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      // Admin権限チェック
      userId = await checkAdminPermission(auth);
    } catch (error) {
      console.error('[wallet-root-manager] Authentication error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  let result: unknown;

  try {
    switch (body.action) {
      case 'initialize': {
        if (!body.masterKeyId) {
          throw new Error('masterKeyId is required for initialize action');
        }
        // isSystemRootフラグがtrueの場合はuserIdをnullに上書き（システム用ルート）
        // システム用ルートは集権型管理（user_id=NULL）で、緊急時やテスト用途のみ使用
        const effectiveUserId = body.isSystemRoot ? null : userId;
        console.log('[wallet-root-manager] Initialize with user_id:', effectiveUserId, '(isSystemRoot:', body.isSystemRoot, ')');
        if (body.isSystemRoot) {
          console.log('[wallet-root-manager] ⚠️ Creating system root (user_id=NULL) - developer/emergency use only');
        }
        result = await initializeWalletRoots(
          body.masterKeyId,
          effectiveUserId,
          body.force || false,
          body.chains
        );
        break;
      }

      case 'validate': {
        if (!body.masterKeyId) {
          throw new Error('masterKeyId is required for validate action');
        }
        result = await validateWalletRoots(body.masterKeyId);
        break;
      }

      case 'list': {
        const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: walletRoots, error } = await serviceClient
          .from('wallet_roots')
          .select('*')
          .order('chain, network, asset');

        if (error) {
          throw new Error(`wallet_roots取得エラー: ${error.message}`);
        }

        result = walletRoots || [];
        break;
      }

      case 'test': {
        if (!body.mnemonic || !body.target_address) {
          throw new Error('mnemonic and target_address are required for test action');
        }
        result = await testCardanoAddressGeneration(
          body.mnemonic,
          body.target_address
        );
        break;
      }

      case 'refresh': {
        // TODO: 実装
        throw new Error('Refresh action not yet implemented');
      }

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('[wallet-root-manager] Error:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});
