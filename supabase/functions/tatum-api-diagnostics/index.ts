// @ts-expect-error - Supabase Edge Functions環境での外部モジュール型定義制約のため
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

// Deno global types
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

/*
  Tatum APIキー診断ツール
  - 機能: v3/v4 API権限の包括的診断
  - 出力: 詳細な権限解析レポートと推奨アクション
  - 用途: v4サブスクリプション機能権限問題の解決支援
*/

const TATUM_API_KEY = Deno.env.get('TATUM_API_KEY');

interface DiagnosticResult {
  status: 'ok' | 'error' | 'partial';
  endpoint: string;
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  responseTime?: number;
  details?: unknown;
}

interface DiagnosticReport {
  timestamp: string;
  apiKeyConfigured: boolean;
  diagnostics: {
    v3_baseline: DiagnosticResult;
    v4_read_access: DiagnosticResult;
    v4_write_access: DiagnosticResult;
  };
  permissionAnalysis: {
    currentScope: string[];
    requiredScope: string[];
    missingPermissions: string[];
    planLevel?: string;
  };
  recommendations: {
    actionRequired: 'none' | 'upgrade' | 'new_key' | 'contact_support';
    priority: 'low' | 'medium' | 'high' | 'critical';
    steps: string[];
    estimatedResolutionTime: string;
    dashboardUrl?: string;
  };
}

// ====================================
// API診断実行函数
// ====================================

async function testV3Baseline(): Promise<DiagnosticResult> {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.tatum.io/v3/tatum/version', {
      method: 'GET',
      headers: {
        'x-api-key': TATUM_API_KEY!
      }
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      return {
        status: 'ok',
        endpoint: '/v3/tatum/version',
        httpStatus: response.status,
        responseTime,
        details: result
      };
    } else {
      const errorText = await response.text();
      return {
        status: 'error',
        endpoint: '/v3/tatum/version',
        httpStatus: response.status,
        message: errorText,
        responseTime
      };
    }
  } catch (error) {
    return {
      status: 'error',
      endpoint: '/v3/tatum/version',
      message: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - startTime
    };
  }
}

async function testV4ReadAccess(): Promise<DiagnosticResult> {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.tatum.io/v4/subscription?pageSize=1&type=mainnet', {
      method: 'GET',
      headers: {
        'x-api-key': TATUM_API_KEY!
      }
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      return {
        status: 'ok',
        endpoint: '/v4/subscription (READ)',
        httpStatus: response.status,
        responseTime,
        details: {
          subscriptionCount: result.data?.length || 0,
          response: result
        }
      };
    } else {
      const errorBody = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorBody);
      } catch {
        parsedError = { raw: errorBody };
      }

      return {
        status: 'error',
        endpoint: '/v4/subscription (READ)',
        httpStatus: response.status,
        errorCode: parsedError.errorCode,
        message: parsedError.message || errorBody,
        responseTime,
        details: parsedError
      };
    }
  } catch (error) {
    return {
      status: 'error',
      endpoint: '/v4/subscription (READ)',
      message: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - startTime
    };
  }
}

async function testV4WriteAccess(): Promise<DiagnosticResult> {
  const startTime = Date.now();

  try {
    // テスト用のダミーサブスクリプション作成要求
    // 実際には作成されない（無効なアドレス使用）
    const testPayload = {
      type: 'ADDRESS_EVENT',
      attr: {
        address: '0x0000000000000000000000000000000000000000', // ダミーアドレス
        chain: 'ETH',
        url: 'https://test.example.com/webhook' // ダミーURL
      }
    };

    const response = await fetch('https://api.tatum.io/v4/subscription?type=testnet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TATUM_API_KEY!
      },
      body: JSON.stringify(testPayload)
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      return {
        status: 'ok',
        endpoint: '/v4/subscription (WRITE)',
        httpStatus: response.status,
        responseTime,
        message: 'Write access confirmed (test subscription created)',
        details: result
      };
    } else {
      const errorBody = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(errorBody);
      } catch {
        parsedError = { raw: errorBody };
      }

      // 権限エラーと他のエラーを区別
      const isPermissionError = response.status === 401 ||
                               parsedError.errorCode === 'subscription.invalid' ||
                               parsedError.message?.includes('Authentication required');

      return {
        status: isPermissionError ? 'error' : 'partial',
        endpoint: '/v4/subscription (WRITE)',
        httpStatus: response.status,
        errorCode: parsedError.errorCode,
        message: parsedError.message || errorBody,
        responseTime,
        details: parsedError
      };
    }
  } catch (error) {
    return {
      status: 'error',
      endpoint: '/v4/subscription (WRITE)',
      message: error instanceof Error ? error.message : String(error),
      responseTime: Date.now() - startTime
    };
  }
}

// ====================================
// 権限解析・推奨アクション生成
// ====================================

function analyzePermissions(diagnostics: DiagnosticReport['diagnostics']): DiagnosticReport['permissionAnalysis'] {
  const currentScope: string[] = [];
  const requiredScope = ['v4_subscription_read', 'v4_subscription_write'];
  const missingPermissions: string[] = [];

  // v3アクセス確認
  if (diagnostics.v3_baseline.status === 'ok') {
    currentScope.push('v3_basic_access');
  }

  // v4読み込みアクセス確認
  if (diagnostics.v4_read_access.status === 'ok') {
    currentScope.push('v4_subscription_read');
  } else {
    missingPermissions.push('v4_subscription_read');
  }

  // v4書き込みアクセス確認
  if (diagnostics.v4_write_access.status === 'ok') {
    currentScope.push('v4_subscription_write');
  } else if (diagnostics.v4_write_access.status === 'error') {
    missingPermissions.push('v4_subscription_write');
  }

  return {
    currentScope,
    requiredScope,
    missingPermissions
  };
}

function generateRecommendations(
  permissionAnalysis: DiagnosticReport['permissionAnalysis'],
  diagnostics: DiagnosticReport['diagnostics']
): DiagnosticReport['recommendations'] {
  const { missingPermissions } = permissionAnalysis;

  // 権限不足なし
  if (missingPermissions.length === 0) {
    return {
      actionRequired: 'none',
      priority: 'low',
      steps: ['✅ APIキーは正常に動作しています', 'v4サブスクリプション機能が利用可能です'],
      estimatedResolutionTime: '解決済み'
    };
  }

  // v4サブスクリプション権限が完全に不足
  if (missingPermissions.includes('v4_subscription_read') && missingPermissions.includes('v4_subscription_write')) {
    return {
      actionRequired: 'upgrade',
      priority: 'critical',
      steps: [
        '🔑 現在のAPIキーがv4サブスクリプション機能にアクセス権限を持っていません',
        '📋 以下の手順でTatumダッシュボードにアクセスしてください：',
        '   1. https://dashboard.tatum.io にログイン',
        '   2. 左メニューから「API Keys」を選択',
        '   3. 現在のAPIキーの権限設定を確認',
        '   4. 「Notification API」または「Subscription API」が有効か確認',
        '   5. 無効の場合、プランのアップグレードまたは新しいAPIキーの生成が必要',
        '⚡ 代替案: 新しいAPIキーを生成して環境変数TATUM_API_KEYを更新'
      ],
      estimatedResolutionTime: '5-15分（ダッシュボード操作）',
      dashboardUrl: 'https://dashboard.tatum.io/api-keys'
    };
  }

  // 部分的権限不足
  return {
    actionRequired: 'upgrade',
    priority: 'high',
    steps: [
      '⚠️ APIキーの権限が部分的に不足しています',
      `❌ 不足権限: ${missingPermissions.join(', ')}`,
      '📋 Tatumダッシュボードで権限設定を確認・更新してください',
      '🔗 ダッシュボードURL: https://dashboard.tatum.io/api-keys'
    ],
    estimatedResolutionTime: '5-10分',
    dashboardUrl: 'https://dashboard.tatum.io/api-keys'
  };
}

// ====================================
// メインハンドラー
// ====================================

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(origin);
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const url = new URL(req.url);
    const testType = url.searchParams.get('test') || 'all';

    // APIキー設定確認
    if (!TATUM_API_KEY) {
      const errorReport: DiagnosticReport = {
        timestamp: new Date().toISOString(),
        apiKeyConfigured: false,
        diagnostics: {
          v3_baseline: { status: 'error', endpoint: 'N/A', message: 'TATUM_API_KEY not configured' },
          v4_read_access: { status: 'error', endpoint: 'N/A', message: 'TATUM_API_KEY not configured' },
          v4_write_access: { status: 'error', endpoint: 'N/A', message: 'TATUM_API_KEY not configured' }
        },
        permissionAnalysis: {
          currentScope: [],
          requiredScope: ['v4_subscription_read', 'v4_subscription_write'],
          missingPermissions: ['TATUM_API_KEY_MISSING']
        },
        recommendations: {
          actionRequired: 'new_key',
          priority: 'critical',
          steps: [
            '🚨 TATUM_API_KEYが設定されていません',
            '1. TatumダッシュボードでAPIキーを生成',
            '2. Supabase環境変数にTATUM_API_KEYを設定',
            '3. supabase secrets set TATUM_API_KEY=<your-key>'
          ],
          estimatedResolutionTime: '10-20分'
        }
      };

      return new Response(JSON.stringify(errorReport, null, 2), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    console.log(`[tatum-api-diagnostics] Starting diagnostic tests: ${testType}`);

    // 段階的診断実行
    const diagnostics = {
      v3_baseline: await testV3Baseline(),
      v4_read_access: await testV4ReadAccess(),
      v4_write_access: await testV4WriteAccess()
    };

    // 権限解析
    const permissionAnalysis = analyzePermissions(diagnostics);

    // 推奨アクション生成
    const recommendations = generateRecommendations(permissionAnalysis, diagnostics);

    const report: DiagnosticReport = {
      timestamp: new Date().toISOString(),
      apiKeyConfigured: true,
      diagnostics,
      permissionAnalysis,
      recommendations
    };

    console.log(`[tatum-api-diagnostics] Diagnostic completed:`, {
      v3: diagnostics.v3_baseline.status,
      v4_read: diagnostics.v4_read_access.status,
      v4_write: diagnostics.v4_write_access.status,
      action: recommendations.actionRequired
    });

    return new Response(JSON.stringify(report, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('[tatum-api-diagnostics] Error:', error);
    return new Response(JSON.stringify({
      error: 'Internal diagnostic error',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});