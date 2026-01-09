#!/usr/bin/env tsx

/**
 * Tatum サブスクリプション管理CLI
 *
 * deposit_addresses テーブルとTatumサブスクリプションの同期管理を行う
 *
 * 使用方法:
 *   npm run tatum:sync                           - deposit_addressesとサブスクリプション同期
 *   npm run tatum:list                           - 現在のサブスクリプション一覧表示
 *   npm run tatum:create <address> <chain>       - 手動サブスクリプション作成（拡張版）
 *   npm run tatum:create <address> <chain> [network] [asset] - ネットワークとアセット指定対応
 *   npm run tatum:delete <id>                    - サブスクリプション削除
 *   npm run tatum:status                         - サブスクリプション状態とWebhook履歴確認
 */

// 環境変数の読み込み (.env.local -> .env の優先順位)
import dotenv from 'dotenv';

// .env.local（開発用シークレット）-> .env（デフォルト設定）の順で読み込み
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TatumClient } from './lib/tatum-client.js';
import { SupabaseClient } from './lib/supabase-client.js';
import { SubscriptionManager } from './lib/subscription-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

async function initializeClients() {
  console.log('🔧 クライアント初期化中...');

  let tatumClient: TatumClient | null = null;
  let supabaseClient: SupabaseClient | null = null;

  try {
    tatumClient = new TatumClient();
    supabaseClient = new SupabaseClient();

    await tatumClient.initialize();
    await supabaseClient.initialize();

    const subscriptionManager = new SubscriptionManager(tatumClient, supabaseClient);
    return { tatumClient, supabaseClient, subscriptionManager };
  } catch (error) {
    // エラー時には初期化済みのtatumClientを必ず破棄
    if (tatumClient) {
      await tatumClient.destroy();
    }
    throw error;
  }
}

async function syncCommand() {
  console.log('🔄 サブスクリプション同期を開始します...');

  let tatumClient: TatumClient | null = null;
  let hasError = false;

  try {
    const clients = await initializeClients();
    tatumClient = clients.tatumClient;

    // 戻り値を明示的にチェックして部分失敗を検知
    const result = await clients.subscriptionManager.syncSubscriptions();
    if (result.errors && result.errors.length > 0) {
      throw new Error(`同期処理が部分的に失敗しました: ${result.errors.length}件のエラーが発生`);
    }

    console.log('✅ 同期が完了しました');
  } catch (error) {
    console.error('❌ 同期に失敗しました:', error);
    hasError = true;
  } finally {
    if (tatumClient) {
      await tatumClient.destroy();
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

async function listCommand() {
  console.log('📋 サブスクリプション一覧を取得中...');

  let tatumClient: TatumClient | null = null;
  let hasError = false;

  try {
    const clients = await initializeClients();
    tatumClient = clients.tatumClient;
    await clients.subscriptionManager.listSubscriptions();
  } catch (error) {
    console.error('❌ 一覧取得に失敗しました:', error);
    hasError = true;
  } finally {
    if (tatumClient) {
      await tatumClient.destroy();
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

async function createCommand(address: string, chain: string, network?: string, asset?: string) {
  const displayNetwork = network || 'デフォルト';
  const displayAsset = asset || 'デフォルト';
  console.log(`🆕 サブスクリプション作成中: ${address} (${chain}/${displayNetwork}/${displayAsset})`);

  let tatumClient: TatumClient | null = null;
  let hasError = false;

  try {
    const clients = await initializeClients();
    tatumClient = clients.tatumClient;
    await clients.subscriptionManager.createSubscription(address, chain, network, asset);
    console.log('✅ サブスクリプションが作成されました');
  } catch (error) {
    console.error('❌ 作成に失敗しました:', error);
    hasError = true;
  } finally {
    if (tatumClient) {
      await tatumClient.destroy();
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

async function deleteCommand(subscriptionId: string) {
  console.log(`🗑️ サブスクリプション削除中: ${subscriptionId}`);

  let tatumClient: TatumClient | null = null;
  let hasError = false;

  try {
    const clients = await initializeClients();
    tatumClient = clients.tatumClient;
    await clients.subscriptionManager.deleteSubscription(subscriptionId);
    console.log('✅ サブスクリプションが削除されました');
  } catch (error) {
    console.error('❌ 削除に失敗しました:', error);
    hasError = true;
  } finally {
    if (tatumClient) {
      await tatumClient.destroy();
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

async function statusCommand() {
  console.log('📊 サブスクリプション状態を確認中...');

  let tatumClient: TatumClient | null = null;
  let hasError = false;

  try {
    const clients = await initializeClients();
    tatumClient = clients.tatumClient;
    await clients.subscriptionManager.checkStatus();
  } catch (error) {
    console.error('❌ 状態確認に失敗しました:', error);
    hasError = true;
  } finally {
    if (tatumClient) {
      await tatumClient.destroy();
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

async function ensureCommand(address: string, chain: string, network: string, asset: string) {
  console.log(`🔔 サブスクリプション確保中: ${address} (${chain}/${network}/${asset})`);

  let tatumClient: TatumClient | null = null;
  let hasError = false;

  try {
    const clients = await initializeClients();
    tatumClient = clients.tatumClient;

    // ensureSubscriptionForAddress メソッドを呼び出し
    const result = await clients.subscriptionManager.ensureSubscriptionForAddress(
      address,
      chain,
      network,
      asset
    );

    // Edge Function向けにJSON形式で結果を出力
    console.log(JSON.stringify({
      success: result.success,
      created: result.created,
      skipped: result.skipped,
      errors: result.error ? [result.error] : [],
      metadata: {
        address,
        chain,
        network,
        asset,
        timestamp: new Date().toISOString()
      }
    }));

    if (!result.success && result.error) {
      hasError = true;
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      success: false,
      errors: [errorMessage],
      metadata: {
        address,
        chain,
        network,
        asset,
        timestamp: new Date().toISOString()
      }
    }));
    hasError = true;
  } finally {
    if (tatumClient) {
      await tatumClient.destroy();
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

// CLIコマンド設定
program
  .name('tatum-subscription-manager')
  .description('Tatum サブスクリプション管理CLI')
  .version(packageJson.version);

program
  .command('sync')
  .description('deposit_addressesテーブルとTatumサブスクリプションを同期')
  .action(syncCommand);

program
  .command('list')
  .description('現在のサブスクリプション一覧を表示')
  .action(listCommand);

program
  .command('create')
  .description('新しいサブスクリプションを手動作成（マルチアセット・マルチネットワーク対応）')
  .argument('<address>', '監視するアドレス')
  .argument('<chain>', 'チェーン名 (evm, btc, xrp)')
  .argument('[network]', 'ネットワーク名 (ethereum, sepolia, polygon, bsc, mainnet, testnet) - 省略時はデフォルト')
  .argument('[asset]', 'アセット名 (ETH, USDT, USDC, DAI, MATIC, BNB, BTC, XRP) - 省略時はネイティブアセット')
  .action(createCommand);

program
  .command('delete')
  .description('サブスクリプションを削除')
  .argument('<subscription-id>', '削除するサブスクリプションID')
  .action(deleteCommand);

program
  .command('status')
  .description('サブスクリプション状態とWebhook履歴を確認')
  .action(statusCommand);

program
  .command('ensure')
  .description('単一アドレスのサブスクリプション確保（フロントエンド統合用）')
  .argument('<address>', '監視するアドレス')
  .argument('<chain>', 'チェーン名 (evm, btc, xrp)')
  .argument('<network>', 'ネットワーク名 (ethereum, sepolia, polygon, bsc, mainnet, testnet)')
  .argument('<asset>', 'アセット名 (ETH, USDT, USDC, DAI, MATIC, BNB, BTC, XRP)')
  .action(ensureCommand);

// CLIメイン実行
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse(process.argv);
}