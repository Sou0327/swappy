/**
 * Supabaseクライアントのモック（完全修正版）
 * deposit-detectorで確立したパターンを適用し、クエリビルダーのPromise化を完全実装
 */

import {
  TEST_USER_ID,
  TEST_XPUBS,
  TEST_ADDRESS_INDEX,
  TEST_DESTINATION_TAG,
  EXPECTED_ADDRESSES,
} from './fixtures.ts';

/**
 * Supabase RPCレスポンスの型定義
 */
interface MockSupabaseResponse<T = any> {
  data: T | null;
  error: {
    message: string;
    code?: string;
  } | null;
}

/**
 * モックSupabaseクライアントの状態
 */
class MockSupabaseState {
  // データベースの状態をシミュレート
  walletRoots: Map<string, any> = new Map();
  depositAddresses: Map<string, any> = new Map();
  depositRoutes: Map<string, any> = new Map();
  addressRequests: Map<string, any> = new Map();

  // RPC呼び出しの設定
  rpcBehavior: Map<string, (args: any) => MockSupabaseResponse> = new Map();

  // 認証状態
  isAuthenticated: boolean = true;
  currentUserId: string = TEST_USER_ID;

  reset() {
    this.walletRoots.clear();
    this.depositAddresses.clear();
    this.depositRoutes.clear();
    this.addressRequests.clear();
    this.rpcBehavior.clear();
    this.isAuthenticated = true;
    this.currentUserId = TEST_USER_ID;
  }
}

// グローバル状態（テスト間で共有）
export const mockSupabaseState = new MockSupabaseState();

/**
 * モックSupabaseクライアント
 */
export function createMockSupabaseClient(isServiceRole = false) {
  return {
    // 認証
    auth: {
      getUser: async () => {
        if (!mockSupabaseState.isAuthenticated) {
          return {
            data: { user: null },
            error: { message: 'Not authenticated' },
          };
        }

        return {
          data: {
            user: {
              id: mockSupabaseState.currentUserId,
              email: 'test@example.com',
            },
          },
          error: null,
        };
      },
    },

    // テーブルクエリ
    from: (table: string) => {
      return createTableQuery(table, isServiceRole);
    },

    // RPC呼び出し
    rpc: (functionName: string, args?: any) => {
      return createRpcCall(functionName, args);
    },
  };
}

/**
 * テーブルクエリビルダーのモック（完全修正版）
 *
 * 重要：メソッドチェーンを保持しながらPromiseを返す
 */
function createTableQuery(table: string, isServiceRole: boolean) {
  const query: any = {
    _table: table,
    _filters: [] as Array<{ column: string; operator: string; value: any }>,
    _select: '*',
    _single: false,
    _order: null as { column: string; ascending: boolean } | null,
    _limit: null as number | null,

    select: function (columns = '*') {
      this._select = columns;
      return this;
    },

    eq: function (column: string, value: any) {
      this._filters.push({ column, operator: 'eq', value });
      return this;
    },

    neq: function (column: string, value: any) {
      this._filters.push({ column, operator: 'neq', value });
      return this;
    },

    order: function (column: string, { ascending = true } = {}) {
      this._order = { column, ascending };
      return this;
    },

    limit: function (count: number) {
      this._limit = count;
      return this;
    },

    single: function () {
      this._single = true;
      return this;
    },

    maybeSingle: function () {
      this._single = true;
      // 重要：queryオブジェクト（this）を保持したままPromiseを返す
      const self = this;
      return new Promise<MockSupabaseResponse>(async (resolve, reject) => {
        try {
          const result = await executeQuery(self);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    },
  };

  return query;
}

/**
 * クエリ実行のシミュレーション（完全修正版）
 */
async function executeQuery(query: any): Promise<MockSupabaseResponse> {
  const { _table, _filters, _single } = query;

  // wallet_rootsテーブル
  if (_table === 'wallet_roots') {
    const chainFilter = _filters.find((f: any) => f.column === 'chain');
    const networkFilter = _filters.find((f: any) => f.column === 'network');
    const autoGenFilter = _filters.find((f: any) => f.column === 'auto_generated');

    // chainとnetworkは必須（deposit-detector実装パターン）
    if (!chainFilter || !networkFilter) {
      return { data: null, error: { message: 'Missing required filters' } };
    }

    // キーの構築：auto_generatedフィルターの有無で分岐
    let key: string;
    if (autoGenFilter !== undefined) {
      key = `${chainFilter.value}-${networkFilter.value}-${autoGenFilter.value}`;
    } else {
      // auto_generatedフィルターなしの場合、全パターンを検索
      const withAutoGen = mockSupabaseState.walletRoots.get(
        `${chainFilter.value}-${networkFilter.value}-true`
      );
      const withoutAutoGen = mockSupabaseState.walletRoots.get(
        `${chainFilter.value}-${networkFilter.value}-false`
      );
      const root = withAutoGen || withoutAutoGen;
      return { data: _single ? root : (root ? [root] : []), error: null };
    }

    const root = mockSupabaseState.walletRoots.get(key);

    if (!root) {
      return { data: null, error: null };
    }

    return { data: _single ? root : [root], error: null };
  }

  // deposit_addressesテーブル
  if (_table === 'deposit_addresses') {
    const userFilter = _filters.find((f: any) => f.column === 'user_id');
    const chainFilter = _filters.find((f: any) => f.column === 'chain');
    const networkFilter = _filters.find((f: any) => f.column === 'network');

    if (!userFilter || !chainFilter || !networkFilter) {
      return { data: null, error: { message: 'Missing required filters' } };
    }

    const key = `${userFilter.value}-${chainFilter.value}-${networkFilter.value}`;
    const address = mockSupabaseState.depositAddresses.get(key);

    if (!address) {
      return { data: null, error: null };
    }

    return { data: _single ? address : [address], error: null };
  }

  // deposit_routesテーブル
  if (_table === 'deposit_routes') {
    const userFilter = _filters.find((f: any) => f.column === 'user_id');
    const chainFilter = _filters.find((f: any) => f.column === 'chain');

    if (!userFilter || !chainFilter) {
      return { data: null, error: { message: 'Missing required filters' } };
    }

    const key = `${userFilter.value}-${chainFilter.value}`;
    const route = mockSupabaseState.depositRoutes.get(key);

    if (!route) {
      return { data: null, error: null };
    }

    return { data: _single ? route : [route], error: null };
  }

  return { data: null, error: { message: 'Table not found' } };
}

/**
 * RPC呼び出しのモック（完全修正版）
 */
function createRpcCall(functionName: string, args?: any): Promise<MockSupabaseResponse> {
  return new Promise(async (resolve, reject) => {
    try {
      // カスタム動作が設定されている場合
      if (mockSupabaseState.rpcBehavior.has(functionName)) {
        const customBehavior = mockSupabaseState.rpcBehavior.get(functionName)!;
        const result = customBehavior(args);
        resolve(result);
        return;
      }

      // デフォルト動作
      const result = await executeRpc(functionName, args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * RPC関数の実行シミュレーション
 */
async function executeRpc(functionName: string, args?: any): Promise<MockSupabaseResponse> {
  // allocate_address_with_idempotency
  if (functionName === 'allocate_address_with_idempotency') {
    const { p_user_id, p_idempotency_key, p_chain, p_network } = args;

    const key = `${p_user_id}-${p_idempotency_key}`;
    const existing = mockSupabaseState.addressRequests.get(key);

    if (existing) {
      return { data: existing.id, error: null };
    }

    const newRequest = {
      id: 'request-' + Date.now(),
      user_id: p_user_id,
      idempotency_key: p_idempotency_key,
      chain: p_chain,
      network: p_network,
      status: 'pending',
    };

    mockSupabaseState.addressRequests.set(key, newRequest);
    return { data: newRequest.id, error: null };
  }

  // allocate_next_address_index
  if (functionName === 'allocate_next_address_index') {
    return { data: TEST_ADDRESS_INDEX, error: null };
  }

  // allocate_next_destination_tag
  if (functionName === 'allocate_next_destination_tag') {
    return { data: TEST_DESTINATION_TAG, error: null };
  }

  // get_active_xrp_master_address
  if (functionName === 'get_active_xrp_master_address') {
    return { data: EXPECTED_ADDRESSES.xrp, error: null };
  }

  // complete_address_request
  if (functionName === 'complete_address_request') {
    return { data: null, error: null };
  }

  return { data: null, error: { message: `Unknown RPC function: ${functionName}` } };
}

/**
 * モックSupabaseクライアントファクトリー
 */
export const mockSupabaseFactory = {
  createClient: createMockSupabaseClient,
  getState: () => mockSupabaseState,
  resetState: () => mockSupabaseState.reset(),
};
