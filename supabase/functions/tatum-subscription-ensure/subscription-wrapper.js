#!/usr/bin/env node

/**
 * Tatumサブスクリプション確保 - Node.js Wrapper
 *
 * 使用方法:
 *   node subscription-wrapper.js <address> <chain> <network> <asset>
 *
 * 出力: JSON形式でのサブスクリプション作成結果
 *
 * 説明:
 *   SubscriptionManagerCLIを呼び出して、ensureサブコマンドを実行
 *   Supabase Edge Function から呼び出すためのNode.js wrapper
 */

const { spawn } = require('child_process');
const path = require('path');

async function main() {
  try {
    // コマンドライン引数の取得
    const [address, chain, network, asset] = process.argv.slice(2);

    if (!address || !chain || !network || !asset) {
      console.error(JSON.stringify({
        success: false,
        error: 'Missing required arguments: address, chain, network, asset'
      }));
      process.exit(1);
    }

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

    // ensureサブコマンドで実行
    const args = [cliScript, 'ensure', address, chain, network, asset];

    const result = await runCommand(tsxPath, args, {
      cwd: projectRoot,
      env: { ...process.env }
    });

    if (result.success) {
      // 成功時はstdoutを直接出力（JSON形式想定）
      console.log(result.stdout);
    } else {
      // 失敗時はエラー情報を含むJSONを出力
      console.error(JSON.stringify({
        success: false,
        error: result.stderr || 'Command execution failed',
        stdout: result.stdout,
        timestamp: new Date().toISOString()
      }));
    }

    process.exit(result.success ? 0 : 1);

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