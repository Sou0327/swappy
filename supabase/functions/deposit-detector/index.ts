// Deno環境での型定義
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-ignore - Deno runtime imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - Deno runtime imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 基本的な型定義
interface DepositAddress {
  id: string;
  user_id: string;
  address: string;
  asset: string;
  chain: string;
  network: string;
  active: boolean;
  destination_tag?: string;
}

interface BitcoinTransaction {
  txid: string;
  vout: Array<{
    value: number;
    scriptpubkey_address: string;
  }>;
  vin: Array<{
    prevout?: {
      scriptpubkey_address: string;
    };
  }>;
  status?: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
  };
}

interface XRPTransaction {
  hash: string;
  TransactionType: string;
  Destination: string;
  DestinationTag?: number;
  Amount: string;
  Account: string;
}

// 環境変数
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_ANON_KEY) {
  throw new Error('Supabase credentials are not configured');
}
const ETHEREUM_RPC_URL = Deno.env.get('ETHEREUM_RPC_URL');
const ETHEREUM_SEPOLIA_RPC_URL = Deno.env.get('ETHEREUM_SEPOLIA_RPC_URL');
const BITCOIN_RPC_URL = Deno.env.get('BITCOIN_RPC_URL');
const TRON_RPC_URL = Deno.env.get('TRON_RPC_URL') || 'https://api.trongrid.io';
const TRONGRID_API_KEY = Deno.env.get('TRONGRID_API_KEY') || '';
const TRC20_USDT_CONTRACT = Deno.env.get('TRC20_USDT_CONTRACT') || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const XRP_RPC_URL = Deno.env.get('XRP_RPC_URL') || 'wss://xrplcluster.com';
const BLOCKFROST_PROJECT_ID = Deno.env.get('BLOCKFROST_PROJECT_ID') || Deno.env.get('BLOCKFROST_API_KEY') || '';
const USDT_ERC20_CONTRACT = Deno.env.get('USDT_ERC20_CONTRACT') || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_SEPOLIA_CONTRACT = Deno.env.get('USDT_SEPOLIA_CONTRACT') || '';

// Supabaseクライアント
const supabase = createClient(
  SUPABASE_URL,
  (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY) as string
);

// チェーン別の設定
interface ChainDetectorConfig {
  name: string;
  rpcUrl: string;
  minConfirmations: number;
  pollInterval: number; // 秒
}

const CHAIN_CONFIGS: Record<string, ChainDetectorConfig> = {
  ethereum: {
    name: 'Ethereum',
    rpcUrl: ETHEREUM_RPC_URL || '',
    minConfirmations: 12,
    pollInterval: 15
  },
  bitcoin: {
    name: 'Bitcoin',
    rpcUrl: BITCOIN_RPC_URL || '',
    minConfirmations: 3,
    pollInterval: 60
  },
  tron: {
    name: 'Tron',
    rpcUrl: TRON_RPC_URL,
    minConfirmations: 19,
    pollInterval: 5
  },
  cardano: {
    name: 'Cardano',
    rpcUrl: '',
    minConfirmations: 15,
    pollInterval: 60
  },
  xrp: {
    name: 'XRP Ledger',
    rpcUrl: XRP_RPC_URL,
    minConfirmations: 1,
    pollInterval: 5
  }
};

export function hexToNumber(hex: string | null | undefined): number {
  if (!hex) return 0;
  return parseInt(hex, 16);
}

// --- chain_progress ヘルパー ---
export async function getChainProgress(chain: string, network: string, asset: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('chain_progress')
      .select('last_block')
      .eq('chain', chain)
      .eq('network', network)
      .eq('asset', asset)
      .maybeSingle();
    return (data?.last_block as number) || 0;
  } catch {
    return 0;
  }
}

export async function setChainProgress(chain: string, network: string, asset: string, lastBlock: number) {
  try {
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('chain_progress')
      .upsert({ chain, network, asset, last_block: lastBlock, updated_at: now }, { onConflict: 'chain,network,asset' })
      .select('id')
      .maybeSingle();
    return data?.id || null;
  } catch (e) {
    console.error('Failed to set chain progress:', e);
    return null;
  }
}

// Ethereum入金検知（ブロック走査）
export async function detectEthereumDeposits(
  network: 'ethereum' | 'sepolia' = 'ethereum',
  supabaseClient = supabase,
  rpcUrl?: string
) {
  console.log(`[${new Date().toISOString()}] Detecting Ethereum deposits on ${network}`);

  try {
    // アクティブなEthereumアドレスを取得
    const { data: addresses, error } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      // Phase 2 schema: EVM系は chain='evm' で保存
      .eq('chain', 'evm')
      .eq('network', network)
      .eq('active', true);

    if (error) {
      console.error('Error fetching Ethereum addresses:', error);
      return;
    }

    if (!addresses || addresses.length === 0) {
      console.log('No active Ethereum addresses found');
      return;
    }

    console.log(`Found ${addresses.length} active Ethereum addresses`);

    const rpc = rpcUrl ?? (network === 'ethereum' ? ETHEREUM_RPC_URL : ETHEREUM_SEPOLIA_RPC_URL);
    if (!rpc) {
      console.log(`No RPC URL configured for Ethereum ${network}`);
      return;
    }

    // 最新ブロック番号
    const latestBlockResponse = await fetch(rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 })
    });
    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = hexToNumber(latestBlockData.result);
    const last = await getChainProgress('evm', network, 'ETH');
    const fromBlock = last > 0 ? (last + 1) : Math.max(0, latestBlockNumber - 1000);

    const addressSet = new Map<string, Record<string, unknown>>();
    for (const a of addresses) {
      addressSet.set((a.address as string).toLowerCase(), a);
    }

    for (let bn = fromBlock; bn <= latestBlockNumber; bn++) {
      const blockHex = '0x' + bn.toString(16);
      const blockRes = await fetch(rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getBlockByNumber', params: [blockHex, true] })
      });
      const blockData = await blockRes.json();
      const block = blockData.result;
      if (!block || !Array.isArray(block.transactions)) continue;

      for (const tx of block.transactions) {
        if (!tx.to) continue;
        const toAddr = (tx.to as string).toLowerCase();
        if (!addressSet.has(toAddr)) continue;
        if (!tx.value || tx.value === '0x0') continue;
        await processEthereumTransaction({ transactionHash: tx.hash }, addressSet.get(toAddr)! as unknown as DepositAddress, network, supabaseClient);
      }
    }
    // 進捗更新
    await setChainProgress('evm', network, 'ETH', latestBlockNumber);
  } catch (error) {
    console.error('Error in detectEthereumDeposits:', error);
  }
}

// ERC-20(USDT)入金検知（簡易）
export async function detectErc20Deposits(
  network: 'ethereum' | 'sepolia',
  token: 'USDT',
  supabaseClient = supabase,
  rpcUrl?: string,
  contract?: string
) {
  console.log(`[${new Date().toISOString()}] Detecting ERC20 ${token} on ${network}`);

  try {
    const rpc = rpcUrl ?? (network === 'ethereum' ? ETHEREUM_RPC_URL : ETHEREUM_SEPOLIA_RPC_URL);
    const contractAddr = contract ?? (network === 'ethereum' ? USDT_ERC20_CONTRACT : USDT_SEPOLIA_CONTRACT);
    const decimals = 6;
    if (!rpc || !contractAddr) return;

    const { data: addrList } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      .eq('chain', 'evm')
      .eq('network', network)
      .eq('asset', token)
      .eq('active', true);
    if (!Array.isArray(addrList) || addrList.length === 0) return;

    const toMap = new Map<string, Record<string, unknown>>();
    for (const a of addrList) toMap.set((a.address as string).toLowerCase(), a);

    // 直近のブロック範囲をスキャン
    const latestRes = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }) });
    const latestData = await latestRes.json();
    const latest = parseInt(latestData.result, 16);
    const last = await getChainProgress('evm', network, token);
    const fromBlock = last > 0 ? (last + 1) : Math.max(0, latest - 2000);

    // Transfer(address,address,uint256)
    const topicTransfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const logsRes = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getLogs', params: [{ fromBlock: '0x' + fromBlock.toString(16), toBlock: 'latest', address: contractAddr, topics: [topicTransfer] }] })
    });
    const logsData = await logsRes.json();
    const logs = Array.isArray(logsData.result) ? logsData.result : [];

    for (const log of logs) {
      const toTopic = log.topics?.[2];
      if (!toTopic) continue;
      const to = '0x' + toTopic.slice(26).toLowerCase();
      if (!toMap.has(to)) continue;

      const addrInfo = toMap.get(to) as DepositAddress | undefined;
      if (!addrInfo) continue; // undefinedチェックを追加
      
      const amount = Number(BigInt(log.data) / BigInt(10 ** decimals));

      // 既存処理済みチェック
      const { data: existing } = await supabaseClient
        .from('deposit_transactions')
        .select('id')
        .eq('transaction_hash', log.transactionHash as string)
        .eq('to_address', addrInfo.address)
        .maybeSingle();
      if (existing) continue;

      // 確認数
      const [txRes, tipRes] = await Promise.all([
        fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_getTransactionReceipt', params: [log.transactionHash] }) }),
        fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'eth_blockNumber', params: [] }) })
      ]);
      const txData = await txRes.json();
      const tipData = await tipRes.json();
      const blockNumber = parseInt(txData.result?.blockNumber || '0x0', 16);
      const tip = parseInt(tipData.result, 16);
      const confirmations = blockNumber > 0 ? (tip - blockNumber + 1) : 0;
      const required = CHAIN_CONFIGS.ethereum.minConfirmations;
      const isConfirmed = confirmations >= required;

      await supabaseClient.from('deposit_transactions').insert({
        user_id: addrInfo.user_id,
        deposit_address_id: addrInfo.id,
        chain: 'evm',
        network,
        asset: token,
        transaction_hash: log.transactionHash as string,
        block_number: blockNumber,
        from_address: '0x' + (log.topics?.[1]?.slice(26) || ''),
        to_address: addrInfo.address,
        amount: amount.toString(),
        confirmations,
        required_confirmations: required,
        status: isConfirmed ? 'confirmed' : 'pending',
        raw_transaction: log,
        confirmed_at: isConfirmed ? new Date().toISOString() : null
      });

      if (isConfirmed) {
        await updateUserBalance(addrInfo.user_id, token, amount, supabaseClient);
      }

      await upsertDepositRow({
        user_id: addrInfo.user_id,
        amount,
        currency: token,
        chain: 'evm',
        network,
        asset: token,
        status: isConfirmed ? 'confirmed' : 'pending',
        transaction_hash: log.transactionHash as string,
        wallet_address: addrInfo.address,
        confirmations_required: required,
        confirmations_observed: confirmations
      }, supabaseClient);
    }
    // 進捗更新
    await setChainProgress('evm', network, token, latest);
  } catch (e) {
    console.error('Error in detectErc20Deposits:', e);
  }
}

// 個別Ethereumアドレスの入金チェック
async function checkEthereumAddress(addressInfo: DepositAddress, network: 'ethereum' | 'sepolia') {
  try {
    const rpcUrl = network === 'ethereum' 
      ? ETHEREUM_RPC_URL 
      : ETHEREUM_SEPOLIA_RPC_URL;
    
    if (!rpcUrl) {
      console.log(`No RPC URL configured for Ethereum ${network}`);
      return;
    }
    
    // 最新ブロック番号を取得
    const latestBlockResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1
      })
    });
    
    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = parseInt(latestBlockData.result, 16);
    
    // 過去100ブロックをチェック（実際の運用ではより効率的な方法を使用）
    const fromBlock = Math.max(0, latestBlockNumber - 100);
    
    // トランザクション履歴を取得
    const logsResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getLogs',
        params: [{
          fromBlock: '0x' + fromBlock.toString(16),
          toBlock: 'latest',
          address: addressInfo.address
        }],
        id: 2
      })
    });
    
    const logsData = await logsResponse.json();
    
    if (logsData.result && logsData.result.length > 0) {
      console.log(`Found ${logsData.result.length} transactions for ${addressInfo.address}`);
      
      // 各トランザクションを処理
      for (const log of logsData.result) {
        await processEthereumTransaction(log, addressInfo, network);
      }
    }
    
  } catch (error) {
    console.error(`Error checking Ethereum address ${addressInfo.address}:`, error);
  }
}

// Ethereumトランザクションの処理
export async function processEthereumTransaction(
  log: Record<string, unknown>,
  addressInfo: DepositAddress,
  network: 'ethereum' | 'sepolia',
  supabaseClient = supabase,
  rpcUrl?: string
) {
  try {
    const txHash = log.transactionHash as string;

    // 既に処理済みかチェック
    const { data: existingTx } = await supabaseClient
      .from('deposit_transactions')
      .select('id')
      .eq('transaction_hash', txHash)
      .eq('to_address', addressInfo.address)
      .single();

    if (existingTx) {
      console.log(`Transaction ${txHash} already processed`);
      return;
    }

    // トランザクション詳細を取得
    const rpc = rpcUrl ?? (network === 'ethereum' ? ETHEREUM_RPC_URL : ETHEREUM_SEPOLIA_RPC_URL);

    const txResponse = await fetch(rpc!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 3
      })
    });
    
    const txData = await txResponse.json();
    const transaction = txData.result;
    
    if (!transaction) {
      console.log(`Transaction ${txHash} not found`);
      return;
    }
    
    // 金額を計算（Wei to ETH）
    const amountWei = parseInt(transaction.value, 16);
    const amountEth = amountWei / Math.pow(10, 18);
    
    // 最小入金額チェック
    // 最小入金額: ETH 0.01〜0.05（下限を適用）
    if (amountEth < 0.01) {
      console.log(`Amount ${amountEth} ETH too small, skipping`);
      return;
    }
    
    // 確認数を取得
    const latestBlockResponse = await fetch(rpc!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 4
      })
    });
    
    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = parseInt(latestBlockData.result, 16);
    const txBlockNumber = parseInt(transaction.blockNumber, 16);
    const confirmations = latestBlockNumber - txBlockNumber + 1;

    // deposit_transactionsテーブルに記録
    const { error } = await supabaseClient
      .from('deposit_transactions')
      .insert({
        user_id: addressInfo.user_id,
        deposit_address_id: addressInfo.id,
        chain: 'evm',
        network: network,
        asset: addressInfo.asset || 'ETH',
        transaction_hash: txHash,
        block_number: txBlockNumber,
        block_hash: transaction.blockHash,
        from_address: transaction.from,
        to_address: transaction.to,
        amount: amountEth.toString(),
        confirmations: confirmations,
        required_confirmations: CHAIN_CONFIGS.ethereum.minConfirmations,
        status: confirmations >= CHAIN_CONFIGS.ethereum.minConfirmations ? 'confirmed' : 'pending',
        raw_transaction: transaction,
        confirmed_at: confirmations >= CHAIN_CONFIGS.ethereum.minConfirmations ? new Date().toISOString() : null
      });
    
    if (error) {
      console.error(`Error inserting transaction ${txHash}:`, error);
    } else {
      console.log(`Successfully recorded deposit: ${amountEth} ETH from ${transaction.from} to ${transaction.to}`);
      
      // 確認済みの場合、ユーザーの残高を更新
      if (confirmations >= CHAIN_CONFIGS.ethereum.minConfirmations) {
        await updateUserBalance(addressInfo.user_id, 'ETH', amountEth);
      }

      // deposits テーブルに pending/confirmed を反映
      await upsertDepositRow({
        user_id: addressInfo.user_id,
        amount: amountEth,
        currency: 'ETH',
        chain: 'evm',
        network,
        asset: (addressInfo.asset || 'ETH'),
        status: confirmations >= CHAIN_CONFIGS.ethereum.minConfirmations ? 'confirmed' : 'pending',
        transaction_hash: txHash,
        wallet_address: transaction.to,
        confirmations_required: CHAIN_CONFIGS.ethereum.minConfirmations,
        confirmations_observed: confirmations
      });
    }
    
  } catch (error) {
    console.error('Error processing Ethereum transaction:', error);
  }
}

// Bitcoin入金検知（簡易実装）
export async function detectBitcoinDeposits(
  network: string = 'mainnet',
  supabaseClient = supabase,
  baseExplorerUrl?: string
) {
  console.log(`[${new Date().toISOString()}] Detecting Bitcoin deposits on ${network}`);

  // Bitcoin用のxpub派生アドレスをチェック
  try {
    const { data: addresses, error } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      .eq('chain', 'btc')
      .eq('network', network)
      .eq('active', true);

    if (error || !addresses) {
      console.error('Error fetching Bitcoin addresses:', error);
      return;
    }

    console.log(`Found ${addresses.length} active Bitcoin addresses`);

    // 実際の実装では、Bitcoin Core RPCやBlockstream APIを使用
    // ここは簡易的な実装例
    for (const addressInfo of addresses) {
      // BlockstreamのAPIを使用した例
      const explorerUrl = baseExplorerUrl ?? (network === 'mainnet'
        ? 'https://blockstream.info/api'
        : 'https://blockstream.info/testnet/api');

      try {
        const response = await fetch(`${explorerUrl}/address/${addressInfo.address}/txs`);
        const transactions = await response.json();

        if (Array.isArray(transactions) && transactions.length > 0) {
          console.log(`Found ${transactions.length} Bitcoin transactions for ${addressInfo.address}`);

          for (const tx of transactions) {
            await processBitcoinTransaction(tx, addressInfo, network, supabaseClient);
          }
        }
      } catch (txError) {
        console.error(`Error checking Bitcoin address ${addressInfo.address}:`, txError);
      }
    }

  } catch (error) {
    console.error('Error in detectBitcoinDeposits:', error);
  }
}

// Bitcoinトランザクションの処理
async function processBitcoinTransaction(
  tx: BitcoinTransaction,
  addressInfo: DepositAddress,
  network: string,
  supabaseClient = supabase,
  tipUrlOverride?: string
) {
  try {
    // 既に処理済みかチェック
    const { data: existingTx } = await supabaseClient
      .from('deposit_transactions')
      .select('id')
      .eq('transaction_hash', tx.txid)
      .eq('to_address', addressInfo.address)
      .single();
    
    if (existingTx) {
      return;
    }
    
    // 入金額を計算
    let depositAmount = 0;
    for (const output of tx.vout) {
      if (output.scriptpubkey_address === addressInfo.address) {
        depositAmount += output.value / 100000000; // satoshi to BTC
      }
    }
    
    // 最小入金額: BTC 0.0001〜0.001（下限を適用）
    if (depositAmount < 0.0001) {
      console.log(`Bitcoin amount ${depositAmount} BTC too small, skipping`);
      return;
    }
    
    // 確認数を取得
    let confirmations = 0;
    let isConfirmed = false;
    try {
      const tipUrl = tipUrlOverride ?? (network === 'mainnet' ? 'https://blockstream.info/api/blocks/tip/height' : 'https://blockstream.info/testnet/api/blocks/tip/height');
      const tipText = await (await fetch(tipUrl)).text();
      const tipHeight = parseInt(tipText, 10) || 0;
      const txHeight = tx.status?.block_height || 0;
      confirmations = (tx.status?.confirmed && txHeight > 0) ? (tipHeight - txHeight + 1) : 0;
      isConfirmed = confirmations >= CHAIN_CONFIGS.bitcoin.minConfirmations;
    } catch {
      // ブロックチェーンAPIエラーを無視し、デフォルト値を使用
    }
    
    // deposit_transactionsテーブルに記録
    const { error } = await supabaseClient
      .from('deposit_transactions')
      .insert({
        user_id: addressInfo.user_id,
        deposit_address_id: addressInfo.id,
        chain: 'btc',
        network: network,
        asset: 'BTC',
        transaction_hash: tx.txid,
        block_number: tx.status?.block_height,
        block_hash: tx.status?.block_hash,
        from_address: tx.vin[0]?.prevout?.scriptpubkey_address || 'unknown',
        to_address: addressInfo.address,
        amount: depositAmount.toString(),
        confirmations: confirmations,
        required_confirmations: CHAIN_CONFIGS.bitcoin.minConfirmations,
        status: isConfirmed ? 'confirmed' : 'pending',
        raw_transaction: tx,
        confirmed_at: isConfirmed ? new Date().toISOString() : null
      });

    if (error) {
      console.error(`Error inserting Bitcoin transaction ${tx.txid}:`, error);
    } else {
      console.log(`Successfully recorded Bitcoin deposit: ${depositAmount} BTC to ${addressInfo.address}`);

      if (isConfirmed) {
        await updateUserBalance(addressInfo.user_id, 'BTC', depositAmount, supabaseClient);
      }

      await upsertDepositRow({
        user_id: addressInfo.user_id,
        amount: depositAmount,
        currency: 'BTC',
        chain: 'btc',
        network,
        asset: 'BTC',
        status: isConfirmed ? 'confirmed' : 'pending',
        transaction_hash: tx.txid,
        wallet_address: addressInfo.address,
        confirmations_required: CHAIN_CONFIGS.bitcoin.minConfirmations,
        confirmations_observed: confirmations || 0
      }, supabaseClient);
    }
    
  } catch (error) {
    console.error('Error processing Bitcoin transaction:', error);
  }
}

// XRP入金検知
export async function detectXRPDeposits(
  network: string = 'mainnet',
  supabaseClient = supabase,
  rpcUrl?: string
) {
  console.log(`[${new Date().toISOString()}] Detecting XRP deposits on ${network}`);

  try {
    // XRP固定アドレスを取得
    const { data: fixedAddresses, error } = await supabaseClient
      .from('xrp_fixed_addresses')
      .select('*')
      .eq('network', network)
      .eq('active', true);

    if (error || !fixedAddresses) {
      console.error('Error fetching XRP addresses:', error);
      return;
    }

    for (const fixedAddress of fixedAddresses) {
      // XRP Ledger APIを使用してトランザクションを取得
      const ledgerRpcUrl = rpcUrl ?? (network === 'mainnet'
        ? 'https://s1.ripple.com:51234/'
        : 'https://s.altnet.rippletest.net:51234/');

      try {
        const response = await fetch(ledgerRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'account_tx',
            params: [{
              account: fixedAddress.address,
              ledger_index_min: -1,
              ledger_index_max: -1,
              limit: 100
            }]
          })
        });

        const data = await response.json();

        if (data.result && data.result.transactions) {
          console.log(`Found ${data.result.transactions.length} XRP transactions for ${fixedAddress.address}`);

          for (const txData of data.result.transactions) {
            await processXRPTransaction(txData, fixedAddress, network, supabaseClient);
          }
        }

      } catch (txError) {
        console.error(`Error checking XRP address ${fixedAddress.address}:`, txError);
      }
    }

  } catch (error) {
    console.error('Error in detectXRPDeposits:', error);
  }
}

// XRPトランザクションの処理
async function processXRPTransaction(
  txData: Record<string, unknown>,
  fixedAddress: DepositAddress,
  network: string,
  supabaseClient = supabase
) {
  try {
    const tx = txData.tx as XRPTransaction;
    const txHash = tx.hash;

    // Payment transactionのみを処理
    if (tx.TransactionType !== 'Payment') {
      return;
    }

    // 自分宛ての入金のみを処理
    if (tx.Destination !== fixedAddress.address) {
      return;
    }

    const destinationTag = tx.DestinationTag;
    if (!destinationTag) {
      console.log(`No destination tag in transaction ${txHash}, skipping`);
      return;
    }

    // Destination Tagからユーザーを特定
    const { data: depositAddresses, error: addressError } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      .eq('chain', 'xrp')
      .eq('network', network)
      .eq('destination_tag', destinationTag.toString())
      .eq('active', true);

    if (addressError || !depositAddresses || depositAddresses.length === 0) {
      console.log(`No user found for destination tag ${destinationTag}`);
      return;
    }

    const addressInfo = depositAddresses[0];

    // 既に処理済みかチェック
    const { data: existingTx } = await supabaseClient
      .from('deposit_transactions')
      .select('id')
      .eq('transaction_hash', txHash)
      .eq('destination_tag', destinationTag.toString())
      .maybeSingle();
    
    if (existingTx) {
      return;
    }
    
    // 金額を計算（drops to XRP）
    const amountDrops = parseInt(tx.Amount, 10);
    const amountXRP = amountDrops / 1000000;
    
    // 最小入金額: XRP 20〜50（下限を適用）
    if (amountXRP < 20) {
      console.log(`XRP amount ${amountXRP} too small, skipping`);
      return;
    }
    
    // deposit_transactionsテーブルに記録
    const { error } = await supabaseClient
      .from('deposit_transactions')
      .insert({
        user_id: addressInfo.user_id,
        deposit_address_id: addressInfo.id,
        chain: 'xrp',
        network: network,
        asset: 'XRP',
        transaction_hash: txHash,
        block_number: txData.ledger_index,
        from_address: tx.Account,
        to_address: tx.Destination,
        amount: amountXRP.toString(),
        destination_tag: destinationTag.toString(),
        confirmations: 1,
        required_confirmations: 1,
        status: 'confirmed',
        raw_transaction: txData,
        confirmed_at: new Date().toISOString()
      });

    if (error) {
      console.error(`Error inserting XRP transaction ${txHash}:`, error);
    } else {
      console.log(`Successfully recorded XRP deposit: ${amountXRP} XRP with destination tag ${destinationTag}`);
      await updateUserBalance(addressInfo.user_id, 'XRP', amountXRP, supabaseClient);

      await upsertDepositRow({
        user_id: addressInfo.user_id,
        amount: amountXRP,
        currency: 'XRP',
        chain: 'xrp',
        network,
        asset: 'XRP',
        status: 'confirmed',
        transaction_hash: txHash,
        wallet_address: addressInfo.address,
        confirmations_required: CHAIN_CONFIGS.xrp.minConfirmations,
        confirmations_observed: CHAIN_CONFIGS.xrp.minConfirmations
      }, supabaseClient);
    }
    
  } catch (error) {
    console.error('Error processing XRP transaction:', error);
  }
}

// ユーザー残高の更新
async function updateUserBalance(userId: string, asset: string, amount: number, supabaseClient = supabase) {
  try {
    // 既存の残高を取得
    const { data: existingBalance, error: fetchError } = await supabaseClient
      .from('user_assets')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', asset)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching user balance:', fetchError);
      return;
    }
    
    if (existingBalance) {
      // 既存の残高を更新
      const newBalance = parseFloat(existingBalance.balance) + amount;
      const { error: updateError } = await supabaseClient
        .from('user_assets')
        .update({ 
          balance: newBalance.toString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('currency', asset);
      
      if (updateError) {
        console.error('Error updating user balance:', updateError);
      } else {
        console.log(`Updated ${asset} balance for user ${userId}: ${newBalance}`);
      }
    } else {
      // 新しい残高レコードを作成
      const { error: insertError } = await supabaseClient
        .from('user_assets')
        .insert({
          user_id: userId,
          currency: asset,
          balance: amount.toString()
        });
      
      if (insertError) {
        console.error('Error creating user balance:', insertError);
      } else {
        console.log(`Created new ${asset} balance for user ${userId}: ${amount}`);
      }
    }
    
  } catch (error) {
    console.error('Error in updateUserBalance:', error);
  }
}

// depositsテーブルへ pending/confirmed を反映（既存Txは更新）
async function upsertDepositRow(params: {
  user_id: string;
  amount: number;
  currency: string;
  chain?: string;
  network?: string;
  asset?: string;
  status: 'pending' | 'confirmed' | 'rejected';
  transaction_hash: string;
  wallet_address: string;
  confirmations_required: number;
  confirmations_observed: number;
}, supabaseClient = supabase) {
  try {
    const { data: existing } = await supabaseClient
      .from('deposits')
      .select('id, status')
      .eq('transaction_hash', params.transaction_hash)
      .eq('user_id', params.user_id)
      .maybeSingle();

    if (existing?.id) {
      await supabaseClient
        .from('deposits')
        .update({
          status: params.status,
          confirmations_observed: params.confirmations_observed,
          confirmations_required: params.confirmations_required,
          chain: params.chain ?? null,
          network: params.network ?? null,
          asset: params.asset ?? params.currency,
          confirmed_at: params.status === 'confirmed' ? new Date().toISOString() : null
        })
        .eq('id', existing.id);
    } else {
      await supabaseClient
        .from('deposits')
        .insert({
          user_id: params.user_id,
          amount: params.amount,
          currency: params.currency,
          chain: params.chain ?? null,
          network: params.network ?? null,
          asset: params.asset ?? params.currency,
          status: params.status,
          transaction_hash: params.transaction_hash,
          wallet_address: params.wallet_address,
          confirmations_required: params.confirmations_required,
          confirmations_observed: params.confirmations_observed,
          confirmed_at: params.status === 'confirmed' ? new Date().toISOString() : null
        });
    }
  } catch (e) {
    console.error('Failed to upsert deposits row:', e);
  }
}

// メイン検知関数
async function runDepositDetection() {
  console.log(`[${new Date().toISOString()}] Starting deposit detection cycle`);
  
  const tasks: Promise<unknown>[] = [];

  if (ETHEREUM_RPC_URL) {
    tasks.push(detectEthereumDeposits('ethereum'));
    tasks.push(detectErc20Deposits('ethereum', 'USDT'));
  }

  if (ETHEREUM_SEPOLIA_RPC_URL) {
    tasks.push(detectEthereumDeposits('sepolia'));
    tasks.push(detectErc20Deposits('sepolia', 'USDT'));
  }

  if (TRONGRID_API_KEY) {
    tasks.push(detectTronDeposits('mainnet'));
    tasks.push(detectTronDeposits('shasta'));
  }
  
  await Promise.allSettled(tasks);
  
  console.log(`[${new Date().toISOString()}] Deposit detection cycle completed`);
}

// HTTP handler (テスト可能にするため関数として抽出)
export async function handleRequest(req: Request): Promise<Response> {
  const { method } = req;

  if (method === 'POST') {
    try {
      await runDepositDetection();

      return new Response(JSON.stringify({
        success: true,
        message: 'Deposit detection completed',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } catch (error) {
      console.error('Error in deposit detection:', error);

      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      });
    }
  } else if (method === 'GET') {
    return new Response(JSON.stringify({
      message: 'Deposit Detection Worker',
      version: '2.1',
      supported_chains: ['ethereum', 'bitcoin', 'xrp', 'tron', 'cardano'],
      status: 'active'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } else {
    return new Response('Method not allowed', { status: 405 });
  }
}

serve(handleRequest);

// --- TRON 入金検知（TRX + TRC20 USDTの簡易対応） ---
export async function detectTronDeposits(
  network: string = 'mainnet',
  supabaseClient = supabase,
  baseUrlOverride?: string,
  apiKeyOverride?: string
) {
  try {
    const baseUrl = baseUrlOverride ?? (network === 'mainnet' ? 'https://api.trongrid.io' : 'https://api.shasta.trongrid.io');
    const apiKey = apiKeyOverride ?? TRONGRID_API_KEY;
    if (!apiKey) {
      console.log('TRONGRID_API_KEY is not set; skip TRON');
      return;
    }

    // 管理対象アドレス（TRX）
    const { data: trxAddresses } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      .eq('chain', 'trc')
      .eq('network', network)
      .eq('asset', 'TRX')
      .eq('active', true);

    // 管理対象アドレス（USDT）
    const { data: usdtAddresses } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      .eq('chain', 'trc')
      .eq('network', network)
      .eq('asset', 'USDT')
      .eq('active', true);

    const headers = {
      'TRON-PRO-API-KEY': apiKey,
      'Accept': 'application/json'
    } as Record<string,string>;

    // 現在ブロック高を取得（確認数計算用）
    let currentBlockNumber = 0;
    try {
      const blockRes = await fetch(`${baseUrl}/v1/now`, { headers });
      const blockData = await blockRes.json();
      currentBlockNumber = blockData.block_header?.raw_data?.number || 0;
      console.log(`[TRON] Current block number: ${currentBlockNumber}`);
    } catch (e) {
      console.error('Failed to get TRON current block number:', e);
    }

    // TRC20 (USDT)
    if (Array.isArray(usdtAddresses) && usdtAddresses.length > 0) {
      for (const addr of usdtAddresses) {
        const url = new URL(`${baseUrl}/v1/accounts/${addr.address}/transactions/trc20`);
        url.searchParams.set('contract_address', TRC20_USDT_CONTRACT);
        url.searchParams.set('limit', '50');
        try {
          const res = await fetch(url.toString(), { headers });
          const data = await res.json();
          const list = data.data || [];
          for (const tx of list) {
            if (tx.to !== addr.address) continue;
            const decimals = (tx.token_info && tx.token_info.decimals) ? tx.token_info.decimals : 6;
            const amount = (Number(tx.value) / Math.pow(10, decimals));
            if (amount <= 0) continue;

            // 重複チェック
            const { data: existing } = await supabaseClient
              .from('deposit_transactions')
              .select('id')
              .eq('transaction_hash', tx.transaction_id)
              .eq('to_address', addr.address)
              .maybeSingle();
            if (existing) continue;

            // 確認数を動的に計算
            const txBlockNumber = tx.block_number || 0;
            const confirmations = (currentBlockNumber > 0 && txBlockNumber > 0)
              ? (currentBlockNumber - txBlockNumber + 1) : 0;
            const isConfirmed = confirmations >= CHAIN_CONFIGS.tron.minConfirmations;

            await supabaseClient.from('deposit_transactions').insert({
              user_id: addr.user_id,
              deposit_address_id: addr.id,
              chain: 'trc',
              network: network,
              asset: 'USDT',
              transaction_hash: tx.transaction_id,
              block_number: txBlockNumber,
              from_address: tx.from,
              to_address: tx.to,
              amount: amount.toString(),
              confirmations: confirmations,
              required_confirmations: CHAIN_CONFIGS.tron.minConfirmations,
              status: isConfirmed ? 'confirmed' : 'pending',
              raw_transaction: tx,
              confirmed_at: isConfirmed ? new Date().toISOString() : null
            });

            console.log(`[TRON TRC20] Recorded USDT deposit: ${amount} USDT, confirmations: ${confirmations}/${CHAIN_CONFIGS.tron.minConfirmations}, status: ${isConfirmed ? 'confirmed' : 'pending'}`);

            // 確認済みの場合は残高を更新
            if (isConfirmed) {
              await updateUserBalance(addr.user_id, 'USDT', amount, supabaseClient);
            }

            await upsertDepositRow({
              user_id: addr.user_id,
              amount: amount,
              currency: 'USDT',
              chain: 'trc',
              network,
              asset: 'USDT',
              status: isConfirmed ? 'confirmed' : 'pending',
              transaction_hash: tx.transaction_id,
              wallet_address: addr.address,
              confirmations_required: CHAIN_CONFIGS.tron.minConfirmations,
              confirmations_observed: confirmations
            });
          }
        } catch (e) {
          console.error('TRC20 scan error:', e);
        }
      }
    }

    // TRXネイティブ（簡易）
    if (Array.isArray(trxAddresses) && trxAddresses.length > 0) {
      for (const addr of trxAddresses) {
        const url = new URL(`${baseUrl}/v1/accounts/${addr.address}/transactions`);
        url.searchParams.set('only_to', 'true');
        url.searchParams.set('limit', '50');
        try {
          const res = await fetch(url.toString(), { headers });
          const data = await res.json();
          const list = data.data || [];
          for (const tx of list) {
            if (!tx.raw_data || !tx.raw_data.contract || !tx.raw_data.contract[0]) continue;
            if (tx.raw_data.contract[0].type !== 'TransferContract') continue;
            const v = tx.raw_data.contract[0].parameter.value;
            if (!v || v.to_address !== addr.address) continue;
            const amount = (v.amount || 0) / 1e6;
            if (amount <= 0) continue;

            const { data: existing } = await supabaseClient
              .from('deposit_transactions')
              .select('id')
              .eq('transaction_hash', tx.txID)
              .eq('to_address', addr.address)
              .maybeSingle();
            if (existing) continue;

            // 確認数を動的に計算
            const txBlockNumber = tx.blockNumber || 0;
            const confirmations = (currentBlockNumber > 0 && txBlockNumber > 0)
              ? (currentBlockNumber - txBlockNumber + 1) : 0;
            const isConfirmed = confirmations >= CHAIN_CONFIGS.tron.minConfirmations;

            await supabaseClient.from('deposit_transactions').insert({
              user_id: addr.user_id,
              deposit_address_id: addr.id,
              chain: 'trc',
              network: network,
              asset: 'TRX',
              transaction_hash: tx.txID,
              block_number: txBlockNumber,
              from_address: v.owner_address,
              to_address: v.to_address,
              amount: amount.toString(),
              confirmations: confirmations,
              required_confirmations: CHAIN_CONFIGS.tron.minConfirmations,
              status: isConfirmed ? 'confirmed' : 'pending',
              raw_transaction: tx,
              confirmed_at: isConfirmed ? new Date().toISOString() : null
            });

            console.log(`[TRON TRX] Recorded TRX deposit: ${amount} TRX, confirmations: ${confirmations}/${CHAIN_CONFIGS.tron.minConfirmations}, status: ${isConfirmed ? 'confirmed' : 'pending'}`);

            // 確認済みの場合は残高を更新
            if (isConfirmed) {
              await updateUserBalance(addr.user_id, 'TRX', amount, supabaseClient);
            }

            await upsertDepositRow({
              user_id: addr.user_id,
              amount: amount,
              currency: 'TRX',
              chain: 'trc',
              network,
              asset: 'TRX',
              status: isConfirmed ? 'confirmed' : 'pending',
              transaction_hash: tx.txID,
              wallet_address: addr.address,
              confirmations_required: CHAIN_CONFIGS.tron.minConfirmations,
              confirmations_observed: confirmations
            });
          }
        } catch (e) {
          console.error('TRX scan error:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error in detectTronDeposits:', error);
  }
}

// --- ADA (Cardano) 入金検知（簡易：ADAネイティブ） ---
export async function detectAdaDeposits(
  network: string = 'mainnet',
  supabaseClient = supabase,
  baseUrlOverride?: string,
  projectIdOverride?: string
) {
  try {
    const projectId = projectIdOverride ?? BLOCKFROST_PROJECT_ID;
    if (!projectId) {
      console.log('BLOCKFROST_PROJECT_ID is not set; skip ADA');
      return;
    }
    const base = baseUrlOverride ?? (network === 'mainnet'
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-preprod.blockfrost.io/api/v0');

    const headers = { 'project_id': projectId } as Record<string,string>;

    // 現在ブロック高を取得（確認数計算用）
    let latestBlockNumber = 0;
    try {
      const blockRes = await fetch(`${base}/blocks/latest`, { headers });
      const blockData = await blockRes.json();
      latestBlockNumber = blockData.height || 0;
      console.log(`[Cardano] Latest block height: ${latestBlockNumber}`);
    } catch (e) {
      console.error('Failed to get Cardano latest block height:', e);
    }

    const { data: addresses } = await supabaseClient
      .from('deposit_addresses')
      .select('*')
      .eq('chain', 'ada')
      .eq('network', network)
      .eq('asset', 'ADA')
      .eq('active', true);

    if (!Array.isArray(addresses) || addresses.length === 0) return;

    for (const addr of addresses) {
      try {
        const url = `${base}/addresses/${addr.address}/transactions?order=desc&count=10`;
        const res = await fetch(url, { headers });
        const txs = await res.json();
        if (!Array.isArray(txs)) continue;
        for (const t of txs) {
          const txHash = t.tx_hash || t.hash || t;
          // 重複チェック
          const { data: existing } = await supabaseClient
            .from('deposit_transactions')
            .select('id')
            .eq('transaction_hash', txHash)
            .eq('to_address', addr.address)
            .maybeSingle();
          if (existing) continue;

          // 詳細取得
          const detailRes = await fetch(`${base}/txs/${txHash}`, { headers });
          const detail = await detailRes.json();
          if (!detail || !Array.isArray(detail.output_amount)) continue;
          const lovelace = detail.output_amount.find((o: Record<string, unknown>) => o.unit === 'lovelace');
          if (!lovelace) continue;
          const amount = Number(lovelace.quantity) / 1e6;
          if (amount <= 0) continue;

          // 確認数を動的に計算
          const txBlockNumber = detail.block_height || 0;
          const confirmations = (latestBlockNumber > 0 && txBlockNumber > 0)
            ? (latestBlockNumber - txBlockNumber + 1) : 0;
          const isConfirmed = confirmations >= CHAIN_CONFIGS.cardano.minConfirmations;

          await supabaseClient.from('deposit_transactions').insert({
            user_id: addr.user_id,
            deposit_address_id: addr.id,
            chain: 'ada',
            network: network,
            asset: 'ADA',
            transaction_hash: txHash,
            block_number: txBlockNumber,
            from_address: '',
            to_address: addr.address,
            amount: amount.toString(),
            confirmations: confirmations,
            required_confirmations: CHAIN_CONFIGS.cardano.minConfirmations,
            status: isConfirmed ? 'confirmed' : 'pending',
            raw_transaction: detail,
            confirmed_at: isConfirmed ? new Date().toISOString() : null
          });

          console.log(`[Cardano] Recorded ADA deposit: ${amount} ADA, confirmations: ${confirmations}/${CHAIN_CONFIGS.cardano.minConfirmations}, status: ${isConfirmed ? 'confirmed' : 'pending'}`);

          // 確認済みの場合は残高を更新
          if (isConfirmed) {
            await updateUserBalance(addr.user_id, 'ADA', amount, supabaseClient);
          }

          await upsertDepositRow({
            user_id: addr.user_id,
            amount: amount,
            currency: 'ADA',
            chain: 'ada',
            network,
            asset: 'ADA',
            status: isConfirmed ? 'confirmed' : 'pending',
            transaction_hash: txHash,
            wallet_address: addr.address,
            confirmations_required: CHAIN_CONFIGS.cardano.minConfirmations,
            confirmations_observed: confirmations
          }, supabaseClient);
        }
      } catch (e) {
        console.error('ADA scan error:', e);
      }
    }
  } catch (error) {
    console.error('Error in detectAdaDeposits:', error);
  }
}
