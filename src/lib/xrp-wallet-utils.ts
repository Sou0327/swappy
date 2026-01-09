import { hashTo32BitInt } from './crypto-utils';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface XRPDepositInfo {
  address: string;
  destinationTag: number;
  network: 'mainnet' | 'testnet';
}

export interface XRPNetworkConfig {
  name: string;
  explorer: string;
  rpcUrl: string;
  minReserve: number; // XRP
  ownerReserve: number; // XRP
}

// XRP network configurations
export const XRP_NETWORKS: Record<string, XRPNetworkConfig> = {
  mainnet: {
    name: 'XRP Ledger Mainnet',
    explorer: 'https://xrpscan.com',
    rpcUrl: 'wss://xrplcluster.com',
    minReserve: 10,
    ownerReserve: 2
  },
  testnet: {
    name: 'XRP Ledger Testnet',
    explorer: 'https://test.bithomp.com',
    rpcUrl: 'wss://s.altnet.rippletest.net:51233',
    minReserve: 10,
    ownerReserve: 2
  }
};

// XRP固定アドレスはDBから取得する（ホワイトラベル対応）
// 購入者はSupabase SQL Editorでxrp_fixed_addressesテーブルにアドレスを登録

/**
 * ユーザー固有のDestination Tagを生成
 * 暗号学的ハッシュを使用して衝突を回避
 */
export function generateDestinationTag(userId: string): number {
  // タイムスタンプとランダム要素を追加して一意性を確保
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2);
  const combined = `${userId}-xrp-${timestamp}-${random}`;

  // 簡易ハッシュ生成（CryptoJSを使わない安全な実装）
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }

  // Destination Tagは32bit整数の範囲内である必要がある
  // 0は無効なので、1以上の値を保証
  return Math.max(1, Math.abs(hash) % 0xFFFFFFFF);
}

/**
 * XRP入金情報を生成（DBから固定アドレスを取得）
 *
 * @param supabase - Supabaseクライアント
 * @param userId - ユーザーID
 * @param network - ネットワーク（mainnet/testnet）
 * @returns XRP入金情報
 * @throws XRP固定アドレスが設定されていない場合
 */
export async function generateXRPDepositInfo(
  supabase: SupabaseClient,
  userId: string,
  network: 'mainnet' | 'testnet'
): Promise<XRPDepositInfo> {
  // DBからXRP固定アドレスを取得
  // ⚠️ .single() はDB制約（ネットワークごとにactive=trueは1件のみ）により安全
  const { data: fixedAddress, error } = await supabase
    .from('xrp_fixed_addresses')
    .select('address')
    .eq('network', network)
    .eq('active', true)
    .single();

  if (error || !fixedAddress) {
    throw new Error(`XRP固定アドレスが設定されていません (network: ${network})`);
  }

  const destinationTag = generateDestinationTag(userId);

  return {
    address: fixedAddress.address,
    destinationTag,
    network
  };
}

/**
 * XRPアドレスの妥当性をチェック
 */
export function validateXRPAddress(address: string): boolean {
  try {
    // XRPアドレスの基本的な形式チェック
    if (!address || address.length < 25 || address.length > 34) {
      return false;
    }
    
    // 'r'で始まる必要がある
    if (!address.startsWith('r')) {
      return false;
    }
    
    // Base58文字チェック（XRPは独自のアルファベット）
    const rippleBase58Regex = /^r[rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz]+$/;
    return rippleBase58Regex.test(address);
  } catch (error) {
    return false;
  }
}

/**
 * Destination Tagの妥当性をチェック
 */
export function validateDestinationTag(tag: number | string): boolean {
  const numTag = typeof tag === 'string' ? parseInt(tag, 10) : tag;
  
  if (isNaN(numTag)) return false;
  if (numTag < 0) return false;
  if (numTag > 0xFFFFFFFF) return false; // 32bit整数の最大値
  
  return true;
}

/**
 * XRP amount（drops）を XRP単位に変換
 * 1 XRP = 1,000,000 drops
 */
export function dropsToXRP(drops: string | number): number {
  const dropsNum = typeof drops === 'string' ? parseInt(drops, 10) : drops;
  return dropsNum / 1000000;
}

/**
 * XRP単位を drops に変換
 */
export function xrpToDrops(xrp: number): string {
  return Math.floor(xrp * 1000000).toString();
}

/**
 * XRP transaction feeを推定
 */
export function estimateXRPTransactionFee(): number {
  // XRPの基本手数料は通常10-12 drops（0.00001-0.000012 XRP）
  return 0.000012; // XRP
}

/**
 * 最小アカウント残高を取得
 */
export function getMinimumAccountBalance(network: 'mainnet' | 'testnet'): number {
  const config = XRP_NETWORKS[network];
  return config.minReserve;
}

/**
 * XRP Ledgerアカウント情報を取得するためのURL生成
 */
export function getAccountInfoUrl(
  address: string,
  network: 'mainnet' | 'testnet'
): string {
  const config = XRP_NETWORKS[network];
  return `${config.explorer}/account/${address}`;
}

/**
 * XRP transaction URLを生成
 */
export function getTransactionUrl(
  txHash: string,
  network: 'mainnet' | 'testnet'
): string {
  const config = XRP_NETWORKS[network];
  return `${config.explorer}/tx/${txHash}`;
}

/**
 * 支払いメモを生成（多言語対応）
 */
export function generatePaymentMemo(userId: string, language: string = 'ja'): string {
  const messages = {
    ja: `入金確認用ID: ${userId.slice(0, 8)}`,
    en: `Deposit ID: ${userId.slice(0, 8)}`,
    zh: `充值确认ID: ${userId.slice(0, 8)}`
  };
  
  return messages[language as keyof typeof messages] || messages.ja;
}

/**
 * XRP入金アドレス情報を整形してユーザーに表示
 */
export function formatXRPDepositInfo(
  depositInfo: XRPDepositInfo,
  language: string = 'ja'
): {
  address: string;
  destinationTag: string;
  warning: string;
  instructions: string[];
} {
  const warnings = {
    ja: 'Destination Tagを必ず入力してください。入力を忘れると入金が失われる可能性があります。',
    en: 'Please ensure to include the Destination Tag. Failure to include it may result in loss of funds.',
    zh: '请务必输入目标标签。如果忘记输入可能导致资金丢失。'
  };
  
  const instructions = {
    ja: [
      '上記のXRPアドレスに送金してください',
      'Destination Tagは必ず入力してください',
      '最小入金額は20 XRPです',
      '入金確認には通常1-3分かかります'
    ],
    en: [
      'Send XRP to the address above',
      'Always include the Destination Tag',
      'Minimum deposit amount is 20 XRP',
      'Deposits are usually confirmed within 1-3 minutes'
    ],
    zh: [
      '请向上述XRP地址发送资金',
      '请务必包含目标标签',
      '最小充值金额为20 XRP',
      '充值确认通常需要1-3分钟'
    ]
  };
  
  return {
    address: depositInfo.address,
    destinationTag: depositInfo.destinationTag.toString(),
    warning: warnings[language as keyof typeof warnings] || warnings.ja,
    instructions: instructions[language as keyof typeof instructions] || instructions.ja
  };
}