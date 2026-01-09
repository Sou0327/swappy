#!/usr/bin/env node

/**
 * Tatum管理者ステータス取得 - Node.js Wrapper
 *
 * 使用方法:
 *   node status-wrapper.js
 *
 * 出力: JSON形式でのTatumサブスクリプション状況とサマリー
 *
 * 説明:
 *   SubscriptionManagerのlistSubscriptionsとcheckStatusメソッドを
 *   呼び出して、管理画面向けのデータを収集
 */

const { spawn } = require('child_process');
const path = require('path');

async function main() {
  try {
    // 環境変数チェック
    const requiredEnvVars = [
      'TATUM_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.error(JSON.stringify({
          success: false,
          error: `Missing required environment variable: ${envVar}`
        }));
        process.exit(1);
      }
    }

    // プロジェクトルートからの相対パス
    const projectRoot = path.resolve(__dirname, '../../../');
    const cliScript = path.join(projectRoot, 'scripts/tatum-subscription-manager.ts');

    // tsxを使用してTypeScriptを実行
    const tsxPath = path.join(projectRoot, 'node_modules/.bin/tsx');

    // statusサブコマンドで実行してステータス情報を取得
    const statusResult = await runCommand(tsxPath, [cliScript, 'status'], {
      cwd: projectRoot,
      env: { ...process.env }
    });

    if (!statusResult.success) {
      console.error(JSON.stringify({
        success: false,
        error: 'Status check failed',
        details: statusResult.stderr
      }));
      process.exit(1);
    }

    // listサブコマンドで実行してサブスクリプション一覧を取得
    const listResult = await runCommand(tsxPath, [cliScript, 'list'], {
      cwd: projectRoot,
      env: { ...process.env }
    });

    if (!listResult.success) {
      console.error(JSON.stringify({
        success: false,
        error: 'List subscriptions failed',
        details: listResult.stderr
      }));
      process.exit(1);
    }

    // CLIからの出力をパースして管理画面用のデータ構造に変換
    const subscriptions = parseSubscriptionsFromCLI(listResult.stdout);
    const summary = parseStatusFromCLI(statusResult.stdout);

    // 管理画面向けに構造化されたデータを出力
    console.log(JSON.stringify({
      success: true,
      subscriptions: subscriptions,
      summary: summary,
      metadata: {
        timestamp: new Date().toISOString(),
        total_subscriptions: subscriptions.length,
        active_subscriptions: subscriptions.filter(s => s.status === 'active').length,
        error_subscriptions: subscriptions.filter(s => s.error_count > 0).length
      }
    }));

    process.exit(0);

  } catch (error) {
    // エラー結果をJSON出力
    console.error(JSON.stringify({
      success: false,
      error: error.message || String(error),
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
    process.exit(1);
  }
}

/**
 * CLIからのサブスクリプション一覧出力をパースして構造化データに変換
 */
function parseSubscriptionsFromCLI(cliOutput) {
  // TODO: 実際のCLI出力形式に合わせてパース処理を実装
  // 現在はサンプルデータを返す
  return [
    {
      id: 'sub_1',
      address: '0x1234567890123456789012345678901234567890',
      chain: 'evm',
      network: 'ethereum',
      type: 'INCOMING_NATIVE_TX',
      status: 'active',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      last_webhook: new Date(Date.now() - 3600000).toISOString(),
      error_count: 0
    },
    {
      id: 'sub_2',
      address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      chain: 'evm',
      network: 'ethereum',
      type: 'INCOMING_FUNGIBLE_TX',
      status: 'active',
      created_at: new Date(Date.now() - 172800000).toISOString(),
      last_webhook: new Date(Date.now() - 1800000).toISOString(),
      error_count: 2
    },
    {
      id: 'sub_3',
      address: 'rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      chain: 'xrp',
      network: 'mainnet',
      type: 'INCOMING_NATIVE_TX',
      status: 'inactive',
      created_at: new Date(Date.now() - 259200000).toISOString(),
      error_count: 5
    }
  ];
}

/**
 * CLIからのステータス出力をパースしてサマリー情報に変換
 */
function parseStatusFromCLI(cliOutput) {
  // TODO: 実際のCLI出力形式に合わせてパース処理を実装
  // 現在はサンプルデータを返す
  return {
    total_addresses: 45,
    active_subscriptions: 42,
    inactive_subscriptions: 3,
    sync_percentage: 93,
    last_check: new Date().toISOString()
  };
}

/**
 * 子プロセスでコマンドを実行
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        stdout: '',
        stderr: error.message,
        exitCode: -1
      });
    });
  });
}

// 未処理例外ハンドリング
process.on('uncaughtException', (error) => {
  console.error(JSON.stringify({
    success: false,
    error: 'Uncaught exception: ' + (error.message || String(error)),
    stack: error.stack,
    timestamp: new Date().toISOString()
  }));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    success: false,
    error: 'Unhandled rejection: ' + String(reason),
    timestamp: new Date().toISOString()
  }));
  process.exit(1);
});

// メイン実行
if (require.main === module) {
  main();
}

module.exports = { main };