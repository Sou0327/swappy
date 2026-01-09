/**
 * Supabaseクライアントのモック（confirmations-updater用）
 * address-allocatorで確立したPromiseパターンを適用
 */

import { TEST_USER_ID } from './fixtures.ts';

interface MockSupabaseResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

class MockSupabaseState {
  depositTransactions: Map<string, any> = new Map();
  deposits: Map<string, any> = new Map();
  userAssets: Map<string, any> = new Map();
  notifications: Array<any> = [];

  reset() {
    this.depositTransactions.clear();
    this.deposits.clear();
    this.userAssets.clear();
    this.notifications = [];
  }
}

export const mockSupabaseState = new MockSupabaseState();

export function createMockSupabaseClient(isServiceRole = true) {
  return {
    from: (table: string) => createTableQuery(table, isServiceRole),
  };
}

function createTableQuery(table: string, isServiceRole: boolean) {
  const query: any = {
    _table: table,
    _filters: [] as Array<{ column: string; operator: string; value: any }>,
    _select: '*',
    _single: false,
    _limit: null as number | null,
    _updates: null as Record<string, any> | null,
    _inserts: null as Array<any> | null,

    select: function (columns = '*') {
      this._select = columns;
      return this;
    },

    eq: function (column: string, value: any) {
      this._filters.push({ column, operator: 'eq', value });
      return this;
    },

    limit: function (count: number) {
      this._limit = count;
      return this;
    },

    maybeSingle: function () {
      this._single = true;
      const self = this;
      return new Promise<MockSupabaseResponse>(async (resolve) => {
        const result = await executeQuery(self);
        resolve(result);
      });
    },

    single: function () {
      this._single = true;
      const self = this;
      return new Promise<MockSupabaseResponse>(async (resolve) => {
        const result = await executeQuery(self);
        resolve(result);
      });
    },

    update: function (data: Record<string, any>) {
      this._updates = data;
      return this;
    },

    insert: function (data: any | any[]) {
      this._inserts = Array.isArray(data) ? data : [data];
      return this;
    },

    // Promiseメソッド（update/insert後の実行用）
    then: function (resolve: (value: MockSupabaseResponse) => void) {
      const self = this;
      executeQuery(self).then(resolve);
    },
  };

  // update/insertの場合、直接Promiseを返す
  const originalUpdate = query.update;
  query.update = function (data: Record<string, any>) {
    this._updates = data;
    const self = this;

    // eqチェーン用のラッパー
    return {
      eq: function (column: string, value: any) {
        self._filters.push({ column, operator: 'eq', value });
        return new Promise<MockSupabaseResponse>(async (resolve) => {
          const result = await executeUpdate(self);
          resolve(result);
        });
      },
    };
  };

  const originalInsert = query.insert;
  query.insert = function (data: any | any[]) {
    this._inserts = Array.isArray(data) ? data : [data];

    return new Promise<MockSupabaseResponse>(async (resolve) => {
      const result = await executeInsert(this);
      resolve(result);
    });
  };

  return query;
}

async function executeQuery(query: any): Promise<MockSupabaseResponse> {
  const { _table, _filters, _single, _limit } = query;

  if (_table === 'deposit_transactions') {
    const chainFilter = _filters.find((f: any) => f.column === 'chain');
    const networkFilter = _filters.find((f: any) => f.column === 'network');
    const statusFilter = _filters.find((f: any) => f.column === 'status');

    let results = Array.from(mockSupabaseState.depositTransactions.values());

    if (chainFilter) {
      results = results.filter(r => r.chain === chainFilter.value);
    }
    if (networkFilter) {
      results = results.filter(r => r.network === networkFilter.value);
    }
    if (statusFilter) {
      results = results.filter(r => r.status === statusFilter.value);
    }
    if (_limit) {
      results = results.slice(0, _limit);
    }

    if (_single) {
      return { data: results[0] || null, error: null };
    }
    return { data: results, error: null };
  }

  if (_table === 'user_assets') {
    const userFilter = _filters.find((f: any) => f.column === 'user_id');
    const currencyFilter = _filters.find((f: any) => f.column === 'currency');

    if (userFilter && currencyFilter) {
      const key = `${userFilter.value}-${currencyFilter.value}`;
      const asset = mockSupabaseState.userAssets.get(key);
      return { data: asset || null, error: null };
    }

    return { data: null, error: null };
  }

  return { data: null, error: null };
}

async function executeUpdate(query: any): Promise<MockSupabaseResponse> {
  const { _table, _filters, _updates } = query;

  if (_table === 'deposit_transactions') {
    const idFilter = _filters.find((f: any) => f.column === 'id');
    if (idFilter) {
      const tx = mockSupabaseState.depositTransactions.get(idFilter.value);
      if (tx) {
        const updated = { ...tx, ..._updates };
        mockSupabaseState.depositTransactions.set(idFilter.value, updated);
        return { data: updated, error: null };
      }
    }
  }

  if (_table === 'deposits') {
    // transaction_hashとuser_idでフィルタ
    const txHashFilter = _filters.find((f: any) => f.column === 'transaction_hash');
    const userFilter = _filters.find((f: any) => f.column === 'user_id');

    if (txHashFilter && userFilter) {
      const key = `${txHashFilter.value}-${userFilter.value}`;
      const deposit = mockSupabaseState.deposits.get(key);
      if (deposit) {
        const updated = { ...deposit, ..._updates };
        mockSupabaseState.deposits.set(key, updated);
        return { data: updated, error: null };
      }
    }
  }

  if (_table === 'user_assets') {
    const idFilter = _filters.find((f: any) => f.column === 'id');
    if (idFilter) {
      const asset = Array.from(mockSupabaseState.userAssets.values()).find(a => a.id === idFilter.value);
      if (asset) {
        const updated = { ...asset, ..._updates };
        const key = `${asset.user_id}-${asset.currency}`;
        mockSupabaseState.userAssets.set(key, updated);
        return { data: updated, error: null };
      }
    }
  }

  return { data: null, error: null };
}

async function executeInsert(query: any): Promise<MockSupabaseResponse> {
  const { _table, _inserts } = query;

  if (_table === 'user_assets' && _inserts) {
    const insert = _inserts[0];
    const key = `${insert.user_id}-${insert.currency}`;
    mockSupabaseState.userAssets.set(key, { ...insert, id: `asset-${Date.now()}` });
    return { data: insert, error: null };
  }

  if (_table === 'notifications' && _inserts) {
    mockSupabaseState.notifications.push(..._inserts);
    return { data: _inserts, error: null };
  }

  return { data: null, error: null };
}

export const mockSupabaseFactory = {
  createClient: createMockSupabaseClient,
  getState: () => mockSupabaseState,
  resetState: () => mockSupabaseState.reset(),
};
